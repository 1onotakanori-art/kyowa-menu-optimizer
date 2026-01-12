const app = require('./server');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`🚀 API サーバーが起動しました: http://localhost:${PORT}`);
  console.log(`📌 GET /menus`);
  console.log(`📌 GET /menus?date=YYYY-MM-DD`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM 受け取り、サーバーをシャットダウンします');
  server.close(() => {
    console.log('サーバーが停止しました');
    process.exit(0);
  });
});
