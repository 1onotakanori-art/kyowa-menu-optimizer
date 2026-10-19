import { createClient } from '@supabase/supabase-js';

/**
 * Supabase の接続先。anon キーは公開前提の値（読み取りは RLS で制御している）。
 * Vercel の環境変数 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY を設定すると、そちらを優先する。
 */
const DEFAULT_URL = 'https://zzleqjendqkoizbdvblw.supabase.co';
const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6bGVxamVuZHFrb2l6YmR2Ymx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NjA0ODYsImV4cCI6MjA5MDAzNjQ4Nn0.OwuE6oJYLuA9nzEm-lAKq6BNc-J9RWv1ylZ9cH34vY8';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY,
);
