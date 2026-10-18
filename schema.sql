-- ============================================================
--  English with Usmonov — Supabase schema
--  Supabase → SQL Editor → New query → shu faylni to'liq qo'yib "Run" bosing
--  (qayta ishga tushirish xavfsiz)
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists tests (
  id           uuid primary key default gen_random_uuid(),
  section      text not null check (section in ('reading','listening')),
  format       text not null check (format in ('ielts','multilevel')),
  title        text not null,
  duration_min int  not null default 60,
  play_once    boolean not null default false,
  published    boolean not null default true,
  data         jsonb not null,
  created_at   timestamptz not null default now()
);

create table if not exists groups (
  code       text primary key,            -- har doim KATTA harfda saqlanadi
  name       text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists results (
  id           uuid primary key default gen_random_uuid(),
  test_id      uuid references tests(id) on delete set null,
  test_title   text not null,
  section      text not null,
  format       text not null,
  student_name text not null,
  group_code   text not null,
  correct      int  not null,
  total        int  not null,
  percent      numeric not null,
  band         text not null,
  points       numeric,
  time_sec     int,
  details      jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists results_test_idx  on results(test_id);
create index if not exists results_group_idx on results(group_code);

-- Guruh kodini tekshirish (kodlar ro'yxati oshkor bo'lmaydi)
create or replace function check_group(c text) returns text
language sql security definer set search_path = public stable as $$
  select coalesce(nullif(name,''), code) from groups where upper(code) = upper(trim(c)) limit 1
$$;
grant execute on function check_group(text) to anon, authenticated;

alter table tests   enable row level security;
alter table groups  enable row level security;
alter table results enable row level security;

-- Testlar: o'quvchilar faqat e'lon qilinganlarini ko'radi, o'qituvchi hammasini
drop policy if exists tests_read on tests;
create policy tests_read on tests for select using (published or auth.role() = 'authenticated');
drop policy if exists tests_write on tests;
create policy tests_write on tests for all to authenticated using (true) with check (true);

-- Guruhlar: faqat o'qituvchi
drop policy if exists groups_all on groups;
create policy groups_all on groups for all to authenticated using (true) with check (true);

-- Natijalar: hamma ko'ra oladi (leaderboard), faqat to'g'ri guruh kodi bilan yozish mumkin
drop policy if exists results_read on results;
create policy results_read on results for select using (true);
drop policy if exists results_insert on results;
create policy results_insert on results for insert to anon, authenticated
  with check (check_group(group_code) is not null and percent between 0 and 100);
drop policy if exists results_delete on results;
create policy results_delete on results for delete to authenticated using (true);

-- Audio / rasm fayllari uchun ochiq bucket
insert into storage.buckets (id, name, public) values ('audio','audio', true) on conflict do nothing;
drop policy if exists "audio public read" on storage.objects;
create policy "audio public read" on storage.objects for select using (bucket_id = 'audio');
drop policy if exists "audio teacher write" on storage.objects;
create policy "audio teacher write" on storage.objects for insert to authenticated with check (bucket_id = 'audio');
drop policy if exists "audio teacher del" on storage.objects;
create policy "audio teacher del" on storage.objects for delete to authenticated using (bucket_id = 'audio');
