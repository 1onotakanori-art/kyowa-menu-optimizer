import { LayoutDashboard } from 'lucide-react';
import { PlaceholderPage } from '../components/PlaceholderPage.tsx';
import { renderPage } from '../lib/render.tsx';

renderPage(
  <PlaceholderPage
    current="dashboard"
    title="ダッシュボード"
    icon={LayoutDashboard}
    description="AI 推奨の傾向（スコア、栄養、よく推奨されるメニュー）を期間ごとに集計して表示します。"
  />,
);
