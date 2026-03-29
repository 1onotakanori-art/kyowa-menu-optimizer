const { chromium } = require('playwright');
const { toDateLabel } = require('../utils/date');

/**
 * 指定した日付のメニューをスクレイプ
 * 
 * 参照: SCRAPER_REBUILD_PLAN.md の「重要な処理フロー」セクション
 * 
 * @param {string} dateLabel - "1/12(月)" 形式の日付ラベル
 * @returns {Promise<{dateLabel: string, count: number, menus: Array}>}
 */
async function fetchMenus(dateLabel) {
  let browser;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🌐 [スクレイプ開始] 日付: ${dateLabel}`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    // ステップ 1: ブラウザ起動
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    console.log('✅ ブラウザ起動完了');

    // ステップ 2: サイト読み込み
    console.log('⏳ サイト読み込み中...');
    await page.goto('https://kyowa2407225.uguide.info', {
      waitUntil: 'networkidle'
    });
    console.log('✅ サイト読み込み完了');
    
    // ステップ 3: サイト完全レンダリング待機
    // 参照: SCRAPER_REBUILD_PLAN.md の「タイミング・待機処理」
    await page.waitForTimeout(2000);
    console.log('✅ サイト完全レンダリング完了');

    // ステップ 4: タブ切り替え
    console.log('📑 タブ切り替え: 「今週」を選択');
    await selectTab(page, '今週');

    // ステップ 5: 日付選択
    console.log(`📅 日付選択: 「${dateLabel}」`);
    await selectDate(page, dateLabel);

    // ステップ 6: メニュー展開
    console.log('📋 メニュー展開');
    await expandAllMenus(page);

    // ステップ 7: メニュー取得
    console.log('🔍 メニュー・栄養情報取得');
    const menus = await scrapeMenus(page);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✨ [完成] ${dateLabel} のスクレイプ完了`);
    console.log(`   合計メニュー数: ${menus.length} (Phase 4 - スクレイピング実装済み)`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      dateLabel,
      count: menus.length,
      menus: menus
    };

  } catch (error) {
    console.error(`❌ スクレイプエラー: ${error.message}`);
    throw error;

  } finally {
    // ブラウザを必ず閉じる（ゾンビプロセス防止）
    // 参照: SCRAPER_REBUILD_PLAN.md の「保持すべき機能」
    if (browser) {
      await browser.close();
      console.log('✅ ブラウザ終了');
    }
  }
}

/**
 * タブを文字列一致で選択
 * 参照: SCRAPER_REBUILD_PLAN.md の「DOM セレクタ一覧」
 * セレクタ: #menu-target .tab-button（「今週」など、部分一致）
 * 待機: クリック後 800ms（アニメーション完全待機）
 * 
 * @param {Page} page - Playwright の Page オブジェクト
 * @param {string} tabText - 選択対象のテキスト（部分一致）
 * @returns {Promise<void>}
 * @throws {Error} タブが見つからない場合
 */
async function selectTab(page, tabText) {
  console.log(`🔍 タブ選択開始: "${tabText}"`);

  // ステップ 1: タブが DOM に存在することを確認（タブ消失防止）
  await page.waitForSelector('#menu-target .tab-button', { timeout: 5000 });
  console.log('✅ タブ要素を確認');

  // ステップ 2: Playwright locator でタブをクリック
  // 理由: evaluate 内の element.click() ではサイトのJSイベントハンドラが
  // 発火しないため、Playwright のブラウザレベルクリックを使用
  const tabs = page.locator('#menu-target .tab-button');
  const count = await tabs.count();
  let clicked = false;

  for (let i = 0; i < count; i++) {
    const text = await tabs.nth(i).textContent();
    if (text.includes(tabText)) {
      await tabs.nth(i).click();
      clicked = true;
      break;
    }
  }

  if (!clicked) {
    const available = [];
    for (let i = 0; i < count; i++) {
      available.push((await tabs.nth(i).textContent()).trim());
    }
    throw new Error(`タブ「${tabText}」が見つかりません。利用可能: ${available.join(', ')}`);
  }
  console.log(`✅ タブをクリック: "${tabText}"`);

  // ステップ 3: タブ切り替えアニメーション待ち
  await page.waitForTimeout(800);
  console.log('✅ タブ切り替え完了（アニメーション待機）');
}

/**
 * 日付を文字列一致で選択
 * 参照: SCRAPER_REBUILD_PLAN.md の「DOM セレクタ一覧」「日付選択機能」
 * セレクタ: .weeks-day-btn button.after-btn（"1/12(月)" など）
 * 特性: スクロール可能なため、スクロール後に再検索が必要
 * 待機: メニュー表示まで最大 5秒
 * 
 * @param {Page} page - Playwright の Page オブジェクト
 * @param {string} dateLabel - "1/12(月)" 形式
 * @returns {Promise<void>}
 * @throws {Error} 日付が見つからない場合、または メニュー表示タイムアウト
 */
async function selectDate(page, dateLabel) {
  // ステップ 1: ボタンが存在することを確認
  await page.waitForSelector('.weeks-day-btn button.after-btn', { timeout: 5000 });
  console.log(`🔍 日付選択開始: "${dateLabel}"`);

  // ステップ 2: 現在選択されている日付を確認
  const selectedBtn = page.locator('.weeks-day-btn button.after-btn.selected');
  if (await selectedBtn.count() > 0) {
    const currentSelectedDate = (await selectedBtn.first().textContent()).trim();
    if (currentSelectedDate === dateLabel) {
      console.log(`✅ 既に選択済みの日付: ${currentSelectedDate}`);
      return;
    }
  }

  // デバッグ: menu-area の子要素構造を事前に取得
  const preClickDebug = await page.evaluate(() => {
    const menuArea = document.querySelector('.menu-area');
    if (!menuArea) return { error: 'menu-area not found' };

    const children = [...menuArea.children].map(child => ({
      tag: child.tagName,
      class: typeof child.className === 'string' ? child.className : '',
      id: child.id || '',
      childCount: child.children.length,
      html: child.outerHTML.substring(0, 500)
    }));

    // 日付ボタンの詳細情報
    const btns = [...document.querySelectorAll('.weeks-day-btn button.after-btn')];
    const btnInfo = btns.slice(0, 5).map(btn => ({
      text: btn.textContent.trim(),
      class: btn.className,
      parentClass: btn.parentElement?.className || '',
      grandparentClass: btn.parentElement?.parentElement?.className || '',
      isVisible: btn.offsetWidth > 0 && btn.offsetHeight > 0,
      rect: btn.getBoundingClientRect()
    }));

    return { childCount: menuArea.children.length, children, btnInfo };
  });
  console.log('📊 [事前] menu-area 子要素:', JSON.stringify(preClickDebug, null, 2));

  // ステップ 3: 複数のクリック手法を順番に試行
  const buttons = page.locator('.weeks-day-btn button.after-btn');
  const count = await buttons.count();
  let targetIndex = -1;

  for (let i = 0; i < count; i++) {
    const text = await buttons.nth(i).textContent();
    if (text.trim() === dateLabel) {
      targetIndex = i;
      break;
    }
  }

  if (targetIndex === -1) {
    const available = [];
    for (let i = 0; i < count; i++) {
      available.push((await buttons.nth(i).textContent()).trim());
    }
    throw new Error(`日付「${dateLabel}」が見つかりません。利用可能な日付: ${available.join(', ')}`);
  }

  const targetBtn = buttons.nth(targetIndex);

  // 手法A: Playwright locator.click()
  console.log('🔧 [手法A] Playwright locator.click() を試行...');
  await targetBtn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500); // スクロール安定待機
  await targetBtn.click();
  await page.waitForTimeout(1500);

  let menuCount = await page.$$eval('.menu-content', els => els.length);
  let selectedDate = await page.evaluate(() => {
    const btn = document.querySelector('.weeks-day-btn button.after-btn.selected');
    return btn ? btn.textContent.trim() : 'なし';
  });
  console.log(`   結果: selected="${selectedDate}", menu-content数=${menuCount}`);

  if (menuCount > 0) {
    console.log(`✅ [手法A成功] 日付をクリック: "${dateLabel}"`);
    await waitForMenuDisplay(page, dateLabel);
    return;
  }

  // 手法B: Playwright page.tap()（タッチイベント）
  console.log('🔧 [手法B] Playwright page.tap() を試行...');
  try {
    await targetBtn.tap();
    await page.waitForTimeout(1500);

    menuCount = await page.$$eval('.menu-content', els => els.length);
    selectedDate = await page.evaluate(() => {
      const btn = document.querySelector('.weeks-day-btn button.after-btn.selected');
      return btn ? btn.textContent.trim() : 'なし';
    });
    console.log(`   結果: selected="${selectedDate}", menu-content数=${menuCount}`);

    if (menuCount > 0) {
      console.log(`✅ [手法B成功] 日付をタップ: "${dateLabel}"`);
      await waitForMenuDisplay(page, dateLabel);
      return;
    }
  } catch (e) {
    console.log(`   tap失敗: ${e.message}`);
  }

  // 手法C: locator.click({ force: true }) - アクション可能性チェックをバイパス
  console.log('🔧 [手法C] locator.click({ force: true }) を試行...');
  await targetBtn.click({ force: true });
  await page.waitForTimeout(1500);

  menuCount = await page.$$eval('.menu-content', els => els.length);
  selectedDate = await page.evaluate(() => {
    const btn = document.querySelector('.weeks-day-btn button.after-btn.selected');
    return btn ? btn.textContent.trim() : 'なし';
  });
  console.log(`   結果: selected="${selectedDate}", menu-content数=${menuCount}`);

  if (menuCount > 0) {
    console.log(`✅ [手法C成功] 日付を強制クリック: "${dateLabel}"`);
    await waitForMenuDisplay(page, dateLabel);
    return;
  }

  // 手法D: evaluate内でPointerEventシーケンスをdispatch
  console.log('🔧 [手法D] PointerEvent + MouseEvent シーケンスを試行...');
  await page.evaluate((label) => {
    const btns = [...document.querySelectorAll('.weeks-day-btn button.after-btn')];
    const target = btns.find(btn => btn.textContent.trim() === label);
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse' };

    target.dispatchEvent(new PointerEvent('pointerdown', opts));
    target.dispatchEvent(new PointerEvent('pointerup', opts));
    target.dispatchEvent(new MouseEvent('mousedown', opts));
    target.dispatchEvent(new MouseEvent('mouseup', opts));
    target.dispatchEvent(new MouseEvent('click', opts));
  }, dateLabel);
  await page.waitForTimeout(1500);

  menuCount = await page.$$eval('.menu-content', els => els.length);
  selectedDate = await page.evaluate(() => {
    const btn = document.querySelector('.weeks-day-btn button.after-btn.selected');
    return btn ? btn.textContent.trim() : 'なし';
  });
  console.log(`   結果: selected="${selectedDate}", menu-content数=${menuCount}`);

  if (menuCount > 0) {
    console.log(`✅ [手法D成功] 日付をイベントディスパッチ: "${dateLabel}"`);
    await waitForMenuDisplay(page, dateLabel);
    return;
  }

  // 手法E: 親要素（swiper-slide）をクリック
  console.log('🔧 [手法E] 親要素 (swiper-slide) をクリック...');
  const slideClicked = await page.evaluate((label) => {
    const btns = [...document.querySelectorAll('.weeks-day-btn button.after-btn')];
    const target = btns.find(btn => btn.textContent.trim() === label);
    if (!target) return false;

    // 親のswiper-slideを探してクリック
    let parent = target.parentElement;
    while (parent && !parent.classList.contains('swiper-slide')) {
      parent = parent.parentElement;
    }
    if (parent) {
      parent.click();
      return true;
    }
    return false;
  }, dateLabel);
  if (slideClicked) {
    await page.waitForTimeout(1500);
    menuCount = await page.$$eval('.menu-content', els => els.length);
    selectedDate = await page.evaluate(() => {
      const btn = document.querySelector('.weeks-day-btn button.after-btn.selected');
      return btn ? btn.textContent.trim() : 'なし';
    });
    console.log(`   結果: selected="${selectedDate}", menu-content数=${menuCount}`);
  }

  if (menuCount > 0) {
    console.log(`✅ [手法E成功] 日付をスライドクリック: "${dateLabel}"`);
    await waitForMenuDisplay(page, dateLabel);
    return;
  }

  // 全手法失敗 - 詳細デバッグ
  console.error(`\n${'='.repeat(60)}`);
  console.error('🔍 [デバッグ] 全クリック手法失敗 - 詳細ページ状態');
  console.error(`${'='.repeat(60)}`);
  console.error(`📍 現在のURL: ${page.url()}`);

  // スクリーンショット保存
  try {
    const fs = require('fs');
    const path = require('path');
    const debugDir = path.join(process.cwd(), 'debug');
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
    const screenshotPath = path.join(debugDir, `timeout_${dateLabel.replace(/[\/()]/g, '_')}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.error(`📸 スクリーンショット保存: ${screenshotPath}`);
  } catch (ssErr) {
    console.error(`📸 スクリーンショット保存失敗: ${ssErr.message}`);
  }

  // 詳細DOM調査
  const debugInfo = await page.evaluate(() => {
    const menuArea = document.querySelector('.menu-area');
    const menuAreaHTML = menuArea ? menuArea.innerHTML : 'NOT FOUND';

    // 全selected要素
    const allSelected = [...document.querySelectorAll('[class*="selected"], [class*="active"]')]
      .slice(0, 20)
      .map(el => ({
        tag: el.tagName,
        class: typeof el.className === 'string' ? el.className : '',
        text: (el.textContent || '').substring(0, 50).trim()
      }));

    // menu-areaの全子孫のクラス一覧
    const allClasses = new Set();
    if (menuArea) {
      menuArea.querySelectorAll('*').forEach(el => {
        if (el.classList) el.classList.forEach(c => allClasses.add(c));
      });
    }

    // ネットワークリクエスト用: fetchやXHRの存在確認
    const hasServiceWorker = 'serviceWorker' in navigator;

    return {
      menuAreaHTML: menuAreaHTML.substring(0, 5000),
      menuAreaFullLength: menuAreaHTML.length,
      allSelected,
      allMenuAreaClasses: [...allClasses].sort(),
      hasServiceWorker
    };
  });

  console.error(`\n📊 [詳細デバッグ結果]`);
  console.error(`  menu-area HTML長: ${debugInfo.menuAreaFullLength}`);
  console.error(`  menu-area 全クラス: ${debugInfo.allMenuAreaClasses.join(', ')}`);
  console.error(`  selected/active 要素:`);
  debugInfo.allSelected.forEach((el, i) => {
    console.error(`    [${i}] <${el.tag}> class="${el.class}" text="${el.text}"`);
  });
  console.error(`\n📄 [menu-area HTML (先頭5000文字)]`);
  console.error(debugInfo.menuAreaHTML);
  console.error(`${'='.repeat(60)}\n`);

  throw new Error(`メニュー表示タイムアウト（${dateLabel}）- 全クリック手法失敗`);
}

/**
 * メニュー表示の完了を待機するヘルパー
 */
async function waitForMenuDisplay(page, dateLabel) {
  console.log('⏳ メニュー表示待機中...');
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('.menu-content').length > 0,
      { timeout: 10000 }
    );
    const menuCount = await page.$$eval('.menu-content', els => els.length);
    console.log(`✅ メニュー表示確認: ${menuCount} メニュー`);
  } catch (error) {
    throw new Error(`メニュー表示タイムアウト（${dateLabel}）`);
  }
  await page.waitForTimeout(500);
}

/**
 * メニューを展開ボタンで全展開
 * 参照: SCRAPER_REBUILD_PLAN.md の「メニュー展開機能」
 * セレクタ: .menu-next-btn:not([disabled])（「次へ」ボタン）
 * 方法: 「次へ」ボタンをクリックし、メニュー数が増えるまで待機
 * 終了条件: ボタンが存在しなくなる、または メニュー数が増えない（タイムアウト）
 * 
 * @param {Page} page - Playwright の Page オブジェクト
 * @returns {Promise<void>}
 */
async function expandAllMenus(page) {
  let clickCount = 0;
  const maxIterations = 50; // 無限ループ防止
  
  console.log('📋 [展開開始] メニュー展開ボタンをクリック開始');
  
  while (clickCount < maxIterations) {
    // ステップ 1: 展開前のメニュー数をカウント
    const beforeCount = await page.$$eval('.menu-content', els => els.length);
    console.log(`   展開前: ${beforeCount} メニュー`);
    
    // ステップ 2: 展開ボタンの存在確認
    // 参照: SCRAPER_REBUILD_PLAN.md の「保持すべき機能」
    const nextBtn = await page.$('.menu-next-btn:not([disabled])');
    if (!nextBtn) {
      console.log(`✅ [展開完了] 展開ボタンがなくなりました（合計 ${clickCount} 回クリック）`);
      break;
    }

    // ステップ 3: ボタンをビューポート内に移動
    // 理由: ボタンがスクロール範囲外の場合、クリックが効かない
    try {
      await nextBtn.scrollIntoViewIfNeeded();
      console.log(`   ボタンをスクロール位置内に移動`);
    } catch (e) {
      console.log(`   ⚠️  scrollIntoViewIfNeeded 失敗（継続）`);
    }

    // ステップ 4: クリック実行
    await nextBtn.click({ force: true });
    console.log(`   🖱️  クリック ${clickCount + 1} 実行`);
    
    // ステップ 5: メニュー数が増えるまで待機
    // 参照: SCRAPER_REBUILD_PLAN.md の「タイミング・待機処理」
    // 理由: ネットワーク遅延への対応（最大5秒）
    const startTime = Date.now();
    let currentCount = beforeCount;
    const maxWaitTime = 5000;
    let menuIncreased = false;
    
    console.log(`   ⏳ メニュー追加待機中...`);
    while (Date.now() - startTime < maxWaitTime) {
      await page.waitForTimeout(200); // ネットワーク遅延対応
      currentCount = await page.$$eval('.menu-content', els => els.length);
      
      if (currentCount > beforeCount) {
        // メニュー数が増えた！
        menuIncreased = true;
        const elapsed = Date.now() - startTime;
        console.log(`   ✅ クリック ${clickCount + 1}: ${beforeCount} → ${currentCount} メニュー (+${currentCount - beforeCount}) [${elapsed}ms]`);
        clickCount++;
        break;
      }
    }
    
    // ステップ 6: メニュー数が増えない場合の対応
    if (!menuIncreased) {
      console.log(`   ❌ クリック ${clickCount + 1}: メニュー数変化なし (${beforeCount} → ${currentCount}) [タイムアウト]`);
      console.log(`   ⚠️  ボタンが存在したのにメニューが増えませんでした。`);
      break; // ループを抜ける
    }
    
    // ステップ 7: DOM 安定待機
    await page.waitForTimeout(300);
  }
  
  console.log(`✅ [展開完了] メニュー展開処理終了`);
}

/**
 * メニュー情報をスクレイプ
 * 参照: SCRAPER_REBUILD_PLAN.md の「メニュー取得・スクレイピング」
 * 
 * 処理フロー:
 * 1. メニュー要素の総数を確認
 * 2. 各メニューに対して:
 *    - メニュー名を取得
 *    - 詳細ボタンをクリックして詳細パネルを表示
 *    - 栄養情報をセル（2個ペア）で抽出
 *    - 詳細パネルを閉じる
 * 3. エラーハンドリング: 個別メニュー失敗は全体エラーにしない
 * 
 * @param {Page} page - Playwright の Page オブジェクト
 * @returns {Promise<Array>} メニュー配列 [{name, nutrition}, ...]
 */
async function scrapeMenus(page) {
  // ステップ 1: メニュー要素の存在確認
  // 参照: SCRAPER_REBUILD_PLAN.md の「保持すべき機能」
  console.log('\n🔍 [スクレイプ開始] メニュー抽出処理開始');
  
  try {
    await page.waitForSelector('.menu-content', { timeout: 15000 });
  } catch (err) {
    console.warn(`⚠️  メニュー要素が見つかりません（タイムアウト）`);
  }

  // ステップ 2: メニュー数を取得
  const menuCount = await page.$$eval('.menu-content', els => els.length);
  console.log(`   合計メニュー数: ${menuCount}`);

  // ステップ 3: 結果配列を初期化
  // 参照: SCRAPER_REBUILD_PLAN.md の「エラーハンドリング」
  const results = [];
  let successCount = 0;
  let failureCount = 0;

  // ステップ 4: 各メニューについて詳細取得を試みる
  // 理由: 1メニューの失敗が全体を止めない設計
  for (let i = 0; i < menuCount; i++) {
    try {
      // ステップ 4-1: i番目のメニュー要素を取得
      const menu = page.locator('.menu-content').nth(i);

      // ステップ 4-2: メニュー名を取得
      // 参照: SCRAPER_REBUILD_PLAN.md の「DOM セレクタ一覧」
      const name = (await menu.locator('.menu-name').innerText()).trim();
      if (!name) {
        console.warn(`   ⚠️  メニュー${i}: 名前が取得できません（スキップ）`);
        failureCount++;
        continue;
      }

      // ステップ 4-3: 詳細ボタンをクリック
      // 理由: 栄養情報は詳細パネルにのみ表示される
      await menu.locator('.menu-detail-btn').click({ force: true });
      
      // ステップ 4-4: 詳細パネルが表示されるまで待機
      // 参照: SCRAPER_REBUILD_PLAN.md の「タイミング・待機処理」
      try {
        await page.waitForSelector('.menu-detail-name', {
          state: 'visible',
          timeout: 3000
        });
      } catch (err) {
        throw new Error(`詳細パネルが表示されません`);
      }

      // ステップ 4-5: 栄養情報を取得（evaluate 内で完結）
      // 理由: DOM 構造が複雑なため、evaluate 内で一括処理
      const nutrition = await page.evaluate(() => {
        const cells = [...document.querySelectorAll('.menu-detail-cell')];
        const obj = {};
        
        // セル 2個ペア（キー + 値）で栄養情報を構築
        // 参照: SCRAPER_REBUILD_PLAN.md の「出力ファイル形式」
        for (let i = 0; i < cells.length; i += 2) {
          const key = cells[i]?.innerText?.trim();
          const val = cells[i + 1]?.innerText?.trim();
          
          if (key && val) {
            // 数値に変換可能なら Number に、そうでなければ String として保存
            const numVal = parseFloat(val);
            obj[key] = isNaN(numVal) ? val : numVal;
          }
        }
        return obj;
      });

      // ステップ 4-6: 取得した情報をリストに追加
      results.push({
        name,
        nutrition
      });
      
      successCount++;
      console.log(`   ✅ [${successCount}/${menuCount}] ${name}`);
      console.log(`      栄養情報: ${Object.keys(nutrition).length} 項目`);

      // ステップ 4-7: 詳細パネルを閉じる
      // 理由: 次メニューの操作がぶつからないように
      const closeBtn = await page.$('.menu-detail-header button');
      if (closeBtn) {
        await closeBtn.click({ force: true });
        // クローズアニメーション待ち
        await page.waitForTimeout(300);
      }

    } catch (error) {
      // ステップ 4-8: 1メニューの取得失敗は継続
      // 理由: 部分的な失敗が発生しても、取得できたデータは返す
      // 参照: SCRAPER_REBUILD_PLAN.md の「エラーハンドリング」
      failureCount++;
      console.error(`   ❌ [エラー ${failureCount}] メニュー${i}: ${error.message}`);
      continue;
    }
  }

  console.log(`\n📊 [スクレイプ統計] 成功: ${successCount}, 失敗: ${failureCount}, 合計: ${menuCount}\n`);
  return results;
}

/**
 * サイトから利用可能な日付ラベル一覧を取得
 * 「今週」タブに表示されている日付ボタンのテキストをすべて返す
 *
 * @returns {Promise<string[]>} "3/24(火)" 形式の日付ラベル配列
 */
async function getAvailableSiteDates() {
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto('https://kyowa2407225.uguide.info', {
      waitUntil: 'networkidle'
    });
    await page.waitForTimeout(2000);

    // 「今週」タブを選択
    await selectTab(page, '今週');

    // 日付ボタンからテキストを取得
    await page.waitForSelector('.weeks-day-btn button.after-btn', { timeout: 5000 });
    const dates = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.weeks-day-btn button.after-btn')];
      return btns.map(b => b.textContent.trim());
    });

    console.log(`📅 サイトで利用可能な日付: ${dates.join(', ')}`);
    return dates;

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { fetchMenus, getAvailableSiteDates };
