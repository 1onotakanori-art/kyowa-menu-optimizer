import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/global.css';

/** 各ページの入口から呼ぶ。#root に描画する */
export function renderPage(page: ReactNode) {
  createRoot(document.getElementById('root')!).render(<StrictMode>{page}</StrictMode>);
}
