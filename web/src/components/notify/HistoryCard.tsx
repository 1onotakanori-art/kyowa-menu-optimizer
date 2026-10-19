import { CircleAlert, CircleCheck, CircleMinus, History, LoaderCircle, type LucideIcon } from 'lucide-react';
import { formatDateLabel } from '../../lib/date.ts';
import type { Delivery } from '../../lib/notifyApi.ts';
import { Card } from '../ui.tsx';

const STATUS: Record<string, { label: string; icon: LucideIcon; className: string }> = {
  sent: { label: '送信済み', icon: CircleCheck, className: 'text-success' },
  skipped: { label: '該当なし', icon: CircleMinus, className: 'text-fg-muted' },
  failed: { label: '送信失敗', icon: CircleAlert, className: 'text-danger' },
  pending: { label: '送信中', icon: LoaderCircle, className: 'text-fg-muted' },
};

export function HistoryCard({ deliveries }: { deliveries: Delivery[] }) {
  return (
    <Card title="最近の通知" icon={History}>
      {deliveries.length === 0 ? (
        <p className="text-sm text-fg-muted">まだ通知はありません。</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {deliveries.map((delivery) => {
            const status = STATUS[delivery.status] ?? { label: delivery.status, icon: CircleMinus, className: 'text-fg-muted' };
            return (
              <li key={delivery.menu_date} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2">
                <span className="w-20 tabular-nums">{formatDateLabel(delivery.menu_date)}</span>
                <span className={`flex w-24 items-center gap-1 ${status.className}`}>
                  <status.icon className="size-4" aria-hidden="true" />
                  {status.label}
                </span>
                <span className="min-w-0 flex-1 text-fg-muted">{(delivery.matched ?? []).map((hit) => hit.ruleName).join('、')}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
