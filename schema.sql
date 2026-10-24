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

-- ============================================================
--  Ota-onalar va o'quvchilar portali: davomat, uy vazifasi, to'lov
--  Parents & students portal: attendance, homework, payments
--  (qayta ishga tushirish xavfsiz / safe to run again)
--
--  XAVFSIZLIK: bu jadvallarni FAQAT o'qituvchi (login qilgan) ko'ra oladi.
--  Ota-ona/o'quvchi jadvallarga to'g'ridan-to'g'ri kira olmaydi — faqat
--  portal_report(shaxsiy_raqam) funksiyasi orqali, va faqat o'z ma'lumotini oladi.
-- ============================================================

create table if not exists students (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  group_code  text not null references groups(code) on update cascade on delete restrict,
  access_code text not null unique check (access_code ~ '^[0-9]{12}$'),   -- shaxsiy raqam (12 xonali)
  parent_name text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists students_group_idx on students(group_code);

create table if not exists lessons (
  id          uuid primary key default gen_random_uuid(),
  group_code  text not null references groups(code) on update cascade on delete cascade,
  lesson_date date not null,
  topic       text not null default '',
  homework    text not null default '',          -- berilgan uy vazifasi
  created_at  timestamptz not null default now(),
  unique (group_code, lesson_date)
);

create table if not exists lesson_records (
  lesson_id  uuid not null references lessons(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  attendance text not null default 'present' check (attendance in ('present','late','absent','excused')),
  homework   text not null default 'none'    check (homework in ('done','partial','missing','none')),
  note       text not null default '',          -- ota-onaga ko'rinadigan izoh
  primary key (lesson_id, student_id)
);
create index if not exists lesson_records_student_idx on lesson_records(student_id);

create table if not exists payments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students(id) on delete cascade,
  period      text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),   -- 2026-10
  amount_due  numeric not null default 0 check (amount_due  >= 0),
  amount_paid numeric not null default 0 check (amount_paid >= 0),
  paid_on     date,
  note        text not null default '',
  unique (student_id, period)
);

-- Kod terishga urinishlarni cheklash uchun (faqat funksiya ishlatadi)
create table if not exists portal_attempts (
  at  timestamptz not null default now(),
  key text not null default 'unknown'
);
create index if not exists portal_attempts_at_idx on portal_attempts(at);

alter table students        enable row level security;
alter table lessons         enable row level security;
alter table lesson_records  enable row level security;
alter table payments        enable row level security;
alter table portal_attempts enable row level security;

drop policy if exists students_all on students;
create policy students_all on students for all to authenticated using (true) with check (true);
drop policy if exists lessons_all on lessons;
create policy lessons_all on lessons for all to authenticated using (true) with check (true);
drop policy if exists lesson_records_all on lesson_records;
create policy lesson_records_all on lesson_records for all to authenticated using (true) with check (true);
drop policy if exists payments_all on payments;
create policy payments_all on payments for all to authenticated using (true) with check (true);
-- portal_attempts uchun hech qanday policy yo'q: ochiq foydalanuvchilar ko'ra olmaydi

-- Qo'shimcha himoya: anonim foydalanuvchiga jadvallarga umuman ruxsat bermaymiz
revoke all on table students, lessons, lesson_records, payments, portal_attempts from anon;
revoke all on table portal_attempts from authenticated;

-- Portal: shaxsiy raqam -> faqat shu o'quvchining ma'lumoti
create or replace function portal_report(c text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  code text := regexp_replace(coalesce(c, ''), '\D', '', 'g');
  hdr  json := nullif(current_setting('request.headers', true), '')::json;
  k    text := coalesce(nullif(hdr->>'cf-connecting-ip', ''), nullif(trim(split_part(coalesce(hdr->>'x-forwarded-for', ''), ',', 1)), ''), 'unknown');
  s    students%rowtype;
begin
  delete from portal_attempts where at < now() - interval '1 hour';
  if (select count(*) from portal_attempts where key = k and at > now() - interval '1 minute') >= 10
     or (select count(*) from portal_attempts where at > now() - interval '1 minute') >= 60 then
    raise exception 'too_many_attempts';
  end if;

  select * into s from students where access_code = code and active;
  if not found then
    insert into portal_attempts (key) values (k);
    return null;
  end if;

  return jsonb_build_object(
    'student', jsonb_build_object('name', s.full_name, 'group', s.group_code),
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', l.lesson_date, 'topic', l.topic, 'task', l.homework,
               'attendance', r.attendance, 'homework', r.homework, 'note', r.note)
             order by l.lesson_date desc)
      from lessons l
      join lesson_records r on r.lesson_id = l.id and r.student_id = s.id
      where l.lesson_date >= current_date - 200), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'period', p.period, 'due', p.amount_due, 'paid', p.amount_paid,
               'paid_on', p.paid_on, 'note', p.note)
             order by p.period desc)
      from payments p where p.student_id = s.id), '[]'::jsonb)
  );
end $$;
revoke all on function portal_report(text) from public;
grant execute on function portal_report(text) to anon, authenticated;
