-- メニュー通知メール機能のテーブル
--   profiles                : ユーザーごとの通知設定（auth.users 作成時に自動作成）
--   notification_rules      : 通知条件（1ユーザー複数、ルール同士は OR）
--   notification_deliveries : 送信履歴（同じ日に二重送信しないための台帳）
-- 計画: docs/EMAIL_NOTIFICATION_PLAN.md

-- ---------------------------------------------------------------------------
-- 共通: updated_at 自動更新
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  display_name      text check (char_length(display_name) <= 50),
  email_enabled     boolean not null default true,
  -- ISO 曜日（1=月 … 7=日）
  notify_weekdays   smallint[] not null default '{1,2,3,4,5}'
                    check (notify_weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]),
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles: 本人のみ参照"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "profiles: 本人のみ更新"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 作成はトリガー、削除は auth.users の cascade のみ。
-- unsubscribe_token や user_id をクライアントから書き換えられないよう列単位で許可する。
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, email_enabled, notify_weekdays) on public.profiles to authenticated;

-- 新規ユーザー登録時に profiles を自動作成
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 既存ユーザー（SMTP テストで招待したユーザーなど）の profiles を作成
insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- notification_rules
-- ---------------------------------------------------------------------------
create table public.notification_rules (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 50),
  enabled     boolean not null default true,
  -- 条件DSL: { "all": [ { "field": ..., "op": ..., "value": ... }, ... ] }
  -- 中身の詳細な検証は supabase/functions/_shared/matchRules.js の validateConditions で行う
  conditions  jsonb not null check (
    jsonb_typeof(conditions) = 'object'
    and jsonb_typeof(conditions -> 'all') = 'array'
    and jsonb_array_length(conditions -> 'all') between 1 and 10
  ),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index notification_rules_user_id_idx on public.notification_rules (user_id);

create trigger notification_rules_set_updated_at
  before update on public.notification_rules
  for each row execute function public.set_updated_at();

-- 1ユーザーあたりのルール数上限
create or replace function public.enforce_notification_rules_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.notification_rules where user_id = new.user_id) >= 20 then
    raise exception '通知ルールは1ユーザーあたり20件までです';
  end if;
  return new;
end;
$$;

create trigger notification_rules_limit
  before insert on public.notification_rules
  for each row execute function public.enforce_notification_rules_limit();

alter table public.notification_rules enable row level security;

create policy "notification_rules: 本人のみ参照"
  on public.notification_rules for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "notification_rules: 本人のみ作成"
  on public.notification_rules for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "notification_rules: 本人のみ更新"
  on public.notification_rules for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "notification_rules: 本人のみ削除"
  on public.notification_rules for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.notification_rules from anon, authenticated;
grant select, insert, delete on public.notification_rules to authenticated;
grant update (name, enabled, conditions) on public.notification_rules to authenticated;

-- ---------------------------------------------------------------------------
-- notification_deliveries
-- ---------------------------------------------------------------------------
create table public.notification_deliveries (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  menu_date    date not null,
  status       text not null check (status in ('pending', 'sent', 'skipped', 'failed')),
  matched      jsonb,
  provider_id  text,
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, menu_date)
);

create index notification_deliveries_menu_date_idx on public.notification_deliveries (menu_date);

create trigger notification_deliveries_set_updated_at
  before update on public.notification_deliveries
  for each row execute function public.set_updated_at();

alter table public.notification_deliveries enable row level security;

-- 本人は履歴の参照のみ。書き込みは Edge Function（service_role、RLS をバイパス）だけ。
create policy "notification_deliveries: 本人のみ参照"
  on public.notification_deliveries for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.notification_deliveries from anon, authenticated;
grant select on public.notification_deliveries to authenticated;
