import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { LogIn, LogOut, MailCheck, UserRound } from 'lucide-react';
import { readAuthError } from '../lib/auth.ts';
import { sendLoginLink, signOut } from '../hooks/useSession.ts';
import { Button, Card } from './ui.tsx';

interface LoginCardProps {
  title: string;
  description: ReactNode;
  /** 初めてのメールアドレスでもアカウントを作るか（通知は作る、管理画面は作らない） */
  createUser: boolean;
}

/** メールのリンクでログインするカード */
export function LoginCard({ title, description, createUser }: LoginCardProps) {
  const emailId = useId();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => readAuthError(window.location.hash));

  // エラーを読んだら URL のハッシュは消す（再読み込みで同じエラーを出さない）
  useEffect(() => {
    if (readAuthError(window.location.hash)) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;
    setSending(true);
    setError(null);
    try {
      await sendLoginLink(address, { createUser });
      setSentTo(address);
    } catch (e) {
      setError(`メールを送信できませんでした: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card title={title} icon={LogIn}>
      <p className="mb-4 text-sm text-fg-muted">{description}</p>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor={emailId} className="mb-1 block text-sm font-medium">
            メールアドレス
          </label>
          <input
            id={emailId}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3"
          />
        </div>
        <Button type="submit" variant="primary" icon={LogIn} disabled={sending} className="w-full">
          {sending ? '送信中…' : 'ログイン用のリンクを送る'}
        </Button>
      </form>
      <div aria-live="polite">
        {sentTo && (
          <p className="mt-4 flex gap-2 rounded-lg bg-success-subtle p-3 text-sm text-success">
            <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {sentTo} にログイン用のメールを送りました。メールのリンクを開いてください（届かないときは迷惑メールのフォルダも確認してください）。
            </span>
          </p>
        )}
        {error && <p className="mt-4 rounded-lg bg-danger-subtle p-3 text-sm text-danger">{error}</p>}
      </div>
    </Card>
  );
}

/** ログイン中のアカウントとログアウトのボタン */
export function AccountBar({ email }: { email: string | undefined }) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1">
      <UserRound className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
      <span className="mr-auto truncate text-sm" title={email}>
        {email}
      </span>
      <Button variant="ghost" icon={LogOut} onClick={() => void signOut()}>
        ログアウト
      </Button>
    </div>
  );
}
