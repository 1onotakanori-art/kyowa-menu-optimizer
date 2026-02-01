#!/usr/bin/env python3
"""
Seq2Set Transformer 学習スクリプト
時系列分割で過学習を回避
"""

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
import json
from pathlib import Path
from collections import defaultdict
import sys

# 同一ディレクトリのモジュールをインポート
sys.path.insert(0, str(Path(__file__).parent))
from menu_encoder import MenuEncoder
from seq2set_transformer import Seq2SetTransformer, MenuSetDataset, JaccardLoss

def load_training_data():
    """学習データをロード"""
    menus_dir = Path('/Users/onotakanori/Apps/kyowa-menu-optimizer/menus')
    history_dir = Path('/Users/onotakanori/Apps/kyowa-menu-history/data/history')
    
    # 利用可能な日付
    menu_files = sorted([f.stem.replace('menus_', '') for f in menus_dir.glob('menus_*.json')])
    history_files = sorted([f.stem for f in history_dir.glob('*.json')])
    common_dates = sorted(set(menu_files) & set(history_files))
    
    print(f"📅 学習期間: {common_dates[0]} ~ {common_dates[-1]} ({len(common_dates)}日)\n")
    
    # メニューマッピング（名前 → インデックス）
    all_menus = {}
    menu_to_idx = {}
    idx_to_menu = {}
    idx = 0
    
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
    
    print(f"🍽️  総メニュー数: {len(all_menus)}\n")
    
    # データシーケンスを構築
    sequences = []  # (date, menu_indices)
    
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
    
    return sequences, all_menus, menu_to_idx, idx_to_menu

def create_time_series_split(sequences, seq_length=7, min_train_dates=7):
    """時系列分割: 過去seq_length日から次の日を予測"""
    X_train, y_train = [], []
    X_test, y_test = [], []
    test_dates = []
    
    for i in range(seq_length, len(sequences)):
        # 過去 seq_length 日間
        input_indices = []
        for j in range(i - seq_length, i):
            input_indices.extend(sequences[j][1])
        
        # 次の日のメニュー
        target_indices = sequences[i][1]
        
        if len(input_indices) > 0:
            if i >= min_train_dates + seq_length:
                X_train.append(input_indices)
                y_train.append(target_indices)
            else:
                X_test.append(input_indices)
                y_test.append(target_indices)
                test_dates.append(sequences[i][0])
    
    print(f"📊 データ分割:")
    print(f"   訓練: {len(X_train)}サンプル (最初{min_train_dates}日は検証用)")
    print(f"   検証: {len(X_test)}サンプル (日付: {test_dates})\n")
    
    return (X_train, y_train), (X_test, y_test), test_dates

def prepare_batch(input_indices_list, all_menus, encoder, num_menus, device):
    """バッチデータを準備"""
    batch_X = []
    max_len = max(len(x) for x in input_indices_list) if input_indices_list else 1
    
    for input_indices in input_indices_list:
        # メニュー埋め込みを取得
        embeddings = []
        for idx in input_indices:
            menu_name = idx_to_menu.get(idx, '')
            if menu_name in all_menus:
                emb = encoder.encode_menu(all_menus[menu_name])
            else:
                emb = np.zeros(68)
            embeddings.append(emb)
        
        # パディング
        embeddings = np.array(embeddings)
        if len(embeddings) < max_len:
            pad_len = max_len - len(embeddings)
            embeddings = np.vstack([embeddings, np.zeros((pad_len, 68))])
        
        batch_X.append(embeddings)
    
    return torch.from_numpy(np.array(batch_X)).float().to(device)

def prepare_target(target_indices_list, num_menus, device):
    """ターゲットをバイナリベクトルに変換"""
    batch_y = []
    for target_indices in target_indices_list:
        y_vec = np.zeros(num_menus)
        for idx in target_indices:
            y_vec[idx] = 1.0
        batch_y.append(y_vec)
    
    return torch.from_numpy(np.array(batch_y)).float().to(device)

def train_model():
    """モデル学習"""
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"🖥️  デバイス: {device}\n")
    
    # データロード
    print("🔄 データをロード中...\n")
    sequences, all_menus, menu_to_idx, idx_to_menu_map = load_training_data()
    global idx_to_menu
    idx_to_menu = idx_to_menu_map
    num_menus = len(all_menus)
    
    # エンコーダー準備
    encoder = MenuEncoder()
    encoder.prepare_encoder(list(all_menus.values()))
    
    # 時系列分割
    (X_train, y_train), (X_test, y_test), test_dates = create_time_series_split(
        sequences, seq_length=7, min_train_dates=7
    )
    
    if len(X_train) == 0:
        print("❌ 訓練データが不足しています")
        return
    
    # モデル初期化
    print("🧠 モデルを初期化中...\n")
    model = Seq2SetTransformer(input_dim=68, d_model=128, nhead=4, num_layers=2, num_menus=num_menus)
    model.to(device)
    
    # オプティマイザーと損失関数
    optimizer = optim.Adam(model.parameters(), lr=0.001, weight_decay=1e-5)
    criterion = JaccardLoss()
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', factor=0.5, patience=5, verbose=True)
    
    # 学習ループ
    epochs = 50
    batch_size = 4
    best_val_loss = float('inf')
    patience_counter = 0
    max_patience = 10
    
    print("🚀 学習を開始します...\n")
    
    for epoch in range(epochs):
        # 訓練
        model.train()
        train_loss = 0.0
        train_jaccard = 0.0
        
        for i in range(0, len(X_train), batch_size):
            batch_inputs = X_train[i:i+batch_size]
            batch_targets = y_train[i:i+batch_size]
            
            X_batch = prepare_batch(batch_inputs, all_menus, encoder, num_menus, device)
            y_batch = prepare_target(batch_targets, num_menus, device)
            
            optimizer.zero_grad()
            scores, _ = model(X_batch)
            loss = criterion(scores, y_batch)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            
            train_loss += loss.item()
            
            # Jaccard 計算
            with torch.no_grad():
                pred_binary = (scores > 0.5).float()
                for j in range(len(batch_targets)):
                    intersection = (pred_binary[j] * y_batch[j]).sum()
                    union = ((pred_binary[j] + y_batch[j]) > 0).sum()
                    jaccard = intersection / (union + 1e-8)
                    train_jaccard += jaccard.item()
        
        train_loss /= max(len(X_train) // batch_size, 1)
        train_jaccard /= max(len(X_train), 1)
        
        # 検証
        model.eval()
        val_loss = 0.0
        val_jaccard = 0.0
        
        with torch.no_grad():
            for i in range(0, len(X_test), batch_size):
                batch_inputs = X_test[i:i+batch_size]
                batch_targets = y_test[i:i+batch_size]
                
                X_batch = prepare_batch(batch_inputs, all_menus, encoder, num_menus, device)
                y_batch = prepare_target(batch_targets, num_menus, device)
                
                scores, _ = model(X_batch)
                loss = criterion(scores, y_batch)
                val_loss += loss.item()
                
                pred_binary = (scores > 0.5).float()
                for j in range(len(batch_targets)):
                    intersection = (pred_binary[j] * y_batch[j]).sum()
                    union = ((pred_binary[j] + y_batch[j]) > 0).sum()
                    jaccard = intersection / (union + 1e-8)
                    val_jaccard += jaccard.item()
        
        val_loss /= max(len(X_test) // batch_size, 1)
        val_jaccard /= max(len(X_test), 1)
        
        # ログ
        if (epoch + 1) % 5 == 0:
            print(f"Epoch {epoch+1:2d}: Train Loss={train_loss:.4f}, Jaccard={train_jaccard:.3f} | "
                  f"Val Loss={val_loss:.4f}, Jaccard={val_jaccard:.3f}")
        
        # 早期停止
        scheduler.step(val_loss)
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            torch.save(model.state_dict(), 'ml/seq2set_model_best.pth')
        else:
            patience_counter += 1
            if patience_counter >= max_patience:
                print(f"\n⛔ 早期停止 (Epoch {epoch+1})")
                break
    
    print(f"\n✅ 学習完了")
    print(f"   最良検証損失: {best_val_loss:.4f}")
    print(f"   モデル保存: ml/seq2set_model_best.pth\n")

if __name__ == '__main__':
    train_model()
