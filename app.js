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

    // 栄養目標アイテムクリック処理
    document.querySelectorAll('.nutrition-item').forEach(item => {
      item.addEventListener('click', (e) => this.toggleNutritionItem(e.currentTarget));
    });

    // 日付選択変更
    document.getElementById('date-input').addEventListener('change', () => {
      this.loadMenus();
    });

    // メニュー検索
    document.getElementById('menu-search').addEventListener('input', (e) => {
      this.filterMenus(e.target.value);
    });

    // 最適化実行ボタン
    document.getElementById('optimize-button').addEventListener('click', () => this.runOptimization());

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
    } catch (error) {
      console.error('メニュー読込エラー:', error);
      document.getElementById('menus-list-container').innerHTML = 
        `<p class="error-message">メニュー読込エラー: ${error.message}</p>`;
    }
  }

  /**
   * 利用可能な日付を読込（JSON ファイルから）
   */
  async loadAvailableDates() {
    try {
      const response = await fetch('./available-dates.json');
      if (!response.ok) {
        throw new Error('利用可能な日付の取得に失敗しました');
      }
      const data = await response.json();
      const dates = data.dates || [];
      
      const dateSelect = document.getElementById('date-input');
      dateSelect.innerHTML = '';

      if (dates.length === 0) {
        dateSelect.innerHTML = '<option value="">メニュー データがありません</option>';
        return;
      }

      // 最初の日付をデフォルト選択
      dates.forEach((date, index) => {
        const option = document.createElement('option');
        option.value = date; // "1/13(火)" 形式
        option.textContent = date; // "1/13(火)" 形式で表示
        dateSelect.appendChild(option);
      });

      // 最初の日付を選択
      if (dates.length > 0) {
        dateSelect.value = dates[0];
        await this.loadMenus(); // メニュー読込
      }
    } catch (error) {
      console.error('利用可能な日付の読込エラー:', error);
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

      // クリック時に状態を切り替え
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cycleMenuState(menu.name);
      });

      container.appendChild(item);
    });
  }

  /**
   * メニューの状態を循環的に切り替え（推奨 → 固定 → 除外 → 推奨）
   */
  cycleMenuState(menuName) {
    const isFixed = this.fixedMenus.has(menuName);
    const isExcluded = this.excludedMenus.has(menuName);

    if (isFixed) {
      // 固定 → 除外
      this.fixedMenus.delete(menuName);
      this.excludedMenus.add(menuName);
    } else if (isExcluded) {
      // 除外 → 推奨
      this.excludedMenus.delete(menuName);
    } else {
      // 推奨 → 固定
      this.fixedMenus.add(menuName);
    }

    this.renderMenusList();
  }

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
  toggleNutritionItem(item) {
    const key = item.dataset.key;
    const input = item.querySelector('.nutrition-value');

    if (item.classList.contains('active')) {
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
      input.focus();
    }
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

    // 貪欲法で追加メニューを選択（上限なし：availableMenus.length）
    const additionalMenus = this.selectMenusByGreedy(
      availableMenus,
      targets,
      fixedNutrition,
      availableMenus.length
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

    for (let i = 0; i < maxMenus && remaining.length > 0; i++) {
      let bestIdx = 0;
      let bestScore = Infinity;

      // 最も目標に近づくメニューを探す
      remaining.forEach((menu, idx) => {
        const testNutrition = this.addNutritionObjects(currentNutrition, menu.nutrition || {});
        const score = this.calculateDistance(targets, testNutrition);
        
        if (score < bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      });

      // 最高スコアのメニューを追加
      selected.push(remaining[bestIdx]);
      currentNutrition = this.addNutritionObjects(currentNutrition, remaining[bestIdx].nutrition || {});
      remaining.splice(bestIdx, 1);

      // スコアが十分改善しなくなったら終了
      if (i > 0 && bestScore > selected[i - 1].score) {
        break;
      }
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
   * ユークリッド距離を計算
   */
  calculateDistance(targets, actual) {
    let sumSquares = 0;

    Object.keys(targets).forEach(key => {
      const target = targets[key] || 0;
      const actualVal = actual[key] || 0;
      const diff = actualVal - target;
      sumSquares += diff * diff;
    });

    return Math.sqrt(sumSquares);
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

        // 除外ボタン（提案メニューのみ）をメニュー名の右に表示
        if (isAdditional && elementId !== 'fixed-menus-result') {
          const excludeBtn = document.createElement('button');
          excludeBtn.className = 'result-exclude-btn';
          excludeBtn.textContent = '✕';
          excludeBtn.title = 'この提案を除外';
          excludeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.tempExcludedMenus.add(menu.name);
            item.style.opacity = '0.5';
            excludeBtn.disabled = true;
          });
          
          // メニュー名と除外ボタンをヘッダーレイアウトに
          const header = document.createElement('div');
          header.className = 'menu-result-header';
          header.appendChild(name);
          header.appendChild(excludeBtn);
          
          const detailsWrapper = document.createElement('div');
          detailsWrapper.className = 'menu-list-item-details';
          detailsWrapper.appendChild(header);
          detailsWrapper.appendChild(priceEl);
          detailsWrapper.appendChild(nutrition);
          
          item.appendChild(detailsWrapper);
        } else {
          item.appendChild(details);
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

    if (!targets || Object.keys(targets).length === 0) {
      container.innerHTML = '<p class="empty-message">栄養情報がありません</p>';
      return;
    }

    // チャートコンテナ
    const chartContainer = document.createElement('div');
    chartContainer.style.marginBottom = '20px';
    chartContainer.style.position = 'relative';
    chartContainer.style.height = '300px';
    chartContainer.innerHTML = '<canvas id="nutrition-chart"></canvas>';
    container.appendChild(chartContainer);

    // テーブルコンテナ
    const tableContainer = document.createElement('div');
    tableContainer.className = 'nutrition-table-container';

    // ヘッダー
    const headerRow = document.createElement('div');
    headerRow.className = 'nutrition-row-table header';
    headerRow.innerHTML = `
      <div>栄養項目</div>
      <div class="nutrition-value-cell">目標値</div>
      <div class="nutrition-value-cell">実績</div>
      <div class="nutrition-value-cell">差分</div>
    `;
    tableContainer.appendChild(headerRow);

    // データ行
    const labels = [];
    const targetValues = [];
    const actualValues = [];

    Object.keys(targets).forEach(key => {
      const row = document.createElement('div');
      row.className = 'nutrition-row-table';

      const target = targets[key] || 0;
      const actual = (totalNutrition && totalNutrition[key]) || 0;
      const diff = actual - target;
      const diffColor = diff >= 0 ? '#34C759' : '#FF3B30';

      row.innerHTML = `
        <div class="nutrition-item-name">${key}</div>
        <div class="nutrition-value-cell">${typeof target === 'number' ? target.toFixed(1) : target}</div>
        <div class="nutrition-value-cell">${typeof actual === 'number' ? actual.toFixed(1) : actual}</div>
        <div class="nutrition-value-cell" style="color: ${diffColor}">${diff > 0 ? '+' : ''}${typeof diff === 'number' ? diff.toFixed(1) : diff}</div>
      `;
      tableContainer.appendChild(row);

      // チャート用データ
      labels.push(key);
      targetValues.push(typeof target === 'number' ? target : 0);
      actualValues.push(typeof actual === 'number' ? actual : 0);
    });

    container.appendChild(tableContainer);

    // レーダーチャートを描画
    setTimeout(() => this.drawRadarChart(labels, targetValues, actualValues), 100);
  }

  /**
   * レーダーチャートを描画
   */
  drawRadarChart(labels, targetValues, actualValues) {
    const canvas = document.getElementById('nutrition-chart');
    if (!canvas) {
      console.warn('nutrition-chart キャンバスが見つかりません');
      return;
    }

    if (!window.Chart) {
      console.warn('Chart.js がロードされていません');
      return;
    }

    // 既存のチャートを破棄
    if (this.nutritionChart) {
      this.nutritionChart.destroy();
    }

    const ctx = canvas.getContext('2d');
    try {
      this.nutritionChart = new Chart(ctx, {
        type: 'radar',
        data: {
          labels: labels,
          datasets: [
            {
              label: '目標値',
              data: targetValues,
              borderColor: '#007AFF',
              backgroundColor: 'rgba(0, 122, 255, 0.1)',
              borderWidth: 2,
              fill: true,
              pointBackgroundColor: '#007AFF',
              pointBorderColor: '#fff',
              pointBorderWidth: 2,
              pointRadius: 5,
              pointHoverRadius: 7
            },
            {
              label: '実績',
              data: actualValues,
              borderColor: '#34C759',
              backgroundColor: 'rgba(52, 199, 89, 0.1)',
              borderWidth: 2,
              fill: true,
              pointBackgroundColor: '#34C759',
              pointBorderColor: '#fff',
              pointBorderWidth: 2,
              pointRadius: 5,
              pointHoverRadius: 7
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                usePointStyle: true,
                padding: 15,
                font: {
                  size: 12,
                  weight: '600'
                }
              }
            }
          },
          scales: {
            r: {
              beginAtZero: true,
              ticks: {
                font: {
                  size: 11
                }
              },
              grid: {
                color: 'rgba(0, 0, 0, 0.1)'
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('チャート描画エラー:', error);
    }
  }

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
}

/**
 * アプリを初期化
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('アプリ初期化...');
  new MenuOptimizationApp();
  console.log('アプリ準備完了');
});
