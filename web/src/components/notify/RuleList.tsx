import { CalendarCheck, CalendarX, ListFilter, Pencil, Plus, Trash2 } from 'lucide-react';
import { describeConditions } from '../../../../supabase/functions/_shared/matchRules.js';
import type { ISODate } from '../../lib/date.ts';
import { countUpcomingHitDays, type MenusByDate, type Rule } from '../../lib/notifyPreview.ts';
import { EmptyState } from '../EmptyState.tsx';
import { Button, Card, Switch } from '../ui.tsx';

interface RuleListProps {
  rules: Rule[];
  menusByDate: MenusByDate;
  today: ISODate;
  onAdd: () => void;
  onEdit: (rule: Rule) => void;
  onToggle: (rule: Rule, enabled: boolean) => void;
  onDelete: (rule: Rule) => void;
}

export function RuleList({ rules, menusByDate, today, onAdd, onEdit, onToggle, onDelete }: RuleListProps) {
  return (
    <Card
      title="通知ルール"
      icon={ListFilter}
      action={
        <Button variant="primary" icon={Plus} onClick={onAdd}>
          追加
        </Button>
      }
    >
      <p className="mb-3 text-xs text-fg-muted">どれか1つのルールに合うメニューがあれば通知します。</p>
      {rules.length === 0 ? (
        <EmptyState icon={ListFilter} title="まだルールがありません">
          「追加」から、通知してほしいメニューの条件を作ってください。
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => {
            const hitDays = countUpcomingHitDays(menusByDate, rule.conditions, today);
            return (
              <li key={rule.id} className={`rounded-xl border border-border p-3 ${rule.enabled ? 'bg-surface' : 'bg-surface-muted'}`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium ${rule.enabled ? '' : 'text-fg-muted'}`}>{rule.name}</p>
                    <p className="mt-0.5 text-sm text-fg-muted">{describeConditions(rule.conditions).join(' ／ ')}</p>
                  </div>
                  <Switch checked={rule.enabled} onChange={(on) => onToggle(rule, on)} label={`ルール「${rule.name}」を使う`} hideLabel />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`mr-auto flex items-center gap-1 text-xs ${hitDays ? 'text-success' : 'text-fg-muted'}`}>
                    {hitDays ? <CalendarCheck className="size-3.5" aria-hidden="true" /> : <CalendarX className="size-3.5" aria-hidden="true" />}
                    {hitDays ? `今後のメニューで ${hitDays} 日該当` : '今後のメニューには該当なし'}
                  </span>
                  <Button variant="ghost" icon={Pencil} onClick={() => onEdit(rule)} aria-label={`ルール「${rule.name}」を編集`}>
                    編集
                  </Button>
                  <Button variant="danger" icon={Trash2} onClick={() => onDelete(rule)} aria-label={`ルール「${rule.name}」を削除`}>
                    削除
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
