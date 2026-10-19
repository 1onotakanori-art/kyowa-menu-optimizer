import { useState } from 'react';
import { BellOff, CircleCheck, MailX } from 'lucide-react';
import { AppShell } from '../components/AppShell.tsx';
import { Button, Card, ErrorMessage } from '../components/ui.tsx';
import { renderPage } from '../lib/render.tsx';
import { SUPABASE_URL } from '../lib/supabase.ts';

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/unsubscribe`;

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done' } | { kind: 'error'; message: string };

/** メールのリンク（unsubscribe.html?token=…）から開くページ。押すまでは停止しない */
function UnsubscribePage() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token'));
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const unsubscribe = async () => {
    if (!token) return;
    setStatus({ kind: 'sending' });
    try {
      const res = await fetch(`${FUNCTION_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' });
      const body = (await res.json()) as { ok: boolean; error?: string };
      setStatus(body.ok ? { kind: 'done' } : { kind: 'error', message: body.error ?? '停止できませんでした。' });
    } catch {
      setStatus({ kind: 'error', message: '通信に失敗しました。時間をおいてもう一度お試しください。' });
    }
  };

  return (
    <AppShell current="unsubscribe">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold tracking-tight">
        <MailX className="size-5 text-fg-muted" aria-hidden="true" />
        通知メールの停止
      </h1>
      <Card>
        <div aria-live="polite">
          {!token ? (
            <ErrorMessage>リンクが正しくありません。メールに書かれているリンクから開いてください。</ErrorMessage>
          ) : status.kind === 'done' ? (
            <p className="flex items-center gap-2 font-medium text-success">
              <CircleCheck className="size-5" aria-hidden="true" />
              通知メールを停止しました。
            </p>
          ) : (
            <>
              <p className="mb-4 text-sm">朝の通知メールを停止します。よろしければ下のボタンを押してください。</p>
              {status.kind === 'error' && (
                <div className="mb-4">
                  <ErrorMessage>{status.message}</ErrorMessage>
                </div>
              )}
              <Button variant="primary" icon={BellOff} onClick={unsubscribe} disabled={status.kind === 'sending'} className="w-full sm:w-auto">
                {status.kind === 'sending' ? '停止しています…' : '通知メールを停止する'}
              </Button>
            </>
          )}
        </div>
        <p className="mt-4 border-t border-border pt-4 text-sm text-fg-muted">
          通知を再開したいときや、条件だけ変えたいときは
          <a href="/notify" className="mx-1 text-accent underline underline-offset-2">
            メニュー通知
          </a>
          のページから変更できます。
        </p>
      </Card>
    </AppShell>
  );
}

renderPage(<UnsubscribePage />);
