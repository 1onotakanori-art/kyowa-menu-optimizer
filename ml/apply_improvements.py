#!/usr/bin/env python3
"""
改善されたレコメンデーションを全日付に適用
既存の ai-selections JSON に複合スコア情報を追加
"""

import json
import torch
import numpy as np
from pathlib import Path
import sys
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))
from menu_encoder import MenuEncoder
from seq2set_transformer import Seq2SetTransformer
from improve_recommendations import (
    DiversityScorer,
    NutritionMatcher,
    AllergenFilter,
    RecommendationImprover
)


def apply_improvements_to_all_dates(
    diversity_weight=0.20,
    nutrition_weight=0.30,
    model_weight=0.50
):
    """
    全日付のAI推奨に改善を適用
    """
    improver = RecommendationImprover()
    
    # データロード
    print("📚 データをロード中...")
    all_menus, menu_to_idx, idx_to_menu, _ = improver.load_data()
    
    # AI推奨ディレクトリから利用可能日付を取得
    ai_dir = Path(__file__).parent.parent / 'docs' / 'ai-selections'
    index_path = ai_dir / 'available-ai-dates.json'
    
    with open(index_path, 'r', encoding='utf-8') as f:
        index_data = json.load(f)
    
    dates = index_data.get('dates', [])
    print(f"\n🔄 {len(dates)}個の日付を処理中...\n")
    
    improvement_stats = {
        'total_dates': len(dates),
        'processed': 0,
        'errors': 0,
        'total_score_improvement': 0,
        'avg_diversity_score': [],
        'avg_nutrition_score': [],
        'avg_composite_score': []
    }
    
    # 各日付の推奨を改善
    for date in dates:
        try:
            ai_path = ai_dir / f'ai-selections_{date}.json'
            
            with open(ai_path, 'r', encoding='utf-8') as f:
                ai_data = json.load(f)
            
            # 元々の推奨
            original_recs = ai_data.get('recommendations', [])
            
            # 改善を適用
            improved_recs = improver.generate_improved_recommendations(
                original_recs,
                all_menus,
                idx_to_menu,
                diversity_weight=diversity_weight,
                nutrition_weight=nutrition_weight,
                model_weight=model_weight,
                exclude_allergens=[]
            )
            
            # 改善済みスコア情報を追加
            for i, rec in enumerate(improved_recs):
                original_recs[i]['composite_score'] = rec['composite_score']
                original_recs[i]['model_score'] = rec['model_score']
                original_recs[i]['diversity_score'] = rec['diversity_score']
                original_recs[i]['nutrition_match_score'] = rec['nutrition_match_score']
                original_recs[i]['score_improvement'] = (
                    rec['composite_score'] - rec['model_score']
                ) if rec['model_score'] > 0 else 0
            
            # 統計を更新
            avg_diversity = np.mean([r['diversity_score'] for r in improved_recs])
            avg_nutrition = np.mean([r['nutrition_match_score'] for r in improved_recs])
            avg_composite = np.mean([r['composite_score'] for r in improved_recs])
            
            improvement_stats['avg_diversity_score'].append(avg_diversity)
            improvement_stats['avg_nutrition_score'].append(avg_nutrition)
            improvement_stats['avg_composite_score'].append(avg_composite)
            
            # 改善済みJSONを保存
            ai_data['recommendations'] = original_recs
            ai_data['improvement_applied'] = True
            ai_data['improvement_config'] = {
                'diversity_weight': diversity_weight,
                'nutrition_weight': nutrition_weight,
                'model_weight': model_weight,
                'applied_at': datetime.now().isoformat()
            }
            ai_data['improvement_stats'] = {
                'avg_diversity_score': float(avg_diversity),
                'avg_nutrition_match_score': float(avg_nutrition),
                'avg_composite_score': float(avg_composite)
            }
            
            with open(ai_path, 'w', encoding='utf-8') as f:
                json.dump(ai_data, f, ensure_ascii=False, indent=2)
            
            print(f"✅ {date}: 多様性{avg_diversity:.3f} | 栄養{avg_nutrition:.3f} | 複合{avg_composite:.3f}")
            improvement_stats['processed'] += 1
            
        except Exception as e:
            print(f"❌ {date}: エラー - {str(e)}")
            improvement_stats['errors'] += 1
    
    # 統計レポート
    print("\n" + "="*70)
    print("📊 改善適用レポート")
    print("="*70)
    print(f"\n✅ 処理完了: {improvement_stats['processed']}/{improvement_stats['total_dates']}個")
    print(f"❌ エラー: {improvement_stats['errors']}個")
    
    if improvement_stats['avg_diversity_score']:
        print(f"\n📈 全日付の平均統計:")
        print(f"  多様性スコア平均: {np.mean(improvement_stats['avg_diversity_score']):.4f}")
        print(f"  栄養マッチ平均: {np.mean(improvement_stats['avg_nutrition_score']):.4f}")
        print(f"  複合スコア平均: {np.mean(improvement_stats['avg_composite_score']):.4f}")
    
    print("\n" + "="*70)
    print(f"✅ 改善済みAI推奨を保存しました: {ai_dir}")
    print("="*70 + "\n")


if __name__ == '__main__':
    apply_improvements_to_all_dates(
        diversity_weight=0.20,
        nutrition_weight=0.30,
        model_weight=0.50
    )
