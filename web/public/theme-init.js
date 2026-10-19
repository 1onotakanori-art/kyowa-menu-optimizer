// 初回描画の前にテーマを決めて、ライト → ダークのちらつきを防ぐ。
// 解決ロジックは src/lib/theme.ts と同じ（変えるときは両方を直す）。
(function () {
  var preference = 'system';
  try {
    var saved = localStorage.getItem('kyowa-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') preference = saved;
  } catch (e) {
    // localStorage が使えない環境では OS の設定に従う
  }
  var dark = preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
