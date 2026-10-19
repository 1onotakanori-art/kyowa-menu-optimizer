// 旧 GitHub Pages（https://1onotakanori-art.github.io/kyowa-menu-optimizer/）から Vercel の新しいサイトへ転送する。
// パスは拡張子なしにし（notify.html → /notify）、クエリ（配信停止の token など）とハッシュはそのまま引き継ぐ。
(function () {
  var NEW_ORIGIN = 'https://kyowa-menu-optimizer.vercel.app';
  var PAGES = { 'index': '/', 'notify': '/notify', 'admin': '/admin', 'unsubscribe': '/unsubscribe', 'dashboard': '/dashboard' };
  var name = location.pathname.replace(/^\/kyowa-menu-optimizer/, '').replace(/^\/+|\/+$/g, '').replace(/\.html$/, '') || 'index';
  var path = Object.prototype.hasOwnProperty.call(PAGES, name) ? PAGES[name] : '/';
  location.replace(NEW_ORIGIN + path + location.search + location.hash);
})();
