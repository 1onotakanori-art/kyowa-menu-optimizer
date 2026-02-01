#!/usr/bin/env python3
"""
レコメンデーション改善エンジン
推奨メニューの多様性、栄養バランス、ユーザー目標への適合性を向上
"""

import json
import numpy as np
import torch
from pathlib import Path
from collections import defaultdict
import sys
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))
from menu_encoder import MenuEncoder
from seq2set_transformer import Seq2SetTransformer


class DiversityScorer:
    """多様性スコア計算"""
    
    def calculate_menu_diversity(self, menu_set, all_menus, idx_to_menu):
        """
        メニューセット内の多様性を計算
        栄養値の差異が大きいほど多様性が高い
        """
        if len(menu_set) <= 1:
            return 0.0
        
        # 各メニューの栄養値を取得
        nutrition_vectors = []
        for idx in menu_set:
            menu_name = idx_to_menu.get(idx, '')
            if menu_name in all_menus:
                menu = all_menus[menu_name]
                nutrition = menu.get('nutrition', {})
                
                # 栄養ベクトル (正規化)
                vector = np.array([
                    self._parse_value(nutrition.get('エネルギー', 0)) / 700,  # 正規化
                    self._parse_value(nutrition.get('たんぱく質', 0)) / 40,
                    self._parse_value(nutrition.get('脂質', 0)) / 30,
                    self._parse_value(nutrition.get('炭水化物', 0)) / 100,
                ])
                nutrition_vectors.append(vector)
        
        if len(nutrition_vectors) < 2:
            return 0.0
        
        # ペアワイズの距離を計算
        total_distance = 0
        pair_count = 0
        for i in range(len(nutrition_vectors)):
            for j in range(i + 1, len(nutrition_vectors)):
                distance = np.linalg.norm(nutrition_vectors[i] - nutrition_vectors[j])
                total_distance += distance
                pair_count += 1
        
        # 平均距離を多様性スコアとして返す (0-1 に正規化)
        avg_distance = total_distance / pair_count if pair_count > 0 else 0
        return min(avg_distance, 1.0)
    
    @staticmethod
    def _parse_value(val):
        """値を float に変換"""
        if isinstance(val, str):
            try:
                return float(val)
            except:
                return 0
        return float(val) if val else 0


class NutritionMatcher:
    """栄養マッチング"""
    
    def __init__(self, target_protein=20, target_energy=400, target_fat=10, target_carbs=50):
        """
        Args:
            target_protein: タンパク質目標 (g)
            target_energy: エネルギー目標 (kcal)
            target_fat: 脂質目標 (g)
            target_carbs: 炭水化物目標 (g)
        """
        self.target_protein = target_protein
        self.target_energy = target_energy
        self.target_fat = target_fat
        self.target_carbs = target_carbs
    
    def calculate_match_score(self, menu_nutrition):
        """
        メニューの栄養値が目標値とどの程度マッチしているか計算
        完全一致: 1.0、完全不一致: 0.0
        """
        energy = self._parse_value(menu_nutrition.get('エネルギー', 0))
        protein = self._parse_value(menu_nutrition.get('たんぱく質', 0))
        fat = self._parse_value(menu_nutrition.get('脂質', 0))
        carbs = self._parse_value(menu_nutrition.get('炭水化物', 0))
        
        # 各栄養値の正規化された差異を計算
        energy_error = abs(energy - self.target_energy) / (self.target_energy + 1e-6)
        protein_error = abs(protein - self.target_protein) / (self.target_protein + 1e-6)
        fat_error = abs(fat - self.target_fat) / (self.target_fat + 1e-6)
        carbs_error = abs(carbs - self.target_carbs) / (self.target_carbs + 1e-6)
        
        # 誤差から距離を計算 (1 - 誤差)
        energy_score = max(0, 1 - energy_error)
        protein_score = max(0, 1 - protein_error)
        fat_score = max(0, 1 - fat_error)
        carbs_score = max(0, 1 - carbs_error)
        
        # 加重平均 (タンパク質を最も重視)
        match_score = (
            0.3 * protein_score +  # 30%
            0.3 * energy_score +   # 30%
            0.2 * fat_score +      # 20%
            0.2 * carbs_score      # 20%
        )
        
        return match_score
    
    def calculate_set_balance_score(self, menu_set, all_menus, idx_to_menu):
        """
        メニューセット全体のバランススコアを計算
        タンパク質が充実し、栄養がバランスしている度合い
        """
        if not menu_set:
            return 0.0
        
        total_protein = 0
        total_energy = 0
        total_fat = 0
        total_carbs = 0
        
        for idx in menu_set:
            menu_name = idx_to_menu.get(idx, '')
            if menu_name in all_menus:
                menu = all_menus[menu_name]
                nutrition = menu.get('nutrition', {})
                
                total_protein += self._parse_value(nutrition.get('たんぱく質', 0))
                total_energy += self._parse_value(nutrition.get('エネルギー', 0))
                total_fat += self._parse_value(nutrition.get('脂質', 0))
                total_carbs += self._parse_value(nutrition.get('炭水化物', 0))
        
        # 目標値との比較
        set_size = len(menu_set)
        avg_protein = total_protein / set_size
        avg_energy = total_energy / set_size
        
        # タンパク質スコア (18-25g が理想)
        protein_score = 1.0 - abs(avg_protein - 21.5) / 21.5
        protein_score = max(0, min(1, protein_score))
        
        # エネルギースコア (350-450 kcal が理想)
        energy_score = 1.0 - abs(avg_energy - 400) / 400
        energy_score = max(0, min(1, energy_score))
        
        # PFC バランススコア
        pfc_kcal = (avg_protein * 4) + (total_fat / set_size * 9) + (total_carbs / set_size * 4)
        if pfc_kcal > 0:
            protein_ratio = (avg_protein * 4) / pfc_kcal
            balance_score = 1.0 - abs(protein_ratio - 0.3) / 0.3  # 30% が理想
            balance_score = max(0, min(1, balance_score))
        else:
            balance_score = 0.0
        
        # 総合スコア
        set_balance_score = 0.5 * protein_score + 0.3 * energy_score + 0.2 * balance_score
        return set_balance_score
    
    @staticmethod
    def _parse_value(val):
        """値を float に変換"""
        if isinstance(val, str):
            try:
                return float(val)
            except:
                return 0
        return float(val) if val else 0


class AllergenFilter:
    """アレルゲンベースのフィルタリング"""
    
    COMMON_ALLERGENS = [
        '卵', '乳類', '小麦', 'そば', '落花生',
        '海老', 'カニ', '牛肉', 'くるみ',
        '大豆', '鶏肉', '豚肉'
    ]
    
    def filter_allergens(self, menus, exclude_allergens):
        """
        指定されたアレルゲンを含まないメニューのみを返す
        """
        filtered = []
        for menu in menus:
            nutrition = menu.get('nutrition', {})
            has_allergen = False
            
            for allergen in exclude_allergens:
                if nutrition.get(allergen, '－') == '◯':
                    has_allergen = True
                    break
            
            if not has_allergen:
                filtered.append(menu)
        
        return filtered
    
    def get_allergen_profile(self, menu_nutrition):
        """メニューのアレルゲンプロファイルを取得"""
        allergens = {}
        for allergen in self.COMMON_ALLERGENS:
            allergens[allergen] = menu_nutrition.get(allergen, '－') == '◯'
        return allergens


class RecommendationImprover:
    """レコメンデーション改善エンジン"""
    
    def __init__(self, model_path='ml/seq2set_model_best.pth'):
        self.device = torch.device('cpu')
        self.model_path = model_path
        self.diversity_scorer = DiversityScorer()
        self.nutrition_matcher = NutritionMatcher()
        self.allergen_filter = AllergenFilter()
    
    def load_data(self):
        """訓練時と同じロジックでデータをロード"""
        menus_dir = Path(__file__).parent.parent / 'menus'
        history_dir = Path(__file__).parent.parent.parent / 'kyowa-menu-history' / 'data' / 'history'
        
        menu_files = sorted([f.stem.replace('menus_', '') for f in menus_dir.glob('menus_*.json')])
        history_files = sorted([f.stem for f in history_dir.glob('*.json')])
        common_dates = sorted(set(menu_files) & set(history_files))
        
        all_menus = {}
        menu_to_idx = {}
        idx_to_menu = {}
        idx = 0
        all_menu_dicts = []
        
        for date in common_dates:
            menu_path = menus_dir / f'menus_{date}.json'
            with open(menu_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for menu in data.get('menus', []):
                    name = menu.get('name')
                    if name and name not in menu_to_idx:
                        menu_to_idx[name] = idx
                        idx_to_menu[idx] = name
                        all_menus[name] = menu
                        all_menu_dicts.append(menu)
                        idx += 1
        
        print(f"🍽️  総メニュー数: {len(all_menus)}")
        return all_menus, menu_to_idx, idx_to_menu, all_menu_dicts
    
    def generate_improved_recommendations(
        self,
        recommendations,
        all_menus,
        idx_to_menu,
        diversity_weight=0.2,
        nutrition_weight=0.3,
        model_weight=0.5,
        exclude_allergens=None
    ):
        """
        複合スコアを使用して推奨メニューを改善
        
        Args:
            recommendations: モデルが生成した推奨メニュー
            diversity_weight: 多様性スコアの重み (0-1)
            nutrition_weight: 栄養マッチスコアの重み (0-1)
            model_weight: モデルスコアの重み (0-1)
            exclude_allergens: 除外するアレルゲンリスト
        
        Returns:
            改善されたスコアで再ランク付けされた推奨メニュー
        """
        if exclude_allergens is None:
            exclude_allergens = []
        
        # 正規化係数を確認
        total_weight = diversity_weight + nutrition_weight + model_weight
        if total_weight == 0:
            total_weight = 1.0
        
        improved_recs = []
        menu_indices = set()
        
        for rec in recommendations:
            menu_name = rec['name']
            
            # モデルスコア
            model_score = rec.get('score', 0.5)
            
            # 多様性スコア (既に選択されたメニューとの差異)
            if menu_indices:
                # 選択済みメニューとの多様性を計算
                selected_menu_set = list(menu_indices)
                diversity_score = self.diversity_scorer.calculate_menu_diversity(
                    selected_menu_set, all_menus, idx_to_menu
                )
            else:
                diversity_score = 0.5  # 最初のメニューはニュートラル
            
            # 栄養マッチスコア
            nutrition = all_menus.get(menu_name, {}).get('nutrition', {})
            nutrition_match_score = self.nutrition_matcher.calculate_match_score(nutrition)
            
            # アレルゲンフィルター
            if exclude_allergens:
                has_allergen = False
                for allergen in exclude_allergens:
                    if nutrition.get(allergen, '－') == '◯':
                        has_allergen = True
                        break
                
                if has_allergen:
                    continue  # アレルゲンを含むメニューはスキップ
            
            # 複合スコア
            composite_score = (
                (model_weight / total_weight) * model_score +
                (diversity_weight / total_weight) * diversity_score +
                (nutrition_weight / total_weight) * nutrition_match_score
            )
            
            improved_recs.append({
                'name': menu_name,
                'original_score': rec.get('score', 0),
                'composite_score': composite_score,
                'model_score': model_score,
                'diversity_score': diversity_score,
                'nutrition_match_score': nutrition_match_score,
                'nutrition': nutrition
            })
            
            menu_indices.add(menu_name)
        
        # 複合スコアでソート
        improved_recs.sort(key=lambda x: x['composite_score'], reverse=True)
        
        return improved_recs
    
    def analyze_improvement(self, original_recs, improved_recs):
        """
        改善前後の推奨品質を分析
        """
        print("\n" + "="*70)
        print("📊 レコメンデーション改善分析")
        print("="*70)
        
        # スコア統計
        orig_scores = [r.get('score', 0) for r in original_recs]
        improved_scores = [r['composite_score'] for r in improved_recs]
        
        print(f"\n📈 スコア統計:")
        print(f"  元々のモデルスコア平均: {np.mean(orig_scores):.4f}")
        print(f"  改善後の複合スコア平均: {np.mean(improved_scores):.4f}")
        print(f"  改善率: {(np.mean(improved_scores) - np.mean(orig_scores)) / np.mean(orig_scores) * 100:.1f}%")
        
        # 多様性分析
        diversity_scores = [r['diversity_score'] for r in improved_recs]
        print(f"\n🎨 多様性スコア:")
        print(f"  平均: {np.mean(diversity_scores):.4f}")
        print(f"  最小: {np.min(diversity_scores):.4f}")
        print(f"  最大: {np.max(diversity_scores):.4f}")
        
        # 栄養マッチ分析
        nutrition_scores = [r['nutrition_match_score'] for r in improved_recs]
        print(f"\n🥗 栄養マッチスコア:")
        print(f"  平均: {np.mean(nutrition_scores):.4f}")
        print(f"  最小: {np.min(nutrition_scores):.4f}")
        print(f"  最大: {np.max(nutrition_scores):.4f}")
        
        # メニュー多様性
        print(f"\n📋 推奨メニュー:")
        for i, rec in enumerate(improved_recs, 1):
            print(f"  {i}. {rec['name']}")
            print(f"     複合スコア: {rec['composite_score']:.4f}")
            print(f"     モデル: {rec['model_score']:.4f} | 多様性: {rec['diversity_score']:.4f} | 栄養: {rec['nutrition_match_score']:.4f}")
        
        print("\n" + "="*70)


def main():
    print("\n" + "="*70)
    print("🚀 レコメンデーション改善エンジン")
    print("="*70)
    
    # 改善エンジンを初期化
    improver = RecommendationImprover()
    
    print("\n📚 データをロード中...")
    all_menus, menu_to_idx, idx_to_menu, all_menu_dicts = improver.load_data()
    
    # テスト用の推奨メニューを生成 (元々のシステムから)
    test_recommendations = [
        {
            'rank': 1,
            'name': '白菜とツナのさっと煮',
            'score': 0.768,
            'nutrition': all_menus.get('白菜とツナのさっと煮', {}).get('nutrition', {})
        },
        {
            'rank': 2,
            'name': '白身魚としめじの蒸し物　ぽん酢だれ',
            'score': 0.7672,
            'nutrition': all_menus.get('白身魚としめじの蒸し物　ぽん酢だれ', {}).get('nutrition', {})
        },
        {
            'rank': 3,
            'name': 'たんぱく質の摂れる小鉢 蒸し鶏＆ブロッコリー',
            'score': 0.7672,
            'nutrition': all_menus.get('たんぱく質の摂れる小鉢 蒸し鶏＆ブロッコリー', {}).get('nutrition', {})
        },
        {
            'rank': 4,
            'name': '野菜とベーコンのあっさり和風醤油炒め',
            'score': 0.767,
            'nutrition': all_menus.get('野菜とベーコンのあっさり和風醤油炒め', {}).get('nutrition', {})
        }
    ]
    
    # テスト用に存在するメニューのみ使用
    test_recommendations = [
        rec for rec in test_recommendations
        if rec['name'] in all_menus
    ]
    
    print(f"\n✅ テスト用推奨メニュー: {len(test_recommendations)}個")
    
    # 改善
    print("\n🔄 改善中...")
    improved_recommendations = improver.generate_improved_recommendations(
        test_recommendations,
        all_menus,
        idx_to_menu,
        diversity_weight=0.25,
        nutrition_weight=0.25,
        model_weight=0.50,
        exclude_allergens=[]
    )
    
    # 分析
    improver.analyze_improvement(test_recommendations, improved_recommendations)
    
    print("\n" + "="*70)
    print("✅ レコメンデーション改善完了")
    print("="*70 + "\n")


if __name__ == '__main__':
    main()
