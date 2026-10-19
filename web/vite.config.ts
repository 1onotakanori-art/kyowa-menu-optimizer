import { resolve } from 'node:path';
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// ページごとに HTML を分けるマルチページ構成。
// 本番は Vercel の cleanUrls で /notify → notify.html のように配信する（メール内の notify.html / unsubscribe.html のリンクもそのまま使える）。
const pages = ['index', 'dashboard', 'notify', 'admin', 'unsubscribe'];

/** 開発サーバーとプレビューでも /notify のような拡張子なしの URL で各ページを開けるようにする */
function cleanUrls(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    const [path, query] = (req.url ?? '').split('?');
    const name = path.replace(/^\/|\/$/g, '');
    if (pages.includes(name) && name !== 'index') {
      req.url = `/${name}.html${query ? `?${query}` : ''}`;
    }
    next();
  };
  return {
    name: 'clean-urls',
    configureServer: (server) => void server.middlewares.use(rewrite),
    configurePreviewServer: (server) => void server.middlewares.use(rewrite),
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cleanUrls()],
  build: {
    rollupOptions: {
      input: Object.fromEntries(pages.map((name) => [name, resolve(import.meta.dirname, `${name}.html`)])),
    },
  },
});
