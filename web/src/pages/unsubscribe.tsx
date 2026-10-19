import { MailX } from 'lucide-react';
import { PlaceholderPage } from '../components/PlaceholderPage.tsx';
import { renderPage } from '../lib/render.tsx';

renderPage(
  <PlaceholderPage current="unsubscribe" title="配信停止" icon={MailX} description="メニュー通知メールの配信を停止します。" />,
);
