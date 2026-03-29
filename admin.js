/**
 * 管理者ページ - 食事記録管理
 * 
 * 機能:
 * - 日付選択 & メニュー読込（Supabaseから）
 * - 食べたメニューの選択
 * - Supabase経由でデータ保存
 * - 履歴表示
 */

// Supabase クライアント初期化
const _adminSupabaseClient = window.supabase.createClient(
  'https://zzleqjendqkoizbdvblw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6bGVxamVuZHFrb2l6YmR2Ymx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NjA0ODYsImV4cCI6MjA5MDAzNjQ4Nn0.OwuE6oJYLuA9nzEm-lAKq6BNc-J9RWv1ylZ9cH34vY8'
);

class AdminApp {
  constructor() {
    this.currentDate = null;
    this.availableMenus = [];
    this.selectedMenus = new Set();
    this.menuRatings = {}; // メニュー名 -> 評価(1-5) のマッピング
    
    this.initializeEventListeners();
    this.loadRecentHistory();
  }

  /**
   * イベントリスナー初期化
   */
  initializeEventListeners() {
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
   * メニュー読込（Supabaseから取得）
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
    this.menuRatings = {}; // 前回の評価をクリア
    this.showLoadStatus('メニュー読込中...', 'info');
    
    try {
      // Supabaseからメニューデータを取得
      const { data, error } = await _adminSupabaseClient
        .from('menus')
        .select('menu_name, nutrition')
        .eq('date', date);
      
      if (error) throw new Error(`Supabase エラー: ${error.message}`);
      
      if (!data || data.length === 0) {
        throw new Error('メニューデータが見つかりません');
      }
      
      // データ形式を変換
      this.availableMenus = data.map(item => ({
        name: item.menu_name,
        nutrition: item.nutrition
      }));
      
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
      label.textContent = menu.name;
      
      // チェックボックス自体のクリックを無効化
      checkbox.addEventListener('click', (e) => {
        e.preventDefault();
      });
      
      // アイテム全体をクリック可能に
      item.addEventListener('click', (e) => {
        // 星をクリックした場合は無視
        if (e.target.classList.contains('star-rating') || e.target.classList.contains('star')) {
          return;
        }
        e.preventDefault();
        checkbox.checked = !checkbox.checked;
        if (checkbox.checked) {
          this.selectedMenus.add(menu.name);
          // デフォルト評価を設定
          if (!this.menuRatings[menu.name]) {
            this.menuRatings[menu.name] = 3;
          }
        } else {
          this.selectedMenus.delete(menu.name);
          delete this.menuRatings[menu.name];
        }
        this.updateSelectionCount();
        this.updateNutritionSummary();
      });
      
      item.appendChild(checkbox);
      item.appendChild(label);
      
      // 星評価ウィジェットを追加（選択されている場合のみ）
      if (this.selectedMenus.has(menu.name)) {
        const ratingDiv = document.createElement('div');
        ratingDiv.className = 'star-rating';
        const currentRating = this.menuRatings[menu.name] || 3;
        
        for (let i = 1; i <= 5; i++) {
          const star = document.createElement('span');
          star.className = 'star';
          star.textContent = i <= currentRating ? '★' : '☆';
          star.style.cursor = 'pointer';
          star.style.fontSize = '18px';
          star.style.color = i <= currentRating ? '#ffc107' : '#ddd';
          star.addEventListener('click', (e) => {
            e.stopPropagation();
            this.menuRatings[menu.name] = i;
            this.renderMenuSelection();
          });
          ratingDiv.appendChild(star);
        }
        item.appendChild(ratingDiv);
      }
      
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
      // まずSupabaseから取得を試みる
      const supabaseData = await this.fetchHistoryFromSupabase(date);
      
      if (supabaseData) {
        let menuNames = [];
        if (supabaseData.selected_menus) {
          menuNames = supabaseData.selected_menus.map(m => m.name);
          // 評価データも復元
          supabaseData.selected_menus.forEach(m => {
            if (m.rating) {
              this.menuRatings[m.name] = m.rating;
            }
          });
        }
        
        if (menuNames.length > 0) {
          this.selectedMenus = new Set(menuNames);
          this.renderMenuSelection();
          this.updateSelectionCount();
          this.updateNutritionSummary();
          this.showLoadStatus(`既存の記録を読み込みました（${menuNames.length}件）`, 'info');
          return;
        }
      }
      
      // Supabaseにデータがなければローカルストレージを確認
      const storageKey = `history_${date}`;
      const existingData = localStorage.getItem(storageKey);
      
      if (existingData) {
        const data = JSON.parse(existingData);
        let menuNames = [];
        if (data.selectedMenus) {
          menuNames = data.selectedMenus.map(m => m.name);
          // 評価データも復元
          data.selectedMenus.forEach(m => {
            if (m.rating) {
              this.menuRatings[m.name] = m.rating;
            }
          });
        }
        
        if (menuNames.length > 0) {
          this.selectedMenus = new Set(menuNames);
          this.renderMenuSelection();
          this.updateSelectionCount();
          this.updateNutritionSummary();
          this.showLoadStatus('既存の記録を読み込みました（ローカル）', 'info');
        }
      }
    } catch (error) {
      console.error('既存履歴読込エラー:', error);
      // エラーは無視して続行
    }
  }

  /**
   * Supabaseから履歴データを取得
   */
  async fetchHistoryFromSupabase(date) {
    try {
      const { data, error } = await _adminSupabaseClient
        .from('meal_history')
        .select('*')
        .eq('date', date)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          // データが見つからない
          console.log(`📭Supabase: 履歴データなし: ${date}`);
          return null;
        }
        throw error;
      }
      
      console.log(`✅ Supabase履歴データ取得成功: ${date}`);
      return data;
      
    } catch (error) {
      console.error('Supabase履歴取得エラー:', error);
      return null;
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
      // 選択されたメニューの詳細データを取得
      const selectedMenusData = [];
      const nutritionTotal = {
        'エネルギー': 0,
        'たんぱく質': 0,
        '脂質': 0,
        '炭水化物': 0,
        '野菜重量': 0
      };
      
      this.availableMenus.forEach(menu => {
        if (this.selectedMenus.has(menu.name)) {
          // メニュー詳細を追加（評価スコア付き）
          selectedMenusData.push({
            name: menu.name,
            nutrition: menu.nutrition || {},
            rating: this.menuRatings[menu.name] || 3  // デフォルト値: 3
          });
          
          // 栄養合計を計算
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
        day_of_week: this.getDayOfWeek(this.currentDate),
        user_name: "ONO",
        timestamp: new Date().toISOString(),
        settings: {
          targets: {}, // 管理者ページでは目標設定なし
          preferences: {}
        },
        selected_menus: selectedMenusData,
        totals: nutritionTotal,
        achievement: {} // 目標がないので空
      };
      
      // Phase 1: ローカルストレージに保存（オフライン用）
      const storageKey = `history_${this.currentDate}`;
      const localData = {
        date: this.currentDate,
        dayOfWeek: historyData.day_of_week,
        user: "ONO",
        timestamp: historyData.timestamp,
        settings: historyData.settings,
        selectedMenus: selectedMenusData,
        totals: nutritionTotal,
        achievement: {}
      };
      localStorage.setItem(storageKey, JSON.stringify(localData));
      
      // Phase 2: Supabaseに保存
      try {
        await this.saveToSupabase(historyData);
        this.showSaveStatus('Supabase に保存しました！', 'success');
      } catch (supabaseError) {
        console.error('Supabase保存エラー:', supabaseError);
        this.showSaveStatus(`ローカル保存成功、Supabase保存失敗: ${supabaseError.message}`, 'warning');
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
   * Supabase経由で保存
   */
  async saveToSupabase(data) {
    const { error } = await _adminSupabaseClient
      .from('meal_history')
      .upsert({
        date: data.date,
        day_of_week: data.day_of_week,
        user_name: data.user_name,
        timestamp: data.timestamp,
        settings: data.settings,
        selected_menus: data.selected_menus,
        totals: data.totals,
        achievement: data.achievement
      }, {
        onConflict: 'date'
      });
    
    if (error) {
      throw new Error(`Supabase API エラー: ${error.message}`);
    }
    
    console.log('Supabase保存成功:', data.date);
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
      
      // 新形式・旧形式の両方に対応
      const menusList = history.selectedMenus 
        ? history.selectedMenus.map(m => m.name)
        : history.eaten || [];
      
      menusEl.textContent = `${menusList.length}件: ${menusList.join(', ')}`;
      
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

  /**
   * 日付から曜日を取得
   */
  getDayOfWeek(dateStr) {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const date = new Date(dateStr + 'T00:00:00');
    return days[date.getDay()];
  }
}

// アプリ初期化
document.addEventListener('DOMContentLoaded', () => {
  console.log('管理者ページ初期化...');
  new AdminApp();
});
