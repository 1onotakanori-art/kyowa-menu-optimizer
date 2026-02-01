#!/usr/bin/env python3
"""
Seq2Set Transformer を使用して、学習したメニューセットを生成
日付ごとに JSON ファイルで出力
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

def get_menu_nutrition(menu_name, menus_dir):
    """全メニューファイルからメニューの栄養情報を取得"""
    for menu_file in menus_dir.glob('menus_*.json'):
        with open(menu_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            for menu in data.get('menus', []):
                if menu.get('name') == menu_name:
                    return menu.get('nutrition', {})
    return {}

def load_data():
    """訓練時と同じロジックでメニューデータを読み込み"""
    menus_dir = Path(__file__).parent.parent / 'menus'
    history_dir = Path(__file__).parent.parent.parent / 'kyowa-menu-history' / 'data' / 'history'
    
    # 利用可能な日付
    menu_files = sorted([f.stem.replace('menus_', '') for f in menus_dir.glob('menus_*.json')])
    history_files = sorted([f.stem for f in history_dir.glob('*.json')])
    common_dates = sorted(set(menu_files) & set(history_files))
    
    print(f"📅 学習期間: {common_dates[0]} ~ {common_dates[-1]} ({len(common_dates)}日)")
    
    # メニューマッピング（訓練時と同じロジック）
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
    
    print(f"🍽️  総メニュー数 (モデル訓練時): {len(all_menus)}")
    
    # 日付ごとのメニュー情報
    sequences = []
    for date in common_dates:
        menu_path = menus_dir / f'menus_{date}.json'
        with open(menu_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            menu_names = [m.get('name') for m in data.get('menus', []) if m.get('name')]
            menu_indices = [menu_to_idx[name] for name in menu_names if name in menu_to_idx]
            if menu_indices:
                sequences.append((date, menu_names, menu_indices))
    
    print(f"✅ {len(sequences)}個の日付データを読み込み\n")
    
    return all_menus, menu_to_idx, idx_to_menu, sequences, all_menu_dicts


def generate_recommendations(date=None, model_path='ml/seq2set_model_best.pth', top_k=4):
    """
    Seq2Set Transformer を使用して推奨メニューセットを生成
    
    Args:
        date: 推奨対象日 (YYYY-MM-DD形式)
        model_path: モデルパス
        top_k: 推奨メニュー数
    """
    device = torch.device('cpu')
    menus_dir = Path(__file__).parent.parent / 'menus'
    
    print("🔄 データをロード中...\n")
    all_menus, menu_to_idx, idx_to_menu, sequences, all_menu_dicts = load_data()
    num_menus = len(all_menus)
    
    print("📚 メニューエンコーダーを準備中...\n")
    encoder = MenuEncoder()
    encoder.prepare_encoder(all_menu_dicts)  # 全メニュー辞書リストを渡す
    
    print("🧠 モデルをロード中...\n")
    model = Seq2SetTransformer(input_dim=68, d_model=128, nhead=4, num_layers=2, num_menus=num_menus)
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.to(device)
    model.eval()
    
    # 栄養値の統計を計算（閾値を動的に決定するため）
    print("📊 栄養統計を分析中...\n")
    all_proteins = []
    all_energies = []
    all_vegetables = []
    
    for menu_dict in all_menu_dicts:
        nutrition = menu_dict.get('nutrition', {})
        try:
            all_proteins.append(float(nutrition.get('たんぱく質', 0)))
            all_energies.append(float(nutrition.get('エネルギー', 0)))
            all_vegetables.append(float(nutrition.get('野菜重量', 0)))
        except:
            pass
    
    # パーセンタイルで動的閾値を計算
    import numpy as np
    protein_75p = np.percentile(all_proteins, 75) if all_proteins else 10
    protein_90p = np.percentile(all_proteins, 90) if all_proteins else 15
    energy_25p = np.percentile(all_energies, 25) if all_energies else 100
    energy_75p = np.percentile(all_energies, 75) if all_energies else 300
    veg_75p = np.percentile(all_vegetables, 75) if all_vegetables else 80
    
    print(f"📈 栄養値の分布:")
    print(f"   タンパク質: 75%値={protein_75p:.1f}g, 90%値={protein_90p:.1f}g")
    print(f"   エネルギー: 25%値={energy_25p:.0f}kcal, 75%値={energy_75p:.0f}kcal")
    print(f"   野菜: 75%値={veg_75p:.0f}g\n")
    
    # 推奨を生成
    recommendations_by_date = {}
    
    for date_str, menu_names, menu_indices in sequences:
        try:
            # メニュー埋め込みを取得
            menu_embeddings = []
            for idx in menu_indices:
                menu_name = idx_to_menu[idx]
                nutrition = all_menus.get(menu_name, {})
                
                # encode_menu の入力形式に合わせる
                menu_dict = {
                    'name': menu_name,
                    'nutrition': nutrition
                }
                embedding = encoder.encode_menu(menu_dict)
                menu_embeddings.append(embedding)
            
            # テンソルに変換
            X = torch.FloatTensor(menu_embeddings).unsqueeze(0).to(device)  # (1, seq_len, 68)
            
            # モデルで推奨を生成
            with torch.no_grad():
                # Transformer エンコーダー出力
                output_logits, _ = model(X)  # (1, num_menus), attentions
                output_probs = torch.sigmoid(output_logits)  # (1, num_menus)
            
            # Top-K を選択
            top_indices = torch.argsort(output_probs[0], descending=True)[:top_k].cpu().numpy()
            
            # 推奨理由を生成する関数
            def generate_recommendation_reason(menu_name, score, rank):
                """推奨理由を生成（動的閾値を使用）"""
                nutrition = get_menu_nutrition(menu_name, menus_dir)
                reasons = []
                
                # スコアに基づく理由
                if score > 0.9:
                    reasons.append("高評価メニュー")
                elif score > 0.75:
                    reasons.append("推奨度高")
                
                # 栄養に基づく理由（動的閾値）
                try:
                    protein = float(nutrition.get('たんぱく質', 0))
                    if protein > protein_90p:
                        reasons.append("タンパク質豊富")
                    elif protein > protein_75p:
                        reasons.append("良好なタンパク質")
                except:
                    pass
                
                try:
                    energy = float(nutrition.get('エネルギー', 0))
                    if energy < energy_25p:
                        reasons.append("低カロリー")
                    elif energy > energy_75p:
                        reasons.append("ボリューム満点")
                except:
                    pass
                
                try:
                    vegetables = float(nutrition.get('野菜重量', 0))
                    if vegetables > veg_75p:
                        reasons.append("野菜たっぷり")
                except:
                    pass
                
                # 脂質情報も追加
                try:
                    fat = float(nutrition.get('脂質', 0))
                    all_fats = [m.get('nutrition', {}).get('脂質', 0) for m in all_menu_dicts]
                    fat_75p = np.percentile([float(f) if f else 0 for f in all_fats], 75)
                    if fat > fat_75p * 1.2:
                        reasons.append("しっかり脂質")
                except:
                    pass
                
                # ランクに基づく理由
                if rank == 1:
                    reasons.append("最優先推奨")
                
                # 理由がない場合はデフォルト
                if not reasons:
                    reasons.append("バランス良好")
                
                return reasons[:2]  # 最大2つまで
            
            # 推奨メニューを取得
            recommended_menus = []
            for rank, idx in enumerate(top_indices, 1):
                menu_name = idx_to_menu[int(idx)]
                score = output_probs[0, idx].item()
                # 全メニューファイルから栄養情報を取得
                nutrition = get_menu_nutrition(menu_name, menus_dir)
                
                # 推奨理由を生成
                reasons = generate_recommendation_reason(menu_name, score, rank)
                
                recommended_menus.append({
                    'rank': rank,
                    'name': menu_name,
                    'score': round(score, 4),
                    'reasons': reasons,
                    'nutrition': {
                        'energy': nutrition.get('エネルギー', 0),
                        'protein': nutrition.get('たんぱく質', 0),
                        'fat': nutrition.get('脂質', 0),
                        'carbs': nutrition.get('炭水化物', 0),
                        'vegetable_weight': nutrition.get('野菜重量', 0),
                        'fiber': nutrition.get('食物繊維', 0)
                    }
                })
            
            # セット全体の理由を生成
            def generate_set_reason(menus_with_reasons):
                """メニューセット全体の選定理由を生成"""
                if not menus_with_reasons:
                    return "バランスの取れたセットです"
                
                reason_parts = []
                
                # 各メニューの主な理由を構築
                for menu in menus_with_reasons:
                    menu_name = menu['name']
                    reasons = menu['reasons']
                    
                    if reasons:
                        # 理由をアイコン化（簡潔版）
                        reason_str = f"{menu_name}は{' / '.join(reasons)}"
                    else:
                        reason_str = f"{menu_name}は栄養バランス良好"
                    
                    reason_parts.append(reason_str)
                
                # セット全体の栄養バランスをチェック
                avg_score = sum(m['score'] for m in menus_with_reasons) / len(menus_with_reasons)
                if avg_score > 0.9:
                    balance = "全体で高スコア維持"
                elif avg_score > 0.7:
                    balance = "全体で安定したスコア"
                else:
                    balance = "全体で多様性を重視"
                
                # セット理由を組み立て
                set_reason = " / ".join(reason_parts) + f" / 全体: {balance}"
                return set_reason
            
            set_reason = generate_set_reason(recommended_menus)
            
            # セット全体の栄養情報を計算
            total_energy = sum(m['nutrition']['energy'] for m in recommended_menus)
            total_protein = sum(m['nutrition']['protein'] for m in recommended_menus)
            total_fat = sum(m['nutrition']['fat'] for m in recommended_menus)
            total_carbs = sum(m['nutrition']['carbs'] for m in recommended_menus)
            
            avg_energy = total_energy / len(recommended_menus) if recommended_menus else 0
            avg_protein = total_protein / len(recommended_menus) if recommended_menus else 0
            
            # PFC バランスを計算
            total_cal = total_energy
            pfc_ratio = {
                'protein': round(total_protein * 4 / (total_cal + 1e-6) * 100, 1),
                'fat': round(total_fat * 9 / (total_cal + 1e-6) * 100, 1),
                'carbs': round(total_carbs * 4 / (total_cal + 1e-6) * 100, 1)
            }
            
            recommendations_by_date[date_str] = {
                'date': date_str,
                'generated_at': datetime.now().isoformat(),
                'model': 'Seq2Set Transformer v1',
                'set_reason': set_reason,
                'recommendations': recommended_menus,
                'nutrition_summary': {
                    'total_energy': round(total_energy, 1),
                    'total_protein': round(total_protein, 1),
                    'total_fat': round(total_fat, 1),
                    'total_carbs': round(total_carbs, 1),
                    'average_energy': round(avg_energy, 1),
                    'average_protein': round(avg_protein, 1)
                },
                'pfc_ratio': pfc_ratio,
                'recommendation_count': len(recommended_menus)
            }
            
            print(f"✅ {date_str}: {len(recommended_menus)}個のメニューを推奨")
            
        except Exception as e:
            print(f"⚠️  {date_str}: 推奨生成エラー - {str(e)}")
            continue
    
    return recommendations_by_date


def save_recommendations(recommendations_by_date):
    """推奨をファイルに保存"""
    output_dir = Path(__file__).parent.parent / 'docs' / 'ai-selections'
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # 日付ごとに保存
    for date, data in recommendations_by_date.items():
        output_file = output_dir / f'ai-selections_{date}.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"💾 保存: {output_file}")
    
    # 利用可能な日付リストも生成
    available_dates = {
        'generated_at': datetime.now().isoformat(),
        'total_dates': len(recommendations_by_date),
        'dates': sorted(recommendations_by_date.keys()),
        'model': 'Seq2Set Transformer v1'
    }
    
    available_file = output_dir / 'available-ai-dates.json'
    with open(available_file, 'w', encoding='utf-8') as f:
        json.dump(available_dates, f, ensure_ascii=False, indent=2)
    print(f"💾 利用可能日付リスト: {available_file}")
    
    return output_dir


if __name__ == '__main__':
    print("=" * 70)
    print("🤖 AI推奨メニューセット生成")
    print("=" * 70)
    print()
    
    try:
        # 推奨を生成
        recommendations_by_date = generate_recommendations(
            model_path='ml/seq2set_model_best.pth',
            top_k=4
        )
        
        print()
        print("=" * 70)
        print(f"✅ {len(recommendations_by_date)}個の日付について推奨を生成しました")
        print("=" * 70)
        print()
        
        # ファイルに保存
        output_dir = save_recommendations(recommendations_by_date)
        
        print()
        print("=" * 70)
        print(f"✅ JSON ファイルを {output_dir} に保存しました")
        print("=" * 70)
        
    except Exception as e:
        print(f"❌ エラーが発生しました: {str(e)}")
        sys.exit(1)
