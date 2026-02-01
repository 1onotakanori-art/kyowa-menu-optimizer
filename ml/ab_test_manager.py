#!/usr/bin/env python3
"""
A/B テスト実装
従来モデルと新モデルの推奨を比較検証
"""

import json
import numpy as np
from pathlib import Path
from datetime import datetime
from collections import defaultdict
import sys

sys.path.insert(0, str(Path(__file__).parent))

class ABTestManager:
    """A/B テスト管理システム"""
    
    def __init__(self, test_name, test_dir='ml/ab_tests'):
        self.test_name = test_name
        self.test_dir = Path(test_dir)
        self.test_dir.mkdir(parents=True, exist_ok=True)
        self.test_file = self.test_dir / f'{test_name}.json'
        self.test_data = self._load_test_data()
    
    def _load_test_data(self):
        """テストデータをロード"""
        if self.test_file.exists():
            with open(self.test_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        
        return {
            'test_name': self.test_name,
            'created_at': datetime.now().isoformat(),
            'control': {
                'model_type': 'RandomForest (個別メニュー予測)',
                'recommendations': [],
                'user_feedback': []
            },
            'treatment': {
                'model_type': 'Seq2Set Transformer + 栄養制約',
                'recommendations': [],
                'user_feedback': []
            },
            'metrics': {}
        }
    
    def record_recommendation(self, group, date, menus, explanation=''):
        """推奨を記録"""
        if group not in ['control', 'treatment']:
            raise ValueError('group は control または treatment である必要があります')
        
        recommendation = {
            'date': date,
            'timestamp': datetime.now().isoformat(),
            'menus': menus,
            'explanation': explanation
        }
        
        self.test_data[group]['recommendations'].append(recommendation)
        self._save_test_data()
        
        return {
            'group': group,
            'recommendation_id': len(self.test_data[group]['recommendations']) - 1,
            'recorded_at': datetime.now().isoformat()
        }
    
    def record_feedback(self, group, recommendation_id, feedback):
        """フィードバックを記録"""
        if group not in ['control', 'treatment']:
            raise ValueError('group は control または treatment である必要があります')
        
        # フィードバック形式: {'satisfaction': 1-5, 'adoption': True/False, 'comments': '...'}
        feedback_entry = {
            'recommendation_id': recommendation_id,
            'timestamp': datetime.now().isoformat(),
            'data': feedback
        }
        
        self.test_data[group]['user_feedback'].append(feedback_entry)
        self._save_test_data()
        
        return {
            'feedback_id': len(self.test_data[group]['user_feedback']) - 1,
            'recorded_at': datetime.now().isoformat()
        }
    
    def calculate_metrics(self):
        """テストメトリクスを計算"""
        metrics = {}
        
        for group in ['control', 'treatment']:
            feedback = self.test_data[group]['user_feedback']
            
            if not feedback:
                metrics[group] = {
                    'sample_size': 0,
                    'satisfaction': None,
                    'adoption_rate': None
                }
                continue
            
            satisfactions = [f['data']['satisfaction'] for f in feedback]
            adoptions = [f['data']['adoption'] for f in feedback]
            
            metrics[group] = {
                'sample_size': len(feedback),
                'satisfaction': {
                    'mean': np.mean(satisfactions),
                    'std': np.std(satisfactions),
                    'min': np.min(satisfactions),
                    'max': np.max(satisfactions)
                },
                'adoption_rate': np.mean(adoptions),
                'adoption_count': sum(adoptions),
                'rejection_count': len(adoptions) - sum(adoptions)
            }
        
        self.test_data['metrics'] = metrics
        self._save_test_data()
        
        return metrics
    
    def calculate_statistical_significance(self, alpha=0.05):
        """統計的有意性を計算 (t-test)"""
        from scipy import stats
        
        control_feedback = self.test_data['control']['user_feedback']
        treatment_feedback = self.test_data['treatment']['user_feedback']
        
        if not control_feedback or not treatment_feedback:
            return {
                'status': 'insufficient_data',
                'reason': 'コントロール群またはトリートメント群のデータが不足しています'
            }
        
        control_sats = [f['data']['satisfaction'] for f in control_feedback]
        treatment_sats = [f['data']['satisfaction'] for f in treatment_feedback]
        
        t_stat, p_value = stats.ttest_ind(control_sats, treatment_sats)
        
        is_significant = p_value < alpha
        
        return {
            'p_value': p_value,
            'alpha': alpha,
            'is_significant': is_significant,
            'interpretation': (
                'トリートメント群が有意に優れています' if is_significant and np.mean(treatment_sats) > np.mean(control_sats)
                else 'コントロール群が有意に優れています' if is_significant and np.mean(control_sats) > np.mean(treatment_sats)
                else '有意な差がありません'
            )
        }
    
    def generate_report(self):
        """テストレポートを生成"""
        metrics = self.calculate_metrics()
        
        report = {
            'test_name': self.test_name,
            'start_date': self.test_data['created_at'],
            'end_date': datetime.now().isoformat(),
            'control_model': self.test_data['control']['model_type'],
            'treatment_model': self.test_data['treatment']['model_type'],
            'metrics': metrics,
            'statistical_significance': self.calculate_statistical_significance()
        }
        
        return report
    
    def print_report(self):
        """レポートを表示"""
        report = self.generate_report()
        metrics = report['metrics']
        
        print(f"""
╔════════════════════════════════════════════════════════════════════╗
║                 📊 A/B テストレポート                              ║
╚════════════════════════════════════════════════════════════════════╝

【テスト概要】
  テスト名: {report['test_name']}
  開始日: {report['start_date']}
  終了日: {report['end_date']}

【グループ設定】
  コントロール (既存): {report['control_model']}
  トリートメント (新): {report['treatment_model']}

【満足度スコア (1-5)】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")
        
        for group in ['control', 'treatment']:
            m = metrics[group]
            if m['sample_size'] == 0:
                print(f"{group}: データなし")
                continue
            
            sat = m['satisfaction']
            print(f"""
{group.upper()}:
  サンプルサイズ: {m['sample_size']}
  平均満足度: {sat['mean']:.2f} / 5.0 (σ={sat['std']:.2f})
  範囲: {sat['min']:.0f} ~ {sat['max']:.0f}
  採択率: {m['adoption_rate']:.1%} ({m['adoption_count']}採択 / {m['rejection_count']}拒否)
""")
        
        sig = report['statistical_significance']
        print(f"""
【統計的検定 (独立t検定)】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  P値: {sig['p_value']:.4f} (有意水準: {sig['alpha']})
  結論: {sig['interpretation']}
  {'✅ 有意差あり' if sig['is_significant'] else '⚠️ 有意差なし'}
""")
    
    def _save_test_data(self):
        """テストデータをファイルに保存"""
        with open(self.test_file, 'w', encoding='utf-8') as f:
            json.dump(self.test_data, f, ensure_ascii=False, indent=2)
    
    def export_results(self, output_path):
        """結果をエクスポート"""
        report = self.generate_report()
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        return output_path

def demo_ab_test():
    """デモンストレーション"""
    print("""
╔════════════════════════════════════════════════════════════════════╗
║               🧪 A/B テスト実装 - デモンストレーション             ║
╚════════════════════════════════════════════════════════════════════╝

【A/B テストの目的】

  従来モデル (コントロール):
    RandomForest による個別メニュー予測
    └─ ベースライン

  新モデル (トリートメント):
    Seq2Set Transformer + 栄養制約
    └─ 改善版

【テスト指標】

  1. 満足度スコア (1-5 ★)
     └─ ユーザーが推奨メニューにどれほど満足したか

  2. 採択率 (%)
     └─ ユーザーが推奨メニューを実際に選択した割合

  3. 説明理解度 (1-5 ★)
     └─ 推奨理由をどれほど理解できたか

【使用例】

1. A/B テストマネージャーを初期化
   ab_test = ABTestManager('seq2set_vs_rf_test_v1')

2. 推奨を記録
   ab_test.record_recommendation(
     'control',
     '2026-02-01',
     ['蒸し鶏&ブロッコリー', '白菜とツナのさっと煮'],
     'RF推奨'
   )

3. ユーザーフィードバックを記録
   ab_test.record_feedback(
     'control',
     recommendation_id=0,
     feedback={
       'satisfaction': 4,
       'adoption': True,
       'comments': 'タンパク質が多くて良い'
     }
   )

4. レポートを生成
   ab_test.print_report()
   ab_test.export_results('ml/ab_tests/results.json')

【期待される結果】

  満足度スコア:
    コントロール: 平均 3.2 / 5.0
    トリートメント: 平均 3.8 / 5.0
    改善率: +18.75%

  採択率:
    コントロール: 65%
    トリートメント: 78%
    改善率: +20%

【統計的有意性】

  p値 < 0.05: 95%の信頼度で差がある
  結論: 新モデルが優れていることが統計的に証明される

【データ保存】

~/.../ml/ab_tests/
├── seq2set_vs_rf_test_v1.json
├── seq2set_vs_rf_test_v2.json
└── results.json

【次のステップ】

  1. 本番環境でリアルユーザーで実施 (最低30サンプル/グループ)
  2. 週単位でメトリクスを監視
  3. 統計的有意性を確認後、新モデルへ完全移行
  4. 継続的な改善サイクル

""")

if __name__ == '__main__':
    demo_ab_test()
