#!/usr/bin/env python3
"""
検証スクリプト: 時系列分割検証と Leave-Future-Out 交差検証

目的:
- 過学習の有無を確認
- 未来データへの汎化性能を測定
- モデルの信頼性を評価
"""

import json
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime
import sys
from collections import defaultdict
import matplotlib.pyplot as plt
import warnings
warnings.filterwarnings('ignore')

sys.path.insert(0, str(Path(__file__).parent))

from menu_recommender import MenuRecommender


class ValidationStrategy:
    """検証戦略クラス"""
    
    def __init__(self):
        self.training_data = None
        self.results = {
            'time_series_split': {},
            'leave_future_out': [],
            'metrics': defaultdict(list)
        }
    
    def load_data_from_files(self):
        """ファイルから直接データを読み込み"""
        print("📂 データを読み込み中...\n")
        
        menus_dir = Path(__file__).parent.parent / 'menus'
        history_dir = Path(__file__).parent.parent.parent / 'kyowa-menu-history' / 'data' / 'history'
        
        # 利用可能な日付を取得
        menu_files = sorted([f.stem.replace('menus_', '') for f in menus_dir.glob('menus_*.json')])
        history_files = sorted([f.stem for f in history_dir.glob('*.json')])
        
        # 両方に存在する日付のみ
        common_dates = sorted(set(menu_files) & set(history_files))
        
        print(f"📊 全メニュー: {len(menu_files)}日分")
        print(f"📊 選択履歴: {len(history_files)}日分")
        print(f"✅ 統合可能: {len(common_dates)}日分")
        print(f"📅 日付範囲: {common_dates[0]} ~ {common_dates[-1]}\n")
        
        # データを統合
        self.training_data = []
        
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
                
                # データを統合
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
                    'selectedCount': len(selected_names),
                    'totalNutrition': history_json.get('totals', {})
                }
                
                self.training_data.append(merged_data)
                
            except Exception as e:
                print(f"⚠️  {date}: スキップ ({e})")
        
        print(f"✅ データ読み込み完了: {len(self.training_data)}日分\n")
        return self.training_data
    
    def time_series_split_validation(self, test_size=0.2):
        """
        時系列分割検証
        古いデータで学習、新しいデータで検証
        """
        print("=" * 70)
        print("📈 検証戦略 1: 時系列分割")
        print("=" * 70)
        print(f"学習: 古い{100-int(test_size*100)}%のデータ")
        print(f"検証: 新しい{int(test_size*100)}%のデータ\n")
        
        split_point = int(len(self.training_data) * (1 - test_size))
        train_data = self.training_data[:split_point]
        test_data = self.training_data[split_point:]
        
        print(f"📚 学習データ: {len(train_data)}日分 ({train_data[0]['date']} ~ {train_data[-1]['date']})")
        print(f"🧪 検証データ: {len(test_data)}日分 ({test_data[0]['date']} ~ {test_data[-1]['date']})\n")
        
        # モデルを学習
        print("🤖 モデルを学習中...")
        recommender = MenuRecommender()
        
        # 学習データをセット
        recommender.training_data = train_data
        recommender.prepare_features()
        recommender.train_models()
        
        # 検証データで評価
        print("\n🧪 検証データで評価中...\n")
        
        metrics = self._evaluate_on_data(recommender, test_data)
        
        self.results['time_series_split'] = {
            'train_size': len(train_data),
            'test_size': len(test_data),
            'metrics': metrics
        }
        
        self._print_metrics(metrics, "時系列分割検証")
        
        return metrics
    
    def leave_future_out_cv(self, n_splits=5):
        """
        Leave-Future-Out交差検証
        段階的に学習データを増やしながら検証
        """
        print("\n" + "=" * 70)
        print("📈 検証戦略 2: Leave-Future-Out交差検証")
        print("=" * 70)
        print(f"段階的に学習データを増やしながら検証 ({n_splits}分割)\n")
        
        n_samples = len(self.training_data)
        fold_size = n_samples // (n_splits + 1)  # テスト用を確保
        
        for fold in range(n_splits):
            train_size = (fold + 1) * fold_size
            test_start = train_size
            test_end = min(test_start + fold_size, n_samples)
            
            train_data = self.training_data[:train_size]
            test_data = self.training_data[test_start:test_end]
            
            if len(test_data) == 0:
                continue
            
            print(f"\n📍 Fold {fold + 1}/{n_splits}:")
            print(f"   学習: {train_data[0]['date']} ~ {train_data[-1]['date']} ({len(train_data)}日)")
            print(f"   検証: {test_data[0]['date']} ~ {test_data[-1]['date']} ({len(test_data)}日)")
            
            # モデルを学習
            recommender = MenuRecommender()
            recommender.training_data = train_data
            recommender.prepare_features()
            recommender.train_models()
            
            # 検証
            metrics = self._evaluate_on_data(recommender, test_data)
            self.results['leave_future_out'].append({
                'fold': fold + 1,
                'train_size': len(train_data),
                'test_size': len(test_data),
                'date_range': f"{test_data[0]['date']} ~ {test_data[-1]['date']}",
                'metrics': metrics
            })
            
            # 結果を表示
            print(f"   ✅ Menu Accuracy: {metrics['menu_accuracy']:.1%}")
            print(f"   ✅ Set Jaccard: {metrics['set_jaccard']:.3f}")
            print(f"   ✅ Nutrition RMSE: {metrics['nutrition_rmse']:.2f}")
    
    def _evaluate_on_data(self, recommender, test_data):
        """テストデータで評価"""
        menu_predictions = []  # 個別メニューの予測
        set_predictions = []   # セットの予測
        nutrition_predictions = []  # 栄養素の予測
        
        for day_data in test_data:
            all_menus = day_data['allMenus']
            selected_names = set(m['name'] for m in all_menus if m['selected'])
            
            # 個別メニューのスコアを予測
            predictions = recommender.predict(all_menus)
            pred_names = set(p['name'] for p in predictions[:len(selected_names)])
            
            # 個別メニュー精度
            menu_predictions.append({
                'actual': [m['name'] for m in all_menus if m['selected']],
                'predicted': [p['name'] for p in predictions[:len(selected_names)]],
                'scores': [p['score'] for p in predictions]
            })
            
            # セット類似度（Jaccard）
            if len(selected_names) > 0:
                jaccard = len(selected_names & pred_names) / len(selected_names | pred_names)
                set_predictions.append(jaccard)
            
            # 栄養素の誤差
            actual_nutrition = day_data['totalNutrition']
            if actual_nutrition:
                # 予測栄養素を計算
                pred_nutrition = {
                    'エネルギー': 0,
                    'たんぱく質': 0,
                    '脂質': 0,
                    '炭水化物': 0
                }
                
                for pred in predictions[:len(selected_names)]:
                    menu = next((m for m in all_menus if m['name'] == pred['name']), None)
                    if menu:
                        for key in pred_nutrition:
                            pred_nutrition[key] += menu['nutrition'].get(key, 0)
                
                # RMSE計算
                rmse = np.sqrt(np.mean([
                    (actual_nutrition.get(key, 0) - pred_nutrition.get(key, 0)) ** 2
                    for key in pred_nutrition.keys()
                ]))
                nutrition_predictions.append(rmse)
        
        # メトリクスを計算
        menu_accuracy = self._calculate_menu_accuracy(menu_predictions)
        set_jaccard = np.mean(set_predictions) if set_predictions else 0
        nutrition_rmse = np.mean(nutrition_predictions) if nutrition_predictions else 0
        
        return {
            'menu_accuracy': menu_accuracy,
            'set_jaccard': set_jaccard,
            'nutrition_rmse': nutrition_rmse,
            'num_predictions': len(menu_predictions)
        }
    
    def _calculate_menu_accuracy(self, predictions):
        """個別メニューの予測精度を計算"""
        correct = 0
        total = 0
        
        for pred in predictions:
            actual_set = set(pred['actual'])
            pred_set = set(pred['predicted'][:len(pred['actual'])])
            
            # 各メニューについて評価
            for menu in pred['actual']:
                total += 1
                if menu in pred_set:
                    correct += 1
        
        return correct / total if total > 0 else 0
    
    def _print_metrics(self, metrics, title):
        """メトリクスを表示"""
        print(f"\n📊 {title}の結果:")
        print(f"   ✅ 個別メニュー精度: {metrics['menu_accuracy']:.1%}")
        print(f"   ✅ セット類似度（Jaccard）: {metrics['set_jaccard']:.3f}")
        print(f"   ✅ 栄養素 RMSE: {metrics['nutrition_rmse']:.2f}")
        print(f"   ✅ 評価サンプル数: {metrics['num_predictions']}")
    
    def plot_results(self):
        """結果をグラフで表示"""
        print("\n" + "=" * 70)
        print("📊 結果をグラフで可視化中...")
        print("=" * 70 + "\n")
        
        # Leave-Future-Outの結果をプロット
        if self.results['leave_future_out']:
            folds = [r['fold'] for r in self.results['leave_future_out']]
            menu_acc = [r['metrics']['menu_accuracy'] for r in self.results['leave_future_out']]
            jaccard = [r['metrics']['set_jaccard'] for r in self.results['leave_future_out']]
            rmse = [r['metrics']['nutrition_rmse'] for r in self.results['leave_future_out']]
            
            fig, axes = plt.subplots(1, 3, figsize=(15, 4))
            
            # メニュー精度
            axes[0].plot(folds, menu_acc, 'o-', color='#2E86AB', linewidth=2, markersize=8)
            axes[0].set_xlabel('Fold', fontsize=12)
            axes[0].set_ylabel('Menu Accuracy', fontsize=12)
            axes[0].set_title('個別メニュー予測精度', fontsize=13, fontweight='bold')
            axes[0].grid(True, alpha=0.3)
            axes[0].set_ylim([0, 1])
            
            # セット類似度
            axes[1].plot(folds, jaccard, 'o-', color='#A23B72', linewidth=2, markersize=8)
            axes[1].set_xlabel('Fold', fontsize=12)
            axes[1].set_ylabel('Jaccard Similarity', fontsize=12)
            axes[1].set_title('セット類似度', fontsize=13, fontweight='bold')
            axes[1].grid(True, alpha=0.3)
            axes[1].set_ylim([0, 1])
            
            # 栄養素RMSE
            axes[2].plot(folds, rmse, 'o-', color='#F18F01', linewidth=2, markersize=8)
            axes[2].set_xlabel('Fold', fontsize=12)
            axes[2].set_ylabel('Nutrition RMSE', fontsize=12)
            axes[2].set_title('栄養素誤差（RMSE）', fontsize=13, fontweight='bold')
            axes[2].grid(True, alpha=0.3)
            
            plt.tight_layout()
            
            # グラフを保存
            output_path = Path(__file__).parent / 'validation_results.png'
            plt.savefig(output_path, dpi=150, bbox_inches='tight')
            print(f"✅ グラフを保存: {output_path}\n")
            
            # 統計を表示
            print("📈 Leave-Future-Out交差検証の統計:")
            print(f"   メニュー精度: {np.mean(menu_acc):.1%} ± {np.std(menu_acc):.1%}")
            print(f"   セット類似度: {np.mean(jaccard):.3f} ± {np.std(jaccard):.3f}")
            print(f"   栄養素RMSE: {np.mean(rmse):.2f} ± {np.std(rmse):.2f}\n")
    
    def save_results(self):
        """結果をJSONで保存"""
        output_path = Path(__file__).parent / 'validation_results.json'
        
        # 結果をシリアライズ可能な形に変換
        results_serializable = {
            'timestamp': datetime.now().isoformat(),
            'time_series_split': self.results['time_series_split'],
            'leave_future_out': [
                {
                    **r,
                    'metrics': {k: float(v) if isinstance(v, (np.floating, float)) else v 
                               for k, v in r['metrics'].items()}
                }
                for r in self.results['leave_future_out']
            ]
        }
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(results_serializable, f, ensure_ascii=False, indent=2)
        
        print(f"✅ 結果を保存: {output_path}\n")


def main():
    """メイン処理"""
    print("\n" + "=" * 70)
    print("🔍 検証スクリプト: 過学習と汎化性能の診断")
    print("=" * 70 + "\n")
    
    validator = ValidationStrategy()
    
    # データを読み込み
    validator.load_data_from_files()
    
    # 時系列分割検証
    validator.time_series_split_validation(test_size=0.2)
    
    # Leave-Future-Out交差検証
    validator.leave_future_out_cv(n_splits=5)
    
    # 結果を可視化
    validator.plot_results()
    
    # 結果を保存
    validator.save_results()
    
    # 診断結果
    print("=" * 70)
    print("🔍 診断結果")
    print("=" * 70)
    print("""
✅ メトリクスの解釈:
   - Menu Accuracy: 個別メニューの予測精度（高いほど良い）
   - Set Jaccard: 予測セットと実際のセットの類似度（0-1, 高いほど良い）
   - Nutrition RMSE: 栄養素の予測誤差（低いほど良い）

📊 過学習の兆候:
   - Foldが進むにつれてメトリクスが悪化 → 過学習の可能性
   - 検証精度が低い → 未来データへの汎化性能が低い
   - RMSE が大きく変動 → モデルが不安定

💡 次のステップ:
   1. 過学習が確認できたら → Seq2Set Transformer を検討
   2. 汎化性能が十分なら → より複雑なモデルで性能向上を試みる
   3. どちらでも → メニュー間の相互作用を明示的にモデル化

詳細は validation_results.json と validation_results.png を確認してください。
    """)
    print("=" * 70 + "\n")


if __name__ == '__main__':
    main()
