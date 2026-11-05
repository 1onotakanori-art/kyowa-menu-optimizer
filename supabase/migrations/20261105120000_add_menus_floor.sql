-- menus に販売フロア（floor）を追加する
--   共和食堂のサイトで「2Fにて販売いたします」と書かれたメニューは 2F でのみ販売される。
--   表記がないメニューが必ず 1F とは限らないので、値は '2F' か null（表記なし）の2通りだけ。
--   同じメニューでも日によって 2F になることがあるため、日付ごとの行（date, menu_name）に持たせる。
--
--   既存の行は null のまま。次回のスクレイプ（npm run weekly:prepare）で取り直した日から埋まる。
--   適用順: このマイグレーション → スクレイパー / Web / Edge Function のデプロイ
--   （先にアプリを出すと、存在しない列を select してメニューが読めなくなる）

alter table public.menus
  add column if not exists floor text;

alter table public.menus
  drop constraint if exists menus_floor_check;

alter table public.menus
  add constraint menus_floor_check check (floor is null or floor = '2F');

comment on column public.menus.floor is
  '販売フロア。''2F'' = 2F でのみ販売（サイトの「2Fにて販売いたします」表記）、null = 表記なし（1F とは限らない）';
