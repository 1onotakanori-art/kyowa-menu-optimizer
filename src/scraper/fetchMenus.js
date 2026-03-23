const { chromium } = require('playwright');
const { toDateLabel } = require('../utils/date');
const path = require('path');

// デバッグ用スクリーンショット保存先
const DEBUG_DIR = path.join(__dirname, '..', '..', 'debug-screenshots');

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
 * タブを文字列一致で選択（Playwright ネイティブ click 使用）
 *
 * @param {Page} page - Playwright の Page オブジェクト
 * @param {string} tabText - 選択対象のテキスト（部分一致）
 * @returns {Promise<void>}
 * @throws {Error} タブが見つからない場合
 */
async function selectTab(page, tabText) {
  console.log(`🔍 タブ選択開始: "${tabText}"`);

  await page.waitForSelector('#menu-target .tab-button', { timeout: 5000 });
  console.log('✅ タブ要素を確認');

  // Playwright ネイティブの locator + click を使用
  // evaluate 内の DOM click() では SPA のイベントハンドラが発火しないケースがある
  const tab = page.locator('#menu-target .tab-button', { hasText: tabText });
  const count = await tab.count();
  if (count === 0) {
    const allTabs = await page.$$eval('#menu-target .tab-button', els => els.map(e => e.textContent.trim()));
    throw new Error(`タブ「${tabText}」が見つかりません。利用可能: ${allTabs.join(', ')}`);
  }

  await tab.first().click();
  console.log(`✅ タブをクリック: "${tabText}"`);

  await page.waitForTimeout(800);
  console.log('✅ タブ切り替え完了（アニメーション待機）');
}

/**
 * 日付を選択（Playwright ネイティブ click 使用）
 *
 * @param {Page} page - Playwright の Page オブジェクト
 * @param {string} dateLabel - "3/25(水)" 形式
 * @returns {Promise<void>}
 * @throws {Error} 日付が見つからない場合、または メニュー表示タイムアウト
 */
async function selectDate(page, dateLabel) {
  await page.waitForSelector('.weeks-day-btn button.after-btn', { timeout: 5000 });
  console.log(`🔍 日付選択開始: "${dateLabel}"`);

  // Playwright ネイティブの locator で日付ボタンを特定してクリック
  // evaluate 内の DOM click() では SPA のイベントハンドラが発火しないケースがある
  const allBtns = page.locator('.weeks-day-btn button.after-btn');
  const btnCount = await allBtns.count();
  let clicked = false;

  for (let i = 0; i < btnCount; i++) {
    const text = (await allBtns.nth(i).textContent()).trim();
    if (text === dateLabel) {
      await allBtns.nth(i).scrollIntoViewIfNeeded();
      await allBtns.nth(i).click();
      clicked = true;
      break;
    }
  }

  if (!clicked) {
    const available = [];
    for (let i = 0; i < btnCount; i++) {
      available.push((await allBtns.nth(i).textContent()).trim());
    }
    throw new Error(`日付「${dateLabel}」が見つかりません。利用可能な日付: ${available.join(', ')}`);
  }
  console.log(`✅ 日付をクリック: "${dateLabel}"`);

  // メニュー表示待機（タイムアウトを延長: 5s → 15s）
  console.log('⏳ メニュー表示待機中...');
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('.menu-content').length > 0,
      { timeout: 15000 }
    );
    const menuCount = await page.$$eval('.menu-content', els => els.length);
    console.log(`✅ メニュー表示確認: ${menuCount} メニュー`);
  } catch (error) {
    // デバッグ: 失敗時のページ状態をログ出力
    const debugInfo = await page.evaluate(() => {
      return {
        url: location.href,
        title: document.title,
        bodyClasses: document.body.className,
        visibleElements: {
          menuContent: document.querySelectorAll('.menu-content').length,
          menuName: document.querySelectorAll('.menu-name').length,
          tabButtons: document.querySelectorAll('.tab-button').length,
          afterBtns: document.querySelectorAll('.after-btn').length,
        },
        bodyTextPreview: document.body.innerText.substring(0, 500)
      };
    });
    console.error(`🔍 デバッグ情報:`, JSON.stringify(debugInfo, null, 2));

    // スクリーンショットを保存（CI でのデバッグ用）
    try {
      const fs = require('fs');
      if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
      const screenshotPath = path.join(DEBUG_DIR, `fail-${dateLabel.replace(/\//g, '-')}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.error(`📸 スクリーンショット保存: ${screenshotPath}`);
    } catch (ssErr) {
      console.error(`📸 スクリーンショット保存失敗: ${ssErr.message}`);
    }

    throw new Error(`メニュー表示タイムアウト（${dateLabel}）`);
  }

  // DOM 安定待機
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
