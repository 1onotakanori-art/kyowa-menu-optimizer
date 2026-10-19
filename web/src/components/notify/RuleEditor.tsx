import { useId, useMemo, useState, type FormEvent } from 'react';
import { Eye, Save, SlidersHorizontal, X } from 'lucide-react';
import {
  ALLERGEN_FIELDS,
  NUTRITION_FIELDS,
  NUTRITION_UNITS,
  describeConditions,
  validateConditions,
} from '../../../../supabase/functions/_shared/matchRules.js';
import { formatDateLabel, type ISODate } from '../../lib/date.ts';
import { buildPreview, menuNameOptions, type Conditions, type MenusByDate, type Rule } from '../../lib/notifyPreview.ts';
import { conditionsToForm, emptyForm, formToConditions } from '../../lib/ruleForm.js';
import { Button, Card } from '../ui.tsx';

/** ruleForm.js のフォームの形 */
interface RuleForm {
  nameMode: string;
  nameText: string;
  excludeText: string;
  nutrition: Record<string, { min: string; max: string }>;
  allergens: string[];
}
type NameMode = 'none' | 'equals' | 'contains';

const NAME_PLACEHOLDER: Record<NameMode, string> = {
  none: '',
  equals: '例: モチコチキン（候補から選べます）',
  contains: '例: カレー 唐揚げ',
};

interface RuleEditorProps {
  rule: Rule | null;
  menusByDate: MenusByDate;
  today: ISODate;
  onCancel: () => void;
  onSave: (name: string, conditions: Conditions) => Promise<void>;
}

export function RuleEditor({ rule, menusByDate, today, onCancel, onSave }: RuleEditorProps) {
  const ids = { name: useId(), mode: useId(), text: useId(), exclude: useId(), list: useId() };
  const [name, setName] = useState(rule?.name ?? '');
  const [form, setForm] = useState<RuleForm>(() => (rule ? conditionsToForm(rule.conditions) : emptyForm()) as RuleForm);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const conditions = useMemo(() => formToConditions(form) as Conditions, [form]);
  const validation = validateConditions(conditions);
  const preview = useMemo(
    () => (conditions.all.length > 0 && validation.ok ? buildPreview(menusByDate, conditions, today) : null),
    [conditions, validation.ok, menusByDate, today],
  );
  const nameOptions = useMemo(() => menuNameOptions(menusByDate), [menusByDate]);

  const update = (patch: Partial<RuleForm>) => setForm((f) => ({ ...f, ...patch }));
  const setBound = (field: string, bound: 'min' | 'max', value: string) =>
    setForm((f) => ({ ...f, nutrition: { ...f.nutrition, [field]: { ...f.nutrition[field], [bound]: value } } }));
  const toggleAllergen = (allergen: string) =>
    setForm((f) => ({
      ...f,
      allergens: f.allergens.includes(allergen) ? f.allergens.filter((a: string) => a !== allergen) : [...f.allergens, allergen],
    }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setSubmitError('ルール名を入力してください。');
    if (!validation.ok) return setSubmitError(validation.errors.join(' / '));
    setSaving(true);
    setSubmitError(null);
    try {
      await onSave(name.trim(), conditions);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const mode = form.nameMode as NameMode;
  const inputClass = 'h-11 w-full rounded-lg border border-border-strong bg-surface px-3 disabled:opacity-50';

  return (
    <Card title={rule ? 'ルールを編集' : 'ルールを追加'} icon={SlidersHorizontal}>
      <form onSubmit={submit} noValidate className="space-y-5">
        <div>
          <label htmlFor={ids.name} className="mb-1 block text-sm font-medium">
            ルール名
          </label>
          <input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="例: カレーの日" className={inputClass} />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">メニュー名</legend>
          <p className="text-xs text-fg-muted">特定のメニュー、またはキーワードを含むメニューに絞ります。表記ゆれ（ｶﾀｶﾅ / ひらがな など）は区別しません。</p>
          <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
            <label htmlFor={ids.mode} className="sr-only">
              メニュー名の指定方法
            </label>
            <select id={ids.mode} value={mode} onChange={(e) => update({ nameMode: e.target.value as NameMode })} className={inputClass}>
              <option value="none">指定しない</option>
              <option value="equals">メニュー名が一致</option>
              <option value="contains">キーワードを含む</option>
            </select>
            <label htmlFor={ids.text} className="sr-only">
              {mode === 'equals' ? 'メニュー名' : 'キーワード'}
            </label>
            <input
              id={ids.text}
              value={form.nameText}
              onChange={(e) => update({ nameText: e.target.value })}
              disabled={mode === 'none'}
              placeholder={NAME_PLACEHOLDER[mode]}
              list={mode === 'equals' ? ids.list : undefined}
              className={inputClass}
            />
            <datalist id={ids.list}>
              {nameOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor={ids.exclude} className="mb-1 block text-sm">
              含まないキーワード（任意）
            </label>
            <input id={ids.exclude} value={form.excludeText} onChange={(e) => update({ excludeText: e.target.value })} placeholder="例: ミニ 小" className={inputClass} />
            <p className="mt-1 text-xs text-fg-muted">複数のときは空白かカンマで区切ります。どれかを含むメニューは外します。</p>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold">栄養値（任意）</legend>
          <p className="mb-2 text-xs text-fg-muted">入力した欄だけが条件になります（以上・以下は境界を含みます）。</p>
          <div className="space-y-1.5">
            {NUTRITION_FIELDS.map((field: string) => (
              <div key={field} className="grid grid-cols-[6.5rem_1fr_auto_1fr_2.5rem] items-center gap-1.5 text-sm">
                <span>{field}</span>
                <input
                  inputMode="decimal"
                  value={form.nutrition[field].min}
                  onChange={(e) => setBound(field, 'min', e.target.value)}
                  placeholder="下限"
                  aria-label={`${field}の下限`}
                  className={`${inputClass} text-right tabular-nums`}
                />
                <span aria-hidden="true" className="text-fg-muted">
                  〜
                </span>
                <input
                  inputMode="decimal"
                  value={form.nutrition[field].max}
                  onChange={(e) => setBound(field, 'max', e.target.value)}
                  placeholder="上限"
                  aria-label={`${field}の上限`}
                  className={`${inputClass} text-right tabular-nums`}
                />
                <span className="text-xs text-fg-muted">{NUTRITION_UNITS[field as keyof typeof NUTRITION_UNITS]}</span>
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold">アレルゲン（任意）</legend>
          <p className="mb-2 text-xs text-fg-muted">選んだ食材を使っていないメニューだけに絞ります。</p>
          <div className="flex flex-wrap gap-1.5">
            {ALLERGEN_FIELDS.map((allergen: string) => {
              const on = form.allergens.includes(allergen);
              return (
                <button
                  key={allergen}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleAllergen(allergen)}
                  className={`min-h-11 rounded-lg border px-3 text-sm transition-colors ${
                    on ? 'border-accent bg-accent-subtle font-medium text-accent' : 'border-border-strong bg-surface text-fg-muted hover:text-fg'
                  }`}
                >
                  {allergen}
                </button>
              );
            })}
          </div>
        </fieldset>

        <section aria-live="polite" className="rounded-xl bg-surface-muted p-3 text-sm">
          <h4 className="mb-2 flex items-center gap-1.5 font-semibold">
            <Eye className="size-4 text-fg-muted" aria-hidden="true" />
            プレビュー
          </h4>
          {conditions.all.length === 0 ? (
            <p className="text-fg-muted">条件を入力すると、直近のメニューで該当するものがここに出ます。</p>
          ) : !validation.ok ? (
            <ul className="space-y-0.5 text-danger">
              {validation.errors.map((error: string) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : (
            <>
              <p className="mb-2">{describeConditions(conditions).join(' ／ ')}</p>
              {preview && preview.upcoming.length > 0 ? (
                <ul className="space-y-1">
                  {preview.upcoming.map(({ date, names }) => (
                    <li key={date}>
                      <span className="font-medium tabular-nums">
                        {date === today ? '今日 ' : ''}
                        {formatDateLabel(date)}
                      </span>
                      ：{names.join('、')}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-fg-muted">今後のメニュー（取得済みの範囲）には該当がありません。</p>
              )}
              {preview && (
                <p className="mt-2 text-xs text-fg-muted">
                  参考: 過去 {preview.pastDays} 営業日のうち {preview.pastHitDays} 日が該当
                </p>
              )}
            </>
          )}
        </section>

        {submitError && (
          <p role="alert" className="rounded-lg bg-danger-subtle p-3 text-sm text-danger">
            {submitError}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button icon={X} onClick={onCancel}>
            キャンセル
          </Button>
          <Button type="submit" variant="primary" icon={Save} disabled={saving}>
            {saving ? '保存しています…' : '保存'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
