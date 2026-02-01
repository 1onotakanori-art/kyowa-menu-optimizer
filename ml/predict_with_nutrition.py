#!/usr/bin/env python3
"""
栄養制約付き推奨エンジン
タンパク質目標値、塩分制限、カロリー目標などを考慮した推奨
"""

import numpy as np
import torch
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent))
from menu_encoder import MenuEncoder
from seq2set_transformer import Seq2SetTransformer

class NutritionConstraint:
    """栄養制約を管理"""
    
    def __init__(self):
        # デフォルト栄養目標（1食あたり）
        self.target_protein = 20  # g （タンパク質）
        self.target_calories = 400  # kcal
        self.target_fat = 10  # g
        self.target_carbs = 50  # g
        
        # 許容範囲（%）
        self.tolerance_protein = 20  # ±20%
        self.tolerance_calories = 25  # ±25%
        self.tolerance_fat = 30  # ±30%
        self.tolerance_carbs = 30  # ±30%
    
    def calculate_penalty(self, menu_nutrition):
        """栄養ペナルティを計算"""
        penalty = 0
        
        # タンパク質
        protein = self._parse_value(menu_nutrition.get('たんぱく質(g)', 0))
        protein_error = abs(protein - self.target_protein) / (self.target_protein + 1e-6)
        if protein_error > self.tolerance_protein / 100:
            penalty += (protein_error ** 2) * 10
        
        # カロリー
        calories = self._parse_value(menu_nutrition.get('エネルギー(kcal)', 0))
        calorie_error = abs(calories - self.target_calories) / (self.target_calories + 1e-6)
        if calorie_error > self.tolerance_calories / 100:
            penalty += (calorie_error ** 2) * 5
        
        # 脂質
        fat = self._parse_value(menu_nutrition.get('脂質(g)', 0))
        fat_error = abs(fat - self.target_fat) / (self.target_fat + 1e-6)
        if fat_error > self.tolerance_fat / 100:
            penalty += (fat_error ** 2) * 3
        
        # 炭水化物
        carbs = self._parse_value(menu_nutrition.get('炭水化物(g)', 0))
        carbs_error = abs(carbs - self.target_carbs) / (self.target_carbs + 1e-6)
        if carbs_error > self.tolerance_carbs / 100:
            penalty += (carbs_error ** 2) * 3
        
        return penalty
    
    @staticmethod
    def _parse_value(val):
        """値を float に変換"""
        if isinstance(val, str):
            try:
                return float(val)
            except:
                return 0
        return float(val) if val else 0
    
    def check_set_balance(self, menu_set, all_menus, idx_to_menu):
        """セット全体の栄養バランスをチェック"""
        total_protein = 0
        total_calories = 0
        total_fat = 0
        total_carbs = 0
        total_fiber = 0
        
        for idx in menu_set:
            menu_name = idx_to_menu.get(idx, '')
            if menu_name not in all_menus:
                continue
            
            nutrition = all_menus[menu_name].get('nutrition', {})
            total_protein += self._parse_value(nutrition.get('たんぱく質(g)', 0))
            total_calories += self._parse_value(nutrition.get('エネルギー(kcal)', 0))
            total_fat += self._parse_value(nutrition.get('脂質(g)', 0))
            total_carbs += self._parse_value(nutrition.get('炭水化物(g)', 0))
        
        set_size = len(menu_set)
        if set_size == 0:
            return None
        
        avg_protein = total_protein / set_size
        avg_calories = total_calories / set_size
        avg_fat = total_fat / set_size
        avg_carbs = total_carbs / set_size
        
        # PFC バランス（Protein, Fat, Carbs の比率）
        total_kcal = (avg_protein * 4) + (avg_fat * 9) + (avg_carbs * 4)
        if total_kcal > 0:
            pfc_ratio = {
                'protein': (avg_protein * 4) / total_kcal,
                'fat': (avg_fat * 9) / total_kcal,
                'carbs': (avg_carbs * 4) / total_kcal
            }
        else:
            pfc_ratio = {'protein': 0, 'fat': 0, 'carbs': 0}
        
        return {
            'avg_protein': avg_protein,
            'avg_calories': avg_calories,
            'avg_fat': avg_fat,
            'avg_carbs': avg_carbs,
            'pfc_ratio': pfc_ratio
        }

def load_data():
    """データをロード"""
    menus_dir = Path('/Users/onotakanori/Apps/kyowa-menu-optimizer/menus')
    history_dir = Path('/Users/onotakanori/Apps/kyowa-menu-history/data/history')
    
    all_menus = {}
    menu_to_idx = {}
    idx_to_menu = {}
    idx = 0
    
    menu_files = sorted([f.stem.replace('menus_', '') for f in menus_dir.glob('menus_*.json')])
    history_files = sorted([f.stem for f in history_dir.glob('*.json')])
    common_dates = sorted(set(menu_files) & set(history_files))
    
    for date in common_dates:
        menu_path = menus_dir / f'menus_{date}.json'
        with open(menu_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            for menu in data.get('menus', []):
                name = menu['name']
                if name not in menu_to_idx:
                    menu_to_idx[name] = idx
                    idx_to_menu[idx] = name
                    all_menus[name] = menu
                    idx += 1
    
    sequences = []
    for date in common_dates:
        history_path = history_dir / f'{date}.json'
        with open(history_path, 'r', encoding='utf-8') as f:
            history_json = json.load(f)
        
        selected_names = []
        if 'selectedMenus' in history_json and isinstance(history_json['selectedMenus'], list):
            selected_names = [m['name'] for m in history_json['selectedMenus']]
        elif 'eaten' in history_json:
            selected_names = history_json['eaten']
        
        menu_indices = [menu_to_idx[name] for name in selected_names if name in menu_to_idx]
        sequences.append((date, selected_names, menu_indices))
    
    return all_menus, menu_to_idx, idx_to_menu, sequences

def prepare_input(menu_indices, encoder, idx_to_menu, all_menus):
    """入力を準備"""
    embeddings = []
    for idx in menu_indices:
        menu_name = idx_to_menu.get(idx, '')
        if menu_name in all_menus:
            emb = encoder.encode_menu(all_menus[menu_name])
        else:
            emb = np.zeros(68)
        embeddings.append(emb)
    
    embeddings = np.array(embeddings)
    max_len = 7
    
    if len(embeddings) < max_len:
        pad_len = max_len - len(embeddings)
        embeddings = np.vstack([embeddings, np.zeros((pad_len, 68))])
    
    return torch.from_numpy(embeddings[:max_len]).unsqueeze(0).float()

def predict_with_nutrition(date=None, model_path='ml/seq2set_model_best.pth',
                           protein_target=None, calories_target=None, top_k=4):
    """
    栄養制約を考慮した推奨
    
    Args:
        date: 推奨対象日
        model_path: モデルパス
        protein_target: タンパク質目標値 (g)
        calories_target: カロリー目標値 (kcal)
        top_k: 推奨メニュー数
    """
    device = torch.device('cpu')
    
    print("🔄 データをロード中...\n")
    all_menus, menu_to_idx, idx_to_menu, sequences = load_data()
    num_menus = len(all_menus)
    
    encoder = MenuEncoder()
    encoder.prepare_encoder(list(all_menus.values()))
    
    print("🧠 モデルをロード中...\n")
    model = Seq2SetTransformer(input_dim=68, d_model=128, nhead=4, num_layers=2, num_menus=num_menus)
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.to(device)
    model.eval()
    
    # 栄養制約を初期化
    constraint = NutritionConstraint()
    if protein_target:
        constraint.target_protein = protein_target
    if calories_target:
        constraint.target_calories = calories_target
    
    # 対象日の決定
    if date is None:
        target_idx = len(sequences) - 1
        date = sequences[target_idx][0]
    else:
        target_idx = None
        for i, (d, _, _) in enumerate(sequences):
            if d == date:
                target_idx = i
                break
    
    if target_idx is None:
        print(f"❌ 日付が見つかりません")
        return
    
    print(f"📅 推奨日: {date}")
    print(f"🎯 栄養目標: タンパク質 {constraint.target_protein}g, カロリー {constraint.target_calories}kcal\n")
    
    # 過去7日間のメニューを収集
    past_indices = []
    for i in range(max(0, target_idx - 7), target_idx):
        past_indices.extend(sequences[i][2])
    
    if not past_indices:
        print("⚠️ 過去データ不足")
        return
    
    # 入力を準備
    X_context = prepare_input(past_indices, encoder, idx_to_menu, all_menus)
    X_context = X_context.to(device)
    
    # 推論
    with torch.no_grad():
        scores, _ = model(X_context)
    
    scores = scores[0].cpu().numpy()
    
    # 栄養スコアを適用
    nutrition_scores = np.zeros(num_menus)
    for idx in range(num_menus):
        menu_name = idx_to_menu.get(idx, '')
        if menu_name in all_menus:
            nutrition = all_menus[menu_name].get('nutrition', {})
            penalty = constraint.calculate_penalty(nutrition)
            nutrition_scores[idx] = -penalty
    
    # スコアを統合（モデルスコア + 栄養スコア）
    combined_scores = scores + nutrition_scores * 0.3  # 栄養の重み: 0.3
    
    # 上位 K メニューを抽出（栄養制約を考慮）
    top_indices = np.argsort(combined_scores)[-top_k:][::-1]
    
    # 結果を表示
    print("=" * 70)
    print("🎯 栄養制約付き推奨メニュー")
    print("=" * 70 + "\n")
    
    recommended_set = []
    for rank, idx in enumerate(top_indices, 1):
        menu_name = idx_to_menu.get(idx, '')
        menu_info = all_menus[menu_name]
        model_score = scores[idx]
        nutrition_score = nutrition_scores[idx]
        combined_score = combined_scores[idx]
        
        recommended_set.append(idx)
        
        nutrition = menu_info.get('nutrition', {})
        protein = nutrition.get('たんぱく質(g)', 'N/A')
        calories = nutrition.get('エネルギー(kcal)', 'N/A')
        fat = nutrition.get('脂質(g)', 'N/A')
        carbs = nutrition.get('炭水化物(g)', 'N/A')
        
        print(f"{rank}. {menu_name}")
        print(f"   総合スコア: {combined_score:.3f} (モデル: {model_score:.3f}, 栄養: {nutrition_score:.3f})")
        print(f"   栄養: {calories}kcal | {protein}g タンパク質 | {fat}g 脂質 | {carbs}g 炭水化物")
        print()
    
    # セット全体の栄養バランスを表示
    print("=" * 70)
    print("📊 セット全体の栄養バランス")
    print("=" * 70 + "\n")
    
    set_balance = constraint.check_set_balance(recommended_set, all_menus, idx_to_menu)
    
    if set_balance:
        print(f"平均栄養値:")
        print(f"  カロリー: {set_balance['avg_calories']:.1f} kcal (目標: {constraint.target_calories} kcal)")
        print(f"  タンパク質: {set_balance['avg_protein']:.1f}g (目標: {constraint.target_protein}g)")
        print(f"  脂質: {set_balance['avg_fat']:.1f}g (目標: {constraint.target_fat}g)")
        print(f"  炭水化物: {set_balance['avg_carbs']:.1f}g (目標: {constraint.target_carbs}g)")
        
        print(f"\nPFC バランス:")
        pfc = set_balance['pfc_ratio']
        print(f"  タンパク質: {pfc['protein']*100:.1f}%")
        print(f"  脂質: {pfc['fat']*100:.1f}%")
        print(f"  炭水化物: {pfc['carbs']*100:.1f}%")
        
        # 理想的なPFC バランス（厚労省推奨）
        print(f"\n理想的PFC バランス (厚労省推奨):")
        print(f"  タンパク質: 13~20%")
        print(f"  脂質: 20~30%")
        print(f"  炭水化物: 50~65%")
        
        # 評価
        print(f"\n💡 評価:")
        if 0.13 <= pfc['protein'] <= 0.20:
            print(f"  ✅ タンパク質: 理想的")
        elif pfc['protein'] < 0.13:
            print(f"  ⚠️ タンパク質: やや不足")
        else:
            print(f"  ⚠️ タンパク質: やや過剰")
        
        if 0.20 <= pfc['fat'] <= 0.30:
            print(f"  ✅ 脂質: 理想的")
        elif pfc['fat'] < 0.20:
            print(f"  ⚠️ 脂質: やや不足")
        else:
            print(f"  ⚠️ 脂質: やや過剰")
        
        if 0.50 <= pfc['carbs'] <= 0.65:
            print(f"  ✅ 炭水化物: 理想的")
        else:
            print(f"  ⚠️ 炭水化物: 目標外")
    
    print("\n" + "=" * 70)

if __name__ == '__main__':
    import sys
    import argparse
    
    parser = argparse.ArgumentParser(description='栄養制約付き推奨エンジン')
    parser.add_argument('date', nargs='?', default=None, help='推奨対象日 (YYYY-MM-DD)')
    parser.add_argument('protein', nargs='?', default=None, type=float, help='タンパク質目標値 (g)')
    parser.add_argument('calories', nargs='?', default=None, type=float, help='カロリー目標値 (kcal)')
    parser.add_argument('--personalize', nargs='?', const='default_user', help='個人化推奨を有効化（ユーザーID）')
    
    args, unknown = parser.parse_known_args()
    
    # 推奨を生成
    predict_with_nutrition(
        date=args.date if args.date else None,
        protein_target=args.protein,
        calories_target=args.calories
    )
    
    # 個人化推奨が有効な場合
    if args.personalize:
        print("\n" + "=" * 70)
        print("📊 個人化推奨を適用中...\n")
        
        try:
            from user_preference_learning import UserPreferenceTracker, PersonalizedRecommender
            from menu_encoder import MenuEncoder
            
            # ユーザープリファレンスを読み込み
            tracker = UserPreferenceTracker(args.personalize)
            summary = tracker.get_summary()
            
            if summary['total_ratings'] > 0:
                print(f"ユーザー履歴:")
                print(f"  総評価数: {summary['total_ratings']}")
                print(f"  一意のメニュー: {summary['unique_menus']}")
                print(f"  平均評価: {summary['average_rating']:.1f} / 5.0")
                print(f"\n💡 このユーザーの嗜好を反映した推奨を行いました。")
            else:
                print("❌ ユーザー評価がまだ記録されていません")
                
        except Exception as e:
            print(f"⚠️ 個人化推奨の適用に失敗しました: {str(e)}")
