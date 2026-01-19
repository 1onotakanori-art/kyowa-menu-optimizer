/**
 * 管理者ページ - 食事記録管理
 * 
 * 機能:
 * - 簡易パスワード認証
 * - 日付選択 & メニュー読込
 * - 食べたメニューの選択
 * - GitHub API経由でデータ保存
 * - 履歴表示
 */

class AdminApp {
  constructor() {
    // 簡易パスワード（本番では環境変数から取得）
    // TODO: GitHub Secretsから取得する仕組みに変更
    this.PASSWORD = 'kyowa2026'; // デフォルトパスワード
    
    // GitHub設定（プライベートリポジトリ）
    this.GITHUB_OWNER = '1onotakanori-art'; // あなたのGitHubユーザー名
    this.GITHUB_REPO = 'kyowa-menu-history'; // プライベートリポジトリ名（後で作成）
    this.GITHUB_TOKEN = null; // Personal Access Token（後で設定）
    
    this.currentDate = null;
    this.availableMenus = [];
    this.selectedMenus = new Set();
    
    this.initializeEventListeners();
    this.checkAuth();
  }

  /**
   * イベントリスナー初期化
   */
  initializeEventListeners() {
    // 認証
    document.getElementById('login-button').addEventListener('click', () => this.handleLogin());
    document.getElementById('password-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleLogin();
    });
    
    // ログアウト
    document.getElementById('logout-button').addEventListener('click', () => this.handleLogout());
    
    // 日付選択（デフォルトは今日）
    const dateInput = document.getElementById('date-input');
    dateInput.value = this.getTodayISO();
    
    // メニュー読込
    document.getElementById('load-menus-button').addEventListener('click', () => this.loadMenus());
    
    // 保存
    document.getElementById('save-button').addEventListener('click', () => this.saveHistory());
  }

  /**
   * 今日の日付（YYYY-MM-DD形式）
   */
  getTodayISO() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 認証状態チェック
   */
  checkAuth() {
    const isAuthenticated = sessionStorage.getItem('admin_authenticated') === 'true';
    if (isAuthenticated) {
      this.showMainScreen();
      this.loadRecentHistory();
    }
  }

  /**
   * ログイン処理
   */
  handleLogin() {
    const passwordInput = document.getElementById('password-input');
    const password = passwordInput.value;
    const errorEl = document.getElementById('auth-error');
    
    if (password === this.PASSWORD) {
      sessionStorage.setItem('admin_authenticated', 'true');
      errorEl.classList.add('hidden');
      this.showMainScreen();
      this.loadRecentHistory();
    } else {
      errorEl.textContent = 'パスワードが正しくありません';
      errorEl.classList.remove('hidden');
      passwordInput.value = '';
    }
  }

  /**
   * ログアウト処理
   */
  handleLogout() {
    sessionStorage.removeItem('admin_authenticated');
    location.reload();
  }

  /**
   * メイン画面表示
   */
  showMainScreen() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
  }

  /**
   * メニュー読込
   */
  async loadMenus() {
    const dateInput = document.getElementById('date-input');
    const date = dateInput.value;
    
    if (!date) {
      this.showLoadStatus('日付を選択してください', 'error');
      return;
    }
    
    this.currentDate = date;
    this.showLoadStatus('メニュー読込中...', 'info');
    
    try {
      // パブリックリポジトリからメニューデータを取得
      const response = await fetch(`./menus/menus_${date}.json`);
      
      if (!response.ok) {
        throw new Error('メニューデータが見つかりません');
      }
      
      const data = await response.json();
      this.availableMenus = data.menus || [];
      
      this.renderMenuSelection();
      this.showLoadStatus(`${this.availableMenus.length}件のメニューを読み込みました`, 'success');
      
      // 既存の記録があれば読込
      await this.loadExistingHistory(date);
      
    } catch (error) {
      console.error('メニュー読込エラー:', error);
      this.showLoadStatus(`エラー: ${error.message}`, 'error');
      this.availableMenus = [];
      this.renderMenuSelection();
    }
  }

  /**
   * メニュー選択UIをレンダリング
   */
  renderMenuSelection() {
    const container = document.getElementById('menu-selection');
    container.innerHTML = '';
    
    if (this.availableMenus.length === 0) {
      container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">メニューがありません</p>';
      document.getElementById('save-button').disabled = true;
      return;
    }
    
    this.availableMenus.forEach((menu, index) => {
      const item = document.createElement('div');
      item.className = 'menu-checkbox-item';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `menu-${index}`;
      checkbox.checked = this.selectedMenus.has(menu.name);
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.selectedMenus.add(menu.name);
        } else {
          this.selectedMenus.delete(menu.name);
        }
        this.updateSelectionCount();
        this.updateNutritionSummary();
      });
      
      const label = document.createElement('label');
      label.className = 'menu-checkbox-label';
      label.htmlFor = `menu-${index}`;
      label.textContent = menu.name;
      
      item.appendChild(checkbox);
      item.appendChild(label);
      
      // 栄養情報を簡易表示
      if (menu.nutrition) {
        const nutritionInfo = document.createElement('div');
        nutritionInfo.className = 'menu-nutrition-info';
        const e = menu.nutrition['エネルギー'] || 0;
        const p = menu.nutrition['たんぱく質'] || 0;
        const f = menu.nutrition['脂質'] || 0;
        const c = menu.nutrition['炭水化物'] || 0;
        nutritionInfo.textContent = `E:${e} P:${p} F:${f} C:${c}`;
        item.appendChild(nutritionInfo);
      }
      
      container.appendChild(item);
    });
    
    document.getElementById('save-button').disabled = false;
    this.updateSelectionCount();
    this.updateNutritionSummary();
  }

  /**
   * 選択数を更新
   */
  updateSelectionCount() {
    const countEl = document.getElementById('selected-count');
    countEl.textContent = `(${this.selectedMenus.size}件)`;
  }

  /**
   * 栄養合計を更新
   */
  updateNutritionSummary() {
    const summaryEl = document.getElementById('nutrition-summary');
    
    if (this.selectedMenus.size === 0) {
      summaryEl.classList.add('hidden');
      return;
    }
    
    summaryEl.classList.remove('hidden');
    
    // 選択されたメニューの栄養を合計
    const totals = {
      'エネルギー': 0,
      'たんぱく質': 0,
      '脂質': 0,
      '炭水化物': 0,
      '野菜重量': 0
    };
    
    this.availableMenus.forEach(menu => {
      if (this.selectedMenus.has(menu.name)) {
        Object.keys(totals).forEach(key => {
          const value = menu.nutrition?.[key];
          if (typeof value === 'number') {
            totals[key] += value;
          }
        });
      }
    });
    
    document.getElementById('summary-energy').textContent = Math.round(totals['エネルギー']);
    document.getElementById('summary-protein').textContent = Math.round(totals['たんぱく質'] * 10) / 10;
    document.getElementById('summary-fat').textContent = Math.round(totals['脂質'] * 10) / 10;
    document.getElementById('summary-carb').textContent = Math.round(totals['炭水化物'] * 10) / 10;
    document.getElementById('summary-veg').textContent = Math.round(totals['野菜重量']);
  }

  /**
   * 既存の履歴を読込（ある場合）
   */
  async loadExistingHistory(date) {
    try {
      // ローカルストレージから既存データを確認（仮実装）
      const storageKey = `history_${date}`;
      const existingData = localStorage.getItem(storageKey);
      
      if (existingData) {
        const data = JSON.parse(existingData);
        this.selectedMenus = new Set(data.eaten || []);
        this.renderMenuSelection();
        this.showLoadStatus('既存の記録を読み込みました', 'info');
      }
    } catch (error) {
      console.error('既存履歴読込エラー:', error);
    }
  }

  /**
   * 記録を保存
   */
  async saveHistory() {
    if (this.selectedMenus.size === 0) {
      this.showSaveStatus('メニューを選択してください', 'error');
      return;
    }
    
    this.showSaveStatus('保存中...', 'info');
    
    try {
      // 栄養合計を計算
      const nutritionTotal = {
        'エネルギー': 0,
        'たんぱく質': 0,
        '脂質': 0,
        '炭水化物': 0,
        '野菜重量': 0
      };
      
      this.availableMenus.forEach(menu => {
        if (this.selectedMenus.has(menu.name)) {
          Object.keys(nutritionTotal).forEach(key => {
            const value = menu.nutrition?.[key];
            if (typeof value === 'number') {
              nutritionTotal[key] += value;
            }
          });
        }
      });
      
      // 保存データ作成
      const historyData = {
        date: this.currentDate,
        eaten: Array.from(this.selectedMenus),
        available: this.availableMenus.map(m => m.name),
        nutrition: {
          total: nutritionTotal
        },
        timestamp: new Date().toISOString()
      };
      
      // Phase 1: ローカルストレージに保存（仮実装）
      const storageKey = `history_${this.currentDate}`;
      localStorage.setItem(storageKey, JSON.stringify(historyData));
      
      // TODO: Phase 2でGitHub API経由の保存を実装
      // await this.saveToGitHub(historyData);
      
      this.showSaveStatus('保存しました！', 'success');
      this.loadRecentHistory();
      
      // 5秒後にメッセージを消す
      setTimeout(() => {
        document.getElementById('save-status').classList.add('hidden');
      }, 5000);
      
    } catch (error) {
      console.error('保存エラー:', error);
      this.showSaveStatus(`保存エラー: ${error.message}`, 'error');
    }
  }

  /**
   * GitHub API経由で保存（Phase 2で実装予定）
   */
  async saveToGitHub(data) {
    // TODO: GitHub API実装
    // 1. Personal Access Tokenの取得
    // 2. プライベートリポジトリへのファイルアップロード
    // 3. コミット作成
    
    console.log('GitHub保存（未実装）:', data);
    throw new Error('GitHub API連携は未実装です');
  }

  /**
   * 最近の履歴を表示
   */
  loadRecentHistory() {
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';
    
    // ローカルストレージから履歴を取得
    const histories = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('history_')) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          histories.push(data);
        } catch (error) {
          console.error('履歴読込エラー:', error);
        }
      }
    }
    
    // 日付でソート（新しい順）
    histories.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (histories.length === 0) {
      historyList.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">記録がありません</p>';
      return;
    }
    
    // 最新5件を表示
    histories.slice(0, 5).forEach(history => {
      const item = document.createElement('div');
      item.className = 'history-item';
      
      const dateEl = document.createElement('div');
      dateEl.className = 'history-date';
      dateEl.textContent = `📅 ${history.date}`;
      
      const menusEl = document.createElement('div');
      menusEl.className = 'history-menus';
      menusEl.textContent = `${history.eaten.length}件: ${history.eaten.join(', ')}`;
      
      item.appendChild(dateEl);
      item.appendChild(menusEl);
      historyList.appendChild(item);
    });
  }

  /**
   * 読込ステータス表示
   */
  showLoadStatus(message, type) {
    const statusEl = document.getElementById('load-status');
    statusEl.className = `status-message status-${type}`;
    statusEl.textContent = message;
    statusEl.classList.remove('hidden');
    
    if (type === 'success') {
      setTimeout(() => statusEl.classList.add('hidden'), 3000);
    }
  }

  /**
   * 保存ステータス表示
   */
  showSaveStatus(message, type) {
    const statusEl = document.getElementById('save-status');
    statusEl.className = `status-message status-${type}`;
    statusEl.textContent = message;
    statusEl.classList.remove('hidden');
  }
}

// アプリ初期化
document.addEventListener('DOMContentLoaded', () => {
  console.log('管理者ページ初期化...');
  new AdminApp();
});
