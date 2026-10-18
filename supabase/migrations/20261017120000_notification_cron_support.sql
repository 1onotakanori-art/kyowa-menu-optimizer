-- 朝の通知メール送信（Edge Function send-daily-digest）の定時実行に必要な準備
--
-- 合言葉（cron → Edge Function の認証用）は Vault に保存し、リポジトリには置かない。
-- 初回のみ SQL Editor などで次を実行して作成する（値はランダムに生成され、どこにも表示されない）:
--   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'notify_cron_secret',
--                              'cron から send-daily-digest を呼ぶときの合言葉');

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Edge Function が受け取った合言葉を Vault の値と照合する（service_role のみ実行可）
create or replace function public.verify_notify_cron_secret(secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'notify_cron_secret'
      -- vault.decrypted_secrets にも secret 列（暗号化された値）があるため、引数は関数名で修飾する
      and decrypted_secret = verify_notify_cron_secret.secret
  );
$$;

revoke execute on function public.verify_notify_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_notify_cron_secret(text) to service_role;
