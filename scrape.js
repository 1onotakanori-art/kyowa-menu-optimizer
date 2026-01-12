const fs = require("fs");

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  /* ===============================
     1. サイトを開く
  =============================== */
  await page.goto('https://kyowa2407225.uguide.info', {
    waitUntil: 'networkidle'
  });

  /* ===============================
     2. 「今週来週」タブを選択
  =============================== */
  await page.waitForSelector('#menu-target .tab-button');

  await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('#menu-target .tab-button')];
    const target = tabs.find(t => t.textContent.includes('今週'));
    if (target) target.click();
  });

  await page.waitForTimeout(800);

  /* ===============================
    3. 直近の平日を選択
  =============================== */
  await page.waitForSelector('.weeks-day-btn button.after-btn');

  await page.evaluate(() => {
    const weekdayMarks = ['(月)', '(火)', '(水)', '(木)', '(金)'];

    const btns = [...document.querySelectorAll('.weeks-day-btn button.after-btn')];

    const target = btns.find(btn =>
      weekdayMarks.some(mark => btn.textContent.includes(mark))
    );

    if (!target) {
      throw new Error('直近の平日が見つかりません');
    }

    target.click();
  });

  await page.waitForTimeout(800);


  /* ===============================
     4. メニューをすべて展開
  =============================== */
  while (true) {
    const nextBtn = await page.$('.menu-next-btn:not([disabled])');
    if (!nextBtn) break;

    await nextBtn.click();
    await page.waitForTimeout(700);
  }

  /* ===============================
     5. メニュー取得
  =============================== */
  await page.waitForSelector('.menu-content');

  const menuCount = await page.$$eval('.menu-content', els => els.length);
  console.log(`メニュー数: ${menuCount}`);

  const results = [];

  for (let i = 0; i < menuCount; i++) {
    const menu = page.locator('.menu-content').nth(i);

    const name = (await menu.locator('.menu-name').innerText()).trim();
    const price = (await menu.locator('.menu-price').innerText()).trim();

    /* ---- 詳細を開く ---- */
    await menu.locator('.menu-detail-btn').click({ force: true });

    await page.waitForSelector('.menu-detail-name', {
      state: 'visible',
      timeout: 5000
    });

    /* ---- 栄養取得 ---- */
    const nutrition = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('.menu-detail-cell')];
      const obj = {};
      for (let i = 0; i < cells.length; i += 2) {
        const key = cells[i]?.innerText?.trim();
        const val = cells[i + 1]?.innerText?.trim();
        if (key && val) obj[key] = val;
      }
      return obj;
    });

    results.push({
      name,
      price,
      nutrition
    });

    /* ---- 詳細を閉じる ---- */
    await page.locator('.menu-detail-header button').click({ force: true });
    await page.waitForTimeout(400);
  }

  console.log(JSON.stringify(results, null, 2));
  console.log(`メニュー数: ${results.length}`);
  exportToCSV(results);
  await browser.close();

  
})();

function exportToCSV(results) {
  const headers = [
    "名前","価格","エネルギー(kcal)","たんぱく質(g)","脂質(g)",
    "炭水化物(g)","食塩相当量(g)","野菜重量(g)",
    "卵","乳類","小麦","そば","落花生","海老","カニ",
    "牛肉","くるみ","大豆","鶏肉","豚肉"
  ];

  const rows = results.map(item => {
    const n = item.nutrition;
    return [
      item.name,
      item.price,
      n["エネルギー"],
      n["たんぱく質"],
      n["脂質"],
      n["炭水化物"],
      n["食塩相当量"],
      n["野菜重量"],
      n["卵"],
      n["乳類"],
      n["小麦"],
      n["そば"],
      n["落花生"],
      n["海老"],
      n["カニ"],
      n["牛肉"],
      n["くるみ"],
      n["大豆"],
      n["鶏肉"],
      n["豚肉"]
    ];
  });

  const csv =
    headers.join(",") + "\n" +
    rows.map(r => r.map(v => `"${v ?? ""}"`).join(",")).join("\n");

  fs.writeFileSync("menu_2025-01-12.csv", csv, "utf8");
  console.log("CSVを書き出しました");
}




