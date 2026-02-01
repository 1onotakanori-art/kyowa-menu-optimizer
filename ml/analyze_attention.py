#!/usr/bin/env python3
"""
Attention マップ可視化
過去のメニュー選択がどのように次の推奨に影響しているかを分析
"""

import numpy as np
import torch
import json
from pathlib import Path
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from datetime import datetime
import sys

sys.path.insert(0, str(Path(__file__).parent))
from menu_encoder import MenuEncoder
from seq2set_transformer import Seq2SetTransformer

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

def analyze_attention(date=None, model_path='ml/seq2set_model_best.pth'):
    """Attention マップを分析"""
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
    
    # 対象日の決定
    if date is None:
        target_idx = len(sequences) - 1
    else:
        target_idx = None
        for i, (d, _, _) in enumerate(sequences):
            if d == date:
                target_idx = i
                break
    
    if target_idx is None:
        print(f"❌ 日付が見つかりません")
        return
    
    target_date = sequences[target_idx][0]
    target_names = sequences[target_idx][1]
    target_indices = sequences[target_idx][2]
    
    print(f"📅 分析対象日: {target_date}")
    print(f"選択メニュー: {', '.join(target_names[:3])}{'...' if len(target_names) > 3 else ''}\n")
    
    # 過去7日間のメニューを収集
    past_menus = []
    past_dates = []
    
    for i in range(max(0, target_idx - 7), target_idx):
        past_menus.extend(sequences[i][1])
        past_dates.append(sequences[i][0])
    
    if not past_menus:
        print("⚠️ 過去データ不足")
        return
    
    # 入力を準備
    input_embedding = prepare_input(sequences[target_idx - 1][2] if target_idx > 0 else [], 
                                    encoder, idx_to_menu, all_menus)
    input_embedding = input_embedding.to(device)
    
    # Forward pass with attention tracking
    with torch.no_grad():
        # モデルを通す前に、入力投影後の値を取得
        x = model.input_projection(input_embedding)  # (1, 7, 128)
        
        # Attention を層ごとに取得
        layer_attentions = []
        for encoder_layer in model.encoder_layers:
            x, attn = encoder_layer(x)
            layer_attentions.append(attn)
        
        scores, _ = model(input_embedding)
    
    # 最終スコア（上位メニュー）
    top_scores, top_indices = torch.topk(scores[0], k=5)
    top_indices = top_indices.cpu().numpy()
    top_scores = top_scores.cpu().numpy()
    
    print("=" * 70)
    print("🎯 推奨メニュー (トップ5)")
    print("=" * 70 + "\n")
    
    for rank, idx in enumerate(top_indices, 1):
        menu_name = idx_to_menu[int(idx)]
        score = top_scores[rank - 1]
        print(f"{rank}. {menu_name:<40} (スコア: {score:.3f})")
    
    # Attention分析
    print("\n" + "=" * 70)
    print("🧠 Attention 分析 (過去への注視度)")
    print("=" * 70 + "\n")
    
    print(f"直近7日のメニュー:\n")
    for i, (d, menus) in enumerate(zip(past_dates, 
                                        [sequences[j][1] for j in range(max(0, target_idx - 7), target_idx)])):
        print(f"  {d}: {', '.join(menus[:2])}{'...' if len(menus) > 2 else ''}")
    
    # Attention weights の統計
    print("\n\n💡 Attention ヘッドの特性分析:\n")
    
    for layer_idx, attn_weights in enumerate(layer_attentions):
        print(f"【Transformer Layer {layer_idx + 1}】")
        
        # attn_weights: (batch, num_heads, query_len, key_len)
        # query_len=key_len=7, num_heads=4
        
        # 平均Attention weights を計算
        avg_attn = attn_weights[0].mean(dim=0).cpu().numpy()  # (7, 7)
        
        # 対角線成分（自己Attention）
        diag_attn = np.diag(avg_attn)
        
        print(f"  自己注視度 (対角線成分):")
        for pos, val in enumerate(diag_attn):
            if pos < target_idx % 7:
                print(f"    位置{pos}: {val:.3f}")
        
        # 最も強い接続
        # 対角線以外の最大値を取得
        off_diag = avg_attn.copy()
        np.fill_diagonal(off_diag, -1)
        max_idx = np.unravel_index(np.argmax(off_diag), off_diag.shape)
        max_val = off_diag[max_idx]
        
        if max_val > 0:
            print(f"  最強接続: 位置{max_idx[1]} → 位置{max_idx[0]} ({max_val:.3f})")
        
        print()
    
    # 推奨理由の生成（Attention に基づく）
    print("=" * 70)
    print("📊 推奨理由 (Attention ベース)")
    print("=" * 70 + "\n")
    
    if len(layer_attentions) > 0:
        avg_attn = layer_attentions[-1][0].mean(dim=0).cpu().numpy()
        
        # 最後の位置（次の推奨対象）に対する注視度
        if avg_attn.shape[0] > 0:
            final_attn = avg_attn[-1] if avg_attn.shape[0] > 1 else avg_attn[0]
            
            # 注視度が高い過去メニューを特定
            important_positions = np.argsort(final_attn)[-3:][::-1]
            
            print("次の推奨に最も影響した過去メニュー:\n")
            for rank, pos in enumerate(important_positions, 1):
                if pos < len(past_dates):
                    past_date = past_dates[pos]
                    past_menus_at_date = sequences[target_idx - 7 + pos][1]
                    attn_val = final_attn[pos]
                    
                    print(f"  {rank}. {past_date}: {', '.join(past_menus_at_date[:2])}")
                    print(f"     注視度: {attn_val:.3f}")
    
    print("\n" + "=" * 70)

if __name__ == '__main__':
    date = sys.argv[1] if len(sys.argv) > 1 else None
    analyze_attention(date)
