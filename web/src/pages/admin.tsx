import { useEffect, useId, useMemo, useState } from 'react';
import { CalendarDays, CircleCheck, History, Save, ShieldAlert, Star, UserCog, Utensils } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { AppShell } from '../components/AppShell.tsx';
import { AccountBar, LoginCard } from '../components/Login.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { MenuNutritionLine, NutritionSummary } from '../components/Nutrition.tsx';
import { Badge, Button, Card, ErrorMessage, Loading } from '../components/ui.tsx';
import { useAsync } from '../hooks/useAsync.ts';
import { useSession } from '../hooks/useSession.ts';
import * as adminApi from '../lib/adminApi.ts';
import { fetchMenus } from '../lib/api.ts';
import { isAdminUser } from '../lib/auth.ts';
import { formatDateLabel, todayInTokyo, type ISODate } from '../lib/date.ts';
import { DEFAULT_RATING, RATINGS, buildMealRecord, selectionFromRecord } from '../lib/mealRecord.ts';
import { sumNutrition } from '../lib/nutrition.ts';
import { renderPage } from '../lib/render.tsx';

function AdminPage() {
  const session = useSession();
  return (
    <AppShell current="admin">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold tracking-tight">
        <UserCog className="size-5 text-fg-muted" aria-hidden="true" />
        食事記録
      </h1>
      <p className="mb-4 text-sm text-fg-muted">実際に食べたメニューを記録します。記録は AI 推奨の学習に使われます。</p>
      {session.status === 'loading' && <Loading>読み込んでいます</Loading>}
      {session.status === 'signedOut' && (
        <LoginCard title="管理者のログイン" createUser={false} description="管理者のメールアドレスを入力すると、ログイン用のリンクが届きます。" />
      )}
      {session.status === 'signedIn' &&
        (isAdminUser(session.session.user) ? (
          <MealRecorder session={session.session} />
        ) : (
          <>
            <AccountBar email={session.session.user.email} />
            <ErrorMessage>
              <span className="inline-flex items-center gap-1.5">
                <ShieldAlert className="size-4" aria-hidden="true" />
                このアカウントには管理者の権限がありません。
              </span>
            </ErrorMessage>
          </>
        ))}
    </AppShell>
  );
}

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string };

function MealRecorder({ session }: { session: Session }) {
  const dateId = useId();
  const [date, setDate] = useState<ISODate>(() => todayInTokyo());
  const [selection, setSelection] = useState<Map<string, number>>(new Map());
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });

  const day = useAsync(async () => {
    const [menus, record] = await Promise.all([fetchMenus(date), adminApi.fetchMealRecord(date)]);
    return { menus, record };
  }, [date]);
  const recent = useAsync(() => adminApi.fetchRecentRecords(), []);

  // 日付を読み込んだら、保存済みの記録があれば選択と評価を戻す
  useEffect(() => {
    if (day.state.status === 'success') setSelection(selectionFromRecord(day.state.data.record));
    setSaveState({ kind: 'idle' });
  }, [day.state]);

  const menus = day.state.status === 'success' ? day.state.data.menus : [];
  const hasRecord = day.state.status === 'success' && selectionFromRecord(day.state.data.record).size > 0;
  const eaten = useMemo(() => menus.filter((m) => selection.has(m.name)), [menus, selection]);

  const toggle = (name: string) =>
    setSelection((current) => {
      const next = new Map(current);
      if (next.has(name)) next.delete(name);
      else next.set(name, DEFAULT_RATING);
      return next;
    });
  const rate = (name: string, rating: number) => setSelection((current) => new Map(current).set(name, rating));

  const save = async () => {
    setSaveState({ kind: 'saving' });
    try {
      await adminApi.saveMealRecord(buildMealRecord(date, menus, selection));
      setSaveState({ kind: 'saved' });
      recent.reload();
    } catch (e) {
      setSaveState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="space-y-4 pb-36">
      <AccountBar email={session.user.email} />

      <Card title="日付" icon={CalendarDays}>
        <label htmlFor={dateId} className="sr-only">
          日付
        </label>
        <input
          id={dateId}
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3"
        />
        {hasRecord && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-info">
            <CircleCheck className="size-4" aria-hidden="true" />
            この日の記録があります。保存した内容を表示しています。
          </p>
        )}
      </Card>

      {day.state.status === 'loading' && <Loading>メニューを読み込んでいます</Loading>}
      {day.state.status === 'error' && <ErrorMessage onRetry={day.reload}>{day.state.error.message}</ErrorMessage>}
      {day.state.status === 'success' &&
        (menus.length === 0 ? (
          <EmptyState icon={Utensils} title={`${formatDateLabel(date)} のメニューはありません`} />
        ) : (
          <Card title={`${formatDateLabel(date)} のメニュー`} icon={Utensils}>
            <p className="mb-3 text-xs text-fg-muted">食べたメニューを押して選び、必要なら星で評価します（初期値は 3）。</p>
            <ul className="space-y-2">
              {menus.map((menu) => {
                const rating = selection.get(menu.name);
                const selected = rating !== undefined;
                return (
                  <li key={menu.name} className={`rounded-xl border ${selected ? 'border-accent bg-accent-subtle' : 'border-border bg-surface'}`}>
                    <button type="button" aria-pressed={selected} onClick={() => toggle(menu.name)} className="w-full px-3 py-2.5 text-left">
                      <span className="mb-1 flex items-center gap-1.5">
                        <span className="font-medium">{menu.name}</span>
                        {selected && (
                          <Badge tone="accent" icon={CircleCheck}>
                            食べた
                          </Badge>
                        )}
                      </span>
                      <MenuNutritionLine nutrition={menu.nutrition} />
                    </button>
                    {selected && (
                      <div role="group" aria-label={`${menu.name}の評価`} className="flex items-center gap-0.5 border-t border-accent/30 px-2">
                        {RATINGS.map((value) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={value <= rating}
                            aria-label={`評価 ${value}`}
                            onClick={() => rate(menu.name, value)}
                            className="grid size-11 place-items-center text-warning"
                          >
                            <Star className={`size-5 ${value <= rating ? 'fill-current' : 'opacity-40'}`} aria-hidden="true" />
                          </button>
                        ))}
                        <span className="ml-1 text-xs text-fg-muted">{rating} / 5</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}

      <Card title="最近の記録" icon={History}>
        {recent.state.status === 'loading' && <Loading>読み込んでいます</Loading>}
        {recent.state.status === 'error' && <ErrorMessage onRetry={recent.reload}>{recent.state.error.message}</ErrorMessage>}
        {recent.state.status === 'success' &&
          (recent.state.data.length === 0 ? (
            <p className="text-sm text-fg-muted">まだ記録がありません。</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {recent.state.data.map((record) => (
                <li key={record.date} className="py-2">
                  <button type="button" onClick={() => setDate(record.date)} className="w-full text-left hover:text-accent">
                    <span className="mr-2 font-medium tabular-nums">{formatDateLabel(record.date)}</span>
                    <span className="text-fg-muted">
                      {record.selected_menus.length}品: {record.selected_menus.map((m) => m.name).join('、')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </Card>

      {menus.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
          <div className="mx-auto max-w-3xl space-y-2 px-4 py-3">
            <NutritionSummary totals={sumNutrition(eaten)} count={eaten.length} label="食べたメニューの合計" />
            <div className="flex items-center gap-3">
              <Button variant="primary" icon={Save} onClick={save} disabled={eaten.length === 0 || saveState.kind === 'saving'} className="flex-1 sm:flex-none">
                {saveState.kind === 'saving' ? '保存しています…' : '記録を保存'}
              </Button>
              <p aria-live="polite" className="min-w-0 flex-1 text-sm">
                {saveState.kind === 'saved' && <span className="text-success">保存しました。</span>}
                {saveState.kind === 'error' && <span className="text-danger">{saveState.message}</span>}
                {saveState.kind === 'idle' && eaten.length === 0 && <span className="text-fg-muted">食べたメニューを選んでください。</span>}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

renderPage(<AdminPage />);
