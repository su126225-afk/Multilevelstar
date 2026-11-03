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

alter table vocab_sets add column if not exists code_hash text not null default '';

-- ═══════════ SPEAKING (AI tekshiruv) ═══════════
create table if not exists speaking_tests (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  published  boolean not null default true,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists speaking_submissions (
  id           uuid primary key default gen_random_uuid(),
  test_id      uuid references speaking_tests(id) on delete set null,
  test_title   text not null,
  student_name text not null,
  group_code   text not null,
  total        int  not null default 0,
  level        text not null default '',
  feedback     jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists ssub_student_idx on speaking_submissions(group_code, student_name);
alter table speaking_tests       enable row level security;
alter table speaking_submissions enable row level security;
drop policy if exists stests_read on speaking_tests;
create policy stests_read on speaking_tests for select using (published or auth.role() = 'authenticated');
drop policy if exists stests_write on speaking_tests;
create policy stests_write on speaking_tests for all to authenticated using (true) with check (true);
drop policy if exists ssub_insert on speaking_submissions;
create policy ssub_insert on speaking_submissions for insert to anon, authenticated
  with check (check_group(group_code) is not null);
drop policy if exists ssub_read on speaking_submissions;
create policy ssub_read on speaking_submissions for select to authenticated using (true);
drop policy if exists ssub_delete on speaking_submissions;
create policy ssub_delete on speaking_submissions for delete to authenticated using (true);
create or replace function my_speakings(n text, g text) returns setof speaking_submissions
language sql security definer set search_path = public stable as $$
  select * from speaking_submissions
  where lower(student_name) = lower(trim(n)) and upper(group_code) = upper(trim(g))
  order by created_at desc limit 100
$$;
grant execute on function my_speakings(text, text) to anon, authenticated;
-- ============================================================
--  IELTS Mock natijalari (o'qituvchi uchun) — Supabase → SQL Editor → Run
--  Amaliyot saytingiz ulangan Supabase loyihasida ishga tushiring (qayta ishga tushirish xavfsiz).
-- ============================================================
create table if not exists mock_submissions (
  id           uuid primary key default gen_random_uuid(),
  attempt_id   text not null,
  student_name text not null,
  group_code   text not null default '-',
  section      text not null check (section in ('listening','reading','writing')),
  correct      int,
  total        int,
  band         text,
  details      jsonb,
  text1        text,
  text2        text,
  created_at   timestamptz not null default now(),
  unique (attempt_id, section)
);
create index if not exists mock_sub_created_idx on mock_submissions(created_at desc);
alter table mock_submissions enable row level security;

-- O'quvchi (kirmagan foydalanuvchi) faqat yoza oladi, o'qiy olmaydi. O'qituvchi (admin kirgan) hammasini ko'radi.
drop policy if exists mock_insert on mock_submissions;
create policy mock_insert on mock_submissions for insert to anon, authenticated
  with check (length(student_name) between 1 and 120 and length(attempt_id) between 4 and 60
              and coalesce(length(text1),0) < 20000 and coalesce(length(text2),0) < 20000);
drop policy if exists mock_read on mock_submissions;
create policy mock_read on mock_submissions for select to authenticated using (true);
drop policy if exists mock_delete on mock_submissions;
create policy mock_delete on mock_submissions for delete to authenticated using (true);

alter table mock_submissions add column if not exists test_no int not null default 1;


-- ═══════════ 35 KUNLIK MARAFON ═══════════
-- Supabase → SQL Editor → New query → hammasini qo'yib Run. Qayta ishga tushirsa ham xavfsiz (eski ma'lumotga tegmaydi).
-- Kunlar, ochilish va jarima SERVERDA tekshiriladi, shuning uchun brauzer ma'lumotini tozalab qulfni aylanib o'tib bo'lmaydi.

create or replace function mar_today() returns date language sql stable as $$ select (now() at time zone 'Asia/Tashkent')::date $$;

create table if not exists mar_settings (
  id          int primary key default 1 check (id = 1),
  miss_limit  int not null default 2 check (miss_limit between 1 and 10),     -- shuncha kun qoldirsa → qulf
  window_days int not null default 10 check (window_days between 2 and 60)    -- oxirgi shuncha kun ichida
);
insert into mar_settings (id) values (1) on conflict do nothing;

create table if not exists mar_groups (code text primary key);               -- marafon ochiq guruh kodlari
create table if not exists mar_days (day int primary key check (day between 1 and 100), tasks text[] not null);

create table if not exists mar_students (
  id           uuid primary key default gen_random_uuid(),
  student_name text not null,
  group_code   text not null,
  start_day    date not null default mar_today(),
  open_upto    int  not null default 1,        -- shu kungacha (shu kun ham) ochiq
  reset_at     date not null default mar_today(),   -- shu sanagacha qoldirilgan kunlar hisobga olinmaydi
  locked       boolean not null default false,
  lock_reason  text not null default '',
  excused      date[] not null default '{}',   -- o'qituvchi kechirgan sanalar
  created_at   timestamptz not null default now()
);
create unique index if not exists mar_students_uq on mar_students (upper(group_code), lower(student_name));

create table if not exists mar_progress (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references mar_students(id) on delete cascade,
  day        int  not null,
  task       text not null,
  score      numeric,
  total      numeric,
  done_day   date not null default mar_today(),
  done_at    timestamptz not null default now(),
  unique (student_id, day, task)
);
create index if not exists mar_progress_day on mar_progress (student_id, done_day);

alter table mar_settings enable row level security;
alter table mar_groups   enable row level security;
alter table mar_days     enable row level security;
alter table mar_students enable row level security;
alter table mar_progress enable row level security;
do $$ declare t text; begin
  foreach t in array array['mar_settings','mar_groups','mar_days','mar_students','mar_progress'] loop
    execute format('drop policy if exists %I on %I', t || '_all', t);
    execute format('create policy %I on %I for all to authenticated using (true) with check (true)', t || '_all', t);
  end loop;
end $$;


-- Qoldirilgan kunlar (oxirgi window_days kun, kecha gacha; bugun hisoblanmaydi)
create or replace function mar_missed(sid uuid) returns date[]
language plpgsql security definer set search_path = public stable as $$
declare s mar_students; st mar_settings; today date := mar_today(); base date; wstart date; d date; out date[] := '{}'; last_day int;
begin
  select * into s from mar_students where id = sid; if not found then return out; end if;
  select * into st from mar_settings where id = 1;
  select max(day) into last_day from mar_days;
  if last_day is not null and s.open_upto > last_day then return out; end if;      -- marafon tugagan
  base := greatest(s.start_day, s.reset_at) + 1;                                    -- boshlangan/ochilgan kun hisoblanmaydi
  wstart := greatest(base, today - st.window_days);
  for d in select generate_series(wstart::timestamp, (today - 1)::timestamp, interval '1 day')::date loop
    if not (d = any (s.excused)) and not exists (select 1 from mar_progress where student_id = sid and done_day = d) then out := out || d; end if;
  end loop;
  return out;
end $$;

-- Qulfni tekshirish va qo'yish
create or replace function mar_eval(sid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s mar_students; st mar_settings; m date[];
begin
  select * into s from mar_students where id = sid; if not found or s.locked then return; end if;
  select * into st from mar_settings where id = 1;
  m := mar_missed(sid);
  if coalesce(array_length(m, 1), 0) >= st.miss_limit then
    update mar_students set locked = true,
      lock_reason = 'Oxirgi ' || st.window_days || ' kun ichida ' || array_length(m, 1) || ' kun dars qilinmadi: ' ||
                    (select string_agg(to_char(x, 'DD.MM'), ', ' order by x) from unnest(m) x)
    where id = sid;
  end if;
end $$;

-- O'quvchi holati (birinchi kirishda o'zi ro'yxatga olinadi, agar guruhi marafonga ochilgan bo'lsa)
create or replace function mar_status(n text, g text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s mar_students; st mar_settings; gc text := upper(trim(g)); nm text := regexp_replace(trim(n), '\s+', ' ', 'g'); m date[];
begin
  if check_group(gc) is null or length(nm) < 2 then return jsonb_build_object('error', 'group'); end if;
  if not exists (select 1 from mar_groups where code = gc) then return jsonb_build_object('enabled', false); end if;
  select * into s from mar_students where upper(group_code) = gc and lower(student_name) = lower(nm);
  if not found then
    insert into mar_students (student_name, group_code) values (nm, gc) returning * into s;
  end if;
  perform mar_eval(s.id);
  select * into s from mar_students where id = s.id;
  select * into st from mar_settings where id = 1;
  m := mar_missed(s.id);
  return jsonb_build_object('enabled', true, 'id', s.id, 'name', s.student_name, 'open_upto', s.open_upto, 'locked', s.locked,
    'lock_reason', s.lock_reason, 'start_day', s.start_day, 'today', mar_today(), 'miss_limit', st.miss_limit, 'window_days', st.window_days,
    'missed', to_jsonb(m),
    'progress', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'task', task, 'score', score, 'total', total, 'done_day', done_day)) from mar_progress where student_id = s.id), '[]'::jsonb),
    'days', coalesce((select jsonb_object_agg(day::text, to_jsonb(tasks)) from mar_days), '{}'::jsonb));
end $$;

-- Vazifani bajarilgan deb belgilash (kun ochiqligi va qulf serverda tekshiriladi)
create or replace function mar_complete(n text, g text, d int, t text, sc numeric, tot numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s mar_students; gc text := upper(trim(g)); nm text := regexp_replace(trim(n), '\s+', ' ', 'g'); tasks_ text[]; last_day int; all_done boolean;
begin
  select * into s from mar_students where upper(group_code) = gc and lower(student_name) = lower(nm);
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_enrolled'); end if;
  perform mar_eval(s.id);
  select * into s from mar_students where id = s.id;
  if s.locked then return jsonb_build_object('ok', false, 'reason', 'locked'); end if;
  if d < 1 or d > s.open_upto then return jsonb_build_object('ok', false, 'reason', 'day_locked'); end if;
  select tasks into tasks_ from mar_days where day = d;
  if tasks_ is null or not (t = any (tasks_)) then return jsonb_build_object('ok', false, 'reason', 'unknown_task'); end if;
  insert into mar_progress (student_id, day, task, score, total) values (s.id, d, t, sc, tot)
  on conflict (student_id, day, task) do update
    set score = greatest(coalesce(mar_progress.score, 0), coalesce(excluded.score, 0)), total = coalesce(excluded.total, mar_progress.total), done_at = now();
  select not exists (select 1 from unnest(tasks_) x where not exists (select 1 from mar_progress p where p.student_id = s.id and p.day = d and p.task = x)) into all_done;
  select max(day) into last_day from mar_days;
  if all_done and d = s.open_upto and d <= last_day then update mar_students set open_upto = d + 1 where id = s.id; end if;
  return jsonb_build_object('ok', true, 'day_done', all_done);
end $$;

-- O'qituvchi: qulfni ochish (shu kundan boshlab qoldirilganlar qayta hisoblanadi)
create or replace function mar_admin_unlock(sid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'authenticated' then raise exception 'not allowed'; end if;
  update mar_students set locked = false, lock_reason = '', reset_at = mar_today() where id = sid;
end $$;

grant execute on function mar_status(text, text) to anon, authenticated;
grant execute on function mar_complete(text, text, int, text, numeric, numeric) to anon, authenticated;
grant execute on function mar_admin_unlock(uuid) to authenticated;
