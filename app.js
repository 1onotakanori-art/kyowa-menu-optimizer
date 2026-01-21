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

      // 本日の日付を取得（"M/D" 形式）
      const today = new Date();
      const todayMonthDay = `${today.getMonth() + 1}/${today.getDate()}`;

      // ページ開いている日以降の日付をフィルタリング
      const filteredDates = availableDates.filter(dateLabel => {
        const match = dateLabel.match(/(\d{1,2})\/(\d{1,2})/);
        if (!match) return false;

        const [, month, day] = match;
        const monthNum = parseInt(month);
        const dayNum = parseInt(day);

        // 本日以降の日付か判定
        // 注：月の跨ぎや年の跨ぎには対応していません
        // スクレイプが最新なら、今月の日付のみで問題ありません
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
      filteredDates.forEach(date => {
        const option = document.createElement('option');
        option.value = date; // "1/13(火)" 形式
        option.textContent = date; // "1/13(火)" 形式で表示
        dateSelect.appendChild(option);
      });

      // デフォルトは本日（存在する場合）、なければ最初の利用可能日付
      const todayOption = filteredDates.find(d => d.startsWith(todayMonthDay));
      if (todayOption) {
        console.log('✅ 本日のメニューが利用可能:', todayOption);
        dateSelect.value = todayOption;
      } else {
        console.log('ℹ️ 本日のメニューなし。最初の利用可能日付を選択:', filteredDates[0]);
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
      <div class="achievement-col-rate">達成率</div>
      <div class="achievement-col-diff">差分</div>
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
      let rateText = '設定なし';
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
        <div class="achievement-col-rate">
          <div class="achievement-bar-container">
            <div class="achievement-bar" style="width: ${barWidth}%; background-color: ${barColor};"></div>
            <div class="achievement-bar-text">${rateText}</div>
          </div>
        </div>
        <div class="achievement-col-diff" style="color: ${diff >= 0 ? '#27ae60' : '#e74c3c'}">${diffText}</div>
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
}

/**
 * アプリを初期化
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('アプリ初期化...');
  new MenuOptimizationApp();
  console.log('アプリ準備完了');
});
