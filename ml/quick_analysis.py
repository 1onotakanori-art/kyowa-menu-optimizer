#!/usr/bin/env python3
"""
簡易検証スクリプト: データの確認と基本的な統計

目的:
- データの状態を確認
- 過学習の簡単な診断
- 手短に結果を出力
"""

import json
from pathlib import Path
from collections import Counter, defaultdict
import numpy as np

def main():
    print("\n" + "=" * 70)
    print("📊 データ状況と基本統計")
    print("=" * 70 + "\n")
    
    menus_dir = Path('/Users/onotakanori/Apps/kyowa-menu-optimizer/menus')
    history_dir = Path('/Users/onotakanori/Apps/kyowa-menu-history/data/history')
    
    # 利用可能な日付を取得
    menu_files = sorted([f.stem.replace('menus_', '') for f in menus_dir.glob('menus_*.json')])
    history_files = sorted([f.stem for f in history_dir.glob('*.json')])
    
    common_dates = sorted(set(menu_files) & set(history_files))
    
    print(f"📊 全メニュー: {len(menu_files)}日分")
    print(f"📊 選択履歴: {len(history_files)}日分")
    print(f"✅ 統合可能: {len(common_dates)}日分")
    print(f"📅 日付範囲: {common_dates[0]} ~ {common_dates[-1]}\n")
    
    # データを分析
    total_menus_count = 0
    total_selections_count = 0
    selection_rates = []
    menu_selection_freq = Counter()
    menu_pair_freq = defaultdict(int)
    nutrition_stats = defaultdict(list)
    
    print("📦 データを分析中...\n")
    
    for date in common_dates:
        try:
            # メニューを読み込み
            menus_path = menus_dir / f'menus_{date}.json'
            with open(menus_path, 'r', encoding='utf-8') as f:
                menus_json = json.load(f)
            
            # 選択履歴を読み込み
            history_path = history_dir / f'{date}.json'
            with open(history_path, 'r', encoding='utf-8') as f:
                history_json = json.load(f)
            
            # 選択されたメニュー名を取得
            selected_names = []
            if 'selectedMenus' in history_json and isinstance(history_json['selectedMenus'], list):
                selected_names = [m['name'] for m in history_json['selectedMenus']]
            elif 'eaten' in history_json and isinstance(history_json['eaten'], list):
                selected_names = history_json['eaten']
            
            all_menus = menus_json.get('menus', [])
            
            # 統計情報を収集
            total_menus_count += len(all_menus)
            total_selections_count += len(selected_names)
            selection_rates.append(len(selected_names) / len(all_menus) if all_menus else 0)
            
            # メニュー選択頻度
            for name in selected_names:
                menu_selection_freq[name] += 1
            
            # メニューペアの共起
            for i, name1 in enumerate(selected_names):
                for name2 in selected_names[i+1:]:
                    pair = tuple(sorted([name1, name2]))
                    menu_pair_freq[pair] += 1
            
            # 栄養素の統計
            for menu in all_menus:
                if menu['name'] in selected_names:
                    nutrition = menu.get('nutrition', {})
                    for key in ['エネルギー', 'たんぱく質', '脂質', '炭水化物']:
                        val = nutrition.get(key, 0)
                        if isinstance(val, (int, float)):
                            nutrition_stats[key].append(val)
            
        except Exception as e:
            print(f"⚠️  {date}: {e}")
    
    print("=" * 70)
    print("📈 データ統計")
    print("=" * 70)
    print(f"\n【全体統計】")
    print(f"  総メニュー数: {total_menus_count}個")
    print(f"  総選択数: {total_selections_count}個")
    print(f"  平均選択率: {np.mean(selection_rates):.1%}")
    print(f"  選択率の範囲: {min(selection_rates):.1%} ~ {max(selection_rates):.1%}")
    
    print(f"\n【よく選ばれるメニュー TOP 10】")
    for i, (menu, count) in enumerate(menu_selection_freq.most_common(10), 1):
        print(f"  {i:2d}. {menu[:30]:30s} {count:3d}回")
    
    print(f"\n【よく一緒に選ばれるペア TOP 10】")
    sorted_pairs = sorted(menu_pair_freq.items(), key=lambda x: -x[1])
    for i, (pair, count) in enumerate(sorted_pairs[:10], 1):
        print(f"  {i:2d}. ({count:2d}回) {pair[0][:20]} ↔ {pair[1][:20]}")
    
    print(f"\n【選択メニューの栄養素統計】")
    for key in ['エネルギー', 'たんぱく質', '脂質', '炭水化物']:
        if nutrition_stats[key]:
            values = nutrition_stats[key]
            print(f"  {key}:")
            print(f"    平均: {np.mean(values):.1f}")
            print(f"    中央値: {np.median(values):.1f}")
            print(f"    標準偏差: {np.std(values):.1f}")
            print(f"    範囲: {min(values):.1f} ~ {max(values):.1f}")
    
    print("\n" + "=" * 70)
    print("🔍 初期診断")
    print("=" * 70)
    
    # 過学習の兆候を診断
    unique_menus = len(menu_selection_freq)
    total_data_points = len(common_dates) * np.mean([len(all_menus) for all_menus in 
                                                      [json.load(open(menus_dir / f'menus_{d}.json'))
                                                       for d in common_dates[:1]]])
    
    print(f"""
【データ量の評価】
  学習データ日数: {len(common_dates)}日
  ユニークメニュー: {unique_menus}個
  データ密度: {total_selections_count / len(common_dates):.1f}選択/日
  
【過学習リスク】
  - データが{len(common_dates)}日分と {'比較的少ない' if len(common_dates) < 30 else '十分ある'}
  - ユニークメニューが{unique_menus}個 {'多いため過学習リスク高' if unique_menus > 100 else '適切' if unique_menus > 50 else 'ユニークメニュー少ない'}
  - 選択率が{np.mean(selection_rates):.1%} {'高く、選別が明確' if np.mean(selection_rates) > 0.3 else '低く、判別が難しい'}
  
【推奨アクション】
  1. ✅ 時系列分割検証で汎化性能を確認
  2. ✅ Leave-Future-Out CVで段階的な性能変化を観察
  3. 📊 過学習が確認されたら → Seq2Set Transformer を検討
  4. 🎯 汎化性能が十分なら → メニュー相互作用を明示的にモデル化
    """)
    
    print("=" * 70 + "\n")


if __name__ == '__main__':
    main()
