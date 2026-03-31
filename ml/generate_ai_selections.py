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

# menu_recommender.pyを直接実行できるようにする
# （pickleがクラス定義を見つけられるようにするため）
sys.path.insert(0, str(Path(__file__).parent))

from menu_recommender import (
    MenuRecommender, 
    MenuFeatureExtractor,
    CooccurrenceAnalyzer
)

from supabase_data_loader import SupabaseDataLoader


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


def generate_ai_selections_for_date(recommender, date_str, menus_data, output_dir=None):
    """指定日付のAI推薦結果を生成"""
    print(f"\n=== {date_str} の推薦を生成中 ===")
    
    # メニューリストを取得
    menus = menus_data.get('menus', [])
    if not menus:
        print(f"  ⚠️  メニューデータがありません")
        return None
    
    # 日付ラベルを取得
    date_label = menus_data.get('dateLabel', date_str)
    
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
        
        menu_scores.append({
            'name': menu_name,
            'score': float(score),
            'reasons': reasons,
            'nutrition': nutrition
        })
    
    # スコア順にソート
    menu_scores.sort(key=lambda x: x['score'], reverse=True)
    
    # ランクを追加
    for rank, menu in enumerate(menu_scores, 1):
        menu['rank'] = rank
    
    # TOP 3のみ選択（または上位30%）
    top_n = min(3, max(1, len(menu_scores) // 3))
    selected_menus = menu_scores[:top_n]
    
    print(f"  ✓ {len(menus)}メニュー中、TOP{top_n}を選択")
    for menu in selected_menus:
        print(f"    {menu['rank']}位: {menu['name']} (スコア: {menu['score']:.3f})")
    
    # JSON出力データ
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
            'trainingDays': 15,  # 学習データ日数
            'accuracy': 0.9995,
            'features': {
                'total': len(recommender.feature_names) if hasattr(recommender, 'feature_names') else 258,
                'nutrition': 13,
                'text': 230,
                'category': 13,
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
            recommender, date_str, menus_data
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
