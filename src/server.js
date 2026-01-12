const express = require('express');
const path = require('path');
const fs = require('fs');
const { fetchMenus } = require('./scraper/fetchMenus');
const { getNearestWeekday, toDateLabel, parseDate } = require('./utils/date');
const { optimizeMenus } = require('./optimizer/optimizeMenus');

const app = express();

// 静的ファイルの配信（public フォルダ）
app.use(express.static(path.join(__dirname, 'public')));

// JSON ボディパーサー
app.use(express.json());

// キャッシュディレクトリ
const CACHE_DIR = path.join(__dirname, '.menus-cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * キャッシュファイル名を生成
 * dateLabel: "1/13(火)" 形式
 */
function getCacheFileName(dateLabel) {
  const match = dateLabel.match(/(\d{1,2})\/(\d{1,2})/);
  if (!match) {
    throw new Error(`Invalid dateLabel format: ${dateLabel}`);
  }
  
  const month = parseInt(match[1]);
  const day = parseInt(match[2]);
  
  // 現在の日付を基準に年を決定
  const today = new Date();
  let year = today.getFullYear();
  
  // 今月か来月か判定
  if (month < today.getMonth() + 1 || (month === today.getMonth() + 1 && day < today.getDate())) {
    year = today.getFullYear() + 1;
  }
  
  const monthStr = String(month).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  
  return `menus_${year}-${monthStr}-${dayStr}.json`;
}

/**
 * メニューをキャッシュから読込
 */
function loadMenusFromCache(dateLabel) {
  try {
    const fileName = getCacheFileName(dateLabel);
    const filePath = path.join(CACHE_DIR, fileName);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('キャッシュ読込エラー:', error);
  }
  return null;
}

/**
 * メニューをキャッシュに保存
 */
function saveMenusToCache(dateLabel, data) {
  try {
    const fileName = getCacheFileName(dateLabel);
    const filePath = path.join(CACHE_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('キャッシュ保存エラー:', error);
  }
}

/**
 * 利用可能な日付を取得
 */
function getAvailableDates() {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    const weekdayMap = { '月': '月', '火': '火', '水': '水', '木': '木', '金': '金', '土': '土', '日': '日' };
    
    const dates = files
      .filter(f => f.startsWith('menus_') && f.endsWith('.json'))
      .map(f => {
        const match = f.match(/menus_(\d{4})-(\d{2})-(\d{2})\.json/);
        if (match) {
          const [, year, month, day] = match;
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          const weekday = date.toLocaleDateString('ja-JP', { weekday: 'short' });
          return `${parseInt(month)}/${parseInt(day)}(${weekday})`;
        }
        return null;
      })
      .filter(d => d !== null)
      .sort((a, b) => {
        const aMatch = a.match(/(\d+)\/(\d+)/);
        const bMatch = b.match(/(\d+)\/(\d+)/);
        const aMonth = parseInt(aMatch[1]);
        const aDay = parseInt(aMatch[2]);
        const bMonth = parseInt(bMatch[1]);
        const bDay = parseInt(bMatch[2]);
        
        if (aMonth !== bMonth) return aMonth - bMonth;
        return aDay - bDay;
      });
    
    return dates;
  } catch (error) {
    console.error('利用可能な日付の取得エラー:', error);
    return [];
  }
}

/**
 * GET /menus
 * クエリパラメータ:
 *   - date: "YYYY-MM-DD" 形式（オプション）
 *   - dateLabel: "1/13(火)" 形式（オプション）
 *   どちらも未指定時は直近平日
 */
app.get('/menus', async (req, res) => {
  try {
    let dateLabel;

    if (req.query.dateLabel) {
      // dateLabel パラメータが指定されている場合（"1/13(火)" 形式）
      dateLabel = req.query.dateLabel;
    } else if (req.query.date) {
      // date パラメータが指定されている場合（"YYYY-MM-DD" 形式）
      const date = parseDate(req.query.date);
      dateLabel = toDateLabel(date);
    } else {
      // 未指定時は直近平日
      const nearestWeekday = getNearestWeekday();
      dateLabel = toDateLabel(nearestWeekday);
    }

    console.log(`📌 メニュー取得: ${dateLabel}`);

    // キャッシュから読込を試みる
    let result = loadMenusFromCache(dateLabel);
    
    if (!result) {
      console.log(`💾 キャッシュなし。スクレイピング実行...`);
      // スクレイプ実行
      result = await fetchMenus(dateLabel);
      // キャッシュに保存
      saveMenusToCache(dateLabel, result);
      console.log(`✅ キャッシュに保存しました`);
    } else {
      console.log(`✅ キャッシュから読込`);
    }

    // JSON で返す
    res.json(result);

  } catch (error) {
    // エラーをJSON で返す
    res.status(400).json({
      error: error.message
    });
  }
});

/**
 * GET /available-dates
 * キャッシュ済みの利用可能な日付を返す
 */
app.get('/available-dates', (req, res) => {
  try {
    const dates = getAvailableDates();
    res.json({ dates });
  } catch (error) {
    res.status(400).json({
      error: error.message
    });
  }
});

/**
 * ヘルスチェック
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * POST /optimize
 * メニュー最適化エンドポイント（改良版）
 * 
 * リクエストボディ:
 * {
 *   "date": "2026-01-13",（オプション、未指定なら直近平日）
 *   "targets": {
 *     "エネルギー": 650,
 *     "たんぱく質": 30
 *   },
 *   "fixedMenuNames": ["飛騨牛コロッケ", "グリーンサラダ"],（オプション）
 *   "excludedMenuNames": ["納豆"],（オプション）
 *   "options": {
 *     "maxMenus": 10,
 *     "multiStart": 3
 *   }
 * }
 * 
 * レスポンス:
 * {
 *   "date": "1/13(火)",
 *   "fixedMenus": [...],
 *   "fixedNutrition": {...},
 *   "additionalMenus": [...],
 *   "additionalNutrition": {...},
 *   "selectedMenus": [...],
 *   "totalNutrition": {...},
 *   "minimumLimits": {...},
 *   "difference": {...},
 *   "distance": 5.85
 * }
 */
app.post('/optimize', express.json(), async (req, res) => {
  try {
    const { date, targets, fixedMenuNames, excludedMenuNames, options } = req.body;

    // 入力バリデーション
    if (!targets || typeof targets !== 'object' || Object.keys(targets).length === 0) {
      return res.status(400).json({
        error: '目標値（targets）は必須です。例: { "エネルギー": 650, "たんぱく質": 30 }'
      });
    }

    // 日付を決定
    let dateLabel;
    if (date) {
      const parsedDate = parseDate(date);
      dateLabel = toDateLabel(parsedDate);
    } else {
      const nearestWeekday = getNearestWeekday();
      dateLabel = toDateLabel(nearestWeekday);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎯 [最適化リクエスト] 日付: ${dateLabel}`);
    console.log(`${'='.repeat(60)}`);

    // メニューをスクレイプ
    console.log('📋 メニュー取得中...');
    const menuData = await fetchMenus(dateLabel);
    const menus = menuData.menus;
    
    console.log(`✅ ${menus.length} メニュー取得完了`);

    // 最適化オプションを構築
    const optimizationOptions = {
      maxMenus: (options && options.maxMenus) || 10,
      multiStart: (options && options.multiStart) || 3,
      fixedMenuNames: fixedMenuNames || [],
      excludedMenuNames: excludedMenuNames || []
    };

    // 最適化を実行
    const optimizationResult = optimizeMenus(menus, targets, optimizationOptions);

    // レスポンスを構築
    const response = {
      date: dateLabel,
      fixedMenus: optimizationResult.fixedMenus,
      fixedNutrition: optimizationResult.fixedNutrition,
      additionalMenus: optimizationResult.additionalMenus,
      additionalNutrition: optimizationResult.additionalNutrition,
      selectedMenus: optimizationResult.selectedMenus,
      totalNutrition: optimizationResult.totalNutrition,
      targets: optimizationResult.targets,
      minimumLimits: optimizationResult.minimumLimits,
      difference: optimizationResult.difference,
      distance: optimizationResult.distance
    };

    console.log(`\n✨ [最適化完了]`);
    console.log(`   選択メニュー数: ${optimizationResult.selectedMenus.length}`);
    console.log(`   距離スコア: ${optimizationResult.distance.toFixed(2)}`);
    console.log(`${'='.repeat(60)}\n`);

    res.json(response);

  } catch (error) {
    console.error(`❌ [エラー] ${error.message}`);
    res.status(400).json({
      error: error.message
    });
  }
});

/**
 * GET /
 * ホームページにリダイレクト
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;

