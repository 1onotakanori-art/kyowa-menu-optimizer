-- 毎朝 7:00 JST（= 22:00 UTC）に通知メール送信の Edge Function を呼び出す
-- 毎日実行し、メニューがない日（土日・祝日など）は Edge Function 側で送信せずに終了する。
-- 合言葉は Vault の notify_cron_secret（20261017120000_notification_cron_support.sql 参照）。

select cron.schedule(
  'send-daily-digest',
  '0 22 * * *',
  $$
  select net.http_post(
    url := 'https://zzleqjendqkoizbdvblw.supabase.co/functions/v1/send-daily-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
