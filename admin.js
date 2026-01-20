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
    // GitHub設定（プライベートリポジトリ）
    this.GITHUB_OWNER = '1onotakanori-art'; // あなたのGitHubユーザー名
    this.GITHUB_REPO = 'kyowa-menu-history'; // プライベートリポジトリ名
    
    // Personal Access Token はローカルストレージから読み込む
    try {
      this.GITHUB_TOKEN = localStorage.getItem('github_token') || null;
      console.log('トークン読み込み:', this.GITHUB_TOKEN ? '成功' : 'なし');
    } catch (error) {
      console.error('localStorage読み込みエラー:', error);
      this.GITHUB_TOKEN = null;
    }
    
    this.currentDate = null;
    this.availableMenus = [];
    this.selectedMenus = new Set();
    
    this.initializeEventListeners();
    this.showMainScreen();
    this.loadRecentHistory();
  }

  /**
   * イベントリスナー初期化
   */
  initializeEventListeners() {
    // トークン保存
    document.getElementById('save-token-button').addEventListener('click', () => this.saveToken());
    document.getElementById('token-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.saveToken();
    });
    
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
   * メイン画面表示
   */
  showMainScreen() {
    this.updateTokenStatus();
  }

  /**
   * トークン保存
   */
  saveToken() {
    const tokenInput = document.getElementById('token-input');
    const token = tokenInput.value.trim();
    
    console.log('トークン保存開始:', token.substring(0, 10) + '...');
    
    if (!token) {
      alert('トークンを入力してください');
      return;
    }
    
    if (!token.startsWith('ghp_')) {
      alert(`無効なトークン形式です。\n入力値: ${token.substring(0, 10)}...\nGitHub Personal Access Token は ghp_ で始まります。`);
      return;
    }
    
    try {
      // localStorageへの保存を試行
      localStorage.setItem('github_token', token);
      
      // 保存確認
      const saved = localStorage.getItem('github_token');
      if (saved !== token) {
        throw new Error('localStorageに保存できませんでした');
      }
      
      this.GITHUB_TOKEN = token;
      tokenInput.value = '';
      this.updateTokenStatus();
      console.log('✅ トークン保存成功');
      alert('✅ トークンを保存しました！\n\nGitHub保存が有効になりました。');
      
    } catch (error) {
      console.error('トークン保存エラー:', error);
      alert(`❌ トークンの保存に失敗しました。\n\nエラー: ${error.message}\n\niOSのプライベートブラウジングモードでは保存できません。通常モードでお試しください。`);
    }
  }

  /**
   * トークン状態を更新
   */
  updateTokenStatus() {
    const statusText = document.getElementById('token-status-text');
    const tokenInput = document.getElementById('token-input');
    
    console.log('トークン状態更新:', this.GITHUB_TOKEN ? 'あり' : 'なし');
    
    if (this.GITHUB_TOKEN) {
      statusText.textContent = `✅ 設定済み（GitHub保存有効）- ${this.GITHUB_TOKEN.substring(0, 10)}...`;
      statusText.style.color = '#28a745';
      tokenInput.placeholder = '新しいトークンで上書きする場合は入力';
    } else {
      statusText.textContent = '❌ 未設定（ローカルのみ保存）';
      statusText.style.color = '#dc3545';
      tokenInput.placeholder = 'Personal Access Token (ghp_...)';
    }
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
    this.selectedMenus.clear(); // 前回の選択をクリア
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
      this.selectedMenus.clear(); // エラー時もクリア
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
      
      const label = document.createElement('label');
      label.className = 'menu-checkbox-label';
      label.htmlFor = `menu-${index}`;
      label.textContent = menu.name;
      
      // アイテム全体をクリック可能に
      item.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;
        if (checkbox.checked) {
          this.selectedMenus.add(menu.name);
        } else {
          this.selectedMenus.delete(menu.name);
        }
        this.updateSelectionCount();
        this.updateNutritionSummary();
      });
      
      item.appendChild(checkbox);
      item.appendChild(label);
      
      // 栄養情報を色付きバッジで表示
      if (menu.nutrition) {
        const nutritionInfo = document.createElement('div');
        nutritionInfo.className = 'menu-nutrition-info';
        
        const e = Math.round(menu.nutrition['エネルギー'] || 0);
        const p = Math.round((menu.nutrition['たんぱく質'] || 0) * 10) / 10;
        const f = Math.round((menu.nutrition['脂質'] || 0) * 10) / 10;
        const c = Math.round((menu.nutrition['炭水化物'] || 0) * 10) / 10;
        const v = Math.round(menu.nutrition['野菜重量'] || 0);
        
        nutritionInfo.innerHTML = `
          <span class="nutrition-badge energy"><span class="nutrition-label-small">E</span>${e}</span>
          <span class="nutrition-badge protein"><span class="nutrition-label-small">P</span>${p}</span>
          <span class="nutrition-badge fat"><span class="nutrition-label-small">F</span>${f}</span>
          <span class="nutrition-badge carb"><span class="nutrition-label-small">C</span>${c}</span>
          <span class="nutrition-badge veg"><span class="nutrition-label-small">V</span>${v}</span>
        `;
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
      
      // Phase 1: ローカルストレージに保存
      const storageKey = `history_${this.currentDate}`;
      localStorage.setItem(storageKey, JSON.stringify(historyData));
      
      // Phase 2: GitHub API経由の保存
      let githubSaveSuccess = false;
      try {
        if (this.GITHUB_TOKEN) {
          await this.saveToGitHub(historyData);
          githubSaveSuccess = true;
          this.showSaveStatus('GitHub にも保存しました！', 'success');
        } else {
          this.showSaveStatus('保存しました（ローカルのみ）', 'success');
        }
      } catch (githubError) {
        console.error('GitHub保存エラー:', githubError);
        this.showSaveStatus(`ローカル保存成功、GitHub保存失敗: ${githubError.message}`, 'warning');
      }
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
   * GitHub API経由で保存（Phase 2実装）
   */
  async saveToGitHub(data) {
    if (!this.GITHUB_TOKEN) {
      throw new Error('GitHub Personal Access Tokenが設定されていません');
    }
    
    const fileName = `data/history/${data.date}.json`;
    const content = JSON.stringify(data, null, 2);
    const contentBase64 = btoa(unescape(encodeURIComponent(content)));
    
    // 既存ファイルのSHA取得（更新の場合）
    let existingSha = null;
    try {
      const getResponse = await fetch(
        `https://api.github.com/repos/${this.GITHUB_OWNER}/${this.GITHUB_REPO}/contents/${fileName}`,
        {
          headers: {
            'Authorization': `token ${this.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );
      if (getResponse.ok) {
        const existingFile = await getResponse.json();
        existingSha = existingFile.sha;
      }
    } catch (error) {
      // ファイルが存在しない場合は新規作成
      console.log('新規ファイル作成:', fileName);
    }
    
    // ファイルのコミット
    const requestBody = {
      message: `Update history for ${data.date}`,
      content: contentBase64,
      branch: 'main'
    };
    
    if (existingSha) {
      requestBody.sha = existingSha;
    }
    
    const response = await fetch(
      `https://api.github.com/repos/${this.GITHUB_OWNER}/${this.GITHUB_REPO}/contents/${fileName}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${this.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`GitHub API エラー: ${errorData.message}`);
    }
    
    const result = await response.json();
    console.log('GitHub保存成功:', result.content.html_url);
    return result;
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
