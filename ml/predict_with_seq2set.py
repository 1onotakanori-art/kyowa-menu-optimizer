#!/usr/bin/env python3
"""
Seq2Set Transformer 推論スクリプト
前7日のメニュー履歴から次の日の推奨メニューセットを生成
"""

import numpy as np
import torch
import json
from pathlib import Path
from datetime import datetime, timedelta
import sys

sys.path.insert(0, str(Path(__file__).parent))
from menu_encoder import MenuEncoder
from seq2set_transformer import Seq2SetTransformer

def load_menus_and_history():
    """メニューと選択履歴をロード"""
    menus_dir = Path('/Users/onotakanori/Apps/kyowa-menu-optimizer/menus')
    history_dir = Path('/Users/onotakanori/Apps/kyowa-menu-history/data/history')
    
    # メニューマッピング
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
    
    # 履歴をロード
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
        sequences.append((date, menu_indices))
    
    return all_menus, menu_to_idx, idx_to_menu, sequences

def prepare_context_embedding(menu_indices, encoder, idx_to_menu, all_menus, num_menus):
    """過去7日間のメニューから文脈埋め込みを準備"""
    embeddings = []
    
    for idx in menu_indices:
        menu_name = idx_to_menu.get(idx, '')
        if menu_name in all_menus:
            emb = encoder.encode_menu(all_menus[menu_name])
        else:
            emb = np.zeros(68)
        embeddings.append(emb)
    
    embeddings = np.array(embeddings)
    
    # パディング（最大7日分を想定）
    max_len = 7
    if len(embeddings) < max_len:
        pad_len = max_len - len(embeddings)
        embeddings = np.vstack([embeddings, np.zeros((pad_len, 68))])
    
    return torch.from_numpy(embeddings[:max_len]).unsqueeze(0).float()

def compute_nutrition_stats(menu_indices, idx_to_menu, all_menus):
    """現在の栄養統計を計算"""
    stats = {
        'energy': [],
        'protein': [],
        'fat': [],
        'carbs': [],
        'vitamin_c': []
    }
    
    for idx in menu_indices:
        menu_name = idx_to_menu.get(idx, '')
        if menu_name not in all_menus:
            continue
        
        nutrition = all_menus[menu_name].get('nutrition', {})
        
        def safe_float(key):
            val = nutrition.get(key, 0)
            if isinstance(val, str):
                try:
                    return float(val)
                except:
                    return 0
            return val
        
        stats['energy'].append(safe_float('エネルギー(kcal)'))
        stats['protein'].append(safe_float('たんぱく質(g)'))
        stats['fat'].append(safe_float('脂質(g)'))
        stats['carbs'].append(safe_float('炭水化物(g)'))
        stats['vitamin_c'].append(safe_float('ビタミンC(mg)'))
    
    return {
        'avg_energy': np.mean(stats['energy']) if stats['energy'] else 0,
        'avg_protein': np.mean(stats['protein']) if stats['protein'] else 0,
        'avg_fat': np.mean(stats['fat']) if stats['fat'] else 0,
        'avg_carbs': np.mean(stats['carbs']) if stats['carbs'] else 0,
        'avg_vitamin_c': np.mean(stats['vitamin_c']) if stats['vitamin_c'] else 0,
    }

def generate_explanation(predicted_set, all_menus, idx_to_menu, past_indices, past_stats):
    """推奨の理由を生成"""
    explanations = []
    
    # 1. メニューセットの多様性
    predicted_names = [idx_to_menu.get(idx, '') for idx in predicted_set]
    categories = {'meat': 0, 'fish': 0, 'vegetable': 0, 'soup': 0}
    
    category_keywords = {
        'meat': ['肉', '鶏', '豚'],
        'fish': ['魚', 'さば', 'まぐろ'],
        'vegetable': ['野菜', 'サラダ', 'ブロッコリー'],
        'soup': ['汁', 'スープ'],
    }
    
    for name in predicted_names:
        for cat, keywords in category_keywords.items():
            if any(kw in name for kw in keywords):
                categories[cat] += 1
    
    if len(predicted_names) > 0:
        if categories['meat'] > 0:
            explanations.append(f"🍗 タンパク質補給: {categories['meat']}個の肉類")
        if categories['vegetable'] > 0:
            explanations.append(f"🥦 ビタミン補給: {categories['vegetable']}個の野菜類")
        if categories['fish'] > 0:
            explanations.append(f"🐟 栄養バランス: {categories['fish']}個の魚類")
    
    # 2. 前日との違い
    past_names = [idx_to_menu.get(idx, '') for idx in past_indices[-3:]]  # 直近3日
    repeated = len(set(predicted_names) & set(past_names))
    unique_new = len(set(predicted_names) - set(past_names))
    
    if unique_new > 0:
        explanations.append(f"✨ 新メニュー: {unique_new}個 (飽きを防止)")
    if repeated > 0:
        explanations.append(f"♻️ 既選定: {repeated}個 (人気メニュー)")
    
    # 3. 栄養バランス
    new_stats = compute_nutrition_stats(predicted_set, idx_to_menu, all_menus)
    protein_change = new_stats['avg_protein'] - past_stats['avg_protein']
    if protein_change > 2:
        explanations.append(f"💪 タンパク質強化: +{protein_change:.1f}g/平均")
    elif protein_change < -2:
        explanations.append(f"⚖️ タンパク質調整: {protein_change:.1f}g/平均")
    
    return explanations

def predict_menu_set(date=None, model_path='ml/seq2set_model_best.pth', top_k=4):
    """
    推奨メニューセットを予測
    
    Args:
        date: 予測対象日 (None で最新日の次の日)
        model_path: モデルファイルパス
        top_k: 推奨メニュー数
    """
    device = torch.device('cpu')
    
    # データロード
    print("🔄 データをロード中...\n")
    all_menus, menu_to_idx, idx_to_menu, sequences = load_menus_and_history()
    num_menus = len(all_menus)
    
    # エンコーダー準備
    encoder = MenuEncoder()
    encoder.prepare_encoder(list(all_menus.values()))
    
    # モデルロード
    print("🧠 モデルをロード中...\n")
    model = Seq2SetTransformer(input_dim=68, d_model=128, nhead=4, num_layers=2, num_menus=num_menus)
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.to(device)
    model.eval()
    
    # 対象日の決定
    if date is None:
        target_idx = len(sequences) - 1
        date = sequences[target_idx][0]
    else:
        target_idx = None
        for i, (d, _) in enumerate(sequences):
            if d == date:
                target_idx = i
                break
        if target_idx is None:
            print(f"❌ 日付 {date} が見つかりません")
            return
    
    print(f"📅 推奨日: {date}\n")
    
    # 過去7日間のメニューを収集
    past_indices = []
    for i in range(max(0, target_idx - 7), target_idx):
        past_indices.extend(sequences[i][1])
    
    if not past_indices:
        print("⚠️ 十分な過去データがありません")
        return
    
    # 文脈埋め込みを準備
    X_context = prepare_context_embedding(past_indices, encoder, idx_to_menu, all_menus, num_menus)
    X_context = X_context.to(device)
    
    # 推論
    with torch.no_grad():
        scores, attentions = model(X_context)
    
    # 上位 K メニューを抽出
    top_scores, top_indices = torch.topk(scores[0], k=top_k)
    top_indices = top_indices.cpu().numpy()
    top_scores = top_scores.cpu().numpy()
    
    # 結果を表示
    print("=" * 70)
    print("🎯 推奨メニューセット")
    print("=" * 70 + "\n")
    
    recommended_set = []
    for rank, idx in enumerate(top_indices, 1):
        menu_name = idx_to_menu[int(idx)]
        menu_info = all_menus[menu_name]
        score = top_scores[rank - 1]
        recommended_set.append(int(idx))
        
        nutrition = menu_info.get('nutrition', {})
        energy = nutrition.get('エネルギー(kcal)', 'N/A')
        protein = nutrition.get('たんぱく質(g)', 'N/A')
        
        print(f"{rank}. {menu_name}")
        print(f"   推奨度: {score:.3f}")
        print(f"   エネルギー: {energy} kcal | たんぱく質: {protein}g")
        print()
    
    # 説明を生成
    print("=" * 70)
    print("💡 推奨理由")
    print("=" * 70 + "\n")
    
    past_stats = compute_nutrition_stats(past_indices, idx_to_menu, all_menus)
    explanations = generate_explanation(recommended_set, all_menus, idx_to_menu, past_indices, past_stats)
    
    for exp in explanations:
        print(f"  {exp}")
    
    print("\n" + "=" * 70)
    print("📊 栄養バランス比較")
    print("=" * 70 + "\n")
    
    new_stats = compute_nutrition_stats(recommended_set, idx_to_menu, all_menus)
    
    print(f"過去7日平均:")
    print(f"  エネルギー: {past_stats['avg_energy']:.1f} kcal")
    print(f"  タンパク質: {past_stats['avg_protein']:.1f}g")
    print()
    print(f"推奨セット平均:")
    print(f"  エネルギー: {new_stats['avg_energy']:.1f} kcal ({new_stats['avg_energy']-past_stats['avg_energy']:+.1f})")
    print(f"  タンパク質: {new_stats['avg_protein']:.1f}g ({new_stats['avg_protein']-past_stats['avg_protein']:+.1f})")
    print()

if __name__ == '__main__':
    import sys
    date = sys.argv[1] if len(sys.argv) > 1 else None
    predict_menu_set(date)
