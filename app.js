/**
 * メニュー最適化 Web アプリ - フロントエンド
 * iPhone 対応、チェックボタン式メニュー選択
 */

class MenuOptimizationApp {
  constructor() {
    this.allMenus = []; // スクレイピングされた全メニュー
    this.filteredMenus = []; // 検索フィルター済みメニュー
    this.selectedNutritionTargets = {}; // ユーザーが選択した栄養目標
    this.fixedMenus = new Set(); // 固定メニュー名のセット
    this.excludedMenus = new Set(); // 除外メニュー名のセット
    this.lastOptimizationResult = null; // 最後の最適化結果
    this.tempExcludedMenus = new Set(); // 結果から一時的に除外するメニュー
    this.cachedDates = []; // キャッシュされた日付マッピング (dateLabel -> YYYY-MM-DD)
    this.aiSelections = null; // AI推薦データ { selectedMenus: [{name, score, rank, reasons}], allMenusWithScores: [...] }

    this.loadSettings(); // ローカルストレージから設定を復元
    this.initializeEventListeners();
    this.loadAvailableDates(); // 利用可能な日付を読込
  }

  /**
   * イベントリスナーを初期化
   */
  initializeEventListeners() {
    // タブ切り替え
    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });

    // 栄養目標：外枠タップは選択ON/OFF（キーボードは出さない）
    // 入力欄タップは編集（必要なら選択ON+デフォルト投入）
    document.querySelectorAll('.nutrition-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const clickedInput = e.target.closest && e.target.closest('.nutrition-value');
        if (clickedInput) {
          // 入力欄をタップ：編集はブラウザに任せる。未選択なら選択ON+デフォルト投入だけ行う。
          this.ensureNutritionItemActive(item);
          return;
        }

        // 外枠タップ：ON/OFF 切替（編集はしない）
        this.toggleNutritionItem(item, { focusInput: false });
      });
    });

    document.querySelectorAll('.nutrition-value').forEach(input => {
      input.addEventListener('input', () => {
        // 目標値変更時は固定のみ集計の差分表示も更新
        this.updateFixedSummary();
        // 設定を保存
        this.saveSettings();
      });
    });

    // 日付選択変更
    document.getElementById('date-input').addEventListener('change', () => {
      this.loadMenus();
      // AIタブも同じ日付で更新
      const dateSelect = document.getElementById('date-input');
      const selectedDate = dateSelect.value; // "1/13(月)" 形式
      console.log('📅 日付変更イベント:', selectedDate);
      if (selectedDate) {
        const isoDate = this.dateLabelToISOString(selectedDate);
        console.log('📅 ISO形式に変換:', isoDate);
        this.loadAIMenus(isoDate);
      }
    });

    // 最大メニュー数の変更時に設定を保存
    const maxMenusInput = document.getElementById('max-menus-input');
    if (maxMenusInput) {
      maxMenusInput.addEventListener('input', () => {
        this.saveSettings();
      });
    }

    // メニュー検索
    document.getElementById('menu-search').addEventListener('input', (e) => {
      this.filterMenus(e.target.value);
    });

    // 最適化実行ボタン
    document.getElementById('optimize-button').addEventListener('click', () => this.runOptimization());

    // 最適化なしで結果表示（固定のみ）
    const fixedOnlyBtn = document.getElementById('fixed-only-result-button');
    if (fixedOnlyBtn) {
      fixedOnlyBtn.addEventListener('click', () => this.showFixedOnlyResult());
    }

    // 再最適化ボタン
    document.getElementById('re-optimize-button').addEventListener('click', () => this.runOptimization());

    // 設定に戻るボタン
    document.getElementById('back-to-edit-button').addEventListener('click', () => {
      this.switchTab('input-tab');
    });
  }

  /**
   * dateLabel（"1/13(火)" 形式）を YYYY-MM-DD 形式に変換
   */
  dateLabelToISOString(dateLabel) {
    if (!dateLabel) return null;
    
    const match = dateLabel.match(/(\d{1,2})\/(\d{1,2})/);
    if (!match) return null;

    const [, month, day] = match;
    const today = new Date();
    let year = today.getFullYear();

    // 月日が今日より前の場合は、来年と判定
    const monthNum = parseInt(month);
    const dayNum = parseInt(day);
    if (monthNum < today.getMonth() + 1 || (monthNum === today.getMonth() + 1 && dayNum < today.getDate())) {
      year = today.getFullYear() + 1;
    }

    const monthStr = String(monthNum).padStart(2, '0');
    const dayStr = String(dayNum).padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
  }

  /**
   * YYYY-MM-DD 形式を M/D(曜日) 形式に変換
   */
  isoDateToDateLabel(isoDate) {
    if (!isoDate) return null;
    
    const [year, month, day] = isoDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const dayOfWeek = days[date.getDay()];
    
    return `${month}/${day}(${dayOfWeek})`;
  }

  /**
   * メニューを読込（JSON ファイルから直接読込）
   */
  async loadMenus() {
    try {
      const dateSelect = document.getElementById('date-input');
      const selectedDateLabel = dateSelect.value; // "1/13(火)" 形式

      if (!selectedDateLabel) {
        console.error('日付が選択されていません');
        return;
      }

      // dateLabel を YYYY-MM-DD 形式に変換
      const isoDate = this.dateLabelToISOString(selectedDateLabel);
      if (!isoDate) {
        throw new Error('日付の形式が正しくありません');
      }

      // JSON ファイルから直接読込（GitHub Pages）
      const response = await fetch(`./menus/menus_${isoDate}.json`);
      if (!response.ok) {
        throw new Error(`メニュー「${selectedDateLabel}」が見つかりません`);
      }
      const data = await response.json();
      this.allMenus = data.menus || [];
      this.filteredMenus = [...this.allMenus];
      
      // AI推薦データを読み込み（エラーでも継続）
      try {
        await this.loadAISelections(isoDate);
      } catch (aiError) {
        console.warn('AI推薦データの読み込みに失敗しましたが、メニュー表示は継続します:', aiError);
        this.aiSelections = null;
      }
      
      this.renderMenusList();
      this.updateFixedSummary();
    } catch (error) {
      console.error('メニュー読込エラー:', error);
      document.getElementById('menus-list-container').innerHTML = 
        `<p class="error-message">メニュー読込エラー: ${error.message}</p>`;
    }
  }

  /**
   * 利用可能な日付を読込（menus/ フォルダのデータから）
   * - ページ開いている日以降のみを選択可能
   * - デフォルトは本日（存在する場合）
   */
  async loadAvailableDates() {
    try {
      console.log('📅 loadAvailableDates() 実行開始');
      
      // ✅ 修正：ファイルパスを menus/ フォルダに統一
      const response = await fetch('./menus/available-dates.json');
      
      console.log('🔗 Fetch response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: 利用可能な日付の取得に失敗しました`);
      }
      
      const data = await response.json();
      console.log('✅ データ取得成功:', data);
      
      const availableDates = data.dates || [];
      console.log('📅 利用可能な日付:', availableDates);
      
      if (availableDates.length === 0) {
        const dateSelect = document.getElementById('date-input');
        dateSelect.innerHTML = '<option value="">メニューデータがありません</option>';
        return;
      }

      // YYYY-MM-DD 形式から M/D(曜日) 形式に変換
      const dateLabels = availableDates.map(isoDate => this.isoDateToDateLabel(isoDate));
      
      // 本日の日付を取得
      const today = new Date();
      const todayMonthDay = `${today.getMonth() + 1}/${today.getDate()}`;

      // ページ開いている日以降の日付をフィルタリング
      const filteredDates = dateLabels.filter(dateLabel => {
        const match = dateLabel.match(/(\d{1,2})\/(\d{1,2})/);
        if (!match) return false;

        const [, month, day] = match;
        const monthNum = parseInt(month);
        const dayNum = parseInt(day);

        // 本日以降の日付か判定
        if (monthNum > today.getMonth() + 1) {
          return true; // 翌月以降
        }
        if (monthNum === today.getMonth() + 1 && dayNum >= today.getDate()) {
          return true; // 今月で本日以降
        }
        return false;
      });

      console.log('🔍 フィルター後の日付:', filteredDates);

      if (filteredDates.length === 0) {
        const dateSelect = document.getElementById('date-input');
        dateSelect.innerHTML = '<option value="">本日以降のメニューデータがありません</option>';
        return;
      }

      const dateSelect = document.getElementById('date-input');
      dateSelect.innerHTML = '';

      // フィルター後の日付をオプションに追加
      filteredDates.forEach(dateLabel => {
        const option = document.createElement('option');
        option.value = dateLabel; // "1/13(火)" 形式
        option.textContent = dateLabel; // "1/13(火)" 形式で表示
        dateSelect.appendChild(option);
      });

      // デフォルトは本日（存在する場合）、なければ本日以降の最初の平日
      const getNearestWeekday = (startDate) => {
        // 指定日付から開始して、最初の平日を見つける
        let current = new Date(startDate);
        while (true) {
          const dayOfWeek = current.getDay();
          // 平日判定（月=1 ～ 金=5、土=6日曜=0は除外）
          if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            return current;
          }
          // 次の日へ
          current.setDate(current.getDate() + 1);
          
          // 無限ループ防止（30日以内）
          if (current > new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000)) {
            return startDate;
          }
        }
      };
      
      // 本日が平日か、そうでなければ次の平日を見つける
      const todayOrNextWeekday = getNearestWeekday(today);
      const targetMonthDay = `${todayOrNextWeekday.getMonth() + 1}/${todayOrNextWeekday.getDate()}`;
      
      const targetOption = filteredDates.find(d => d.startsWith(targetMonthDay));
      if (targetOption) {
        console.log('✅ デフォルト選択日付:', targetOption);
        dateSelect.value = targetOption;
      } else {
        console.log('ℹ️ デフォルト選択日付なし。最初の利用可能日付を選択:', filteredDates[0]);
        dateSelect.value = filteredDates[0];
      }

      await this.loadMenus(); // メニュー読込
    } catch (error) {
      console.error('❌ 利用可能な日付の読込エラー:', error);
      const dateSelect = document.getElementById('date-input');
      dateSelect.innerHTML = '<option value="">エラー: 日付を取得できません</option>';
    }
  }

  /**
   * AI推薦データを読み込む
   */
  async loadAISelections(date) {
    try {
      const response = await fetch(`./docs/ai-selections/ai-selections_${date}.json`);
      if (response.ok) {
        this.aiSelections = await response.json();
        console.log(`✅ AI推薦データ読み込み完了: ${date}`);
      } else {
        console.log(`⚠️  AI推薦データが見つかりません: ${date}`);
        this.aiSelections = null;
      }
    } catch (error) {
      console.warn('AI推薦データ読み込みエラー:', error);
      this.aiSelections = null;
    }
  }

  /**
   * メニューのAI推薦情報を取得
   */
  getAIRecommendation(menuName) {
    if (!this.aiSelections || !this.aiSelections.allMenusWithScores) {
      return null;
    }
    return this.aiSelections.allMenusWithScores.find(m => m.name === menuName);
  }

  /**
   * メニューをフィルター（検索）
   */
  filterMenus(query) {
    if (!query.trim()) {
      this.filteredMenus = [...this.allMenus];
    } else {
      this.filteredMenus = this.allMenus.filter(menu =>
        menu.name.toLowerCase().includes(query.toLowerCase())
      );
    }
    this.renderMenusList();
  }

  /**
   * メニュー一覧をレンダリング
   */
  renderMenusList() {
    const container = document.getElementById('menus-list-container');
    container.innerHTML = '';

    if (this.filteredMenus.length === 0) {
      container.innerHTML = '<p class="empty-message">該当するメニューがありません</p>';
      return;
    }

    this.filteredMenus.forEach(menu => {
      const item = document.createElement('div');
      item.className = 'menu-list-item';

      // メニューの状態判定
      const isFixed = this.fixedMenus.has(menu.name);
      const isExcluded = this.excludedMenus.has(menu.name);
      
      // CSS クラス設定：状態に応じて .fixed または .excluded を追加
      // （.suggested はデフォルト）
      if (isFixed) {
        item.classList.add('fixed');
      } else if (isExcluded) {
        item.classList.add('excluded');
      } else {
        // デフォルト：推奨（特別なクラスは不要）
      }

      // メニュー詳細情報
      const details = document.createElement('div');
      details.className = 'menu-list-item-details';

      const name = document.createElement('div');
      name.className = 'menu-list-item-name';
      name.textContent = menu.name;

      // 栄養情報を表示（E, P, F, C, V で表示）
      const nutrition = document.createElement('div');
      nutrition.className = 'menu-list-item-nutrition';

      const nutritionMap = [
        { key: 'エネルギー', label: 'E', class: 'nutrition-e' },
        { key: 'たんぱく質', label: 'P', class: 'nutrition-p' },
        { key: '脂質', label: 'F', class: 'nutrition-f' },
        { key: '炭水化物', label: 'C', class: 'nutrition-c' },
        { key: '野菜重量', label: 'V', class: 'nutrition-v' }
      ];

      nutritionMap.forEach(({ key, label, class: className }) => {
        const value = menu.nutrition?.[key];
        if (value !== undefined && value !== null) {
          const nutritionItem = document.createElement('div');
          nutritionItem.className = `menu-list-item-nutrition-item ${className}`;
          const displayValue = typeof value === 'number' ? value : value;
          nutritionItem.innerHTML = `<span>${displayValue}</span>`;
          nutrition.appendChild(nutritionItem);
        }
      });

      // 固定トグル（6列目に配置）
      const footer = document.createElement('div');
      footer.className = 'menu-list-item-footer';

      const fixedToggleWrap = document.createElement('div');
      fixedToggleWrap.className = 'menu-fixed-toggle';
      fixedToggleWrap.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      const switchLabel = document.createElement('label');
      switchLabel.className = 'ios-switch';
      switchLabel.setAttribute('aria-label', '固定');
      switchLabel.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      const switchInput = document.createElement('input');
      switchInput.type = 'checkbox';
      switchInput.checked = isFixed;
      switchInput.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      switchInput.addEventListener('change', (e) => {
        e.stopPropagation();
        this.setFixed(menu.name, e.target.checked);
      });

      const switchSlider = document.createElement('span');
      switchSlider.className = 'ios-switch-slider';
      switchSlider.setAttribute('aria-hidden', 'true');
      switchSlider.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      switchLabel.appendChild(switchInput);
      switchLabel.appendChild(switchSlider);
      fixedToggleWrap.appendChild(switchLabel);
      footer.appendChild(fixedToggleWrap);
      nutrition.appendChild(footer);

      // 状態ラベル（絶対配置で右上に表示）
      const stateLabel = document.createElement('div');
      stateLabel.className = 'menu-state-label';
      stateLabel.textContent = isFixed ? '固定' : (isExcluded ? '除外' : '推奨');

      details.appendChild(name);
      details.appendChild(nutrition);
      item.appendChild(details);
      item.appendChild(stateLabel);

      // 行タップ：推奨/除外を切り替え
      // ただし固定ONの場合は「固定解除→除外」に切り替える
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onMenuRowTapped(menu.name);
      });

      container.appendChild(item);
    });

    this.updateFixedSummary();
  }

  setFixed(menuName, isOn) {
    if (isOn) {
      // 仕様: 固定ONで除外は自動解除
      this.fixedMenus.add(menuName);
      this.excludedMenus.delete(menuName);
    } else {
      this.fixedMenus.delete(menuName);
    }
    this.renderMenusList();
  }

  onMenuRowTapped(menuName) {
    const isFixed = this.fixedMenus.has(menuName);
    const isExcluded = this.excludedMenus.has(menuName);

    if (isFixed) {
      // 仕様: 固定ON中に行タップ -> 固定解除して除外へ
      this.fixedMenus.delete(menuName);
      this.excludedMenus.add(menuName);
    } else {
      // 推奨/除外 をトグル
      if (isExcluded) {
        this.excludedMenus.delete(menuName);
      } else {
        this.excludedMenus.add(menuName);
      }
    }

    this.renderMenusList();
  }

  // 旧: cycleMenuState（循環タップ） は UI 方針変更により未使用

  /**
   * メニューを通常に設定
   */
  setMenuNormal(menuName) {
    this.fixedMenus.delete(menuName);
    this.excludedMenus.delete(menuName);
    this.renderMenusList();
  }

  /**
   * メニューを固定に設定
   */
  setMenuFixed(menuName) {
    this.fixedMenus.add(menuName);
    this.excludedMenus.delete(menuName);
    this.renderMenusList();
  }

  /**
   * メニューを除外に設定
   */
  setMenuExcluded(menuName) {
    this.fixedMenus.delete(menuName);
    this.excludedMenus.add(menuName);
    this.renderMenusList();
  }

  getNutritionTargetsFromUI() {
    const targets = {};
    document.querySelectorAll('.nutrition-item.active').forEach(item => {
      const key = item.dataset.key;
      const input = item.querySelector('.nutrition-value');
      const value = parseFloat(input.value);
      if (!isNaN(value) && value > 0) {
        targets[key] = value;
      }
    });
    return targets;
  }

  getFixedMenusData() {
    if (!this.allMenus || this.allMenus.length === 0) return [];
    const fixedNames = this.fixedMenus;
    return this.allMenus.filter(m => fixedNames.has(m.name));
  }

  calculateNutritionTotals(menus) {
    const totals = {
      'エネルギー': 0,
      'たんぱく質': 0,
      '脂質': 0,
      '炭水化物': 0,
      '野菜重量': 0
    };

    menus.forEach(menu => {
      Object.keys(totals).forEach(key => {
        const value = menu?.nutrition?.[key];
        const numeric = typeof value === 'number' ? value : parseFloat(value);
        if (!isNaN(numeric)) {
          totals[key] += numeric;
        }
      });
    });

    return totals;
  }

  updateFixedSummary() {
    const summaryEl = document.getElementById('fixed-summary');
    const countEl = document.getElementById('fixed-summary-count');
    const valuesEl = document.getElementById('fixed-summary-header');
    if (!summaryEl || !countEl || !valuesEl) return;

    const fixedMenus = this.getFixedMenusData();
    countEl.textContent = `${fixedMenus.length}件`;

    const totals = this.calculateNutritionTotals(fixedMenus);
    const targets = this.getNutritionTargetsFromUI();

    const display = [
      { key: 'エネルギー', label: 'E' },
      { key: 'たんぱく質', label: 'P' },
      { key: '脂質', label: 'F' },
      { key: '炭水化物', label: 'C' },
      { key: '野菜重量', label: 'V' }
    ];

    // valuesElをクリアして、6列グリッドとして再構築
    valuesEl.innerHTML = '';
    
    display.forEach(({ key, label }) => {
      const pill = document.createElement('div');
      pill.className = 'fixed-summary-pill';

      const totalValue = totals[key] || 0;
      const targetValue = targets[key];
      const hasTarget = targetValue !== undefined;
      const diff = hasTarget ? (totalValue - targetValue) : null;

      const formattedTotal = Number.isFinite(totalValue) ? (Math.round(totalValue * 10) / 10) : '-';
      const formattedDiff = hasTarget ? `${diff >= 0 ? '+' : ''}${Math.round(diff * 10) / 10}` : '—';

      pill.innerHTML = `
        <div class="fixed-summary-pill-label">${label}</div>
        <div class="fixed-summary-pill-value">${formattedTotal}</div>
        <div class="fixed-summary-pill-diff">${formattedDiff}</div>
      `;

      valuesEl.appendChild(pill);
    });
    
    // 件数を6列目に追加
    valuesEl.appendChild(countEl);
  }

  ensureNutritionItemActive(item) {
    if (!item || item.classList.contains('active')) return;
    this.toggleNutritionItem(item, { focusInput: false, forceActive: true });
  }

  /**
   * タブを切り替える
   */
  switchTab(tabName) {
    // タブボタンの状態を更新
    document.querySelectorAll('.tab-button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // タブコンテンツの表示/非表示を切り替える
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === tabName);
    });
  }

  /**
   * 栄養目標アイテムをクリック（選択/解除）
   */
  toggleNutritionItem(item, options = {}) {
    const key = item.dataset.key;
    const input = item.querySelector('.nutrition-value');

    const { focusInput = true, forceActive = false } = options;

    if (item.classList.contains('active') && !forceActive) {
      // 選択解除
      item.classList.remove('active');
      input.value = '';
      delete this.selectedNutritionTargets[key];
    } else {
      // 選択
      item.classList.add('active');
      const defaults = {
        'エネルギー': '650',
        'たんぱく質': '30',
        '脂質': '25',
        '炭水化物': '95',
        '野菜重量': '120'
      };
      if (!input.value) {
        input.value = defaults[key] || '';
      }
      if (focusInput) {
        input.focus();
      }
    }

    this.updateFixedSummary();
    // 設定を保存
    this.saveSettings();
  }

  /**
   * 栄養目標チェックボックスがクリックされたとき（非推奨：toggleNutritionItem に置き換え）
   */
  toggleNutritionInput(checkbox) {
    const key = checkbox.dataset.key;
    const input = document.querySelector(`.nutrition-value[data-key="${key}"]`);

    if (checkbox.checked) {
      input.disabled = false;
      input.focus();
      // デフォルト値を設定
      if (!input.value) {
        const defaults = {
          'エネルギー': '650',
          'たんぱく質': '30',
          '脂質': '25',
          '炭水化物': '95',
          '野菜重量': '120'
        };
        input.value = defaults[key] || '';
      }
    } else {
      input.disabled = true;
      input.value = '';
      // 目標から削除
      delete this.selectedNutritionTargets[key];
    }

    // 入力値の変更をリッスン
    if (checkbox.checked) {
      input.removeEventListener('input', this.onNutritionValueChange);
      input.addEventListener('input', (e) => this.onNutritionValueChange(e, key));
    }
  }

  /**
   * 栄養値の入力が変更された時
   */
  onNutritionValueChange(e, key) {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value > 0) {
      this.selectedNutritionTargets[key] = value;
    }
  }

  /**
   * 最適化を実行（フロントエンドのみ）
   */
  async runOptimization() {
    // バリデーション
    const dateSelect = document.getElementById('date-input');
    const dateLabelValue = dateSelect.value;
    
    // 栄養目標を再取得（アクティブな nutrition-item から）
    const targets = {};
    document.querySelectorAll('.nutrition-item.active').forEach(item => {
      const key = item.dataset.key;
      const input = item.querySelector('.nutrition-value');
      const value = parseFloat(input.value);
      if (!isNaN(value) && value > 0) {
        targets[key] = value;
      }
    });

    if (Object.keys(targets).length === 0) {
      this.showError('栄養目標を最低1つ選択してください');
      return;
    }

    // UI を更新
    this.showLoading(true);
    this.hideError();

    try {
      // 固定・除外メニューの名前を取得（一時除外を含める）
      const fixedMenuNames = Array.from(this.fixedMenus);
      const excludedMenuNames = Array.from(this.excludedMenus).concat(Array.from(this.tempExcludedMenus));

      console.log('最適化実行:', {
        dateLabel: dateLabelValue,
        targets,
        menus: this.allMenus.length,
        fixedMenuNames,
        excludedMenuNames
      });

      // フロントエンドで最適化を実行（簡易版）
      const result = this.performOptimization(
        this.allMenus,
        targets,
        fixedMenuNames,
        excludedMenuNames,
        dateLabelValue
      );

      this.lastOptimizationResult = result;
      this.tempExcludedMenus.clear(); // 一時除外をリセット
      this.displayResults(result);
      // 自動で結果タブに切り替え
      this.switchTab('result-tab');

    } catch (error) {
      console.error('最適化エラー:', error);
      this.showError(`エラー: ${error.message}`);
    } finally {
      this.showLoading(false);
    }
  }

  showFixedOnlyResult() {
    this.hideError();
    this.showLoading(true);
    try {
      const dateSelect = document.getElementById('date-input');
      const dateLabelValue = dateSelect ? dateSelect.value : '';

      const fixedMenus = this.getFixedMenusData();
      if (!fixedMenus || fixedMenus.length === 0) {
        this.showError('固定メニューがありません（固定を1つ以上選択してください）');
        return;
      }

      const targets = this.getNutritionTargetsFromUI();
      const fixedNutrition = this.calculateTotalNutrition(fixedMenus);
      const additionalNutrition = {};
      const totalNutrition = { ...fixedNutrition };

      const difference = {};
      Object.keys(targets).forEach(key => {
        difference[key] = (totalNutrition[key] || 0) - targets[key];
      });

      const distance = Object.keys(targets).length > 0 ? this.calculateDistance(targets, totalNutrition) : 0;

      const result = {
        date: dateLabelValue,
        dateLabel: dateLabelValue,
        fixedMenus,
        additionalMenus: [],
        selectedMenus: [...fixedMenus],
        fixedNutrition,
        additionalNutrition,
        totalNutrition,
        targets,
        difference,
        distance,
        minimumLimits: {}
      };

      this.displayResults(result);
      this.switchTab('result-tab');
    } catch (error) {
      console.error('固定のみ結果表示エラー:', error);
      this.showError(`エラー: ${error.message}`);
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * フロントエンド側での最適化処理（簡易版）
   */
  performOptimization(menus, targets, fixedMenuNames, excludedMenuNames, dateLabel) {
    // 固定メニューを取得
    const fixedMenus = menus.filter(m => fixedMenuNames.includes(m.name));
    const fixedNutrition = this.calculateTotalNutrition(fixedMenus);

    // 固定メニュー以外で選択可能なメニュー
    const availableMenus = menus.filter(m => 
      !fixedMenuNames.includes(m.name) && 
      !excludedMenuNames.includes(m.name)
    );

    // 最大メニュー数を取得（入力欄から）
    const maxMenusInput = document.getElementById('max-menus-input');
    const maxMenus = maxMenusInput ? parseInt(maxMenusInput.value) || availableMenus.length : availableMenus.length;

    // 貪欲法で追加メニューを選択
    const additionalMenus = this.selectMenusByGreedy(
      availableMenus,
      targets,
      fixedNutrition,
      maxMenus
    );

    const additionalNutrition = this.calculateTotalNutrition(additionalMenus);
    const totalNutrition = this.addNutritionObjects(fixedNutrition, additionalNutrition);

    // 差分を計算
    const difference = {};
    const distance = this.calculateDistance(targets, totalNutrition);

    Object.keys(targets).forEach(key => {
      difference[key] = (totalNutrition[key] || 0) - targets[key];
    });

    return {
      date: dateLabel,
      dateLabel: dateLabel,
      fixedMenus: fixedMenus,
      additionalMenus: additionalMenus,
      selectedMenus: [...fixedMenus, ...additionalMenus],
      fixedNutrition: fixedNutrition,
      additionalNutrition: additionalNutrition,
      totalNutrition: totalNutrition,
      targets: targets,
      difference: difference,
      distance: distance,
      minimumLimits: {} // 簡易版では空
    };
  }

  /**
   * 貪欲法でメニューを選択
   */
  selectMenusByGreedy(availableMenus, targets, fixedNutrition, maxMenus) {
    const selected = [];
    let currentNutrition = { ...fixedNutrition };
    const remaining = [...availableMenus];

    let currentScore = this.calculateDistance(targets, currentNutrition);

    for (let i = 0; i < maxMenus && remaining.length > 0; i++) {
      let bestIdx = -1;
      let bestScore = currentScore;

      // 最も目標に近づくメニューを探す
      remaining.forEach((menu, idx) => {
        const testNutrition = this.addNutritionObjects(currentNutrition, menu.nutrition || {});
        const score = this.calculateDistance(targets, testNutrition);
        
        if (score < bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      });

      // 改善しないなら終了（固定だけが最善等）
      if (bestIdx === -1) break;

      // 最高スコアのメニューを追加
      selected.push(remaining[bestIdx]);
      currentNutrition = this.addNutritionObjects(currentNutrition, remaining[bestIdx].nutrition || {});
      remaining.splice(bestIdx, 1);

      currentScore = bestScore;
    }

    return selected;
  }

  /**
   * 栄養情報の合計を計算
   */
  calculateTotalNutrition(menus) {
    const total = {};

    menus.forEach(menu => {
      if (menu.nutrition && typeof menu.nutrition === 'object') {
        Object.entries(menu.nutrition).forEach(([key, value]) => {
          if (typeof value === 'number') {
            total[key] = (total[key] || 0) + value;
          }
        });
      }
    });

    return total;
  }

  /**
   * 2つの栄養情報オブジェクトを加算
   */
  addNutritionObjects(nut1, nut2) {
    const result = { ...nut1 };
    
    Object.entries(nut2).forEach(([key, value]) => {
      if (typeof value === 'number') {
        result[key] = (result[key] || 0) + value;
      }
    });

    return result;
  }

  /**
   * 距離を計算（非対称・正規化 + 片側は誤差無視）
   *
   * ルール:
   * - P/V: 不足は許容 10% で評価、超過は誤差を無視
   * - F/C: 超過は許容 10% で評価、不足は誤差を無視
   * - E  : 超過 10% / 不足 20% をそのまま評価
   */
  calculateDistance(targets, actual) {
    const keys = Object.keys(targets || {});
    if (keys.length === 0) return 0;

    const rules = {
      'エネルギー': { overTol: 0.10, underTol: 0.20, ignoreOver: false, ignoreUnder: false },
      'たんぱく質': { overTol: 0.20, underTol: 0.10, ignoreOver: true, ignoreUnder: false },
      '脂質': { overTol: 0.10, underTol: 0.20, ignoreOver: false, ignoreUnder: true },
      '炭水化物': { overTol: 0.10, underTol: 0.20, ignoreOver: false, ignoreUnder: true },
      '野菜重量': { overTol: 0.20, underTol: 0.10, ignoreOver: true, ignoreUnder: false },
      // 互換（ラベルだけのキーを使う場合）
      'E': { overTol: 0.10, underTol: 0.20, ignoreOver: false, ignoreUnder: false },
      'P': { overTol: 0.20, underTol: 0.10, ignoreOver: true, ignoreUnder: false },
      'F': { overTol: 0.10, underTol: 0.20, ignoreOver: false, ignoreUnder: true },
      'C': { overTol: 0.10, underTol: 0.20, ignoreOver: false, ignoreUnder: true },
      'V': { overTol: 0.20, underTol: 0.10, ignoreOver: true, ignoreUnder: false }
    };

    const power = 2;
    const epsilon = 1e-6;
    let total = 0;

    keys.forEach(key => {
      const target = Number(targets[key]) || 0;
      const actualVal = Number(actual?.[key]) || 0;
      const diff = actualVal - target; // +:超過, -:不足

      const rule = rules[key];
      if (rule) {
        if (diff >= 0 && rule.ignoreOver) return;
        if (diff < 0 && rule.ignoreUnder) return;
      }

      // 目標が 0 の場合は正規化が難しいので絶対誤差
      if (target <= 0) {
        total += Math.abs(diff);
        return;
      }

      const overTol = rule?.overTol ?? 0.15;
      const underTol = rule?.underTol ?? 0.15;
      const tol = diff >= 0 ? overTol : underTol;
      const scale = Math.max(target * tol, epsilon);

      const normalized = diff / scale;
      total += Math.pow(Math.abs(normalized), power);
    });

    return total / keys.length;
  }

  updateResultTotalSummary(result) {
    const summaryEl = document.getElementById('result-total-summary');
    const countEl = document.getElementById('result-total-summary-count');
    const valuesEl = document.getElementById('result-total-summary-values');
    if (!summaryEl || !countEl || !valuesEl) return;

    const selectedMenus = result?.selectedMenus || [];
    countEl.textContent = `${selectedMenus.length}件`;

    const totals = result?.totalNutrition || {};
    const targets = result?.targets || {};

    // 栄養項目にColorClassを追加
    const colorClassMap = {
      'エネルギー': 'nutrition-e',
      'たんぱく質': 'nutrition-p',
      '脂質': 'nutrition-f',
      '炭水化物': 'nutrition-c',
      '野菜重量': 'nutrition-v'
    };

    const display = [
      { key: 'エネルギー', label: 'E' },
      { key: 'たんぱく質', label: 'P' },
      { key: '脂質', label: 'F' },
      { key: '炭水化物', label: 'C' },
      { key: '野菜重量', label: 'V' }
    ];

    valuesEl.innerHTML = '';
    display.forEach(({ key, label }) => {
      const pill = document.createElement('div');
      pill.className = `fixed-summary-pill ${colorClassMap[key] || ''}`;

      const totalValue = totals[key] || 0;
      const targetValue = targets[key];
      const hasTarget = targetValue !== undefined;
      const diff = hasTarget ? (totalValue - targetValue) : null;

      const formattedTotal = Number.isFinite(totalValue) ? (Math.round(totalValue * 10) / 10) : '-';
      const formattedDiff = hasTarget ? `${diff >= 0 ? '+' : ''}${Math.round(diff * 10) / 10}` : '—';

      pill.innerHTML = `
        <div class="fixed-summary-pill-label">${label}</div>
        <div class="fixed-summary-pill-value">${formattedTotal}</div>
        <div class="fixed-summary-pill-diff">${formattedDiff}</div>
      `;

      valuesEl.appendChild(pill);
    });
  }

  /**
   * 結果を表示
   */
  displayResults(result) {
    try {
      const { dateLabel, fixedMenus, additionalMenus, fixedNutrition, additionalNutrition, totalNutrition, targets, minimumLimits, difference, distance, selectedMenus } = result;

      // 日付を表示
      const resultDateEl = document.getElementById('result-date');
      if (resultDateEl) {
        resultDateEl.textContent = dateLabel || 'メニュー最適化結果';
      }

      // サマリーを表示
      const totalMenusEl = document.getElementById('total-menus-count');
      if (totalMenusEl) {
        totalMenusEl.textContent = (selectedMenus && selectedMenus.length) || 0;
      }

      const distanceScoreEl = document.getElementById('distance-score');
      if (distanceScoreEl) {
        distanceScoreEl.textContent = (distance || 0).toFixed(2);
      }

      // 合計（固定+提案）サマリーを表示
      this.updateResultTotalSummary(result);

      // 固定メニューがある場合は表示
      if (fixedMenus && fixedMenus.length > 0) {
        const fixedSectionEl = document.getElementById('fixed-section');
        if (fixedSectionEl) {
          fixedSectionEl.classList.remove('hidden');
          this.displayMenuGrid('fixed-menus-result', fixedMenus, false);
        }
      } else {
        const fixedSectionEl = document.getElementById('fixed-section');
        if (fixedSectionEl) {
          fixedSectionEl.classList.add('hidden');
        }
      }

      // 追加メニューを表示（除外ボタン付き）
      this.displayMenuGrid('additional-menus-result', additionalMenus || [], true);

      // 栄養情報を表示
      this.displayNutritionComparison(targets, minimumLimits, fixedNutrition, additionalNutrition, totalNutrition);

      // 結果コンテンツを表示
      const resultContentEl = document.getElementById('result-content');
      if (resultContentEl) {
        resultContentEl.classList.remove('hidden');
      }

      const loadingEl = document.getElementById('loading');
      if (loadingEl) {
        loadingEl.classList.add('hidden');
      }
    } catch (error) {
      console.error('結果表示エラー:', error);
      this.showError(`結果表示エラー: ${error.message}`);
    }
  }

  /**
   * メニューグリッドを表示（設定画面と同じスタイル）
   */
  displayMenuGrid(elementId, menus, isAdditional = false) {
    const container = document.getElementById(elementId);
    if (!container) {
      console.warn(`${elementId} 要素が見つかりません`);
      return;
    }
    container.innerHTML = '';

    if (!menus || menus.length === 0) {
      container.innerHTML = '<p class="empty-message">メニューがありません</p>';
      return;
    }

    menus.forEach(menu => {
      try {
        const item = document.createElement('div');
        item.className = 'menu-list-item';
        
        // elementId が fixed-menus-result の場合は固定スタイル
        if (elementId === 'fixed-menus-result') {
          item.classList.add('fixed');
        }
        // 提案メニュー（追加メニュー）は .suggested クラスなし（デフォルト=推奨スタイル）

        // 結果タブの追加メニュー：一時除外を反映
        const isTempExcluded = isAdditional && this.tempExcludedMenus.has(menu.name);
        if (isTempExcluded) {
          item.classList.add('excluded');
        }

        const details = document.createElement('div');
        details.className = 'menu-list-item-details';

        const name = document.createElement('div');
        name.className = 'menu-list-item-name';
        name.textContent = menu.name || '（名前なし）';

        // 価格を表示
        const price = menu.nutrition?.['価格'];
        const priceEl = document.createElement('div');
        priceEl.className = 'menu-list-item-price';
        if (price !== undefined && price !== null) {
          priceEl.textContent = `¥${price}`;
        }

        // 栄養情報を表示（E, P, F, C, V で表示）
        const nutrition = document.createElement('div');
        nutrition.className = 'menu-list-item-nutrition';

        const nutritionMap = [
          { key: 'エネルギー', label: 'E', class: 'nutrition-e' },
          { key: 'たんぱく質', label: 'P', class: 'nutrition-p' },
          { key: '脂質', label: 'F', class: 'nutrition-f' },
          { key: '炭水化物', label: 'C', class: 'nutrition-c' },
          { key: '野菜重量', label: 'V', class: 'nutrition-v' }
        ];

        nutritionMap.forEach(({ key, label, class: className }) => {
          const value = menu.nutrition?.[key];
          if (value !== undefined && value !== null) {
            const nutritionItem = document.createElement('div');
            nutritionItem.className = `menu-list-item-nutrition-item ${className}`;
            const displayValue = typeof value === 'number' ? value : value;
            nutritionItem.innerHTML = `<span>${displayValue}</span>`;
            nutrition.appendChild(nutritionItem);
          }
        });

        details.appendChild(name);
        details.appendChild(priceEl);
        details.appendChild(nutrition);

        item.appendChild(details);

        // 結果タブの見た目をメニュータブに合わせる（状態ラベル）
        const footer = document.createElement('div');
        footer.className = 'menu-list-item-footer';

        const stateLabel = document.createElement('div');
        stateLabel.className = 'menu-state-label';
        if (elementId === 'fixed-menus-result') {
          stateLabel.textContent = '固定';
        } else if (isTempExcluded) {
          stateLabel.textContent = '除外';
        } else {
          stateLabel.textContent = '推奨';
        }

        footer.appendChild(stateLabel);
        item.appendChild(footer);

        // 追加メニューは行タップで一時除外をトグル（結果タブ内）
        if (isAdditional && elementId !== 'fixed-menus-result') {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.tempExcludedMenus.has(menu.name)) {
              this.tempExcludedMenus.delete(menu.name);
            } else {
              this.tempExcludedMenus.add(menu.name);
            }
            // 再描画して状態を反映
            this.displayMenuGrid(elementId, menus, isAdditional);
          });
        }

        container.appendChild(item);
      } catch (error) {
        console.error(`メニューカード作成エラー (${menu.name}):`, error);
      }
    });
  }

  /**
   * 栄養情報の比較表を表示
   */
  displayNutritionComparison(targets, minimumLimits, fixedNutrition, additionalNutrition, totalNutrition) {
    const container = document.getElementById('nutrition-comparison');
    if (!container) {
      console.error('nutrition-comparison 要素が見つかりません');
      return;
    }
    container.innerHTML = '';

    // 達成率テーブルのコンテナ
    const tableContainer = document.createElement('div');
    tableContainer.className = 'nutrition-achievement-table';

    // ヘッダー行
    const headerRow = document.createElement('div');
    headerRow.className = 'nutrition-achievement-header';
    headerRow.innerHTML = `
      <div class="achievement-col-name">栄養項目</div>
      <div class="achievement-col-target">目標</div>
      <div class="achievement-col-actual">実績</div>
      <div class="achievement-col-diff">差分</div>
      <div class="achievement-col-rate">達成率</div>
    `;
    tableContainer.appendChild(headerRow);

    // 栄養項目の定義（超過を嫌うかどうか）
    const nutritionConfig = [
      { key: 'エネルギー', label: 'エネルギー', avoidExcess: true },
      { key: 'たんぱく質', label: 'たんぱく質', avoidExcess: false },
      { key: '脂質', label: '脂質', avoidExcess: true },
      { key: '炭水化物', label: '炭水化物', avoidExcess: true },
      { key: '野菜重量', label: '野菜重量', avoidExcess: false }
    ];

    nutritionConfig.forEach(({ key, label, avoidExcess }) => {
      const row = document.createElement('div');
      row.className = 'nutrition-achievement-row';

      const target = targets && targets[key] ? targets[key] : null;
      const actual = (totalNutrition && totalNutrition[key]) || 0;
      
      let ratePercent = 0;
      let rateText = '-';
      let barColor = '#999';
      let diff = 0;
      let diffText = '-';

      if (target && target > 0) {
        ratePercent = (actual / target) * 100;
        rateText = `${Math.round(ratePercent)}%`;
        diff = actual - target;
        diffText = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}`;

        // 色の判定
        if (avoidExcess) {
          // 超過を嫌う項目（E, F, C）: 110%超→赤、110%以下→緑、50%以下→青
          if (ratePercent > 110) {
            barColor = '#e74c3c'; // 赤
          } else if (ratePercent <= 50) {
            barColor = '#3498db'; // 青
          } else {
            barColor = '#27ae60'; // 緑
          }
        } else {
          // 不足を嫌う項目（P, V）: 90%以上→緑、90%以下→青
          if (ratePercent >= 90) {
            barColor = '#27ae60'; // 緑
          } else {
            barColor = '#3498db'; // 青
          }
        }
      }

      const barWidth = target ? Math.min(ratePercent, 200) : 0; // 最大200%まで表示

      row.innerHTML = `
        <div class="achievement-col-name">${label}</div>
        <div class="achievement-col-target">${target ? target.toFixed(1) : '-'}</div>
        <div class="achievement-col-actual">${actual.toFixed(1)}</div>
        <div class="achievement-col-diff" style="color: ${diff >= 0 ? '#27ae60' : '#e74c3c'}">${diffText}</div>
        <div class="achievement-col-rate">
          <div class="achievement-bar-container">
            <div class="achievement-bar" style="width: ${barWidth}%; background-color: ${barColor};"></div>
            <div class="achievement-bar-text">${rateText}</div>
          </div>
        </div>
      `;
      tableContainer.appendChild(row);
    });

    container.appendChild(tableContainer);
  }

  /**
   * レーダーチャートを描画
   */
  /**
   * エラーメッセージを表示
   */
  showError(message) {
    const errorElement = document.getElementById('error-message');
    errorElement.textContent = message;
    errorElement.classList.remove('hidden');
  }

  /**
   * エラーメッセージを非表示
   */
  hideError() {
    document.getElementById('error-message').classList.add('hidden');
  }

  /**
   * ローディング表示を切り替え
   */
  showLoading(show) {
    const loading = document.getElementById('loading');
    if (show) {
      loading.classList.remove('hidden');
      document.getElementById('result-content').classList.add('hidden');
    } else {
      loading.classList.add('hidden');
    }
  }

  /**
   * 設定をローカルストレージに保存
   */
  saveSettings() {
    try {
      const settings = {
        // 最大メニュー数
        maxMenus: document.getElementById('max-menus-input')?.value || 5,
        
        // 栄養目標の状態と値
        nutritionTargets: {}
      };

      // 各栄養目標の状態と値を保存
      document.querySelectorAll('.nutrition-item').forEach(item => {
        const key = item.dataset.key;
        const input = item.querySelector('.nutrition-value');
        const isActive = item.classList.contains('active');
        
        settings.nutritionTargets[key] = {
          active: isActive,
          value: input.value || ''
        };
      });

      localStorage.setItem('menuOptimizerSettings', JSON.stringify(settings));
      console.log('✅ 設定を保存しました:', settings);
    } catch (error) {
      console.error('❌ 設定の保存に失敗:', error);
    }
  }

  /**
   * 設定をローカルストレージから復元
   */
  loadSettings() {
    try {
      const savedSettings = localStorage.getItem('menuOptimizerSettings');
      if (!savedSettings) {
        console.log('ℹ️ 保存された設定がありません');
        return;
      }

      const settings = JSON.parse(savedSettings);
      console.log('📥 設定を復元します:', settings);

      // 最大メニュー数を復元
      if (settings.maxMenus) {
        const maxMenusInput = document.getElementById('max-menus-input');
        if (maxMenusInput) {
          maxMenusInput.value = settings.maxMenus;
        }
      }

      // 栄養目標の状態と値を復元
      if (settings.nutritionTargets) {
        Object.entries(settings.nutritionTargets).forEach(([key, data]) => {
          const item = document.querySelector(`.nutrition-item[data-key="${key}"]`);
          if (!item) return;

          const input = item.querySelector('.nutrition-value');
          if (!input) return;

          // 値を復元
          if (data.value) {
            input.value = data.value;
          }

          // アクティブ状態を復元
          if (data.active) {
            item.classList.add('active');
            this.selectedNutritionTargets[key] = parseFloat(data.value) || 0;
          } else {
            item.classList.remove('active');
          }
        });
      }

      console.log('✅ 設定を復元しました');
    } catch (error) {
      console.error('❌ 設定の復元に失敗:', error);
    }
  }

  // ==========================================
  // AI Menus タブ機能
  // ==========================================

  /**
   * AI Menusタブの初期化
   */
  initAIMenusTab() {
    const settingsDateInput = document.getElementById('date-input');
    const aiTab = document.querySelector('[data-tab="ai-menus-tab"]');
    
    if (!settingsDateInput || !aiTab) {
      console.error('❌ AI タブ: 必要な要素が見つかりません');
      return;
    }

    console.log('✅ AI タブ: 初期化開始');

    // タブ切り替え時にAI推薦を読み込む
    aiTab.addEventListener('click', () => {
      console.log('🔄 AIタブ: タブクリックイベント');
      
      const dateLabel = settingsDateInput.value;
      
      if (dateLabel && dateLabel !== '' && dateLabel !== '読込中...') {
        console.log('✅ AIタブ: データ読み込み開始', dateLabel);
        this.loadAITabContent();
      } else {
        console.log('⚠️ AIタブ: 日付が設定されていません');
      }
    });

    // ダッシュボード初期化（admin.htmlに移動したため削除）
    // this.initDashboard();
  }

  /**
   * ダッシュボードタブの初期化
   */
  initDashboard() {
    const dashboardTab = document.querySelector('[data-tab="dashboard-tab"]');
    if (!dashboardTab) return;

    dashboardTab.addEventListener('click', async () => {
      console.log('🔄 ダッシュボード: タブクリックイベント');
      await this.loadDashboardContent();
    });
  }

  /**
   * ダッシュボード用の全推奨データを読み込み・集計
   */
  async loadDashboardContent() {
    const loadingEl = document.getElementById('dashboard-loading');
    const errorEl = document.getElementById('dashboard-error');
    const contentEl = document.getElementById('dashboard-content');

    if (!loadingEl || !errorEl || !contentEl) {
      console.error('❌ ダッシュボード: 必要な要素が見つかりません');
      return;
    }

    loadingEl.style.display = 'flex';
    errorEl.style.display = 'none';
    contentEl.style.display = 'none';

    try {
      // 全推奨データを収集
      const allRecommendations = await this.collectAllRecommendations();
      
      if (!allRecommendations || allRecommendations.length === 0) {
        throw new Error('推奨データが見つかりません');
      }

      // 統計を計算
      const stats = this.calculateStatistics(allRecommendations);
      
      // UI を更新
      this.updateDashboardStats(stats);
      this.renderDashboardCharts(stats, allRecommendations);
      this.updateStatisticsTable(stats);
      
      contentEl.style.display = 'block';
      console.log('✅ ダッシュボード: 表示完了');
    } catch (error) {
      console.error('❌ ダッシュボード読み込みエラー:', error);
      errorEl.style.display = 'block';
    } finally {
      loadingEl.style.display = 'none';
    }
  }

  /**
   * 利用可能な全ての日付のAI推奨データを収集
   */
  async collectAllRecommendations() {
    try {
      // インデックスから利用可能な日付を取得
      const response = await fetch('docs/ai-selections/available-ai-dates.json', {
        cache: 'no-cache'
      });

      if (!response.ok) throw new Error('インデックスファイルが見つかりません');

      const indexData = await response.json();
      const dates = indexData.dates || [];

      // 各日付のAI推奨データを読み込み
      const allRecommendations = [];
      for (const date of dates) {
        try {
          const aiResponse = await fetch(`docs/ai-selections/ai-selections_${date}.json`, {
            cache: 'no-cache'
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            if (aiData.recommendations) {
              allRecommendations.push(...aiData.recommendations);
            }
          }
        } catch (e) {
          console.warn(`推奨データ読み込み失敗: ${date}`, e);
        }
      }

      return allRecommendations;
    } catch (error) {
      console.error('推奨データ収集エラー:', error);
      return [];
    }
  }

  /**
   * 統計を計算
   */
  calculateStatistics(recommendations) {
    if (!recommendations || recommendations.length === 0) {
      return {};
    }

    const stats = {
      totalMenus: recommendations.length,
      scores: [],
      energies: [],
      proteins: [],
      fats: [],
      carbs: [],
      menuFrequency: {},
      scoresByDate: {},
      avgPFC: { protein: 0, fat: 0, carbs: 0 }
    };

    let totalProteinCal = 0;
    let totalFatCal = 0;
    let totalCarbsCal = 0;
    let totalCal = 0;

    // データを集計
    recommendations.forEach(rec => {
      // スコア
      const score = (rec.score * 100);
      stats.scores.push(score);

      // 栄養情報
      const energy = rec.nutrition.energy || 0;
      const protein = rec.nutrition.protein || 0;
      const fat = rec.nutrition.fat || 0;
      const carbs = rec.nutrition.carbs || 0;

      stats.energies.push(energy);
      stats.proteins.push(protein);
      stats.fats.push(fat);
      stats.carbs.push(carbs);

      // PFC計算（カロリーベース）
      totalProteinCal += protein * 4;
      totalFatCal += fat * 9;
      totalCarbsCal += carbs * 4;
      totalCal += energy;

      // メニュー頻度
      const menuName = rec.name;
      stats.menuFrequency[menuName] = (stats.menuFrequency[menuName] || 0) + 1;
    });

    // PFC平均比率
    if (totalCal > 0) {
      stats.avgPFC = {
        protein: (totalProteinCal / totalCal * 100).toFixed(1),
        fat: (totalFatCal / totalCal * 100).toFixed(1),
        carbs: (totalCarbsCal / totalCal * 100).toFixed(1)
      };
    }

    // 統計関数
    const calcStats = (arr) => ({
      min: Math.min(...arr),
      max: Math.max(...arr),
      avg: arr.reduce((a, b) => a + b, 0) / arr.length,
      std: this.calculateStdDev(arr)
    });

    stats.scoreStats = calcStats(stats.scores);
    stats.energyStats = calcStats(stats.energies);
    stats.proteinStats = calcStats(stats.proteins);
    stats.fatStats = calcStats(stats.fats);
    stats.carbsStats = calcStats(stats.carbs);

    return stats;
  }

  /**
   * 標準偏差を計算
   */
  calculateStdDev(arr) {
    if (arr.length === 0) return 0;
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }

  /**
   * ダッシュボード統計を更新
   */
  updateDashboardStats(stats) {
    document.getElementById('stat-total-menus').textContent = stats.totalMenus;
    document.getElementById('stat-avg-score').textContent = stats.scoreStats.avg.toFixed(1) + '%';
    document.getElementById('stat-avg-energy').textContent = Math.round(stats.energyStats.avg) + ' kcal';
    document.getElementById('stat-avg-protein').textContent = stats.proteinStats.avg.toFixed(1) + ' g';
  }

  /**
   * ダッシュボードチャートをレンダリング
   */
  renderDashboardCharts(stats, recommendations) {
    // スコア分布 (ヒストグラム)
    this.renderScoreDistribution(stats.scores);

    // 日付別平均スコア
    this.renderDailyAverageScore(recommendations);

    // PFC比 (円グラフ)
    this.renderPFCRatio(stats.avgPFC);

    // Top 10 メニュー (棒グラフ)
    this.renderTopMenus(stats.menuFrequency);

    // エネルギー分布
    this.renderEnergyDistribution(stats.energies);

    // タンパク質分布
    this.renderProteinDistribution(stats.proteins);
  }

  /**
   * スコア分布チャート
   */
  renderScoreDistribution(scores) {
    const ctx = document.getElementById('chart-score-distribution');
    if (!ctx) return;

    // ヒストグラム用のビン作成
    const bins = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const histogram = new Array(bins.length - 1).fill(0);

    scores.forEach(score => {
      for (let i = 0; i < bins.length - 1; i++) {
        if (score >= bins[i] && score < bins[i + 1]) {
          histogram[i]++;
          break;
        }
      }
    });

    const labels = bins.slice(0, -1).map((b, i) => `${b}-${bins[i + 1]}%`);

    if (window.chartInstances) {
      window.chartInstances['score-distribution']?.destroy();
    } else {
      window.chartInstances = {};
    }

    window.chartInstances['score-distribution'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '推奨スコア',
          data: histogram,
          backgroundColor: 'rgba(52, 199, 89, 0.6)',
          borderColor: 'rgba(52, 199, 89, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }

  /**
   * 日付別平均スコアチャート
   */
  async renderDailyAverageScore(recommendations) {
    const ctx = document.getElementById('chart-daily-average-score');
    if (!ctx) return;

    // インデックスから日付を取得
    const indexResponse = await fetch('docs/ai-selections/available-ai-dates.json', {
      cache: 'no-cache'
    });
    const indexData = await indexResponse.json();
    const dates = indexData.dates || [];

    // 日付ごとの平均スコアを計算
    const scoresByDate = {};
    const allRecsByDate = await Promise.all(
      dates.map(async (date) => {
        try {
          const response = await fetch(`docs/ai-selections/ai-selections_${date}.json`, {
            cache: 'no-cache'
          });
          if (response.ok) {
            const data = await response.json();
            return { date, recommendations: data.recommendations };
          }
        } catch (e) {
          console.warn(`Failed to load: ${date}`, e);
        }
        return null;
      })
    );

    allRecsByDate.forEach(item => {
      if (item && item.recommendations) {
        const avg = item.recommendations.reduce((sum, rec) => sum + (rec.score * 100), 0) / item.recommendations.length;
        scoresByDate[item.date] = avg;
      }
    });

    const chartDates = Object.keys(scoresByDate).sort();
    const chartScores = chartDates.map(d => scoresByDate[d]);

    if (window.chartInstances['daily-average-score']) {
      window.chartInstances['daily-average-score'].destroy();
    }

    window.chartInstances['daily-average-score'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartDates,
        datasets: [{
          label: '平均推奨スコア',
          data: chartScores,
          borderColor: 'rgba(0, 122, 255, 1)',
          backgroundColor: 'rgba(0, 122, 255, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: { min: 0, max: 100 }
        }
      }
    });
  }

  /**
   * PFC比チャート
   */
  renderPFCRatio(avgPFC) {
    const ctx = document.getElementById('chart-pfc-ratio');
    if (!ctx) return;

    if (window.chartInstances['pfc-ratio']) {
      window.chartInstances['pfc-ratio'].destroy();
    }

    window.chartInstances['pfc-ratio'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['タンパク質', '脂質', '炭水化物'],
        datasets: [{
          data: [avgPFC.protein, avgPFC.fat, avgPFC.carbs],
          backgroundColor: [
            'rgba(255, 159, 64, 0.8)',
            'rgba(255, 99, 132, 0.8)',
            'rgba(54, 162, 235, 0.8)'
          ],
          borderColor: [
            'rgba(255, 159, 64, 1)',
            'rgba(255, 99, 132, 1)',
            'rgba(54, 162, 235, 1)'
          ],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }

  /**
   * Top 10 メニューチャート
   */
  renderTopMenus(menuFrequency) {
    const ctx = document.getElementById('chart-top-menus');
    if (!ctx) return;

    // Top 10 を取得
    const sortedMenus = Object.entries(menuFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const labels = sortedMenus.map(([name]) => name.substring(0, 20));
    const data = sortedMenus.map(([, count]) => count);

    if (window.chartInstances['top-menus']) {
      window.chartInstances['top-menus'].destroy();
    }

    window.chartInstances['top-menus'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '推奨回数',
          data: data,
          backgroundColor: 'rgba(154, 85, 255, 0.6)',
          borderColor: 'rgba(154, 85, 255, 1)',
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  /**
   * エネルギー分布チャート
   */
  renderEnergyDistribution(energies) {
    const ctx = document.getElementById('chart-energy-distribution');
    if (!ctx) return;

    // ビン作成
    const bins = [0, 100, 200, 300, 400, 500, 600, 700, 800];
    const histogram = new Array(bins.length - 1).fill(0);

    energies.forEach(energy => {
      for (let i = 0; i < bins.length - 1; i++) {
        if (energy >= bins[i] && energy < bins[i + 1]) {
          histogram[i]++;
          break;
        }
      }
    });

    const labels = bins.slice(0, -1).map((b, i) => `${b}-${bins[i + 1]}`);

    if (window.chartInstances['energy-distribution']) {
      window.chartInstances['energy-distribution'].destroy();
    }

    window.chartInstances['energy-distribution'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'エネルギー (kcal)',
          data: histogram,
          backgroundColor: 'rgba(255, 193, 7, 0.6)',
          borderColor: 'rgba(255, 193, 7, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }

  /**
   * タンパク質分布チャート
   */
  renderProteinDistribution(proteins) {
    const ctx = document.getElementById('chart-protein-distribution');
    if (!ctx) return;

    // ビン作成
    const bins = [0, 5, 10, 15, 20, 25, 30, 35, 40];
    const histogram = new Array(bins.length - 1).fill(0);

    proteins.forEach(protein => {
      for (let i = 0; i < bins.length - 1; i++) {
        if (protein >= bins[i] && protein < bins[i + 1]) {
          histogram[i]++;
          break;
        }
      }
    });

    const labels = bins.slice(0, -1).map((b, i) => `${b}-${bins[i + 1]}`);

    if (window.chartInstances['protein-distribution']) {
      window.chartInstances['protein-distribution'].destroy();
    }

    window.chartInstances['protein-distribution'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'タンパク質 (g)',
          data: histogram,
          backgroundColor: 'rgba(76, 175, 80, 0.6)',
          borderColor: 'rgba(76, 175, 80, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }

  /**
   * 統計テーブルを更新
   */
  updateStatisticsTable(stats) {
    const updateCell = (id, value) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = typeof value === 'number' ? value.toFixed(1) : value;
      }
    };

    // スコア
    updateCell('score-min', stats.scoreStats.min);
    updateCell('score-avg', stats.scoreStats.avg);
    updateCell('score-max', stats.scoreStats.max);
    updateCell('score-std', stats.scoreStats.std);

    // エネルギー
    updateCell('energy-min', stats.energyStats.min);
    updateCell('energy-avg', stats.energyStats.avg);
    updateCell('energy-max', stats.energyStats.max);
    updateCell('energy-std', stats.energyStats.std);

    // タンパク質
    updateCell('protein-min', stats.proteinStats.min);
    updateCell('protein-avg', stats.proteinStats.avg);
    updateCell('protein-max', stats.proteinStats.max);
    updateCell('protein-std', stats.proteinStats.std);

    // 脂質
    updateCell('fat-min', stats.fatStats.min);
    updateCell('fat-avg', stats.fatStats.avg);
    updateCell('fat-max', stats.fatStats.max);
    updateCell('fat-std', stats.fatStats.std);

    // 炭水化物
    updateCell('carbs-min', stats.carbsStats.min);
    updateCell('carbs-avg', stats.carbsStats.avg);
    updateCell('carbs-max', stats.carbsStats.max);
    updateCell('carbs-std', stats.carbsStats.std);
  }


  /**
   * 履歴データを読み込んで表示
   */
  async loadAIMenus(date) {
    console.log('🔄 loadAIMenus() 開始:', date);
    
    const loadingEl = document.getElementById('ai-loading');
    const noDataEl = document.getElementById('ai-no-data');
    const dataArea = document.getElementById('ai-data-area');

    if (!loadingEl || !noDataEl || !dataArea) {
      console.error('❌ AI表示要素が見つかりません');
      return;
    }

    // ローディング表示（直接スタイルを設定）
    loadingEl.style.display = 'flex';
    noDataEl.style.display = 'none';
    dataArea.style.display = 'none';

    try {
      // AI推奨 JSON から推奨メニューを取得
      const aiData = await this.fetchAIRecommendations(date);

      if (aiData) {
        // データが存在する場合、表示
        this.displayAIRecommendations(aiData);
        dataArea.style.display = 'block';
        noDataEl.style.display = 'none';
        console.log('✅ AI Menus: データ表示完了 -', date);
      } else {
        // データが存在しない
        dataArea.style.display = 'none';
        noDataEl.style.display = 'block';
        console.log('⚠️ AI Menus: データなし -', date);
      }
    } catch (error) {
      console.error('AI推奨データの取得に失敗:', error);
      dataArea.style.display = 'none';
      noDataEl.style.display = 'block';
    } finally {
      // ローディング非表示（直接スタイルを設定）
      loadingEl.style.display = 'none';
      console.log('✅ AI Menus: 処理完了 -', date);
    }
  }

  /**
   * AI推奨 JSON から推奨メニューを取得
   */
  async fetchAIRecommendations(date) {
    const aiJsonPath = `docs/ai-selections/ai-selections_${date}.json`;
    console.log('📡 AI推奨データを取得中:', aiJsonPath);
    
    try {
      const response = await fetch(aiJsonPath, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        cache: 'no-cache'
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ AI推奨データ取得成功: ${date}`, data);
        return data;
      }
      
      if (response.status === 404) {
        console.log(`📭 AI推奨データなし: ${date}`);
        return null;
      }
      
      console.error(`エラー (${response.status}): AI推奨データの取得に失敗`);
      return null;
      
    } catch (error) {
      console.error('AI推奨データの取得エラー:', error);
      return null;
    }
  }

  /**
   * AI推奨メニューを表示
   */
  displayAIRecommendations(aiData) {
    console.log('🎨 displayAIRecommendations() 開始:', aiData);
    
    const grid = document.getElementById('ai-menus-grid');
    if (!grid) {
      console.error('❌ ai-menus-grid が見つかりません');
      return;
    }
    
    // データの有効性を確認
    if (!aiData) {
      console.error('❌ AIデータが null または undefined です');
      grid.innerHTML = '<p class="no-data-message">AI推奨データがありません</p>';
      return;
    }
    
    if (!aiData.recommendations || aiData.recommendations.length === 0) {
      console.warn('⚠️ recommendationsが見つからないか、空です');
      grid.innerHTML = '<p class="no-data-message">AI推奨メニューがありません</p>';
      return;
    }
    
    // 前回の内容をクリア
    grid.innerHTML = '';
    console.log(`✅ AIタブ: ${aiData.recommendations.length}件のメニューを表示します`);
    
    // ========== セット全体のサマリー ==========
    // 栄養合計を計算
    const totals = {
      'エネルギー': 0,
      'たんぱく質': 0,
      '脂質': 0,
      '炭水化物': 0,
      '野菜重量': 0
    };
    
    aiData.recommendations.forEach(rec => {
      if (rec.nutrition) {
        totals['エネルギー'] += rec.nutrition.energy || 0;
        totals['たんぱく質'] += rec.nutrition.protein || 0;
        totals['脂質'] += rec.nutrition.fat || 0;
        totals['炭水化物'] += rec.nutrition.carbs || 0;
        totals['野菜重量'] += rec.nutrition.vegetable_weight || 0;
      }
    });
    
    // 結果タブと同じスタイルでサマリーを表示
    const summaryContainer = document.createElement('div');
    summaryContainer.className = 'ai-summary-container';
    
    const summaryTitle = document.createElement('div');
    summaryTitle.className = 'ai-summary-title';
    summaryTitle.innerHTML = `<h3>🤖 AI推奨セット</h3>`;
    summaryContainer.appendChild(summaryTitle);
    
    const summaryContent = document.createElement('div');
    summaryContent.className = 'result-total-summary';
    
    const countDiv = document.createElement('div');
    countDiv.className = 'result-total-summary-count';
    countDiv.textContent = `${aiData.recommendations.length}件`;
    
    const valuesDiv = document.createElement('div');
    valuesDiv.className = 'result-total-summary-values';
    valuesDiv.id = 'ai-summary-values';
    
    const colorClassMap = {
      'エネルギー': 'nutrition-e',
      'たんぱく質': 'nutrition-p',
      '脂質': 'nutrition-f',
      '炭水化物': 'nutrition-c',
      '野菜重量': 'nutrition-v'
    };
    
    const display = [
      { key: 'エネルギー', label: 'E' },
      { key: 'たんぱく質', label: 'P' },
      { key: '脂質', label: 'F' },
      { key: '炭水化物', label: 'C' },
      { key: '野菜重量', label: 'V' }
    ];
    
    display.forEach(({ key, label }) => {
      const pill = document.createElement('div');
      pill.className = `fixed-summary-pill ${colorClassMap[key] || ''}`;
      
      const totalValue = totals[key] || 0;
      const formattedTotal = Number.isFinite(totalValue) ? (Math.round(totalValue * 10) / 10) : '-';
      
      pill.innerHTML = `
        <div class="fixed-summary-pill-label">${label}</div>
        <div class="fixed-summary-pill-value">${formattedTotal}</div>
        <div class="fixed-summary-pill-diff">—</div>
      `;
      valuesDiv.appendChild(pill);
    });
    
    summaryContent.appendChild(countDiv);
    summaryContent.appendChild(valuesDiv);
    summaryContainer.appendChild(summaryContent);
    grid.appendChild(summaryContainer);
    
    // ========== セット選定理由 ==========
    if (aiData.set_reason) {
      const reasonContainer = document.createElement('div');
      reasonContainer.className = 'ai-set-reason-container';
      
      const reasonTitle = document.createElement('div');
      reasonTitle.className = 'ai-set-reason-title';
      reasonTitle.innerHTML = '📋 セット選定理由';
      
      const reasonText = document.createElement('div');
      reasonText.className = 'ai-set-reason-text';
      reasonText.innerHTML = aiData.set_reason;
      
      reasonContainer.appendChild(reasonTitle);
      reasonContainer.appendChild(reasonText);
      grid.appendChild(reasonContainer);
    }
    
    // ========== メニュー一覧 ==========
    const menuListContainer = document.createElement('div');
    menuListContainer.className = 'ai-menu-list-container';
    
    aiData.recommendations.forEach((recommendation, index) => {
      const item = document.createElement('div');
      item.className = 'menu-list-item ai-recommended';
      
      const details = document.createElement('div');
      details.className = 'menu-list-item-details';
      
      const name = document.createElement('div');
      name.className = 'menu-list-item-name';
      name.textContent = recommendation.name || '（名前なし）';
      details.appendChild(name);
      
      // スコア情報を表示
      const scoreDiv = document.createElement('div');
      scoreDiv.className = 'ai-score-badge';
      const scorePercent = (recommendation.score * 100).toFixed(1);
      scoreDiv.innerHTML = `スコア: ${scorePercent}%`;
      details.appendChild(scoreDiv);
      
      // 選んだ理由があれば表示
      if (recommendation.reasons && recommendation.reasons.length > 0) {
        const reasonsDiv = document.createElement('div');
        reasonsDiv.className = 'ai-reasons-badge';
        reasonsDiv.innerHTML = `💡 ${recommendation.reasons.join(' / ')}`;
        details.appendChild(reasonsDiv);
      } else if (recommendation.reason) {
        // 単数形の reason フィールドもサポート
        const reasonDiv = document.createElement('div');
        reasonDiv.className = 'ai-reasons-badge';
        reasonDiv.innerHTML = `💡 ${recommendation.reason}`;
        details.appendChild(reasonDiv);
      }
      
      // 栄養情報を表示（E, P, F, C, V）
      const nutrition = document.createElement('div');
      nutrition.className = 'menu-list-item-nutrition';
      
      const nutritionMap = [
        { key: 'energy', label: 'E', class: 'nutrition-e' },
        { key: 'protein', label: 'P', class: 'nutrition-p' },
        { key: 'fat', label: 'F', class: 'nutrition-f' },
        { key: 'carbs', label: 'C', class: 'nutrition-c' },
        { key: 'vegetable_weight', label: 'V', class: 'nutrition-v' }
      ];
      
      nutritionMap.forEach(({ key, label, class: className }) => {
        const value = recommendation.nutrition?.[key];
        if (value !== undefined && value !== null) {
          const nutritionItem = document.createElement('div');
          nutritionItem.className = `menu-list-item-nutrition-item ${className}`;
          const displayValue = typeof value === 'number' ? value : value;
          nutritionItem.innerHTML = `<span>${displayValue}</span>`;
          nutrition.appendChild(nutritionItem);
        }
      });
      
      details.appendChild(nutrition);
      item.appendChild(details);
      
      // 状態ラベル（フッター）
      const footer = document.createElement('div');
      footer.className = 'menu-list-item-footer';
      
      const stateLabel = document.createElement('div');
      stateLabel.className = 'menu-state-label';
      stateLabel.textContent = `${index + 1}位`;
      
      footer.appendChild(stateLabel);
      item.appendChild(footer);
      
      menuListContainer.appendChild(item);
    });
    
    grid.appendChild(menuListContainer);
  }

  /**
   * アレルゲン情報を構築
   */
  buildAllergenInfo(allergens) {
    const allergenMap = {
      'egg': '卵',
      'dairy': '乳類',
      'wheat': '小麦',
      'soba': 'そば',
      'shrimp': '海老',
      'crab': 'カニ',
      'beef': '牛肉',
      'walnut': 'くるみ',
      'soy': '大豆',
      'chicken': '鶏肉',
      'pork': '豚肉'
    };
    
    const activeAllergens = Object.entries(allergens)
      .filter(([key, value]) => value === true)
      .map(([key]) => allergenMap[key])
      .filter(name => name);
    
    if (activeAllergens.length === 0) {
      return '<div class="allergen-info"><span class="no-allergen">🟢 アレルゲンなし</span></div>';
    }
    
    return `<div class="allergen-info"><span class="allergen">⚠️ ${activeAllergens.join(', ')}</span></div>`;
  }

  displayOnoTimestamp(timestamp) {
    const timestampEl = document.getElementById('ai-timestamp');
    if (!timestampEl || !timestamp) return;

    const date = new Date(timestamp);
    const formatted = date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    timestampEl.textContent = formatted;
  }

  /**
   * AI Menus のサマリー更新
   */
  updateOnoSummary(totals, count) {
    const valuesEl = document.getElementById('ai-summary-values');
    const countEl = document.getElementById('ai-summary-count');

    if (!valuesEl || !countEl) return;

    valuesEl.innerHTML = '';

    const display = [
      { key: 'エネルギー', label: 'E', class: 'nutrition-e' },
      { key: 'たんぱく質', label: 'P', class: 'nutrition-p' },
      { key: '脂質', label: 'F', class: 'nutrition-f' },
      { key: '炭水化物', label: 'C', class: 'nutrition-c' },
      { key: '野菜重量', label: 'V', class: 'nutrition-v' }
    ];

    display.forEach(({ key, label, class: colorClass }) => {
      const pill = document.createElement('div');
      pill.className = `fixed-summary-pill ${colorClass}`;

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

  /**
   * AI Menus の栄養テーブル更新
   */
  updateOnoNutritionTable(totals, targets) {
    const tableEl = document.getElementById('ai-nutrition-table');
    const sectionEl = document.getElementById('ai-nutrition-section');

    if (!tableEl || !sectionEl) return;

    // 目標が一つも有効でない場合は非表示
    const hasActiveTarget = Object.values(targets).some(t => t && t.enabled);
    if (!hasActiveTarget) {
      sectionEl.classList.add('hidden');
      return;
    }

    sectionEl.classList.remove('hidden');
    tableEl.innerHTML = '';

    // ヘッダー
    const header = document.createElement('div');
    header.className = 'nutrition-achievement-header';
    header.innerHTML = `
      <div class="achievement-col-name">栄養項目</div>
      <div class="achievement-col-target">目標</div>
      <div class="achievement-col-actual">実績</div>
      <div class="achievement-col-diff">差分</div>
      <div class="achievement-col-rate">達成率</div>
    `;
    tableEl.appendChild(header);

    // 各栄養項目
    const nutritionItems = [
      { key: 'エネルギー', label: 'Energy', unit: 'kcal', preference: 'dislikeExcess' },
      { key: 'たんぱく質', label: 'Protein', unit: 'g', preference: 'dislikeDeficit' },
      { key: '脂質', label: 'Fat', unit: 'g', preference: 'dislikeExcess' },
      { key: '炭水化物', label: 'Carbs', unit: 'g', preference: 'dislikeExcess' },
      { key: '野菜重量', label: 'Vegetable', unit: 'g', preference: 'dislikeDeficit' }
    ];

    nutritionItems.forEach(({ key, label, unit, preference }) => {
      const target = targets[key];
      if (!target || !target.enabled) return;

      const targetValue = target.value;
      const actualValue = totals[key] || 0;
      const diff = actualValue - targetValue;
      const achievement = targetValue > 0 ? (actualValue / targetValue) * 100 : 0;

      // 色判定
      let colorClass = '';
      if (preference === 'dislikeExcess') {
        // 超過嫌い：目標以下なら青、超過なら赤
        colorClass = diff <= 0 ? 'achievement-good' : 'achievement-bad';
      } else {
        // 不足嫌い：目標以上なら青、不足なら赤
        colorClass = diff >= 0 ? 'achievement-good' : 'achievement-bad';
      }

      const row = document.createElement('div');
      row.className = 'nutrition-achievement-row';
      row.innerHTML = `
        <div class="achievement-col-name">${label}</div>
        <div class="achievement-col-target">${Math.round(targetValue * 10) / 10}${unit}</div>
        <div class="achievement-col-actual">${Math.round(actualValue * 10) / 10}${unit}</div>
        <div class="achievement-col-diff">${diff >= 0 ? '+' : ''}${Math.round(diff * 10) / 10}${unit}</div>
        <div class="achievement-col-rate">
          <div class="achievement-bar-container">
            <div class="achievement-bar ${colorClass}" style="width: ${Math.min(achievement, 100)}%"></div>
            <span class="achievement-percentage">${Math.round(achievement)}%</span>
          </div>
        </div>
      `;
      tableEl.appendChild(row);
    });
  }

  /**
   * AIタブのコンテンツを読み込む
   */
  async loadAITabContent() {
    console.log('🔄 loadAITabContent() 実行開始');
    
    const dateInput = document.getElementById('date-input');
    if (!dateInput || !dateInput.value) {
      console.warn('⚠️ AIタブ: 日付が選択されていません');
      return;
    }

    // dateLabel（"1/30(金)"）をISO形式に変換
    const dateLabel = dateInput.value;
    const isoDate = this.dateLabelToISOString(dateLabel);
    
    console.log('📅 AIタブ: 日付変換', { dateLabel, isoDate });
    
    if (!isoDate) {
      console.error('❌ AIタブ: 日付の変換に失敗しました');
      return;
    }
    
    // AI推奨データを読み込み
    console.log(`📡 AI推奨データを取得中: ${isoDate}`);
    await this.loadAIMenus(isoDate);
  }

  /**
   * 栄養合計サマリーを作成（結果タブと同じ構造）
   */
  createNutritionSummary(menus, type) {
    // 外側のコンテナ（背景色・枠用）
    const container = document.createElement('div');
    container.className = `ai-nutrition-summary ${type}`;
    
    // 固定サマリー構造（結果タブと同じ）
    const summary = document.createElement('div');
    summary.className = 'fixed-summary';
    summary.style.margin = '0'; // 余白は外側で制御
    summary.style.background = 'transparent'; // 背景は外側のcontainerで制御
    
    const header = document.createElement('div');
    header.className = 'fixed-summary-header';
    
    // 栄養合計を計算
    const totals = {
      'エネルギー': 0,
      'たんぱく質': 0,
      '脂質': 0,
      '炭水化物': 0,
      '野菜重量': 0
    };
    
    menus.forEach(menu => {
      const nutrition = menu.nutrition || {};
      totals['エネルギー'] += parseFloat(nutrition['エネルギー']) || 0;
      totals['たんぱく質'] += parseFloat(nutrition['たんぱく質']) || 0;
      totals['脂質'] += parseFloat(nutrition['脂質']) || 0;
      totals['炭水化物'] += parseFloat(nutrition['炭水化物']) || 0;
      totals['野菜重量'] += parseFloat(nutrition['野菜重量']) || 0;
    });
    
    // サマリーHTML
    const nutritionItems = [
      { key: 'エネルギー', label: 'E', value: Math.round(totals['エネルギー']) },
      { key: 'たんぱく質', label: 'P', value: totals['たんぱく質'].toFixed(1) },
      { key: '脂質', label: 'F', value: totals['脂質'].toFixed(1) },
      { key: '炭水化物', label: 'C', value: totals['炭水化物'].toFixed(1) },
      { key: '野菜重量', label: 'V', value: Math.round(totals['野菜重量']) }
    ];
    
    const valuesDiv = document.createElement('div');
    valuesDiv.className = 'fixed-summary-values';
    
    nutritionItems.forEach(({ label, value }) => {
      const pill = document.createElement('div');
      pill.className = 'fixed-summary-pill';
      pill.innerHTML = `
        <div class="fixed-summary-pill-label">${label}</div>
        <div class="fixed-summary-pill-value">${value}</div>
        <div class="fixed-summary-pill-diff">—</div>
      `;
      valuesDiv.appendChild(pill);
    });
    
    // 品数
    const countDiv = document.createElement('div');
    countDiv.className = 'fixed-summary-count';
    countDiv.textContent = `${menus.length}品`;
    
    header.appendChild(valuesDiv);
    header.appendChild(countDiv);
    summary.appendChild(header);
    container.appendChild(summary);
    
    return container;
  }

  /**
   * AI推薦カードを作成
   */
  createAIRecommendationCard(menu, rank) {
    const card = document.createElement('div');
    card.className = 'ai-recommendation-card';

    // ランクバッジ
    const rankBadge = document.createElement('div');
    rankBadge.className = 'ai-rank-badge';
    rankBadge.textContent = `${rank}位`;
    card.appendChild(rankBadge);

    // メニュー名
    const name = document.createElement('div');
    name.className = 'ai-menu-name';
    name.textContent = menu.name;
    card.appendChild(name);

    // スコア
    const score = document.createElement('div');
    score.className = 'ai-score';
    score.innerHTML = `<span class="ai-score-label">スコア:</span> <span class="ai-score-value">${(menu.score * 100).toFixed(1)}%</span>`;
    card.appendChild(score);

    // 推薦理由
    if (menu.reasons && menu.reasons.length > 0) {
      const reasons = document.createElement('div');
      reasons.className = 'ai-reasons';
      
      const reasonsTitle = document.createElement('div');
      reasonsTitle.className = 'ai-reasons-title';
      reasonsTitle.textContent = '推薦理由:';
      reasons.appendChild(reasonsTitle);

      const reasonsList = document.createElement('ul');
      reasonsList.className = 'ai-reasons-list';
      menu.reasons.forEach(reason => {
        const li = document.createElement('li');
        li.textContent = reason;
        reasonsList.appendChild(li);
      });
      reasons.appendChild(reasonsList);
      
      card.appendChild(reasons);
    }

    // 栄養情報（EPFCV）- 結果タブと同じスタイル
    if (menu.nutrition) {
      const nutrition = document.createElement('div');
      nutrition.className = 'menu-list-item-nutrition';
      
      const nutritionMap = [
        { key: 'エネルギー', label: 'E', class: 'nutrition-e' },
        { key: 'たんぱく質', label: 'P', class: 'nutrition-p' },
        { key: '脂質', label: 'F', class: 'nutrition-f' },
        { key: '炭水化物', label: 'C', class: 'nutrition-c' },
        { key: '野菜重量', label: 'V', class: 'nutrition-v' }
      ];

      nutritionMap.forEach(({ key, label, class: className }) => {
        const value = menu.nutrition[key];
        if (value !== undefined && value !== null) {
          const nutritionItem = document.createElement('div');
          nutritionItem.className = `menu-list-item-nutrition-item ${className}`;
          const displayValue = typeof value === 'number' ? value : value;
          nutritionItem.innerHTML = `<span>${displayValue}</span>`;
          nutrition.appendChild(nutritionItem);
        }
      });
      
      card.appendChild(nutrition);
    }

    return card;
  }

  /**
   * 管理者推薦カードを作成
   */
  createAdminRecommendationCard(menu) {
    const card = document.createElement('div');
    card.className = 'ai-recommendation-card admin';

    // メニュー名
    const name = document.createElement('div');
    name.className = 'ai-menu-name';
    name.textContent = menu.name;
    card.appendChild(name);

    // 栄養情報（EPFCV）- 結果タブと同じスタイル
    if (menu.nutrition) {
      const nutrition = document.createElement('div');
      nutrition.className = 'menu-list-item-nutrition';
      
      const nutritionMap = [
        { key: 'エネルギー', label: 'E', class: 'nutrition-e' },
        { key: 'たんぱく質', label: 'P', class: 'nutrition-p' },
        { key: '脂質', label: 'F', class: 'nutrition-f' },
        { key: '炭水化物', label: 'C', class: 'nutrition-c' },
        { key: '野菜重量', label: 'V', class: 'nutrition-v' }
      ];

      nutritionMap.forEach(({ key, label, class: className }) => {
        const value = menu.nutrition[key];
        if (value !== undefined && value !== null) {
          const nutritionItem = document.createElement('div');
          nutritionItem.className = `menu-list-item-nutrition-item ${className}`;
          const displayValue = typeof value === 'number' ? value : value;
          nutritionItem.innerHTML = `<span>${displayValue}</span>`;
          nutrition.appendChild(nutritionItem);
        }
      });
      
      card.appendChild(nutrition);
    }

    return card;
  }

  /**
   * AI Menus のメニュー一覧表示（旧関数、互換性のため残す）
   */
  displayAIMenusGrid(menus) {
    const gridEl = document.getElementById('ai-menus-grid');
    if (!gridEl) return;

    gridEl.innerHTML = '';

    if (!menus || menus.length === 0) {
      gridEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">メニューデータがありません</p>';
      return;
    }

    menus.forEach(menu => {
      const item = document.createElement('div');
      item.className = 'menu-list-item';

      // メニュー詳細情報
      const details = document.createElement('div');
      details.className = 'menu-list-item-details';

      const name = document.createElement('div');
      name.className = 'menu-list-item-name';
      name.textContent = menu.name;

      // 栄養情報を表示
      const nutrition = document.createElement('div');
      nutrition.className = 'menu-list-item-nutrition';

      const nutritionMap = [
        { key: 'エネルギー', label: 'E', class: 'nutrition-e' },
        { key: 'たんぱく質', label: 'P', class: 'nutrition-p' },
        { key: '脂質', label: 'F', class: 'nutrition-f' },
        { key: '炭水化物', label: 'C', class: 'nutrition-c' },
        { key: '野菜重量', label: 'V', class: 'nutrition-v' }
      ];

      nutritionMap.forEach(({ key, label, class: className }) => {
        const value = menu.nutrition?.[key];
        if (value !== undefined && value !== null) {
          const nutritionItem = document.createElement('div');
          nutritionItem.className = `menu-list-item-nutrition-item ${className}`;
          const displayValue = typeof value === 'number' ? value : value;
          nutritionItem.innerHTML = `<span>${displayValue}</span>`;
          nutrition.appendChild(nutritionItem);
        }
      });

      details.appendChild(name);
      details.appendChild(nutrition);
      item.appendChild(details);
      gridEl.appendChild(item);
    });
  }

  /**
   * AI Menus の簡易メニューリスト表示（旧形式用）
   */
  displayAIMenusGridSimple(menuNames) {
    const gridEl = document.getElementById('ai-menus-grid');
    if (!gridEl) return;

    gridEl.innerHTML = '';

    if (!menuNames || menuNames.length === 0) {
      gridEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">メニューデータがありません</p>';
      return;
    }

    // 簡易表示：メニュー名のリスト
    const listEl = document.createElement('div');
    listEl.style.cssText = 'background: white; border-radius: 12px; padding: 20px;';
    
    const title = document.createElement('p');
    title.style.cssText = 'font-size: 14px; color: var(--text-secondary); margin-bottom: 12px;';
    title.textContent = '※ 旧形式のデータのため、詳細情報は表示されません';
    listEl.appendChild(title);
    
    const ul = document.createElement('ul');
    ul.style.cssText = 'list-style: none; padding: 0; margin: 0;';
    
    menuNames.forEach((name, index) => {
      const li = document.createElement('li');
      li.style.cssText = 'padding: 10px 12px; border-bottom: 1px solid var(--light-gray); display: flex; align-items: center; gap: 8px;';
      li.innerHTML = `<span style="color: var(--text-secondary); font-size: 14px;">${index + 1}.</span><span>${name}</span>`;
      ul.appendChild(li);
    });
    
    listEl.appendChild(ul);
    gridEl.appendChild(listEl);
  }
}

/**
 * アプリを初期化
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('アプリ初期化...');
  const app = new MenuOptimizationApp();
  app.initAIMenusTab(); // AI Menusタブを初期化
  
  console.log('アプリ準備完了');
});
