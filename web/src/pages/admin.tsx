import { UserCog } from 'lucide-react';
import { PlaceholderPage } from '../components/PlaceholderPage.tsx';
import { renderPage } from '../lib/render.tsx';

renderPage(
  <PlaceholderPage current="admin" title="食事記録" icon={UserCog} description="実際に食べたメニューを記録します（管理者のみ）。" />,
);
