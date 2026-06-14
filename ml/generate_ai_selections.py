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
import re
import sys
from collections import Counter
from pathlib import Path
from datetime import datetime
import numpy as np

TARGET_NUTRITION_KEYS = ['エネルギー', 'たんぱく質', '脂質', '炭水化物', '野菜重量']
COUNT_ERROR_WEIGHT = 0.3

# --- セット構成（あなたが実際に選ぶセットの形を学習して反映する） ---
# 各メニューを「食事の中での役割」に分類する。固定の定食ルールを押し付けるのではなく、
# 過去の選択履歴から役割バランス・品数・好みを学習し、それに近いまとまりを生成する。
MEAL_ROLES = ['staple', 'main', 'side', 'soup', 'dessert']
MEAL_ROLE_LABELS = {
    'staple': '主食',
    'main': '主菜',
    'side': '副菜',
    'soup': '汁物',
    'dessert': 'デザート',
}
MAIN_PROTEINS = {'鶏', '豚', '牛', '魚介', '卵'}
SIDE_PROTEINS = {'大豆', '野菜中心'}

# スコアリングの重み
PREFERENCE_WEIGHT = 2.5   # 好み一致への報酬（中立0.5からの差分に対して）
ROLE_ERROR_WEIGHT = 0.9   # 役割構成が普段のセットからズレることへのペナルティ
REDUNDANCY_BASE = 0.6     # 同一系統メニューの重複ペナルティ


def _normalize_base_name(name):
    """サイズ違い等を吸収した基底名（重複検出用）"""
    base = (name or '').strip()
    base = re.sub(r'(ミニ|ハーフ|大盛り?|小盛り?|（大）|（小）|\(大\)|\(小\)|大盛|小盛)$', '', base)
    return base.strip()


def classify_meal_role(menu_name, claude_cache=None):
    """メニューを食事内の役割に分類: staple/main/side/soup/dessert

    メニュー名と（あれば）Claude解析キャッシュの main_protein を併用して判定する。
    """
    name = menu_name or ''

    if re.search(r'プリン|ケーキ|ヨーグルト|デザート|フルーツ|ゼリー|杏仁|シャーベット|アイス|バナナ', name):
        return 'dessert'
    if re.search(r'味噌汁|みそ汁|豚汁|けんちん|スープ|吸い物|お吸い物', name):
        return 'soup'
    if re.search(r'ライス|ご飯|ごはん|丼|炒飯|チャーハン|カレー|ラーメン|うどん|そば|蕎麦|パスタ|スパゲ|パエリア|ピラフ|焼きそば|麺', name):
        return 'staple'

    if claude_cache and name in claude_cache:
        mp = (claude_cache.get(name) or {}).get('main_protein')
        if mp in MAIN_PROTEINS:
            return 'main'
        if mp in SIDE_PROTEINS:
            return 'side'

    if re.search(r'サラダ|お浸し|おひたし|和え|小鉢|煮浸し|きんぴら|酢の物|冷奴|温野菜|ナムル|ひじき|切干|浅漬|漬物|お新香|めかぶ|もずく|納豆|おかか|白和え', name):
        return 'side'
    if re.search(r'肉|チキン|ポーク|ビーフ|鶏|豚|牛|ハンバーグ|カツ|唐揚|竜田|魚|サーモン|鯖|鮭|さば|あじ|鰯|エビ|海老|イカ|白身|フライ|天ぷら|ステーキ|グリル|ソテー|焼き|フリッター|餃子|シュウマイ|春巻|回鍋肉|麻婆', name):
        return 'main'
    return 'side'

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


def build_historical_set_profile(loader, claude_cache=None, limit=120):
    """過去の選択履歴から、セット単位の目標プロファイルを作る

    栄養合計・PFC比に加えて、ユーザーが実際に選ぶセットの「形」
    （役割構成・品数レンジ）を学習する。
    """
    training_data = loader.get_training_data(limit=limit)
    if not training_data:
        return None

    daily_totals = []
    daily_ratios = []
    daily_counts = []
    daily_role_counts = []

    for day_data in training_data:
        selected = [m for m in day_data.get('allMenus', []) if m.get('selected')]
        if not selected:
            continue

        totals = {k: 0.0 for k in TARGET_NUTRITION_KEYS}
        for menu in selected:
            menu_totals = _extract_nutrition_totals(menu.get('nutrition', {}))
            for key in TARGET_NUTRITION_KEYS:
                totals[key] += menu_totals[key]

        role_counter = Counter(
            classify_meal_role(menu.get('name', ''), claude_cache) for menu in selected
        )

        daily_totals.append(totals)
        daily_ratios.append(_calc_pfc_ratios(totals))
        daily_counts.append(len(selected))
        daily_role_counts.append({r: role_counter.get(r, 0) for r in MEAL_ROLES})

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

    # 役割構成の平均（=普段のセットの形）
    target_role_counts = {
        r: float(np.mean([d[r] for d in daily_role_counts]))
        for r in MEAL_ROLES
    }

    # 実際に選んでいる品数のレンジ（外れ値を避けるため10〜90パーセンタイル）
    count_min = max(1, int(round(np.percentile(daily_counts, 10))))
    count_max = max(count_min, int(round(np.percentile(daily_counts, 90))))
    median_count = float(np.median(daily_counts))

    return {
        'daysUsed': len(daily_totals),
        'avgMenuCount': avg_count,
        'medianMenuCount': median_count,
        'countMin': count_min,
        'countMax': count_max,
        'targetTotals': avg_totals,
        'targetPfcRatio': avg_ratios,
        'targetRoleCounts': target_role_counts,
    }


def _score_set(candidate_set, profile, recommender):
    """候補セットの適合度（低いほど良い）

    栄養合計・PFC比に加えて、(1) あなたの好み一致、(2) 普段のセットの役割構成、
    (3) 同一系統メニューの重複回避 を考慮する。
    """
    totals = {k: 0.0 for k in TARGET_NUTRITION_KEYS}
    names = []
    scores = []
    prefs = []
    roles = []
    base_names = []

    for menu in candidate_set:
        names.append(menu['name'])
        scores.append(menu['score'])
        prefs.append(menu.get('preference', 0.5))
        roles.append(menu.get('role', 'side'))
        base_names.append(menu.get('baseName') or menu['name'])
        for key in TARGET_NUTRITION_KEYS:
            totals[key] += menu['nutritionTotals'][key]

    ratios = _calc_pfc_ratios(totals)
    target_totals = profile['targetTotals']
    target_ratios = profile['targetPfcRatio']
    target_count = max(profile['avgMenuCount'], 1.0)

    # 合計栄養の誤差（相対誤差）— カロリーや量(野菜重量)を目標に近づける
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

    # 役割構成誤差（普段あなたが選ぶセットの形にどれだけ近いか）
    role_counter = Counter(roles)
    target_role_counts = profile.get('targetRoleCounts', {})
    role_error = 0.0
    for r in MEAL_ROLES:
        role_error += abs(role_counter.get(r, 0) - target_role_counts.get(r, 0.0))
    role_error /= target_count

    # 好み（高いほど良い → 中立0.5からの差分を報酬に）
    preference_avg = float(np.mean(prefs)) if prefs else 0.5

    # メニュー単体スコアの高さ（高いほど良いので 1-score を誤差扱い）
    avg_item_quality_error = 1.0 - float(np.mean(scores)) if scores else 1.0

    # 重複ペナルティ（同一系統が重なり「セットとして不自然」になるのを防ぐ）
    redundancy = 0.0
    base_dups = len(base_names) - len(set(base_names))
    redundancy += base_dups * REDUNDANCY_BASE
    # 主菜・主食が普段の枠を超えて重複した場合のペナルティ
    for r in ('main', 'staple'):
        allowed = max(1, int(round(target_role_counts.get(r, 1.0))))
        excess = role_counter.get(r, 0) - allowed
        if excess > 0:
            redundancy += excess * 0.45

    # 共起ボーナス（誤差から減点）— 実際に一緒に選ばれた組み合わせを優遇
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
        + role_error * ROLE_ERROR_WEIGHT
        + count_error * COUNT_ERROR_WEIGHT
        + avg_item_quality_error * 0.30
        + redundancy
        - cooc_bonus
        - (preference_avg - 0.5) * PREFERENCE_WEIGHT
    )

    return {
        'error': float(total_error),
        'totals': totals,
        'ratios': ratios,
        'count': len(candidate_set),
        'cooccurrenceBonus': float(cooc_bonus),
        'preferenceAvg': float(preference_avg),
        'roleCounts': {r: role_counter.get(r, 0) for r in MEAL_ROLES},
        'redundancy': float(redundancy),
    }


def select_best_menu_set(menu_scores, profile, recommender):
    """可変品数の最適セットを探索（ビームサーチ）"""
    if not menu_scores:
        return [], None

    # 探索対象を上位候補に絞る（計算量を制御）。
    # モデルスコアだけでなく「好み」もプールに反映させるため、ブレンド順で上位を採用。
    ranked_for_pool = sorted(
        menu_scores,
        key=lambda m: m['score'] + 0.4 * (m.get('preference', 0.5) - 0.5),
        reverse=True,
    )
    candidate_pool_size = min(max(14, int(profile['avgMenuCount'] * 6)), len(ranked_for_pool), 28)
    candidates = ranked_for_pool[:candidate_pool_size]

    # 実際に選んでいる品数レンジを探索（外れ値を避けた10〜90%tile）
    target_count = int(round(profile['avgMenuCount']))
    min_count = max(1, profile.get('countMin', target_count - 1))
    max_count = min(len(candidates), profile.get('countMax', target_count + 1))
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

    # 役割構成（普段のセットの形）を文章化
    role_counts = set_evaluation.get('roleCounts', {})
    role_parts = [
        f"{MEAL_ROLE_LABELS[r]}{role_counts[r]}"
        for r in MEAL_ROLES
        if role_counts.get(r)
    ]
    role_text = '・'.join(role_parts) if role_parts else 'なし'

    pref_pct = set_evaluation.get('preferenceAvg', 0.5) * 100

    return (
        f"過去{profile['daysUsed']}日のあなたの選び方を学習し、"
        f"普段のセットの形（{role_text}）と好み（一致度{pref_pct:.0f}%）に近づけて選定。"
        f"E/P/F/C/V合計は "
        f"E差{pct_diff(actual['エネルギー'], target['エネルギー']):.0f}%・"
        f"P差{pct_diff(actual['たんぱく質'], target['たんぱく質']):.0f}%・"
        f"V差{pct_diff(actual['野菜重量'], target['野菜重量']):.0f}%、"
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

    # Claude解析キャッシュ（役割分類に使用）
    claude_cache = None
    if recommender.feature_extractor.claude_analyzer:
        claude_cache = recommender.feature_extractor.claude_analyzer.cache

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
        
        # 好みスコア（Claude嗜好プロファイル由来。未使用時は中立0.5）
        preference_score = recommender.feature_extractor.get_preference_score(menu_name)

        # Claude特徴量（学習時にClaude特徴量を使用していた場合のみ追加）
        if use_claude:
            claude_features = recommender.feature_extractor.extract_claude_features(menu_name)
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
            'nutritionTotals': nutrition_totals,
            'preference': float(preference_score),
            'role': classify_meal_role(menu_name, claude_cache),
            'baseName': _normalize_base_name(menu_name),
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
        # 履歴が無い場合の控えめなフォールバック（品数過多を避ける）
        fallback_n = min(3, len(menu_scores))
        selected_menus = menu_scores[:fallback_n]
        set_evaluation = None

    # 食事としての並び順に整える（主食→主菜→副菜→汁物→デザート）
    role_order = {r: i for i, r in enumerate(MEAL_ROLES)}
    selected_menus = sorted(
        selected_menus,
        key=lambda m: (role_order.get(m.get('role', 'side'), 99), m['rank']),
    )

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
                'nutrition': menu['nutrition'],
                'role': menu.get('role', 'side'),
                'roleLabel': MEAL_ROLE_LABELS.get(menu.get('role', 'side'), ''),
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

    # Claude解析キャッシュ（役割分類に使用）
    claude_cache = None
    if recommender.feature_extractor.claude_analyzer:
        claude_cache = recommender.feature_extractor.claude_analyzer.cache

    print("\n📊 過去の選択傾向を集計中...")
    historical_profile = build_historical_set_profile(loader, claude_cache=claude_cache)
    if historical_profile:
        role_summary = '・'.join(
            f"{MEAL_ROLE_LABELS[r]}{historical_profile['targetRoleCounts'][r]:.1f}"
            for r in MEAL_ROLES
            if historical_profile['targetRoleCounts'][r] >= 0.3
        )
        print(
            "✓ セット目標を作成: "
            f"{historical_profile['daysUsed']}日, "
            f"平均{historical_profile['avgMenuCount']:.1f}品 "
            f"(品数{historical_profile['countMin']}〜{historical_profile['countMax']}), "
            f"普段の形: {role_summary or 'なし'}"
        )
    else:
        print("⚠️  学習履歴が不足しているため、従来の上位スコア方式で生成します")

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
