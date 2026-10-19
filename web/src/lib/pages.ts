import { Bell, LayoutDashboard, UtensilsCrossed, type LucideIcon } from 'lucide-react';

export type PageId = 'index' | 'dashboard' | 'notify' | 'admin' | 'unsubscribe';

export interface NavItem {
  id: PageId;
  label: string;
  href: string;
  icon: LucideIcon;
}

/** ヘッダーに並べるページ。管理画面と配信停止はリンクを出さない */
export const NAV_ITEMS: NavItem[] = [
  { id: 'index', label: 'メニュー最適化', href: '/', icon: UtensilsCrossed },
  { id: 'dashboard', label: 'ダッシュボード', href: '/dashboard', icon: LayoutDashboard },
  { id: 'notify', label: 'メニュー通知', href: '/notify', icon: Bell },
];
