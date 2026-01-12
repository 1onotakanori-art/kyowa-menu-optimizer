const { chromium } = require('playwright');
const { toDateLabel } = require('../utils/date');

/**
 * 指定した日付のメニューをスクレイプ
 * @param {string} dateLabel - "1/12(月)" 形式の日付ラベル
 * @returns {Promise<{dateLabel: string, count: number, menus: Array}>}
 */
async function fetchMenus(dateLabel) {
  let browser;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🌐 [スクレイプ開始] 日付: ${dateLabel}`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    // ブラウザ起動
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    console.log('✅ ブラウザ起動完了');

    // サイトを開く
    console.log('⏳ サイト読み込み中...');
    await page.goto('https://kyowa2407225.uguide.info', {
      waitUntil: 'networkidle'
    });
    console.log('✅ サイト読み込み完了');

    // タブ切り替え：「今週来週」を選択
    console.log('📑 タブ切り替え: 「今週」を選択');
    await selectTab(page, '今週');
    console.log('✅ タブ切り替え完了');

    // 日付を選択
    console.log(`📅 日付選択: 「${dateLabel}」`);
    await selectDate(page, dateLabel);
    console.log('✅ 日付選択完了');

    // メニューをすべて展開
    await expandAllMenus(page);

    // メニュー取得
    const menus = await scrapeMenus(page);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✨ [完成] ${dateLabel} のメニュー取得完了`);
    console.log(`   合計メニュー数: ${menus.length}`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      dateLabel,
      count: menus.length,
      menus
    };

  } finally {
    // ブラウザを必ず閉じる
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * タブを文字列一致で選択
 * 理由：「本日」「今週来週」タブが消える問題に対応するため、
 * waitForSelector で存在確認 → evaluate 内で文字列一致クリック
 * @param {Page} page
 * @param {string} tabText - 選択対象のテキスト（部分一致）
 */
async function selectTab(page, tabText) {
  // タブが DOM に存在することを確認（タブ消失防止）
  await page.waitForSelector('#menu-target .tab-button', { timeout: 5000 });

  // DOM 操作はすべて evaluate 内で完結（serialize エラー防止）
  // Node の変数（tabText）を渡すが、evaluate 内でのスコープ分離を保つ
  const selected = await page.evaluate((text) => {
    const tabs = [...document.querySelectorAll('#menu-target .tab-button')];
    const target = tabs.find(t => t.textContent.includes(text));
    
    if (!target) {
      return { 
        success: false, 
        message: `タブ「${text}」が見つかりません。利用可能: ${tabs.map(t => t.textContent.trim()).join(', ')}`
      };
    }

    // ユーザーインタラクションを含むアクション（クリック）は evaluate 内で完結
    target.click();
    return { success: true };
  }, tabText);

  if (!selected.success) {
    throw new Error(selected.message);
  }

  // タブ切り替えアニメーション待ち
  // 理由：タブ内容が更新されるまで待つため
  await page.waitForTimeout(800);
}

/**
 * 日付を文字列一致で選択
 * 理由：日付「選択」が効いていない問題対応
 * スクロール + 完全一致 + evaluate 内アクション完結
 * @param {Page} page
 * @param {string} dateLabel - "1/12(月)" 形式
 */
async function selectDate(page, dateLabel) {
  // ボタンが存在することを確認
  await page.waitForSelector('.weeks-day-btn button.after-btn', { timeout: 5000 });

  // スクロール＆クリック処理をすべて evaluate 内で実行
  // 理由：複数の DOM 操作が連鎖するため、一括で処理する必要がある
  const selected = await page.evaluate((label) => {
    // 1回目：ボタン一覧を取得して探す
    let btns = [...document.querySelectorAll('.weeks-day-btn button.after-btn')];
    let target = btns.find(btn => btn.textContent.trim() === label);
    
    if (!target) {
      // 見つからない場合、スクロール＆再検索（カレンダー操作は禁止だが、表示領域スクロールは必要）
      const container = document.querySelector('.weeks-day-btn');
      if (container) {
        // 右方向にスクロール（複数週の日付が見える場合）
        container.scrollLeft += 200;
        // スクロール直後は DOM が安定していない可能性があるため、バッファを取る
        // ※ evaluate 内では waitForTimeout が使えないため、2回目検索は遅延なし
      }
      
      btns = [...document.querySelectorAll('.weeks-day-btn button.after-btn')];
      target = btns.find(btn => btn.textContent.trim() === label);
    }
    
    if (!target) {
      // 見つからない場合、利用可能な日付を返す
      return { 
        success: false, 
        message: `日付「${label}」が見つかりません。利用可能な日付: ${btns.map(b => b.textContent.trim()).join(', ')}` 
      };
    }

    // クリック（force: true の効果をシミュレート）
    // 理由：ボタンが covered されている可能性を考慮
    target.click();
    return { success: true };
  }, dateLabel);

  if (!selected.success) {
    throw new Error(selected.message);
  }

  // 日付変更待ち
  // 理由：サイト側がメニュー更新するまで待つ
  await page.waitForTimeout(800);
}

/**
 * メニューを展開ボタンで全展開
 * 理由：elementHandle.click Timeout 問題に対応
 * selector ベースで安定性を確保
 * 改善：クリック後、メニュー数の安定を確認してから次のクリック
 * @param {Page} page
 */
async function expandAllMenus(page) {
  // 展開ボタンループ：ボタンがなくなるまでクリック
  let clickCount = 0;
  const maxIterations = 50; // 無限ループ防止
  
  console.log('📋 [展開開始] メニュー展開ボタンをクリック開始');
  
  while (clickCount < maxIterations) {
    // 展開前のメニュー数をカウント
    const beforeCount = await page.$$eval('.menu-content', els => els.length);
    console.log(`   展開前: ${beforeCount} メニュー`);
    
    // 存在確認してからクリック（elementHandle timeout 防止）
    const nextBtn = await page.$('.menu-next-btn:not([disabled])');
    if (!nextBtn) {
      // ボタンがないので終了
      console.log(`✅ [展開完了] 展開ボタンがなくなりました（合計 ${clickCount} 回クリック）`);
      break;
    }

    // force: true でカバーされた要素も操作可能に
    // 理由：ボタンが他の要素で覆われている可能性
    await nextBtn.click({ force: true });
    
    // 重要：クリック直後は DOM 更新が進行中の可能性がある
    // 最初の短い待機でクリックが反映するまで待つ
    await page.waitForTimeout(300);
    
    // メニュー数の変化を確認（安定するまで待つ）
    // 理由：DOM 更新が完全に終わるまで待つ必要がある
    let stableCount = 0;
    let lastCount = beforeCount;
    const maxStableChecks = 10;
    
    for (let check = 0; check < maxStableChecks; check++) {
      await page.waitForTimeout(200);
      const currentCount = await page.$$eval('.menu-content', els => els.length);
      
      if (currentCount === lastCount) {
        // メニュー数が同じ = DOM 更新が終了
        stableCount++;
        if (stableCount >= 2) {
          // 2 回連続で同じ数 = 確実に安定
          console.log(`   → クリック ${clickCount + 1}: ${beforeCount} → ${currentCount} メニュー (+${currentCount - beforeCount})`);
          clickCount++;
          break;
        }
      } else {
        // メニュー数が変わった = まだ更新中
        lastCount = currentCount;
        stableCount = 0;
      }
    }
    
    // maxStableChecks に達したら、いったんメニュー数を記録して続行
    if (stableCount < 2) {
      const finalCount = await page.$$eval('.menu-content', els => els.length);
      console.log(`   → クリック ${clickCount + 1}: ${beforeCount} → ${finalCount} メニュー (+${finalCount - beforeCount})`);
      clickCount++;
    }
  }
}

/**
 * メニュー情報をスクレイプ
 * 理由：「results is not defined」エラーと個別失敗の処理を明確化
 * @param {Page} page
 * @returns {Promise<Array>}
 */
async function scrapeMenus(page) {
  // メニュー要素の存在確認
  await page.waitForSelector('.menu-content', { timeout: 5000 });

  // メニュー数を取得
  const menuCount = await page.$$eval('.menu-content', els => els.length);
  console.log(`\n🔍 [スクレイプ開始] 合計 ${menuCount} メニューを取得開始`);

  // 結果配列：スコープ明確化のため最初に宣言
  const results = [];
  let successCount = 0;
  let failureCount = 0;

  // 各メニューについて、詳細取得を試みる
  // 理由：1メニューの失敗が全体を止めない設計
  for (let i = 0; i < menuCount; i++) {
    try {
      // i番目のメニュー要素を取得
      const menu = page.locator('.menu-content').nth(i);

      // 基本情報（名前）を取得
      const name = (await menu.locator('.menu-name').innerText()).trim();
      if (!name) {
        console.warn(`   ⚠️  メニュー${i}: 名前が取得できません（スキップ）`);
        failureCount++;
        continue;
      }

      // 詳細ボタンをクリック
      // 理由：栄養情報は詳細パネルにのみ表示される
      await menu.locator('.menu-detail-btn').click({ force: true });

      // 詳細パネルが表示されるまで待機
      // 理由：パネル表示アニメーション待ち
      await page.waitForSelector('.menu-detail-name', {
        state: 'visible',
        timeout: 3000
      });

      // 栄養情報を取得（evaluate 内で完結）
      // 理由：DOM 構造が複雑なため、evaluate 内で一括処理
      const nutrition = await page.evaluate(() => {
        const cells = [...document.querySelectorAll('.menu-detail-cell')];
        const obj = {};
        
        // セル 2個ペア（キー + 値）で栄養情報を構築
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

      // 取得した情報をリストに追加
      results.push({
        name,
        nutrition
      });
      
      successCount++;
      console.log(`   ✅ [${successCount}/${menuCount}] ${name}`);
      console.log(`      栄養情報キー数: ${Object.keys(nutrition).length}`);

      // 詳細パネルを閉じる
      // 理由：次メニューの操作がぶつからないように
      const closeBtn = await page.$('.menu-detail-header button');
      if (closeBtn) {
        await closeBtn.click({ force: true });
        // クローズアニメーション待ち
        await page.waitForTimeout(300);
      }

    } catch (error) {
      // 1メニューの取得失敗は継続（全体エラーにしない）
      // 理由：部分的な失敗が発生しても、取得できたデータは返す
      failureCount++;
      console.error(`   ❌ [エラー ${failureCount}] メニュー${i}: ${error.message}`);
      continue;
    }
  }

  console.log(`\n📊 [スクレイプ完了] 成功: ${successCount}, 失敗: ${failureCount}, 合計: ${menuCount}`);
  return results;
}

module.exports = { fetchMenus };
