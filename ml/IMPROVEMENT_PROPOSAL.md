# 機械学習改善提案書

## 現状の課題分析

### 1. **過学習リスク**
- **問題**: データ数が少ない（15-20日分程度）
- **現状**: Leave-One-Day-Out交差検証を使用
- **課題**: 日付単位でのholdoutのため、時系列的な汎化性能が不明

### 2. **単独メニュー選択**
- **問題**: 各メニューを独立して評価
- **現状**: 共起スコアは考慮しているが、セット全体の最適化はしていない
- **課題**: 「メニューAとBは相性が悪い」などの制約が考慮されない

### 3. **説明性の欠如**
- **問題**: なぜそのメニューが選ばれたか分からない
- **現状**: 特徴量重要度の分析のみ
- **課題**: ユーザーに理解できる形での説明が不足

---

## 改善案: メニューセット最適化AI

### アーキテクチャ設計

```
┌─────────────────────────────────────────────┐
│ Phase 1: メニュー候補生成                    │
│  - 個別メニュースコアリング (既存モデル)      │
│  - TOP-K候補の抽出 (K=20程度)               │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Phase 2: セット組み合わせ評価                │
│  - Transformer/GNN によるセット評価          │
│  - メニュー間の相互作用をモデル化            │
│  - 全体バランススコアの計算                  │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Phase 3: 最適化とランキング                  │
│  - 制約付き最適化 (栄養バランス制約)         │
│  - Beam Search / 遺伝的アルゴリズム          │
│  - TOP-N セットの提示                        │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Phase 4: 説明生成                            │
│  - Attention重みからキーとなるメニュー抽出   │
│  - ルールベースの理由生成                    │
│  - "Aで基礎栄養、Bで補完、Cで調整"          │
└─────────────────────────────────────────────┘
```

---

## 具体的実装方針

### 方式1: **Seq2Set Transformer** (推奨)
**特徴:**
- メニューをシーケンスとして扱い、セット全体を予測
- Self-Attention で相互作用を学習
- 説明性が高い（Attention 重みを可視化）

**実装:**
```python
class MenuSetTransformer(nn.Module):
    def __init__(self, d_model=256, nhead=8, num_layers=3):
        # メニューエンコーダ
        self.menu_encoder = MenuEncoder(d_model)
        
        # Transformer
        self.transformer = nn.TransformerEncoder(
            nn.TransformerEncoderLayer(d_model, nhead),
            num_layers
        )
        
        # セット評価ヘッド
        self.set_scorer = nn.Linear(d_model, 1)
        
        # 説明生成用 Attention
        self.attention_weights = None
    
    def forward(self, menu_features):
        # [batch, num_menus, feature_dim] -> [batch, num_menus, d_model]
        encoded = self.menu_encoder(menu_features)
        
        # Self-Attention で相互作用を学習
        attended = self.transformer(encoded)  # Attention weights保存
        
        # 各メニューの選択スコア
        scores = self.set_scorer(attended).squeeze(-1)
        
        return scores, attended
```

### 方式2: **Graph Neural Network**
**特徴:**
- メニュー間の関係性をグラフとして表現
- Message Passing で相互作用を伝播
- 明示的な関係性モデリング

**実装:**
```python
class MenuGraphNN(nn.Module):
    def __init__(self, node_features, edge_features):
        self.node_encoder = NodeEncoder(node_features)
        self.edge_encoder = EdgeEncoder(edge_features)
        
        # Message Passing
        self.conv1 = GATConv(node_features, 128, heads=4)
        self.conv2 = GATConv(128*4, 64)
        
        # Set Pooling
        self.set_pool = Set2Set(64, processing_steps=3)
        
        # 分類器
        self.classifier = nn.Linear(128, 2)  # selected or not
```

### 方式3: **Set Transformer + Optimization**
**特徴:**
- Set Transformer で集合表現を学習
- 制約付き最適化で最終セットを決定
- 数理最適化とMLの融合

---

## 検証戦略

### 1. **時系列分割検証**
```python
def time_series_split(dates, test_size=0.2):
    """
    時系列順に分割
    例: 2026-01-13 ~ 2026-01-25 → train
        2026-01-26 ~ 2026-01-30 → test
    """
    split_point = int(len(dates) * (1 - test_size))
    train_dates = dates[:split_point]
    test_dates = dates[split_point:]
    return train_dates, test_dates
```

### 2. **Leave-Future-Out交差検証**
```python
def leave_future_out_cv(dates, n_splits=5):
    """
    未来のデータで順次検証
    Fold 1: Train[1-10] → Test[11-12]
    Fold 2: Train[1-12] → Test[13-14]
    Fold 3: Train[1-14] → Test[15-16]
    ...
    """
```

### 3. **評価指標**
```python
metrics = {
    'accuracy': '個別メニュー予測精度',
    'set_accuracy': 'セット完全一致率',
    'jaccard_similarity': 'セット類似度',
    'nutrition_mae': '栄養素合計の誤差',
    'balance_score': 'PFCバランススコア'
}
```

---

## 説明生成の実装

### Attention-based説明
```python
def generate_explanation(selected_menus, attention_weights, nutrition_total):
    explanations = []
    
    # 1. 基礎メニュー（最初に選ばれたもの）
    base_menu = selected_menus[0]
    explanations.append({
        'menu': base_menu['name'],
        'role': '基礎栄養',
        'reason': f'たんぱく質{base_menu["protein"]}g、エネルギー{base_menu["energy"]}kcal'
    })
    
    # 2. 補完メニュー（Attentionが高いペア）
    for i, menu in enumerate(selected_menus[1:-1], 1):
        attention_score = attention_weights[i, :i].max()
        pair_menu = selected_menus[attention_weights[i, :i].argmax()]
        
        explanations.append({
            'menu': menu['name'],
            'role': '補完',
            'reason': f'{pair_menu["name"]}と相性が良く、野菜を追加'
        })
    
    # 3. 調整メニュー（最後）
    last_menu = selected_menus[-1]
    explanations.append({
        'menu': last_menu['name'],
        'role': '微調整',
        'reason': f'全体バランスを調整（目標: P{target_p}g → 実際: P{nutrition_total["protein"]}g）'
    })
    
    return explanations
```

---

## 実装ロードマップ

### **Phase 1: 検証戦略の改善** (1-2日)
- [ ] 時系列分割検証の実装
- [ ] Leave-Future-Out CVの実装
- [ ] 評価スクリプトの作成
- [ ] 現行モデルでの検証

### **Phase 2: データ準備** (1日)
- [ ] メニューペア特徴量の生成
- [ ] グラフ構造データの準備
- [ ] セットラベルの作成

### **Phase 3: セット評価モデルの実装** (3-4日)
- [ ] Seq2Set Transformer の実装
- [ ] 学習ループの構築
- [ ] Attention可視化

### **Phase 4: 説明生成** (2日)
- [ ] Attention-based説明
- [ ] ルールベース説明の組み合わせ
- [ ] UI連携

### **Phase 5: 最適化統合** (2-3日)
- [ ] Beam Search実装
- [ ] 制約付き最適化
- [ ] セットランキング

---

## 推奨アプローチ

### **即座に実装可能な改善**
1. **時系列分割検証** - 今すぐ実装可能
2. **メニューペア特徴量** - 既存モデルに追加
3. **簡易的な説明生成** - ルールベースで実装

### **中期的な目標**
- **Seq2Set Transformer** - 最もバランスが良い
- **説明可能性** - Attention可視化

### **長期的な展望**
- **強化学習** - ユーザーフィードバックで改善
- **マルチタスク学習** - 栄養予測と選択予測を同時に

---

## 必要なライブラリ追加

```bash
pip install torch torchvision
pip install torch-geometric  # GNN用
pip install transformers  # Transformer utilities
pip install optuna  # ハイパーパラメータ最適化
```

---

どの方式から始めますか？
1. まず検証戦略を改善して過学習を確認
2. Seq2Set Transformer でセット選択を実装
3. 簡易的な説明生成から始める
