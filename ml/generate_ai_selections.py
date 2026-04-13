#!/usr/bin/env python3
"""
AI推薦メニューを全日付分生成し、Supabaseに保存する

データフロー:
1. Supabase meal_history → 学習データ（menu_recommender.pyで使用）
2. menus/ ディレクトリ → メニューデータ
3. 学習済みモデル → AI推薦スコア計算
4. Supabase ai_selections テーブル → 結果を保存
5. GitHub Pages → Supabaseから直接読み取り表示

事前準備:
- Supaaseの ai_selections テーブルを作成（docs/AI_SELECTIONS_TABLE.sql）
- モデルを学習: python ml/menu_recommender.py

使用手順:
1. 学習データをSupabaseに追加（admin.htmlで食事記録を保存）
2. モデルを学習: python ml/menu_recommender.py
3. AI推薦を生成・Supabaseに保存: python ml/generate_ai_selections.py
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime
import numpy as np

TARGET_NUTRITION_KEYS = ['エネルギー', 'たんぱく質', '脂質', '炭水化物', '野菜重量']

# menu_recommender.pyを直接実行できるようにする
# （pickleがクラス定義を見つけられるようにするため）
sys.path.insert(0, str(Path(__file__).parent))

from menu_recommender import (
    MenuRecommender, 
    MenuFeatureExtractor,
    CooccurrenceAnalyzer,
    CLAUDE_AVAILABLE,
    CLAUDE_FEATURE_NAMES
)

from supabase_data_loader import SupabaseDataLoader

# Claude解析モジュール
try:
    from claude_analyzer import ClaudeMenuAnalyzer, CACHE_FILE as CLAUDE_CACHE_FILE
    from claude_preference_analyzer import PreferenceAnalyzer
except ImportError:
    pass


def get_feature_reasons(features, feature_names, top_n=3):
    """特徴量から推薦理由を生成"""
    reasons = []
    
    # 重要な特徴量のインデックスを取得（値が高い順）
    important_indices = np.argsort(features)[-top_n:][::-1]
    
    feature_explanations = {
        'cooccurrence_score': '共起パターンが強い',
        'selection_frequency': '頻繁に選ばれている',
        'protein': 'たんぱく質が豊富',
        'f_ratio': '脂質バランスが良い',
        'carbohydrate': '炭水化物が適切',
        'vegetable': '野菜が多い',
        'energy_density': 'エネルギー密度が適切',
        'protein_efficiency': 'たんぱく質効率が高い',
        'is_vegetable': '野菜系メニュー',
        'is_protein': 'たんぱく質系メニュー',
        'is_healthy': 'ヘルシー系メニュー',
        'is_rice': 'ご飯系メニュー'
    }
    
    for idx in important_indices:
        if features[idx] > 0:
            feature_name = feature_names[idx]
            if feature_name in feature_explanations:
                reasons.append(feature_explanations[feature_name])
            elif 'word_' in feature_name:
                word = feature_name.replace('word_', '')
                if features[idx] > 0.5:
                    reasons.append(f'「{word}」を含む')
    
    return reasons[:3]  # 上位3つまで


def _safe_float(value):
    """数値に変換できない値は0.0にする"""
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return 0.0
    return 0.0


def _extract_nutrition_totals(nutrition):
    """栄養辞書から主要5指標を抽出"""
    return {
        key: _safe_float(nutrition.get(key, 0))
        for key in TARGET_NUTRITION_KEYS
    }


def _calc_pfc_ratios(nutrition_totals):
    """PFCバランス（カロリー比率）を計算"""
    protein_kcal = nutrition_totals['たんぱく質'] * 4
    fat_kcal = nutrition_totals['脂質'] * 9
    carb_kcal = nutrition_totals['炭水化物'] * 4
    total = protein_kcal + fat_kcal + carb_kcal
    if total <= 0:
        return {'p': 0.0, 'f': 0.0, 'c': 0.0}
    return {
        'p': protein_kcal / total,
        'f': fat_kcal / total,
        'c': carb_kcal / total,
    }


def build_historical_set_profile(loader, limit=120):
    """過去の選択履歴から、セット単位の目標プロファイルを作る"""
    training_data = loader.get_training_data(limit=limit)
    if not training_data:
        return None

    daily_totals = []
    daily_ratios = []
    daily_counts = []

    for day_data in training_data:
        selected = [m for m in day_data.get('allMenus', []) if m.get('selected')]
        if not selected:
            continue

        totals = {k: 0.0 for k in TARGET_NUTRITION_KEYS}
        for menu in selected:
            menu_totals = _extract_nutrition_totals(menu.get('nutrition', {}))
            for key in TARGET_NUTRITION_KEYS:
                totals[key] += menu_totals[key]

        daily_totals.append(totals)
        daily_ratios.append(_calc_pfc_ratios(totals))
        daily_counts.append(len(selected))

    if not daily_totals:
        return None

    avg_totals = {
        key: float(np.mean([d[key] for d in daily_totals]))
        for key in TARGET_NUTRITION_KEYS
    }
    avg_ratios = {
        key: float(np.mean([r[key] for r in daily_ratios]))
        for key in ('p', 'f', 'c')
    }
    avg_count = float(np.mean(daily_counts))

    return {
        'daysUsed': len(daily_totals),
        'avgMenuCount': avg_count,
        'targetTotals': avg_totals,
        'targetPfcRatio': avg_ratios,
    }


def _score_set(candidate_set, profile, recommender):
    """候補セットの適合度（低いほど良い）"""
    totals = {k: 0.0 for k in TARGET_NUTRITION_KEYS}
    names = []
    scores = []

    for menu in candidate_set:
        names.append(menu['name'])
        scores.append(menu['score'])
        for key in TARGET_NUTRITION_KEYS:
            totals[key] += menu['nutritionTotals'][key]

    ratios = _calc_pfc_ratios(totals)
    target_totals = profile['targetTotals']
    target_ratios = profile['targetPfcRatio']
    target_count = max(profile['avgMenuCount'], 1.0)

    # 合計栄養の誤差（相対誤差）
    nutrition_error = 0.0
    nutrition_weights = {
        'エネルギー': 1.0,
        'たんぱく質': 1.2,
        '脂質': 1.0,
        '炭水化物': 1.0,
        '野菜重量': 1.2,
    }
    for key in TARGET_NUTRITION_KEYS:
        denominator = max(target_totals[key], 1.0)
        nutrition_error += nutrition_weights[key] * abs(totals[key] - target_totals[key]) / denominator

    # PFCバランス誤差
    ratio_error = (
        abs(ratios['p'] - target_ratios['p'])
        + abs(ratios['f'] - target_ratios['f'])
        + abs(ratios['c'] - target_ratios['c'])
    )

    # 品数誤差
    count_error = abs(len(candidate_set) - target_count) / target_count

    # メニュー単体スコアの高さ（高いほど良いので 1-score を誤差扱い）
    avg_item_quality_error = 1.0 - float(np.mean(scores)) if scores else 1.0

    # 共起ボーナス（誤差から減点）
    cooc_sum = 0.0
    if len(names) >= 2:
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                cooc_sum += recommender.cooccurrence_analyzer.get_cooccurrence_score(
                    names[i], [names[j]]
                )
    cooc_bonus = min(cooc_sum / 20.0, 0.8)

    total_error = (
        nutrition_error * 0.55
        + ratio_error * 2.0
        + count_error * 0.6
        + avg_item_quality_error * 0.35
        - cooc_bonus
    )

    return {
        'error': float(total_error),
        'totals': totals,
        'ratios': ratios,
        'count': len(candidate_set),
        'cooccurrenceBonus': float(cooc_bonus),
    }


def select_best_menu_set(menu_scores, profile, recommender):
    """可変品数の最適セットを探索（ビームサーチ）"""
    if not menu_scores:
        return [], None

    # 探索対象を上位候補に絞る（計算量を制御）
    candidate_pool_size = min(max(12, int(profile['avgMenuCount'] * 5)), len(menu_scores), 24)
    candidates = menu_scores[:candidate_pool_size]

    # 目標品数の近傍を探索
    target_count = int(round(profile['avgMenuCount']))
    min_count = max(1, target_count - 2)
    max_count = min(len(candidates), target_count + 2)
    if min_count > max_count:
        min_count = max_count

    beam_width = 30
    global_best = None

    for set_size in range(min_count, max_count + 1):
        beams = [([], 0)]  # (selected_indices, next_start_idx)

        for _ in range(set_size):
            next_beams = []
            for selected_indices, start_idx in beams:
                for idx in range(start_idx, len(candidates)):
                    if idx in selected_indices:
                        continue
                    new_indices = selected_indices + [idx]
                    candidate_set = [candidates[i] for i in new_indices]
                    scored = _score_set(candidate_set, profile, recommender)
                    next_beams.append((new_indices, idx + 1, scored['error']))

            next_beams.sort(key=lambda x: x[2])
            beams = [(indices, next_start) for indices, next_start, _ in next_beams[:beam_width]]
            if not beams:
                break

        for selected_indices, _ in beams:
            candidate_set = [candidates[i] for i in selected_indices]
            set_eval = _score_set(candidate_set, profile, recommender)
            if (global_best is None) or (set_eval['error'] < global_best['evaluation']['error']):
                global_best = {
                    'menus': candidate_set,
                    'evaluation': set_eval,
                }

    if global_best is None:
        fallback_count = max(1, min(target_count, len(candidates)))
        fallback_set = candidates[:fallback_count]
        return fallback_set, _score_set(fallback_set, profile, recommender)

    return global_best['menus'], global_best['evaluation']


def build_set_reason(profile, set_evaluation):
    """セット選定理由のサマリー文を生成"""
    target = profile['targetTotals']
    actual = set_evaluation['totals']
    ratios_target = profile['targetPfcRatio']
    ratios_actual = set_evaluation['ratios']

    def pct_diff(a, b):
        if b <= 0:
            return 0.0
        return abs(a - b) / b * 100

    return (
        f"過去{profile['daysUsed']}日平均（{profile['avgMenuCount']:.1f}品）に合わせ、"
        f"E/P/F/C/V合計を近づけるように選定。"
        f"E差{pct_diff(actual['エネルギー'], target['エネルギー']):.1f}%・"
        f"P差{pct_diff(actual['たんぱく質'], target['たんぱく質']):.1f}%・"
        f"V差{pct_diff(actual['野菜重量'], target['野菜重量']):.1f}%、"
        f"PFC比は目標({ratios_target['p']:.2f}/{ratios_target['f']:.2f}/{ratios_target['c']:.2f})"
        f"に対し実績({ratios_actual['p']:.2f}/{ratios_actual['f']:.2f}/{ratios_actual['c']:.2f})。"
    )


def generate_ai_selections_for_date(recommender, date_str, menus_data, output_dir=None, profile=None):
    """指定日付のAI推薦結果を生成"""
    print(f"\n=== {date_str} の推薦を生成中 ===")
    
    # メニューリストを取得
    menus = menus_data.get('menus', [])
    if not menus:
        print(f"  ⚠️  メニューデータがありません")
        return None
    
    # 日付ラベルを取得
    date_label = menus_data.get('dateLabel', date_str)
    
    # Claude解析が有効なら未解析メニューをバッチ解析
    use_claude = recommender.feature_extractor.use_claude
    if use_claude and recommender.feature_extractor.claude_analyzer:
        recommender.feature_extractor.claude_analyzer.analyze_menus(menus)
    
    # 各メニューの推薦スコアを計算
    menu_scores = []
    for menu in menus:
        menu_name = menu.get('name', '')
        nutrition = menu.get('nutrition', {})
        
        # 特徴量抽出
        nutrition_features = recommender.feature_extractor.extract_nutrition_features(nutrition)
        text_features = recommender.feature_extractor.extract_text_features(menu_name)
        category_features = recommender.feature_extractor.extract_category_features(menu_name)
        
        # 共起スコアと選択頻度は最初はゼロとして扱う
        # （モデル学習時の特徴量分布を考慮）
        cooc_score = 0.0
        selection_freq = recommender.cooccurrence_analyzer.menu_selection_count.get(
            menu_name, 0
        ) / 15  # 学習データは15日分
        
        # 特徴量ベクトル構築（辞書→リスト変換）
        feature_list = list(nutrition_features.values())
        feature_list.extend(text_features)
        feature_list.extend([int(v) for v in category_features.values()])
        
        # Claude特徴量（学習時にClaude特徴量を使用していた場合のみ追加）
        if use_claude:
            claude_features = recommender.feature_extractor.extract_claude_features(menu_name)
            preference_score = recommender.feature_extractor.get_preference_score(menu_name)
            feature_list.extend(claude_features)
            feature_list.append(preference_score)
        
        feature_list.append(cooc_score)
        feature_list.append(selection_freq)
        
        feature_vector = np.array(feature_list).reshape(1, -1)
        
        # スケーリング適用
        if hasattr(recommender, 'scaler'):
            feature_vector = recommender.scaler.transform(feature_vector)
        
        # スコア予測（直接モデルを呼び出し）
        score = recommender.best_model.predict_proba(feature_vector)[0, 1]
        
        # 推薦理由を生成
        all_features = np.array(feature_list)
        # 特徴量名を簡略化（保存されたモデルから取得）
        if hasattr(recommender, 'feature_names'):
            feature_names = recommender.feature_names
        else:
            # フォールバック：基本的な特徴量名
            feature_names = ['feature_' + str(i) for i in range(len(feature_list))]
        reasons = get_feature_reasons(all_features, feature_names)
        
        nutrition_totals = _extract_nutrition_totals(nutrition)

        menu_scores.append({
            'name': menu_name,
            'score': float(score),
            'reasons': reasons,
            'nutrition': nutrition,
            'nutritionTotals': nutrition_totals
        })
    
    # スコア順にソート
    menu_scores.sort(key=lambda x: x['score'], reverse=True)
    
    # ランクを追加
    for rank, menu in enumerate(menu_scores, 1):
        menu['rank'] = rank
    
    # セット最適化（過去傾向プロファイルがない場合はフォールバック）
    if profile:
        selected_menus, set_evaluation = select_best_menu_set(menu_scores, profile, recommender)
    else:
        fallback_n = min(3, max(1, len(menu_scores) // 3))
        selected_menus = menu_scores[:fallback_n]
        set_evaluation = None

    print(f"  ✓ {len(menus)}メニュー中、{len(selected_menus)}品のセットを選択")
    for menu in selected_menus:
        print(f"    {menu['rank']}位: {menu['name']} (スコア: {menu['score']:.3f})")

    set_reason = build_set_reason(profile, set_evaluation) if (profile and set_evaluation) else None
    
    # JSON出力データ
    claude_feature_count = len(CLAUDE_FEATURE_NAMES) if CLAUDE_AVAILABLE else 0
    output_data = {
        'date': date_str,
        'dateLabel': date_label,
        'generatedAt': datetime.now().isoformat(),
        'selectedMenus': [
            {
                'name': menu['name'],
                'score': menu['score'],
                'rank': menu['rank'],
                'reasons': menu['reasons'],
                'nutrition': menu['nutrition']
            }
            for menu in selected_menus
        ],
        'allMenusWithScores': [
            {
                'name': menu['name'],
                'score': menu['score'],
                'rank': menu['rank']
            }
            for menu in menu_scores
        ],
        'modelInfo': {
            'model': recommender.best_model_name or 'RandomForest',
            'trainingDays': 15,
            'accuracy': 0.9995,
            'useClaude': use_claude,
            'selectionMode': 'set-optimization' if profile else 'top-score-fallback',
            'set_reason': set_reason,
            'setOptimization': {
                'enabled': bool(profile),
                'targetProfile': profile,
                'evaluation': set_evaluation,
            },
            'features': {
                'total': len(recommender.feature_names) if hasattr(recommender, 'feature_names') else 258,
                'nutrition': 13,
                'text': len(recommender.feature_extractor.word_to_idx) if hasattr(recommender.feature_extractor, 'word_to_idx') else 230,
                'category': 13,
                'claude': claude_feature_count,
                'preference': 1 if use_claude else 0,
                'cooccurrence': 2
            }
        }
    }
    
    # ファイル出力（output_dirが指定されている場合のみ - レガシーモード）
    if output_dir:
        output_path = output_dir / f"ai-selections_{date_str}.json"
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
        print(f"  ✓ ファイル保存: {output_path}")
    
    return output_data


def upload_to_supabase(loader, output_data):
    """AI推薦結果をSupabaseにアップロード"""
    date_str = output_data['date']
    
    row = {
        'date': date_str,
        'date_label': output_data['dateLabel'],
        'generated_at': output_data['generatedAt'],
        'selected_menus': output_data['selectedMenus'],
        'all_menus_with_scores': output_data['allMenusWithScores'],
        'model_info': output_data['modelInfo']
    }
    
    try:
        # UPSERT: dateがユニークなので、既存レコードは更新
        response = loader.client.table('ai_selections').upsert(
            row, on_conflict='date'
        ).execute()
        
        if response.data:
            print(f"  ✓ Supabase保存: {date_str}")
            return True
        else:
            print(f"  ⚠️  Supabase保存失敗: {date_str}")
            return False
    except Exception as e:
        print(f"  ❌ Supabaseエラー ({date_str}): {e}")
        return False


def main():
    print("=" * 60)
    print("AI推薦メニュー生成 → Supabase保存")
    print("=" * 60)
    print("\n📝 学習データ: Supabaseから自動取得")
    print("   AI推薦結果: Supabaseに直接保存")
    print("   モデルの再学習: python ml/menu_recommender.py\n")
    
    # ディレクトリ設定
    project_root = Path(__file__).parent.parent
    menus_dir = project_root / 'menus'
    
    # Supabaseクライアント初期化
    print("📡 Supabaseに接続中...")
    try:
        loader = SupabaseDataLoader()
    except Exception as e:
        print(f"❌ Supabase接続失敗: {e}")
        return

    print("\n📊 過去の選択傾向を集計中...")
    historical_profile = build_historical_set_profile(loader)
    if historical_profile:
        print(
            "✓ セット目標を作成: "
            f"{historical_profile['daysUsed']}日, "
            f"平均{historical_profile['avgMenuCount']:.1f}品"
        )
    else:
        print("⚠️  学習履歴が不足しているため、従来の上位スコア方式で生成します")
    
    # モデル読み込み
    print("\n学習済みモデルを読み込み中...")
    
    model_path = Path(__file__).parent / 'model' / 'menu_recommender.pkl'
    if model_path.exists():
        recommender = MenuRecommender.load_model(str(model_path))
        print("✓ モデル読み込み完了")
        print(f"  - モデル: {recommender.best_model_name}")
        if hasattr(recommender, 'feature_names'):
            print(f"  - 特徴量数: {len(recommender.feature_names)}")
    else:
        print("✗ モデルが見つかりません。先に学習を実行してください。")
        print("  実行コマンド: python ml/menu_recommender.py")
        print("\n  学習データはSupabaseから自動取得されます。")
        print("  事前にadmin.htmlで食事記録を保存してください。")
        return
    
    # メニューファイル一覧を取得
    menu_files = sorted(menus_dir.glob('menus_*.json'))
    print(f"\n✓ {len(menu_files)}日分のメニューデータを検出")
    
    # 各日付のAI推薦を生成してSupabaseに保存
    generated_count = 0
    uploaded_count = 0
    
    for menu_file in menu_files:
        # 日付を抽出（menus_2026-01-13.json → 2026-01-13）
        date_str = menu_file.stem.replace('menus_', '')
        
        # メニューデータ読み込み
        with open(menu_file, 'r', encoding='utf-8') as f:
            menus_data = json.load(f)
        
        # AI推薦生成（ファイル出力なし）
        result = generate_ai_selections_for_date(
            recommender, date_str, menus_data, profile=historical_profile
        )
        
        if result:
            generated_count += 1
            # Supabaseに保存
            if upload_to_supabase(loader, result):
                uploaded_count += 1
    
    print("\n" + "=" * 60)
    print(f"✓ 完了: {generated_count}日分のAI推薦を生成")
    print(f"✓ Supabase保存: {uploaded_count}日分")
    print("=" * 60)
    
    print("\n✅ GitHub PagesからSupabase経由で自動的に表示されます。")
    print("   git push は不要です！")


if __name__ == '__main__':
    main()
