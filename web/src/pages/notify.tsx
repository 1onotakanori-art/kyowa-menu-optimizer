import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { AppShell } from '../components/AppShell.tsx';
import { AccountBar, LoginCard } from '../components/Login.tsx';
import { HistoryCard } from '../components/notify/HistoryCard.tsx';
import { ProfileCard } from '../components/notify/ProfileCard.tsx';
import { RuleEditor } from '../components/notify/RuleEditor.tsx';
import { RuleList } from '../components/notify/RuleList.tsx';
import { ErrorMessage, Loading } from '../components/ui.tsx';
import { useAsync } from '../hooks/useAsync.ts';
import { useSession } from '../hooks/useSession.ts';
import { todayInTokyo } from '../lib/date.ts';
import * as api from '../lib/notifyApi.ts';
import type { Rule } from '../lib/notifyPreview.ts';
import { renderPage } from '../lib/render.tsx';

type Message = { text: string; type: 'info' | 'error' };

function NotifyPage() {
  const session = useSession();
  return (
    <AppShell current="notify">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Bell className="size-5 text-fg-muted" aria-hidden="true" />
        メニュー通知
      </h1>
      <p className="mb-4 text-sm text-fg-muted">条件に合うメニューがある日の朝に、メールでお知らせします。</p>
      {session.status === 'loading' && <Loading>読み込んでいます</Loading>}
      {session.status === 'signedOut' && (
        <LoginCard
          title="ログイン / 新規登録"
          createUser
          description="メールアドレスを入力すると、ログイン用のリンクが届きます。初めての方はそのまま登録されます（パスワードはいりません）。"
        />
      )}
      {session.status === 'signedIn' && <NotifySettings key={session.session.user.id} session={session.session} />}
    </AppShell>
  );
}

function NotifySettings({ session }: { session: Session }) {
  const userId = session.user.id;
  const [today] = useState(() => todayInTokyo());
  const [message, setMessage] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);

  const data = useAsync(
    async () => {
      const [profile, rules, menusByDate, deliveries] = await Promise.all([
        api.fetchProfile(userId),
        api.fetchRules(),
        api.fetchPreviewMenus(today),
        api.fetchDeliveries(),
      ]);
      return { profile, rules, menusByDate, deliveries };
    },
    [userId],
  );
  const [rules, setRules] = useState<Rule[]>([]);
  const [profile, setProfile] = useState<api.Profile | null>(null);
  useEffect(() => {
    if (data.state.status === 'success') {
      setRules(data.state.data.rules);
      setProfile(data.state.data.profile);
    }
  }, [data.state]);

  // お知らせは数秒で消す（エラーは消さない）
  useEffect(() => {
    if (message?.type !== 'info') return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  const run = async (action: () => Promise<void>, done?: string) => {
    try {
      await action();
      if (done) setMessage({ text: done, type: 'info' });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), type: 'error' });
    }
  };

  if (data.state.status === 'loading') return <Loading>通知設定を読み込んでいます</Loading>;
  if (data.state.status === 'error') return <ErrorMessage onRetry={data.reload}>{data.state.error.message}</ErrorMessage>;
  const { menusByDate, deliveries } = data.state.data;

  return (
    <div className="space-y-4">
      <AccountBar email={session.user.email} />
      <div aria-live="polite">
        {message && (
          <p className={`rounded-lg p-3 text-sm ${message.type === 'error' ? 'bg-danger-subtle text-danger' : 'bg-success-subtle text-success'}`}>
            {message.text}
          </p>
        )}
      </div>

      {profile && (
        <ProfileCard
          profile={profile}
          onSave={(next) =>
            run(async () => {
              await api.saveProfile(userId, next);
              setProfile(next);
            }, next.email_enabled && next.notify_weekdays.length > 0 ? '通知設定を保存しました。' : '保存しました（通知は届かない設定です）。')
          }
        />
      )}

      {editing ? (
        <RuleEditor
          rule={editing === 'new' ? null : editing}
          menusByDate={menusByDate}
          today={today}
          onCancel={() => setEditing(null)}
          onSave={async (name, conditions) => {
            // 失敗したときは RuleEditor の中にエラーを出すので、ここでは投げ直す
            await api.saveRule(editing === 'new' ? null : editing.id, name, conditions);
            setRules(await api.fetchRules());
            setEditing(null);
            setMessage({ text: 'ルールを保存しました。', type: 'info' });
          }}
        />
      ) : (
        <RuleList
          rules={rules}
          menusByDate={menusByDate}
          today={today}
          onAdd={() => setEditing('new')}
          onEdit={setEditing}
          onToggle={(rule, enabled) =>
            run(async () => {
              await api.setRuleEnabled(rule.id, enabled);
              setRules((list) => list.map((r) => (r.id === rule.id ? { ...r, enabled } : r)));
            })
          }
          onDelete={(rule) => {
            if (!window.confirm(`ルール「${rule.name}」を削除しますか？`)) return;
            void run(async () => {
              await api.deleteRule(rule.id);
              setRules((list) => list.filter((r) => r.id !== rule.id));
            }, 'ルールを削除しました。');
          }}
        />
      )}

      <HistoryCard deliveries={deliveries} />
    </div>
  );
}

renderPage(<NotifyPage />);
