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

-- ═══════════ WRITING (AI tekshiruv) + FAOLLIK VAQTI ═══════════
create table if not exists writing_tasks (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('task1','task2','multilevel')),
  title      text not null,
  prompt     text not null default '',
  image_url  text not null default '',
  min_words  int  not null default 150,
  published  boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists writing_submissions (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid references writing_tasks(id) on delete set null,
  task_title   text not null,
  kind         text not null,
  student_name text not null,
  group_code   text not null,
  body         text not null,
  words        int  not null default 0,
  band         text not null default '',
  feedback     jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists wsub_student_idx on writing_submissions(group_code, student_name);

create table if not exists activity (
  student_name text not null,
  group_code   text not null,
  day          date not null,
  seconds      int  not null default 0,
  primary key (group_code, student_name, day)
);

alter table writing_tasks add column if not exists max_words int not null default 0;

alter table writing_tasks       enable row level security;
alter table writing_submissions enable row level security;
alter table activity            enable row level security;

drop policy if exists wtasks_read on writing_tasks;
create policy wtasks_read on writing_tasks for select using (published or auth.role() = 'authenticated');
drop policy if exists wtasks_write on writing_tasks;
create policy wtasks_write on writing_tasks for all to authenticated using (true) with check (true);

-- Insho matnlari shaxsiy: o'quvchi faqat o'zinikini (my_writings orqali), o'qituvchi hammasini ko'radi
drop policy if exists wsub_insert on writing_submissions;
create policy wsub_insert on writing_submissions for insert to anon, authenticated
  with check (check_group(group_code) is not null and length(body) <= 20000);
drop policy if exists wsub_read on writing_submissions;
create policy wsub_read on writing_submissions for select to authenticated using (true);
drop policy if exists wsub_delete on writing_submissions;
create policy wsub_delete on writing_submissions for delete to authenticated using (true);

create or replace function my_writings(n text, g text) returns setof writing_submissions
language sql security definer set search_path = public stable as $$
  select * from writing_submissions
  where lower(student_name) = lower(trim(n)) and upper(group_code) = upper(trim(g))
  order by created_at desc limit 100
$$;
grant execute on function my_writings(text, text) to anon, authenticated;

-- Faollik: o'quvchi va guruh kodi bo'yicha kunlik soniyalar (har chaqiruvda eng ko'pi 120 s)
create or replace function add_activity(n text, g text, secs int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if check_group(g) is null then return; end if;
  insert into activity(student_name, group_code, day, seconds)
  values (trim(n), upper(trim(g)), current_date, least(greatest(secs,0),120))
  on conflict (group_code, student_name, day)
  do update set seconds = activity.seconds + least(greatest(secs,0),120);
end $$;
grant execute on function add_activity(text, text, int) to anon, authenticated;

drop policy if exists activity_read on activity;
create policy activity_read on activity for select using (true);

-- ═══════════ VOCABULARY MARATHON ═══════════
create table if not exists vocab_sets (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  topics      text not null default '',
  mc_count    int  not null default 25,
  open_count  int  not null default 15,
  seconds     int  not null default 480,
  published   boolean not null default true,
  words       jsonb not null,
  created_at  timestamptz not null default now()
);
create table if not exists vocab_results (
  id           uuid primary key default gen_random_uuid(),
  set_id       uuid references vocab_sets(id) on delete set null,
  set_title    text not null,
  student_name text not null,
  group_code   text not null,
  mc           int not null,
  open         int not null,
  score        int not null,
  total        int not null,
  percent      numeric not null,
  time_sec     int,
  created_at   timestamptz not null default now()
);
create index if not exists vocab_results_set_idx on vocab_results(set_id);
alter table vocab_sets    enable row level security;
alter table vocab_results enable row level security;
drop policy if exists vsets_read on vocab_sets;
create policy vsets_read on vocab_sets for select using (published or auth.role() = 'authenticated');
drop policy if exists vsets_write on vocab_sets;
create policy vsets_write on vocab_sets for all to authenticated using (true) with check (true);
drop policy if exists vres_read on vocab_results;
create policy vres_read on vocab_results for select using (true);
drop policy if exists vres_insert on vocab_results;
create policy vres_insert on vocab_results for insert to anon, authenticated
  with check (check_group(group_code) is not null and percent between 0 and 100);
drop policy if exists vres_delete on vocab_results;
create policy vres_delete on vocab_results for delete to authenticated using (true);
