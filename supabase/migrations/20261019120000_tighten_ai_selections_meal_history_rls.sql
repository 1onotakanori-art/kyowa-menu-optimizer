-- ai_selections / meal_history の RLS 見直し
--   これまで anon キー（公開済み）で誰でも書き込み・削除できた状態をやめる。
--
--   ai_selections : 参照は誰でも（トップページが表示に使う）。書き込みは service_role のみ
--                   （ml/ の Python スクリプトが SUPABASE_SERVICE_KEY で書く。RLS はバイパスされる）
--   meal_history  : 個人の食事記録なので参照も書き込みも管理者のみ
--                   （admin.html で Supabase Auth にログインし、app_metadata.role = 'admin' のユーザー）
--                   ML の学習データ読み込みは service_role で行う
--
-- 管理者の指定（このマイグレーションでは行わない。メールアドレスをリポジトリに書かないため）:
--   update auth.users
--      set raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'
--    where email = '<管理者のメールアドレス>';
--   app_metadata は本人が書き換えられない。反映はトークン更新後（再ログインで確実）。
--
-- 計画と適用手順: docs/RLS_REVIEW.md

-- ---------------------------------------------------------------------------
-- 管理者判定
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- ai_selections
-- ---------------------------------------------------------------------------
drop policy if exists "Allow anonymous insert/update" on public.ai_selections;
drop policy if exists "Allow anonymous read access" on public.ai_selections;

create policy "ai_selections: 誰でも参照"
  on public.ai_selections for select to anon, authenticated
  using (true);

revoke all on public.ai_selections from anon, authenticated;
grant select on public.ai_selections to anon, authenticated;

-- ---------------------------------------------------------------------------
-- meal_history
--   本番 DB のポリシー名は docs/MEAL_HISTORY_TABLE.sql と異なっていたため、両方の名前を消す
-- ---------------------------------------------------------------------------
drop policy if exists "Allow anonymous insert/update" on public.meal_history;
drop policy if exists "Allow anonymous read access" on public.meal_history;
drop policy if exists "public read meal_history" on public.meal_history;
drop policy if exists "public write meal_history" on public.meal_history;
drop policy if exists "public update meal_history" on public.meal_history;
drop policy if exists "service_role full access on meal_history" on public.meal_history;

create policy "meal_history: 管理者のみ参照"
  on public.meal_history for select to authenticated
  using ((select public.is_admin()));

create policy "meal_history: 管理者のみ追加"
  on public.meal_history for insert to authenticated
  with check ((select public.is_admin()));

create policy "meal_history: 管理者のみ更新"
  on public.meal_history for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- admin.js は upsert（INSERT ... ON CONFLICT DO UPDATE）だけを使う。削除は許可しない。
revoke all on public.meal_history from anon, authenticated;
grant select, insert, update on public.meal_history to authenticated;

-- ---------------------------------------------------------------------------
-- 更新時刻トリガー関数の search_path 固定（Security Advisor の指摘）
-- ---------------------------------------------------------------------------
alter function public.update_ai_selections_updated_at() set search_path = '';
alter function public.update_updated_at() set search_path = '';
