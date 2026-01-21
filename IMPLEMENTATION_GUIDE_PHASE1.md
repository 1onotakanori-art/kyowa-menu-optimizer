# ONO Menus 実装ガイド - Phase 1: 履歴表示機能

## 現状確認

### リポジトリ構成
- **kyowa-menu-optimizer**: メインアプリケーション（現在のリポジトリ）
- **kyowa-menu-history**: メニュー選択履歴を保存するリポジトリ
  - `data/history/`: 履歴データ保存場所（現在は空）
  - `data/models/`: 学習済みモデル保存場所（Phase 2で使用）

### 実装すべきこと
1. 管理者用ページで選択したメニューをkyowa-menu-historyに保存する機能
2. 保存された履歴を一般公開ページ（ONO Menusタブ）で表示する機能

---

## Step 1: データ保存機能の実装

### 1.1 データ形式の設計

#### ファイル命名規則
```
kyowa-menu-history/data/history/YYYY-MM-DD.json
例: 2026-01-22.json
```

#### JSONスキーマ
```json
{
  "date": "2026-01-22",
  "dayOfWeek": "水",
  "user": "ONO",
  "timestamp": "2026-01-22T12:34:56+09:00",
  "settings": {
    "targets": {
      "エネルギー": { "value": 2000, "enabled": true },
      "たんぱく質": { "value": 75, "enabled": true },
      "脂質": { "value": 55, "enabled": true },
      "炭水化物": { "value": 275, "enabled": true },
      "野菜重量": { "value": 350, "enabled": true }
    },
    "preferences": {
      "エネルギー": "dislikeExcess",
      "たんぱく質": "dislikeDeficit",
      "脂質": "dislikeExcess",
      "炭水化物": "dislikeExcess",
      "野菜重量": "dislikeDeficit"
    }
  },
  "selectedMenus": [
    {
      "name": "豚肉の生姜焼き定食",
      "type": "fixed",
      "nutrition": {
        "エネルギー": 654,
        "たんぱく質": 28.5,
        "脂質": 24.2,
        "炭水化物": 75.3,
        "食塩相当量": 3.2,
        "野菜重量": 120
      }
    },
    {
      "name": "鶏の唐揚げ定食",
      "type": "recommended",
      "nutrition": {
        "エネルギー": 720,
        "たんぱく質": 32.1,
        "脂質": 28.5,
        "炭水化物": 68.2,
        "食塩相当量": 2.8,
        "野菜重量": 95
      }
    }
  ],
  "totals": {
    "エネルギー": 1374,
    "たんぱく質": 60.6,
    "脂質": 52.7,
    "炭水化物": 143.5,
    "食塩相当量": 6.0,
    "野菜重量": 215
  },
  "achievement": {
    "エネルギー": 68.7,
    "たんぱく質": 80.8,
    "脂質": 95.8,
    "炭水化物": 52.2,
    "野菜重量": 61.4
  }
}
```

### 1.2 管理者用ページの実装

#### オプション1: 既存のindex.htmlを拡張（推奨）
現在のアプリに「保存」機能を追加する方法：

**HTML追加**
```html
<!-- 結果タブ内に追加 -->
<div class="save-section">
  <button id="save-history-btn" class="btn-primary">
    📝 この選択を保存
  </button>
  <div id="save-status" class="save-status"></div>
</div>
```

**JavaScript追加 (app.js)**
```javascript
class MenuOptimizer {
  // ... 既存のコード ...

  async saveHistory() {
    const date = this.currentDate;
    const settings = this.collectSettings();
    const selectedMenus = this.collectSelectedMenus();
    const totals = this.calculateNutritionTotals(selectedMenus);
    const achievement = this.calculateAchievement(totals, settings.targets);

    const historyData = {
      date: date,
      dayOfWeek: this.getDayOfWeek(date),
      user: "ONO",
      timestamp: new Date().toISOString(),
      settings: settings,
      selectedMenus: selectedMenus,
      totals: totals,
      achievement: achievement
    };

    // GitHub APIを使用して保存
    await this.saveToGitHub(historyData);
  }

  async saveToGitHub(historyData) {
    const token = localStorage.getItem('github_token'); // 事前に設定
    const repo = '1onotakanori-art/kyowa-menu-history';
    const path = `data/history/${historyData.date}.json`;
    
    // GitHub API呼び出し
    // ...実装詳細は後述...
  }

  collectSelectedMenus() {
    const fixedMenus = this.getFixedMenusData();
    const recommendedMenus = this.getRecommendedMenusData();
    
    return [
      ...fixedMenus.map(m => ({ ...m, type: 'fixed' })),
      ...recommendedMenus.map(m => ({ ...m, type: 'recommended' }))
    ];
  }
}
```

#### オプション2: 別途admin.htmlを作成
より権限管理を明確にする場合：

**ファイル構成**
```
kyowa-menu-optimizer/
├── index.html          # 一般公開ページ
├── admin.html          # 管理者専用ページ（保存機能付き）
├── app.js              # 共通ロジック
├── admin.js            # 管理者専用機能
└── style.css
```

### 1.3 GitHub APIを使用した保存

#### 必要な設定
1. GitHub Personal Access Token（repo権限）の取得
2. トークンの安全な保存（環境変数またはlocalStorage）

#### 実装コード（app.js または admin.js）
```javascript
class GitHubStorage {
  constructor(token, repo) {
    this.token = token;
    this.repo = repo; // '1onotakanori-art/kyowa-menu-history'
    this.apiBase = 'https://api.github.com';
  }

  async saveHistory(date, data) {
    const path = `data/history/${date}.json`;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));

    // 既存ファイルのSHAを取得（更新の場合）
    let sha = null;
    try {
      const existing = await this.getFile(path);
      sha = existing.sha;
    } catch (e) {
      // ファイルが存在しない場合は新規作成
    }

    const body = {
      message: `Add menu history for ${date}`,
      content: content,
      ...(sha && { sha: sha })
    };

    const response = await fetch(
      `${this.apiBase}/repos/${this.repo}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`);
    }

    return await response.json();
  }

  async getFile(path) {
    const response = await fetch(
      `${this.apiBase}/repos/${this.repo}/contents/${path}`,
      {
        headers: {
          'Authorization': `token ${this.token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`File not found: ${path}`);
    }

    return await response.json();
  }

  async listHistoryFiles() {
    const response = await fetch(
      `${this.apiBase}/repos/${this.repo}/contents/data/history`,
      {
        headers: {
          'Authorization': `token ${this.token}`
        }
      }
    );

    if (!response.ok) {
      return [];
    }

    const files = await response.json();
    return files
      .filter(f => f.name.endsWith('.json'))
      .map(f => f.name.replace('.json', ''));
  }
}
```

---

## Step 2: ONO Menusタブの実装

### 2.1 HTML構造

#### index.htmlに追加
```html
<!-- タブボタンに追加 -->
<div class="tabs">
  <button class="tab-button active" data-tab="menus">メニュー</button>
  <button class="tab-button" data-tab="settings">設定</button>
  <button class="tab-button" data-tab="results">結果</button>
  <button class="tab-button" data-tab="ono-menus">ONO Menus</button> <!-- 新規 -->
</div>

<!-- タブコンテンツに追加 -->
<div id="ono-menus" class="tab-content">
  <div class="container">
    <!-- 日付選択（メニュータブと共通） -->
    <div class="form-section-title">📅 日付選択</div>
    <input 
      type="date" 
      id="ono-date-picker" 
      class="date-picker"
      aria-label="ONO Menus日付選択"
    />

    <!-- データ取得状態 -->
    <div id="ono-loading" class="loading-state hidden">
      <div class="spinner"></div>
      <p>履歴データを読み込み中...</p>
    </div>

    <!-- データなし表示 -->
    <div id="ono-no-data" class="no-data-state hidden">
      <p>この日付の履歴データはありません</p>
    </div>

    <!-- 栄養成分サマリー -->
    <div id="ono-summary" class="fixed-summary hidden" aria-live="polite">
      <div id="ono-summary-header" class="fixed-summary-header">
        <div id="ono-summary-values" class="fixed-summary-values"></div>
        <div id="ono-summary-count" class="fixed-summary-count">0件</div>
      </div>
    </div>

    <!-- 栄養情報テーブル -->
    <div id="ono-nutrition-table" class="nutrition-achievement-table hidden">
      <!-- updateNutritionComparisonと同じ構造 -->
    </div>

    <!-- メニュー一覧 -->
    <div class="form-section-title">選択されたメニュー</div>
    <div id="ono-menus-grid" class="menus-grid"></div>
  </div>
</div>
```

### 2.2 JavaScript実装

#### app.jsに追加
```javascript
class MenuOptimizer {
  constructor() {
    // ... 既存のコード ...
    this.gitHubStorage = new GitHubStorage(
      'ghp_xxxxx', // トークンは環境変数から取得
      '1onotakanori-art/kyowa-menu-history'
    );
    this.initOnoMenusTab();
  }

  initOnoMenusTab() {
    const onoDatePicker = document.getElementById('ono-date-picker');
    if (onoDatePicker) {
      onoDatePicker.addEventListener('change', () => {
        this.loadOnoMenus(onoDatePicker.value);
      });
    }

    // タブ切り替え時に履歴データを読み込む
    const onoTab = document.querySelector('[data-tab="ono-menus"]');
    if (onoTab) {
      onoTab.addEventListener('click', () => {
        const date = onoDatePicker.value || this.currentDate;
        this.loadOnoMenus(date);
      });
    }
  }

  async loadOnoMenus(date) {
    const loadingEl = document.getElementById('ono-loading');
    const noDataEl = document.getElementById('ono-no-data');
    const summaryEl = document.getElementById('ono-summary');
    const tableEl = document.getElementById('ono-nutrition-table');
    const gridEl = document.getElementById('ono-menus-grid');

    // ローディング表示
    loadingEl.classList.remove('hidden');
    noDataEl.classList.add('hidden');
    summaryEl.classList.add('hidden');
    tableEl.classList.add('hidden');

    try {
      // GitHub APIから履歴データを取得
      const historyData = await this.gitHubStorage.getHistory(date);

      // データが存在する場合
      this.displayOnoMenus(historyData);
      
      summaryEl.classList.remove('hidden');
      tableEl.classList.remove('hidden');
    } catch (error) {
      console.error('履歴データの取得に失敗:', error);
      noDataEl.classList.remove('hidden');
    } finally {
      loadingEl.classList.add('hidden');
    }
  }

  displayOnoMenus(historyData) {
    // サマリー表示
    this.updateOnoSummary(historyData.totals, historyData.selectedMenus.length);

    // 栄養テーブル表示
    this.updateOnoNutritionTable(historyData.totals, historyData.settings.targets);

    // メニュー一覧表示
    this.displayOnoMenusGrid(historyData.selectedMenus);
  }

  updateOnoSummary(totals, count) {
    const valuesEl = document.getElementById('ono-summary-values');
    const countEl = document.getElementById('ono-summary-count');

    valuesEl.innerHTML = '';
    
    const display = [
      { key: 'エネルギー', label: 'E' },
      { key: 'たんぱく質', label: 'P' },
      { key: '脂質', label: 'F' },
      { key: '炭水化物', label: 'C' },
      { key: '野菜重量', label: 'V' }
    ];

    display.forEach(({ key, label }) => {
      const pill = document.createElement('div');
      pill.className = 'fixed-summary-pill';
      
      const value = totals[key] || 0;
      const formattedValue = Math.round(value * 10) / 10;

      pill.innerHTML = `
        <div class="fixed-summary-pill-label">${label}</div>
        <div class="fixed-summary-pill-value">${formattedValue}</div>
      `;

      valuesEl.appendChild(pill);
    });

    countEl.textContent = `${count}件`;
  }

  updateOnoNutritionTable(totals, targets) {
    // updateNutritionComparisonと同じロジック
    // ...
  }

  displayOnoMenusGrid(menus) {
    const gridEl = document.getElementById('ono-menus-grid');
    gridEl.innerHTML = '';

    menus.forEach(menu => {
      const card = this.createMenuCard(menu);
      // 固定・除外ボタンは非表示にする
      card.querySelectorAll('.menu-state-btn').forEach(btn => {
        btn.style.display = 'none';
      });
      gridEl.appendChild(card);
    });
  }
}

// GitHubStorageクラスに追加
class GitHubStorage {
  // ... 既存のコード ...

  async getHistory(date) {
    const path = `data/history/${date}.json`;
    const fileData = await this.getFile(path);
    
    // Base64デコード
    const content = decodeURIComponent(escape(atob(fileData.content)));
    return JSON.parse(content);
  }
}
```

### 2.3 スタイリング (style.css)

```css
/* ONO Menusタブ用スタイル */
.loading-state {
  text-align: center;
  padding: 40px 20px;
}

.spinner {
  border: 4px solid var(--light-gray);
  border-top: 4px solid var(--primary);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.no-data-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);
  font-size: 16px;
}

/* ONO Menusのメニューカードは状態ボタンを非表示 */
#ono-menus .menu-state-btn {
  display: none;
}
```

---

## Step 3: デプロイと動作確認

### 3.1 GitHub Personal Access Tokenの設定

1. GitHub Settings → Developer settings → Personal access tokens
2. "Generate new token (classic)"
3. `repo` 権限を選択
4. トークンをコピー
5. アプリに設定（環境変数またはlocalStorage）

**セキュリティ注意事項**:
- トークンは公開リポジトリにコミットしない
- `.env` ファイルに保存し、`.gitignore` に追加
- または、Renderの環境変数として設定

### 3.2 ローカルテスト

```bash
# 1. ローカルサーバー起動
cd kyowa-menu-optimizer
python3 -m http.server 8000

# 2. ブラウザで確認
open http://localhost:8000

# 3. 保存機能のテスト
# - メニューを選択
# - 「この選択を保存」ボタンをクリック
# - kyowa-menu-historyリポジトリを確認

# 4. 履歴表示のテスト
# - ONO Menusタブに切り替え
# - 日付を選択
# - 履歴データが表示されることを確認
```

### 3.3 本番デプロイ

```bash
# コミット・プッシュ
git add -A
git commit -m "Add ONO Menus tab with history display feature"
git push origin main

# GitHub Pagesで自動デプロイ
# または Renderで再デプロイ
```

---

## 実装チェックリスト

### データ保存機能
- [ ] GitHubStorageクラスの実装
- [ ] saveHistory()メソッドの実装
- [ ] collectSelectedMenus()メソッドの実装
- [ ] 「保存」ボタンの追加とイベントハンドラ
- [ ] GitHub Personal Access Tokenの設定
- [ ] 保存成功/失敗のフィードバック表示

### ONO Menusタブ
- [ ] HTMLタブ構造の追加
- [ ] タブ切り替えロジックの拡張
- [ ] 日付選択UIの追加
- [ ] loadOnoMenus()メソッドの実装
- [ ] displayOnoMenus()メソッドの実装
- [ ] updateOnoSummary()の実装
- [ ] updateOnoNutritionTable()の実装
- [ ] displayOnoMenusGrid()の実装

### スタイリング
- [ ] ローディングアニメーション
- [ ] データなし表示
- [ ] ONO Menus専用スタイル

### テスト
- [ ] 保存機能の動作確認
- [ ] 履歴取得の動作確認
- [ ] UI表示の確認（PC/スマホ）
- [ ] エラーハンドリングの確認

### デプロイ
- [ ] 環境変数の設定
- [ ] 本番環境でのテスト
- [ ] ドキュメント更新

---

## 次のステップ（Phase 2準備）

Phase 1が完了したら：
1. 複数日分のデータを蓄積
2. データ分析の開始
3. 学習環境のセットアップ
4. Phase 2（AI学習機能）の実装開始

---

## トラブルシューティング

### GitHub API制限
- 認証なし: 60リクエスト/時間
- 認証あり: 5000リクエスト/時間
- 対策: Personal Access Tokenを使用

### CORS エラー
- GitHub APIは直接呼び出し可能
- ただし、ブラウザからのトークン使用は注意が必要
- 代替: バックエンド（Node.js）経由で保存

### データ重複
- 同じ日付のファイルを上書き
- SHAを取得して更新することで対応済み

---

## 参考リンク

- [GitHub REST API - Contents](https://docs.github.com/en/rest/repos/contents)
- [GitHub Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- [Base64 encoding in JavaScript](https://developer.mozilla.org/en-US/docs/Glossary/Base64)
