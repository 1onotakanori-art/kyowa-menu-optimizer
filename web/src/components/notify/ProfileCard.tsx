import { useEffect, useState } from 'react';
import { BellRing, Save } from 'lucide-react';
import type { Profile } from '../../lib/notifyApi.ts';
import { Button, Card, Switch } from '../ui.tsx';

const WEEKDAYS: [number, string][] = [
  [1, '月'],
  [2, '火'],
  [3, '水'],
  [4, '木'],
  [5, '金'],
  [6, '土'],
  [7, '日'],
];

interface ProfileCardProps {
  profile: Profile;
  onSave: (profile: Profile) => Promise<void>;
}

export function ProfileCard({ profile, onSave }: ProfileCardProps) {
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(profile), [profile]);

  const changed =
    draft.email_enabled !== profile.email_enabled || draft.notify_weekdays.join() !== profile.notify_weekdays.join();
  const toggleDay = (day: number) =>
    setDraft((d) => ({
      ...d,
      notify_weekdays: d.notify_weekdays.includes(day) ? d.notify_weekdays.filter((x) => x !== day) : [...d.notify_weekdays, day].sort(),
    }));

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="通知設定" icon={BellRing}>
      <Switch checked={draft.email_enabled} onChange={(email_enabled) => setDraft((d) => ({ ...d, email_enabled }))} label="通知メールを受け取る" />
      <fieldset className="mt-2">
        <legend className="mb-2 text-sm font-medium">通知する曜日</legend>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map(([day, label]) => {
            const on = draft.notify_weekdays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                aria-label={`${label}曜日`}
                onClick={() => toggleDay(day)}
                className={`grid size-11 place-items-center rounded-lg border text-sm font-medium transition-colors ${
                  on ? 'border-accent bg-accent text-accent-fg' : 'border-border-strong bg-surface text-fg-muted hover:text-fg'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <p className="mt-3 text-xs leading-relaxed text-fg-muted">
        毎朝 7 時ごろ、その日のメニューに条件に合うものがあればメールします。該当がない日や、食堂が休み（メニューがない日）は送りません。
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button variant="primary" icon={Save} onClick={save} disabled={!changed || saving}>
          {saving ? '保存しています…' : '設定を保存'}
        </Button>
        {changed && <span className="text-xs text-fg-muted">保存していない変更があります</span>}
      </div>
    </Card>
  );
}
