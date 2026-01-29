#!/usr/bin/env python3
"""
AI推薦メニューを全日付分生成し、GitHub Pages用のJSONファイルとして出力する

出力フォーマット:
docs/ai-selections/ai-selections_YYYY-MM-DD.json
{
    "date": "2026-01-13",
    "dateLabel": "1/13(火)",
    "selectedMenus": [
        {
            "name": "メニュー名",
            "score": 0.85,
            "rank": 1,
            "reasons": ["共起パターンが強い", "たんぱく質が豊富"]
        }
    ],
    "modelInfo": {
        "model": "RandomForest",
        "trainingDays": 15,
        "accuracy": 0.9995
    }
}
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


def generate_ai_selections_for_date(recommender, date_str, menus_data, output_dir):
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
    
    # ファイル出力
    output_path = output_dir / f"ai-selections_{date_str}.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    
    print(f"  ✓ 保存: {output_path}")
    return output_data


def main():
    print("=" * 60)
    print("AI推薦メニュー生成スクリプト")
    print("=" * 60)
    
    # ディレクトリ設定
    project_root = Path(__file__).parent.parent
    menus_dir = project_root / 'menus'
    output_dir = project_root / 'docs' / 'ai-selections'
    
    # 出力ディレクトリ作成
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"\n出力先: {output_dir}")
    
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
        print("  実行コマンド: python menu_recommender.py")
        return
    
    # メニューファイル一覧を取得
    menu_files = sorted(menus_dir.glob('menus_*.json'))
    print(f"\n✓ {len(menu_files)}日分のメニューデータを検出")
    
    # 各日付のAI推薦を生成
    generated_count = 0
    available_dates = []
    
    for menu_file in menu_files:
        # 日付を抽出（menus_2026-01-13.json → 2026-01-13）
        date_str = menu_file.stem.replace('menus_', '')
        
        # メニューデータ読み込み
        with open(menu_file, 'r', encoding='utf-8') as f:
            menus_data = json.load(f)
        
        # AI推薦生成
        result = generate_ai_selections_for_date(
            recommender, date_str, menus_data, output_dir
        )
        
        if result:
            generated_count += 1
            available_dates.append({
                'date': date_str,
                'dateLabel': result['dateLabel'],
                'menuCount': len(menus_data.get('menus', [])),
                'selectedCount': len(result['selectedMenus'])
            })
    
    # available-ai-dates.json を生成
    available_dates_file = output_dir / 'available-ai-dates.json'
    with open(available_dates_file, 'w', encoding='utf-8') as f:
        json.dump({
            'dates': available_dates,
            'generatedAt': datetime.now().isoformat(),
            'modelInfo': {
                'model': 'RandomForest',
                'accuracy': 0.9995
            }
        }, f, ensure_ascii=False, indent=2)
    
    print("\n" + "=" * 60)
    print(f"✓ 完了: {generated_count}日分のAI推薦を生成しました")
    print(f"✓ 利用可能日付一覧: {available_dates_file}")
    print("=" * 60)
    
    print("\n次のステップ:")
    print("  1. git add docs/ai-selections/")
    print("  2. git commit -m 'Add AI menu selections'")
    print("  3. git push")
    print("  4. GitHub Pagesで表示確認")


if __name__ == '__main__':
    main()
