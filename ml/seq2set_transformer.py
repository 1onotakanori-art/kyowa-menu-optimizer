#!/usr/bin/env python3
"""
Seq2Set Transformer
メニュー系列から最適なメニューセットを予測
"""

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset
from sklearn.metrics import jaccard_score
import json
from pathlib import Path

class TransformerEncoderLayer(nn.Module):
    """Transformer エンコーダーブロック"""
    
    def __init__(self, d_model=128, nhead=4, dim_feedforward=256, dropout=0.2):
        super().__init__()
        self.attention = nn.MultiheadAttention(d_model, nhead, dropout=dropout, batch_first=True)
        self.linear1 = nn.Linear(d_model, dim_feedforward)
        self.dropout = nn.Dropout(dropout)
        self.linear2 = nn.Linear(dim_feedforward, d_model)
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.activation = nn.ReLU()
    
    def forward(self, x):
        """
        x: (batch, seq_len, d_model)
        """
        # Self-Attention
        attn_output, attn_weights = self.attention(x, x, x)
        x = self.norm1(x + attn_output)
        
        # Feed-Forward
        ff_output = self.linear2(self.dropout(self.activation(self.linear1(x))))
        x = self.norm2(x + ff_output)
        
        return x, attn_weights

class SetDecoderHead(nn.Module):
    """セット予測ヘッド: 各メニューのスコアを出力"""
    
    def __init__(self, d_model=128, num_menus=810):
        super().__init__()
        self.query_projection = nn.Linear(d_model, d_model)
        self.value_projection = nn.Linear(d_model, d_model)
        self.score_mlp = nn.Sequential(
            nn.Linear(d_model * 2, 256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, 1)
        )
        self.num_menus = num_menus
    
    def forward(self, context_vec, all_menu_embeddings):
        """
        context_vec: (batch, d_model) - 文脈ベクトル
        all_menu_embeddings: (num_menus, d_model) - 全メニュー埋め込み
        Returns: (batch, num_menus) - 各メニューのスコア
        """
        batch_size = context_vec.shape[0]
        context_expanded = context_vec.unsqueeze(1)  # (batch, 1, d_model)
        all_menus_expanded = all_menu_embeddings.unsqueeze(0)  # (1, num_menus, d_model)
        
        # 相互作用ベクトルを計算
        context_proj = self.query_projection(context_expanded)  # (batch, 1, d_model)
        menu_proj = self.value_projection(all_menus_expanded)   # (1, num_menus, d_model)
        
        # 各メニューとの相互作用を計算
        interaction = context_proj + menu_proj  # (batch, num_menus, d_model)
        
        # スコアを計算（スキップ接続含む）
        menu_proj_exp = menu_proj.expand(batch_size, -1, -1)  # (batch, num_menus, d_model)
        combined = torch.cat([interaction, menu_proj_exp], dim=-1)  # (batch, num_menus, 2*d_model)
        
        scores = self.score_mlp(combined).squeeze(-1)  # (batch, num_menus)
        return scores

class Seq2SetTransformer(nn.Module):
    """Seq2Set Transformer: メニュー列から最適セットを予測"""
    
    def __init__(self, input_dim=68, d_model=128, nhead=4, num_layers=2, num_menus=810):
        super().__init__()
        self.input_dim = input_dim
        self.d_model = d_model
        
        # 入力投影
        self.input_projection = nn.Linear(input_dim, d_model)
        
        # Transformer エンコーダー
        self.encoder_layers = nn.ModuleList([
            TransformerEncoderLayer(d_model, nhead, 256, dropout=0.2)
            for _ in range(num_layers)
        ])
        
        # セットデコーダー
        self.set_decoder = SetDecoderHead(d_model, num_menus)
        
        # 全メニュー埋め込み（学習可能パラメータ）
        self.all_menu_embeddings = nn.Parameter(torch.randn(num_menus, d_model) * 0.1)
        
    def forward(self, seq_embeddings):
        """
        seq_embeddings: (batch, seq_len, input_dim)
        Returns: (batch, num_menus)
        """
        # 入力投影
        x = self.input_projection(seq_embeddings)  # (batch, seq_len, d_model)
        
        # Transformer エンコーダー
        attentions = []
        for encoder_layer in self.encoder_layers:
            x, attn = encoder_layer(x)
            attentions.append(attn)
        
        # 文脈ベクトル: 平均プーリング
        context = x.mean(dim=1)  # (batch, d_model)
        
        # セット予測
        scores = self.set_decoder(context, self.all_menu_embeddings)  # (batch, num_menus)
        
        return scores, attentions

class MenuSetDataset(Dataset):
    """メニューセット学習用データセット"""
    
    def __init__(self, X, y):
        self.X = X
        self.y = y
    
    def __len__(self):
        return len(self.X)
    
    def __getitem__(self, idx):
        return (torch.from_numpy(self.X[idx]).float(),
                torch.from_numpy(self.y[idx]).float())

class JaccardLoss(nn.Module):
    """Jaccard 距離ベースの損失関数"""
    
    def __init__(self):
        super().__init__()
    
    def forward(self, predictions, targets, threshold=0.5):
        """
        predictions: (batch, num_items)
        targets: (batch, num_items)
        """
        # 予測スコアから確率を計算（勾配を保持）
        pred_probs = torch.sigmoid(predictions)
        
        # 閾値でバイナリ化（勾配は失わない）
        pred_binary = (predictions > threshold).float()
        target_binary = targets
        
        # Jaccard 類似度（勾配対応版）
        intersection = (pred_probs * target_binary).sum(dim=1)
        union = ((pred_probs + target_binary) > 0).sum(dim=1).float()
        
        jaccard = intersection / (union + 1e-8)
        loss = 1 - jaccard.mean()
        
        return loss

if __name__ == '__main__':
    print("✅ Seq2Set Transformer モジュールロード完了")
    print(f"   - 入力次元: 68 (メニュー符号化)")
    print(f"   - 内部次元: 128")
    print(f"   - Transformerヘッド: 4")
    print(f"   - Transformerレイヤー: 2")
    print(f"   - 出力: 810メニュースコア\n")
    
    # テスト
    model = Seq2SetTransformer(input_dim=68, d_model=128, nhead=4, num_layers=2, num_menus=810)
    
    # ダミー入力
    batch_size = 4
    seq_len = 7
    dummy_input = torch.randn(batch_size, seq_len, 68)
    
    scores, attentions = model(dummy_input)
    print(f"出力形状: {scores.shape}")
    print(f"Attention層数: {len(attentions)}")
    print(f"パラメータ数: {sum(p.numel() for p in model.parameters()):,}")
