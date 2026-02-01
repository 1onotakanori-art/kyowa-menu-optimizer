/**
 * ML統合サーバーメインファイル
 * 既存の Express サーバーに ML API を統合
 */

const express = require('express');
const path = require('path');
const mlAPI = require('./ml-api');

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ML API をマウント
app.use('/api/ml', mlAPI);

/**
 * ヘルスチェック
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Kyowa Menu Optimizer',
    timestamp: new Date().toISOString()
  });
});

/**
 * API ドキュメント
 */
app.get('/api/docs', (req, res) => {
  res.json({
    service: 'Kyowa Menu Optimizer API',
    version: '2.0.0',
    description: 'メニュー最適化エンジン + ML推論',
    endpoints: {
      ml: {
        base: '/api/ml',
        recommend: {
          method: 'GET',
          path: '/api/ml/recommend',
          description: 'メニュー推奨を生成',
          params: {
            date: { type: 'string', format: 'YYYY-MM-DD', required: false },
            protein: { type: 'number', unit: 'g', required: false, default: 20 },
            calories: { type: 'number', unit: 'kcal', required: false, default: 400 },
            top_k: { type: 'number', required: false, default: 4 }
          },
          examples: [
            '/api/ml/recommend',
            '/api/ml/recommend?date=2026-02-13',
            '/api/ml/recommend?protein=25&calories=450',
            '/api/ml/recommend?date=2026-02-13&protein=30&calories=500'
          ]
        },
        attention: {
          method: 'GET',
          path: '/api/ml/attention',
          description: 'Attention分析を実行（推奨根拠を分析）',
          params: {
            date: { type: 'string', format: 'YYYY-MM-DD', required: false }
          },
          examples: [
            '/api/ml/attention',
            '/api/ml/attention?date=2026-02-13'
          ]
        },
        health: {
          method: 'GET',
          path: '/api/ml/health',
          description: 'ML APIのヘルスチェック'
        }
      }
    }
  });
});

/**
 * エラーハンドリング
 */
app.use((err, req, res, next) => {
  console.error('❌ サーバーエラー:', err);
  res.status(500).json({
    error: 'サーバーエラーが発生しました',
    details: err.message,
    timestamp: new Date().toISOString()
  });
});

/**
 * 404 ハンドラー
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'エンドポイントが見つかりません',
    path: req.path,
    method: req.method,
    available_docs: '/api/docs'
  });
});

/**
 * サーバー起動
 */
const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║     🚀 Kyowa Menu Optimizer - ML統合サーバー起動                ║
╚════════════════════════════════════════════════════════════════╝

📍 ポート: ${PORT}
🌐 URL: http://localhost:${PORT}

📡 API エンドポイント:
  GET  /api/ml                    - APIドキュメント
  GET  /api/ml/health             - ヘルスチェック
  GET  /api/ml/recommend          - メニュー推奨生成
  GET  /api/ml/attention          - Attention分析

🧪 テストコマンド:
  curl http://localhost:${PORT}/api/ml
  curl http://localhost:${PORT}/api/ml/recommend
  curl http://localhost:${PORT}/api/ml/recommend?protein=25&calories=450

📖 ドキュメント:
  http://localhost:${PORT}/api/docs

`);
});

/**
 * Graceful shutdown
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;
