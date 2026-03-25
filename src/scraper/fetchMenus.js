const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://kyowa2407225.uguide.info';
const API_BASE = `${SITE_URL}/wp-json/wp/v2`;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * WordPress REST API を直接呼び出してメニューを取得
 *
 * API エンドポイント:
 *   GET /wp-json/wp/v2/cafeteria_menu?per_page=100&page=1&provide_date=YYYYMMDD&time_section=1,2,3,4
 *
 * @param {string} dateLabel - "3/25(水)" 形式の日付ラベル
 * @returns {Promise<{dateLabel: string, count: number, menus: Array}>}
 */
async function fetchMenus(dateLabel) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🌐 [API取得開始] 日付: ${dateLabel}`);
  console.log(`${'='.repeat(60)}`);

  const dateStr = dateLabelToApiDate(dateLabel);
  console.log(`📅 API日付パラメータ: ${dateStr}`);

  // まずサイトのHTMLを取得してCookie/nonceを取得
  console.log('🍪 セッション取得中...');
  const session = await getSession();

  // 全ページ分のメニューを取得
  const allItems = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `${API_BASE}/cafeteria_menu?per_page=${perPage}&page=${page}&provide_date=${dateStr}&time_section=1,2,3,4&_locale=user`;
    console.log(`📡 API呼出し: page=${page}`);

    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': USER_AGENT,
        'Referer': `${SITE_URL}/`,
        'Origin': SITE_URL,
        ...(session.cookie ? { 'Cookie': session.cookie } : {}),
        ...(session.nonce ? { 'X-WP-Nonce': session.nonce } : {}),
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`API returned ${res.status}: ${body.substring(0, 200)}`);
    }

    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) break;

    console.log(`   ✅ ${items.length} 件取得`);
    allItems.push(...items);

    // ページネーション確認
    const totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '1', 10);
    if (page >= totalPages) break;
    page++;
  }

  console.log(`📊 合計取得件数: ${allItems.length}`);

  // APIレスポンスを既存フォーマットに変換
  const menus = allItems.map(item => parseMenuItem(item)).filter(Boolean);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✨ [完成] ${dateLabel} のメニュー取得完了`);
  console.log(`   合計メニュー数: ${menus.length}`);
  console.log(`${'='.repeat(60)}\n`);

  return {
    dateLabel,
    count: menus.length,
    menus,
  };
}

/**
 * サイトにアクセスしてセッション情報（Cookie、WP Nonce）を取得
 */
async function getSession() {
  try {
    const res = await fetch(SITE_URL, {
      headers: { 'User-Agent': USER_AGENT },
    });

    const cookie = (res.headers.get('set-cookie') || '')
      .split(',')
      .map(c => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');

    const html = await res.text();

    // WordPress が埋め込む REST API nonce を探す
    const nonceMatch = html.match(/["']nonce["']\s*:\s*["']([a-f0-9]+)["']/);
    const nonce = nonceMatch ? nonceMatch[1] : null;

    console.log(`   Cookie: ${cookie ? '取得済み' : 'なし'}`);
    console.log(`   Nonce: ${nonce ? '取得済み' : 'なし'}`);

    return { cookie, nonce };
  } catch (err) {
    console.log(`   ⚠️ セッション取得失敗: ${err.message}`);
    return { cookie: null, nonce: null };
  }
}

/**
 * "3/25(水)" → "20260325" に変換
 */
function dateLabelToApiDate(dateLabel) {
  const match = dateLabel.match(/(\d{1,2})\/(\d{1,2})/);
  if (!match) throw new Error(`日付ラベルのパースに失敗: ${dateLabel}`);

  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  const now = new Date();
  let year = now.getFullYear();

  // 年跨ぎ対応
  if (month < now.getMonth() + 1 || (month === now.getMonth() + 1 && day < now.getDate())) {
    year++;
  }

  return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

/**
 * WordPress REST API のメニューアイテムを既存フォーマットに変換
 *
 * APIレスポンスの形式が不明なため、複数のパターンを試行する
 */
function parseMenuItem(item) {
  try {
    // メニュー名の取得（WordPress REST API の標準形式）
    const name = item.title?.rendered
      || item.title?.raw
      || item.menu_name
      || item.name
      || item.acf?.menu_name
      || (typeof item.title === 'string' ? item.title : null);

    if (!name) {
      console.log(`   ⚠️ メニュー名が取得できません: ${JSON.stringify(item).substring(0, 100)}`);
      return null;
    }

    // 栄養情報の取得
    const nutrition = {};
    const acf = item.acf || {};

    // ACF フィールドから栄養情報をマッピング
    const fieldMap = {
      'エネルギー': ['energy', 'エネルギー', 'kcal', 'calorie'],
      'たんぱく質': ['protein', 'たんぱく質'],
      '脂質': ['fat', '脂質', 'lipid'],
      '炭水化物': ['carbohydrate', '炭水化物', 'carb'],
      '飽和脂肪酸': ['saturated_fat', '飽和脂肪酸'],
      '食塩相当量': ['salt', '食塩相当量', 'sodium'],
      '野菜重量': ['vegetable', '野菜重量', 'vegetable_weight'],
    };

    const allergenMap = {
      '卵': ['egg', '卵'],
      '乳類': ['milk', '乳類', 'dairy'],
      '小麦': ['wheat', '小麦'],
      'そば': ['buckwheat', 'そば', 'soba'],
      '落花生': ['peanut', '落花生'],
      '海老': ['shrimp', '海老', 'ebi'],
      'カニ': ['crab', 'カニ', 'kani'],
      '牛肉': ['beef', '牛肉'],
      'くるみ': ['walnut', 'くるみ', 'kurumi'],
      '大豆': ['soy', '大豆', 'soybean'],
      '鶏肉': ['chicken', '鶏肉'],
      '豚肉': ['pork', '豚肉'],
    };

    // 栄養フィールドの取得
    for (const [jaName, keys] of Object.entries(fieldMap)) {
      for (const key of keys) {
        const val = acf[key] ?? item[key] ?? item.meta?.[key];
        if (val !== undefined && val !== null && val !== '') {
          nutrition[jaName] = typeof val === 'string' ? (isNaN(parseFloat(val)) ? val : parseFloat(val)) : val;
          break;
        }
      }
    }

    // アレルゲンフィールドの取得
    for (const [jaName, keys] of Object.entries(allergenMap)) {
      for (const key of keys) {
        const val = acf[key] ?? item[key] ?? item.meta?.[key];
        if (val !== undefined && val !== null && val !== '') {
          nutrition[jaName] = val === true || val === 1 || val === '1' || val === '◯' ? '◯' : '－';
          break;
        }
      }
    }

    // ACFフィールドから直接マッピングできなかった場合、
    // ACFの全フィールドをそのまま nutrition に入れる（フォールバック）
    if (Object.keys(nutrition).length === 0 && Object.keys(acf).length > 0) {
      console.log(`   📋 ACFフィールド直接使用: ${Object.keys(acf).join(', ')}`);
      for (const [key, val] of Object.entries(acf)) {
        if (val !== null && val !== undefined && val !== '') {
          nutrition[key] = typeof val === 'string' ? (isNaN(parseFloat(val)) ? val : parseFloat(val)) : val;
        }
      }
    }

    return { name: name.replace(/<[^>]*>/g, '').trim(), nutrition };
  } catch (err) {
    console.log(`   ⚠️ メニューパース失敗: ${err.message}`);
    return null;
  }
}

/**
 * サイトから利用可能な平日日付を生成
 *
 * WordPress APIの provide_date パラメータが分かったので、
 * Playwright不要でプログラム的に日付を生成する。
 * 今日から2週間分の平日を返す。
 */
function getAvailableWeekdays(maxDays = 10) {
  const weekdays = ['(日)', '(月)', '(火)', '(水)', '(木)', '(金)', '(土)'];
  const dates = [];
  const today = new Date();

  for (let i = 0; i < 30 && dates.length < maxDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      const month = d.getMonth() + 1;
      const day = d.getDate();
      dates.push(`${month}/${day}${weekdays[dow]}`);
    }
  }

  return dates;
}

module.exports = { fetchMenus, getAvailableWeekdays };
