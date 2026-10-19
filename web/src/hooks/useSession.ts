import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.ts';

export type SessionState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; session: Session };

/** ログイン状態。メールのリンクから戻ってきたときのログインも、ここで受け取る */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    // INITIAL_SESSION を含め、ログイン状態の変化はすべてここで受ける
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // コールバックの中で Supabase を await するとデッドロックするため、状態の更新だけを後回しにする
      setTimeout(() => setState(session ? { status: 'signedIn', session } : { status: 'signedOut' }), 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return state;
}

/** メールのリンクを送る。戻り先は今のページ */
export async function sendLoginLink(email: string, { createUser }: { createUser: boolean }) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname, shouldCreateUser: createUser },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}
