/**
 * ログイン（Supabase Auth のメールリンク）まわりの、画面に依存しない処理
 */

/**
 * メールのリンクの期限切れなどは、戻ってきた URL のハッシュに error_description が付く。
 * 表示用の文言を返す（エラーがなければ null）
 */
export function readAuthError(hash: string): string | null {
  const description = new URLSearchParams(hash.replace(/^#/, '')).get('error_description');
  return description ? `ログインに失敗しました: ${description}（もう一度リンクを送ってください）` : null;
}

/** app_metadata.role が admin のユーザーだけが管理画面を使える（DB の RLS も同じ条件） */
export function isAdminUser(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  return user?.app_metadata?.role === 'admin';
}
