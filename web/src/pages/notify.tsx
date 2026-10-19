import { Bell } from 'lucide-react';
import { PlaceholderPage } from '../components/PlaceholderPage.tsx';
import { renderPage } from '../lib/render.tsx';

renderPage(
  <PlaceholderPage
    current="notify"
    title="メニュー通知"
    icon={Bell}
    description="登録した条件に当日のメニューが合うと、朝 7:00 にメールでお知らせします。"
  />,
);
