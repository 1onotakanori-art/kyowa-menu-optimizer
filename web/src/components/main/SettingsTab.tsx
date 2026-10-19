import { useId, type Dispatch, type SetStateAction } from 'react';
import { ArrowRight, CalendarDays, Minus, Plus, Target } from 'lucide-react';
import { formatDateLabel, type ISODate } from '../../lib/date.ts';
import { TARGET_FIELDS, type TargetKey } from '../../lib/nutrition.ts';
import { MAX_ADDITIONAL_RANGE, clampMaxAdditional, type Settings } from '../../lib/settings.ts';
import type { AsyncState } from '../../hooks/useAsync.ts';
import { Button, Card, ErrorMessage, Loading, NumberField, Switch } from '../ui.tsx';

interface SettingsTabProps {
  dates: AsyncState<ISODate[]>;
  onReloadDates: () => void;
  date: ISODate | null;
  today: ISODate;
  onDateChange: (date: ISODate) => void;
  settings: Settings;
  onSettingsChange: Dispatch<SetStateAction<Settings>>;
  onNext: () => void;
}

export function SettingsTab({ dates, onReloadDates, date, today, onDateChange, settings, onSettingsChange, onNext }: SettingsTabProps) {
  const dateId = useId();
  const maxId = useId();

  // 続けて操作しても取りこぼさないよう、常に最新の設定から作り直す
  const setTarget = (key: TargetKey, patch: Partial<Settings['targets'][TargetKey]>) =>
    onSettingsChange((current) => ({
      ...current,
      targets: { ...current.targets, [key]: { ...current.targets[key], ...patch } },
    }));
  const setMax = (value: number) => onSettingsChange((current) => ({ ...current, maxAdditional: clampMaxAdditional(value) }));

  return (
    <div className="space-y-4">
      <Card title="日付" icon={CalendarDays}>
        {dates.status === 'loading' && <Loading>日付を読み込んでいます</Loading>}
        {dates.status === 'error' && <ErrorMessage onRetry={onReloadDates}>{dates.error.message}</ErrorMessage>}
        {dates.status === 'success' &&
          (dates.data.length === 0 ? (
            <p className="text-sm text-fg-muted">今日以降のメニューはまだ登録されていません。</p>
          ) : (
            <>
              <label htmlFor={dateId} className="sr-only">
                日付
              </label>
              <select
                id={dateId}
                value={date ?? ''}
                onChange={(e) => onDateChange(e.target.value)}
                className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3"
              >
                {dates.data.map((d) => (
                  <option key={d} value={d}>
                    {formatDateLabel(d)}
                    {d === today ? '（今日）' : ''}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-fg-muted">メニューが登録されている日だけを表示しています。</p>
            </>
          ))}
      </Card>

      <Card title="栄養目標" icon={Target}>
        <ul className="divide-y divide-border">
          {TARGET_FIELDS.map((field) => {
            const target = settings.targets[field.key];
            const inputId = `target-${field.short}`;
            return (
              <li key={field.key} className="flex items-center gap-3 py-1.5">
                <Switch
                  checked={target.enabled}
                  onChange={(enabled) => setTarget(field.key, { enabled })}
                  label={`${field.label}を目標にする`}
                  hideLabel
                />
                <label htmlFor={inputId} className={`flex-1 text-sm ${target.enabled ? '' : 'text-fg-muted'}`}>
                  <span className="mr-1.5 inline-block w-4 font-semibold text-fg-muted">{field.short}</span>
                  {field.label}
                </label>
                <div className="flex items-center gap-1.5">
                  <NumberField
                    id={inputId}
                    value={target.value}
                    onCommit={(value) => setTarget(field.key, { value, enabled: true })}
                    className={`w-24 text-right ${target.enabled ? '' : 'text-fg-muted'}`}
                  />
                  <span className="w-8 text-xs text-fg-muted">{field.unit}</span>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-fg-muted">
          エネルギーは多すぎ・少なすぎの両方を、たんぱく質と野菜は不足を、脂質と炭水化物は超過を避けるように選びます。
        </p>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <label htmlFor={maxId} className="flex-1 text-sm">
            追加するメニューの上限
            <span className="block text-xs text-fg-muted">固定したメニューは数えません</span>
          </label>
          <div className="flex items-center rounded-lg border border-border-strong">
            <button
              type="button"
              aria-label="1品減らす"
              onClick={() => setMax(settings.maxAdditional - 1)}
              disabled={settings.maxAdditional <= MAX_ADDITIONAL_RANGE.min}
              className="grid size-11 place-items-center text-fg-muted hover:text-fg disabled:opacity-40"
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
            <NumberField
              id={maxId}
              value={settings.maxAdditional}
              onCommit={setMax}
              isValid={(v) => Number.isInteger(v) && v >= MAX_ADDITIONAL_RANGE.min && v <= MAX_ADDITIONAL_RANGE.max}
              inputMode="numeric"
              className="w-12 rounded-none border-0 border-x text-center"
            />
            <button
              type="button"
              aria-label="1品増やす"
              onClick={() => setMax(settings.maxAdditional + 1)}
              disabled={settings.maxAdditional >= MAX_ADDITIONAL_RANGE.max}
              className="grid size-11 place-items-center text-fg-muted hover:text-fg disabled:opacity-40"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </Card>

      <Button variant="primary" icon={ArrowRight} onClick={onNext} className="w-full">
        メニューを選ぶ
      </Button>
    </div>
  );
}
