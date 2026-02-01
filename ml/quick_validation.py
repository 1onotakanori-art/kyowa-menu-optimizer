#!/usr/bin/env python3
"""
簡易性能測定スクリプト
既存モデルで時系列分割検証を実施
"""

import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent))

from menu_recommender import MenuRecommender
import numpy as np

print("\n" + "=" * 70)
print("⚡ 簡易性能測定: 既存モデルの汎化性能")
print("=" * 70 + "\n")

menus_dir = Path('/Users/onotakanori/Apps/kyowa-menu-optimizer/menus')
history_dir = Path('/Users/onotakanori/Apps/kyowa-menu-history/data/history')

# データ読み込み
menu_files = sorted([f.stem.replace('menus_', '') for f in menus_dir.glob('menus_*.json')])
history_files = sorted([f.stem for f in history_dir.glob('*.json')])
common_dates = sorted(set(menu_files) & set(history_files))

print(f"📅 利用可能なデータ: {len(common_dates)}日分\n")

# データを統合
training_data = []
for date in common_dates:
    try:
        menus_path = menus_dir / f'menus_{date}.json'
        with open(menus_path, 'r', encoding='utf-8') as f:
            menus_json = json.load(f)
        
        history_path = history_dir / f'{date}.json'
        with open(history_path, 'r', encoding='utf-8') as f:
            history_json = json.load(f)
        
        selected_names = []
        if 'selectedMenus' in history_json and isinstance(history_json['selectedMenus'], list):
            selected_names = [m['name'] for m in history_json['selectedMenus']]
        elif 'eaten' in history_json:
            selected_names = history_json['eaten']
        
        merged_data = {
            'date': date,
            'dateLabel': menus_json.get('dateLabel', date),
            'allMenus': [
                {
                    'name': menu['name'],
                    'nutrition': menu.get('nutrition', {}),
                    'selected': menu['name'] in selected_names
                }
                for menu in menus_json.get('menus', [])
            ],
            'totalNutrition': history_json.get('totals', {})
        }
        training_data.append(merged_data)
    except Exception as e:
        print(f"⚠️ {date}: {e}")

print(f"✅ データ読み込み完了: {len(training_data)}日分\n")

# 時系列分割: 70% train, 30% test
split_point = int(len(training_data) * 0.7)
train_data = training_data[:split_point]
test_data = training_data[split_point:]

print(f"📚 学習データ: {len(train_data)}日分 ({train_data[0]['date']} ~ {train_data[-1]['date']})")
print(f"🧪 検証データ: {len(test_data)}日分 ({test_data[0]['date']} ~ {test_data[-1]['date']})\n")

# モデル学習
print("🤖 モデルを学習中...\n")
recommender = MenuRecommender()
recommender.training_data = train_data
recommender.prepare_features()
recommender.train_models()

# 検証
print("🧪 検証データで評価中...\n")

correct_menus = 0
total_menus = 0
set_similarities = []
nutrition_errors = []

for day_data in test_data:
    all_menus = day_data['allMenus']
    selected_names = set(m['name'] for m in all_menus if m['selected'])
    num_selected = len(selected_names)
    
    if num_selected == 0:
        continue
    
    # 予測
    predictions = recommender.predict(all_menus)
    pred_names = set(p['name'] for p in predictions[:num_selected])
    
    # メニュー精度
    for name in selected_names:
        total_menus += 1
        if name in pred_names:
            correct_menus += 1
    
    # Jaccard類似度
    if len(pred_names | selected_names) > 0:
        jaccard = len(pred_names & selected_names) / len(pred_names | selected_names)
        set_similarities.append(jaccard)
    
    # 栄養素誤差
    actual_nutrition = day_data['totalNutrition']
    if actual_nutrition:
        pred_nutrition = {'エネルギー': 0, 'たんぱく質': 0, '脂質': 0, '炭水化物': 0}
        for pred in predictions[:num_selected]:
            menu = next((m for m in all_menus if m['name'] == pred['name']), None)
            if menu:
                for key in pred_nutrition:
                    pred_nutrition[key] += menu['nutrition'].get(key, 0)
        
        rmse = np.sqrt(np.mean([
            (actual_nutrition.get(key, 0) - pred_nutrition.get(key, 0)) ** 2
            for key in pred_nutrition.keys()
        ]))
        nutrition_errors.append(rmse)

# 結果表示
print("=" * 70)
print("📊 検証結果")
print("=" * 70 + "\n")

menu_accuracy = correct_menus / total_menus if total_menus > 0 else 0
avg_jaccard = np.mean(set_similarities) if set_similarities else 0
avg_rmse = np.mean(nutrition_errors) if nutrition_errors else 0

print(f"✅ 個別メニュー精度: {menu_accuracy:.1%}")
print(f"   (正解: {correct_menus}/{total_menus})\n")

print(f"✅ セット類似度 (Jaccard):")
print(f"   平均: {avg_jaccard:.3f}")
print(f"   最小: {min(set_similarities):.3f}")
print(f"   最大: {max(set_similarities):.3f}\n")

print(f"✅ 栄養素誤差 (RMSE):")
print(f"   平均: {avg_rmse:.2f}")
print(f"   評価日数: {len(nutrition_errors)}日\n")

# 診断
print("=" * 70)
print("🔍 診断")
print("=" * 70 + "\n")

if menu_accuracy > 0.75 and avg_jaccard > 0.4:
    print("✅ 性能は良好です")
    print("   → 現在のモデルで十分な汎化性能がある可能性")
    print("   → データをさらに収集してから Seq2Set Transformer 検討")
elif menu_accuracy < 0.6 or avg_jaccard < 0.25:
    print("⚠️ 性能が低いです")
    print("   → 過学習または学習データ不足の可能性")
    print("   → Seq2Set Transformer で相互作用を明示的にモデル化推奨")
else:
    print("⚖️ 性能は中程度です")
    print("   → より詳細な検証が必要")
    print("   → validate_model.py で Leave-Future-Out CV を実施推奨")

print("\n" + "=" * 70 + "\n")
