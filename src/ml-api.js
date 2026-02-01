/**
 * ML推論 API サーバー
 * Seq2Set Transformer + 栄養制約を使用した推奨エンジン
 */

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const router = express.Router();

router.use(express.json());

// Python スクリプトパス
const PYTHON_BIN = path.join(__dirname, '..', '.venv', 'bin', 'python');
const ML_SCRIPTS = {
  predict: path.join(__dirname, '..', 'ml', 'predict_with_nutrition.py'),
  attention: path.join(__dirname, '..', 'ml', 'analyze_attention.py'),
  rate: path.join(__dirname, '..', 'ml', 'user_preference_learning.py')
};

// ユーザー ID（単一ユーザー: デフォルトユーザー）
const DEFAULT_USER_ID = 'default_user';

/**
 * Python スクリプトを実行して結果を取得
 */
function executePythonScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const python = spawn(PYTHON_BIN, [scriptPath, ...args], {
      cwd: path.join(__dirname, '..'),
      timeout: 30000
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python script failed: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });

    python.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * 推奨メニューセットを生成
 * GET /recommend?date=2026-02-13&protein=25&calories=450&personalize=true
 */
router.get('/recommend', async (req, res) => {
  try {
    const { date = null, protein = null, calories = null, top_k = '4', personalize = 'false' } = req.query;
    
    // 日付バリデーション
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: '日付形式が不正です (YYYY-MM-DD)',
        date
      });
    }

    // タンパク質・カロリーのバリデーション
    if (protein && (isNaN(protein) || parseFloat(protein) < 0)) {
      return res.status(400).json({
        error: 'タンパク質は0以上の数値である必要があります',
        protein
      });
    }

    if (calories && (isNaN(calories) || parseFloat(calories) < 0)) {
      return res.status(400).json({
        error: 'カロリーは0以上の数値である必要があります',
        calories
      });
    }

    console.log('🔄 推奨生成を開始:', { date, protein, calories, personalize });

    // Python スクリプトを実行
    const args = [date || ''].filter(Boolean);
    if (protein) args.push(protein);
    if (calories) args.push(calories);
    
    // 個人化推奨フラグ
    if (personalize === 'true') {
      args.push('--personalize');
      args.push(DEFAULT_USER_ID);
    }

    const output = await executePythonScript(ML_SCRIPTS.predict, args);

    // 出力をパース（テキスト形式の場合）
    const result = {
      status: 'success',
      timestamp: new Date().toISOString(),
      request: { date, protein, calories, top_k, personalize },
      output: output,
      note: 'テキスト形式で返却しています。将来的にはJSON形式へ統一予定'
    };

    res.json(result);

  } catch (error) {
    console.error('❌ エラー:', error.message);
    res.status(500).json({
      error: 'ML推論に失敗しました',
      details: error.message
    });
  }
});

/**
 * Attention分析を実行
 * GET /attention?date=2026-02-13
 */
router.get('/attention', async (req, res) => {
  try {
    const { date = null } = req.query;

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: '日付形式が不正です (YYYY-MM-DD)',
        date
      });
    }

    console.log('🔄 Attention分析を開始:', { date });

    // Python スクリプトを実行
    const args = date ? [date] : [];
    const output = await executePythonScript(ML_SCRIPTS.attention, args);

    const result = {
      status: 'success',
      timestamp: new Date().toISOString(),
      request: { date },
      output: output,
      note: 'テキスト形式で返却しています。将来的にはJSON形式へ統一予定'
    };

    res.json(result);

  } catch (error) {
    console.error('❌ エラー:', error.message);
    res.status(500).json({
      error: 'Attention分析に失敗しました',
      details: error.message
    });
  }
});

/**
 * ヘルスチェック
 * GET /health
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ML推論API',
    timestamp: new Date().toISOString(),
    endpoints: {
      recommend: 'GET /api/ml/recommend?date=2026-02-13&protein=25&calories=450',
      attention: 'GET /api/ml/attention?date=2026-02-13',
      health: 'GET /api/ml/health'
    }
  });
});

/**
 * ルートエンドポイント
 */
router.get('/', (req, res) => {
  res.json({
    service: 'Kyowa Menu Optimizer - ML推論エンジン',
    version: '1.0.0',
    status: 'running',
    model: 'Seq2Set Transformer',
    features: [
      'メニュー推奨生成',
      'Attention分析',
      '栄養制約対応'
    ],
    docs: {
      recommend: '/api/ml/recommend - メニュー推奨を生成',
      attention: '/api/ml/attention - Attention分析を実行',
      health: '/api/ml/health - ヘルスチェック'
    }
  });
});

/**
 * ユーザー評価を保存
 * POST /rate
 * Body: { menu_name: "蒸し鶏&ブロッコリー", rating: 5, feedback: "とても美味しい！" }
 */
router.post('/rate', async (req, res) => {
  try {
    const { menu_name, rating, feedback = '' } = req.body;

    // バリデーション
    if (!menu_name || typeof menu_name !== 'string') {
      return res.status(400).json({
        error: 'menu_name は必須です（文字列型）',
        received: menu_name
      });
    }

    if (!rating || isNaN(rating) || rating < 1 || rating > 5 || !Number.isInteger(parseInt(rating))) {
      return res.status(400).json({
        error: 'rating は 1~5 の整数である必要があります',
        received: rating
      });
    }

    if (feedback && typeof feedback !== 'string') {
      return res.status(400).json({
        error: 'feedback は文字列型である必要があります',
        received: typeof feedback
      });
    }

    console.log('💾 評価を保存:', { menu_name, rating, feedback });

    // Python スクリプトで評価を保存
    const fs = require('fs');
    const preferencesDir = path.join(__dirname, '..', 'ml', 'user_preferences');
    const preferencesFile = path.join(preferencesDir, `${DEFAULT_USER_ID}.json`);

    // ディレクトリがなければ作成
    if (!fs.existsSync(preferencesDir)) {
      fs.mkdirSync(preferencesDir, { recursive: true });
    }

    // ファイルを読み込みまたは初期化
    let preferences = {};
    if (fs.existsSync(preferencesFile)) {
      preferences = JSON.parse(fs.readFileSync(preferencesFile, 'utf8'));
    } else {
      preferences = {
        user_id: DEFAULT_USER_ID,
        created_at: new Date().toISOString(),
        ratings: {}
      };
    }

    // 評価を追加
    if (!preferences.ratings) {
      preferences.ratings = {};
    }
    if (!preferences.ratings[menu_name]) {
      preferences.ratings[menu_name] = [];
    }

    preferences.ratings[menu_name].push({
      rating: parseInt(rating),
      timestamp: new Date().toISOString(),
      feedback: feedback
    });

    preferences.updated_at = new Date().toISOString();

    // ファイルに保存
    fs.writeFileSync(preferencesFile, JSON.stringify(preferences, null, 2), 'utf8');

    res.json({
      status: 'success',
      message: '評価を保存しました',
      timestamp: new Date().toISOString(),
      data: {
        user_id: DEFAULT_USER_ID,
        menu_name,
        rating: parseInt(rating),
        feedback
      }
    });

  } catch (error) {
    console.error('❌ エラー:', error.message);
    res.status(500).json({
      error: '評価の保存に失敗しました',
      details: error.message
    });
  }
});

/**
 * ユーザープリファレンスサマリーを取得
 * GET /preferences
 */
router.get('/preferences', async (req, res) => {
  try {
    const fs = require('fs');
    const preferencesPath = path.join(__dirname, '..', 'ml', 'user_preferences', `${DEFAULT_USER_ID}.json`);

    if (!fs.existsSync(preferencesPath)) {
      return res.json({
        status: 'success',
        user_id: DEFAULT_USER_ID,
        total_ratings: 0,
        average_rating: 0,
        message: 'まだ評価がありません'
      });
    }

    const data = JSON.parse(fs.readFileSync(preferencesPath, 'utf8'));

    // 平均評価を計算
    let totalRating = 0;
    let ratingCount = 0;
    for (const ratings of Object.values(data.ratings || {})) {
      for (const r of ratings) {
        totalRating += r.rating;
        ratingCount++;
      }
    }
    const averageRating = ratingCount > 0 ? (totalRating / ratingCount).toFixed(2) : 0;

    res.json({
      status: 'success',
      user_id: DEFAULT_USER_ID,
      total_ratings: ratingCount,
      unique_menus: Object.keys(data.ratings || {}).length,
      average_rating: parseFloat(averageRating),
      created_at: data.created_at,
      updated_at: data.updated_at
    });

  } catch (error) {
    console.error('❌ エラー:', error.message);
    res.status(500).json({
      error: 'プリファレンス情報の取得に失敗しました',
      details: error.message
    });
  }
});

/**
 * エラーハンドリング
 */
router.use((err, req, res, next) => {
  console.error('❌ サーバーエラー:', err);
  res.status(500).json({
    error: 'サーバーエラーが発生しました',
    details: err.message
  });
});

/**
 * 404 ハンドラー
 */
router.use((req, res) => {
  res.status(404).json({
    error: 'エンドポイントが見つかりません',
    path: req.path,
    method: req.method
  });
});

module.exports = router;
