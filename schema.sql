-- ═══════════════════════════════════════════════════════════════
--  GURUH BOSHQARUVI (davomat va to'lovlar) — Supabase jadvallari
--  Hozirgi Supabase loyihangizga qo'shiladi, eski jadvallarga tegmaydi.
--  SQL Editor → New query → hammasini qo'ying → Run. Qayta ishga tushirsa ham xavfsiz.
-- ═══════════════════════════════════════════════════════════════

create table if not exists mg_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  price      integer not null default 0,          -- oylik to'lov (so'm)
  days       integer[] not null default '{}',     -- dars kunlari: 0=Yakshanba … 6=Shanba
  time       text not null default '',            -- masalan 18:00
  pay_day    integer not null default 1,          -- har oyning nechanchi kunigacha to'lanadi
  note       text not null default '',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists mg_students (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid references mg_groups(id) on delete set null,
  name         text not null,
  phone        text not null default '',
  parent_phone text not null default '',
  code         text not null unique,              -- o'quvchi/ota-ona kabineti uchun shaxsiy kod
  price        integer,                           -- bo'sh bo'lsa guruh narxi olinadi
  joined       date not null default current_date,
  active       boolean not null default true,
  note         text not null default '',
  created_at   timestamptz not null default now()
);

-- Muzlatish tarixi: [{"from":"2026-10-01","to":"2026-11-01"}], oxirgisida "to" bo'lmasa hozir muzlatilgan
alter table mg_students add column if not exists freezes jsonb not null default '[]'::jsonb;

create table if not exists mg_lessons (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references mg_groups(id) on delete cascade,
  day       date not null,
  cancelled boolean not null default false,
  topic     text not null default '',
  unique (group_id, day)
);

create table if not exists mg_attendance (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references mg_students(id) on delete cascade,
  day        date not null,
  status     text not null check (status in ('p','a','e','l')),   -- keldi / kelmadi / sababli / kechikdi
  unique (student_id, day)
);

create table if not exists mg_payments (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references mg_students(id) on delete cascade,
  month      text not null,                       -- 2026-10
  amount     integer not null,
  paid_on    date not null default current_date,
  method     text not null default 'naqd',
  note       text not null default '',
  created_at timestamptz not null default now()
);
-- Uyga vazifa (y = bajardi, n = bajarmadi) va tartib (g = yaxshi, b = yomon). Eski bazada ham xavfsiz ishlaydi.
alter table mg_attendance add column if not exists hw  text check (hw  in ('y','n'));
alter table mg_attendance add column if not exists beh text check (beh in ('g','b'));
create index if not exists mg_att_student on mg_attendance(student_id, day);
create index if not exists mg_pay_student on mg_payments(student_id, month);

-- Faqat tizimga kirgan o'qituvchi (Supabase Auth) o'qiy va yoza oladi. Anonim foydalanuvchiga hech narsa ochiq emas.
alter table mg_groups     enable row level security;
alter table mg_students   enable row level security;
alter table mg_lessons    enable row level security;
alter table mg_attendance enable row level security;
alter table mg_payments   enable row level security;
do $$ declare t text; begin
  foreach t in array array['mg_groups','mg_students','mg_lessons','mg_attendance','mg_payments'] loop
    execute format('drop policy if exists %I on %I', t || '_all', t);
    execute format('create policy %I on %I for all to authenticated using (true) with check (true)', t || '_all', t);
  end loop;
end $$;

-- O'quvchi/ota-ona kabineti: faqat o'z kodi bilan o'zining ma'lumotini ko'radi (boshqa hech kimniki emas).
create or replace function mg_my_status(c text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s mg_students; g mg_groups; r jsonb;
begin
  select * into s from mg_students where code = upper(trim(c)) and active limit 1;
  if not found then return null; end if;
  select * into g from mg_groups where id = s.group_id;
  r := jsonb_build_object(
    'student', jsonb_build_object('id', s.id, 'name', s.name, 'joined', s.joined, 'price', s.price, 'freezes', s.freezes),
    'group',   case when g.id is null then null else jsonb_build_object('name', g.name, 'price', g.price, 'days', g.days, 'time', g.time, 'pay_day', g.pay_day) end,
    'attendance', coalesce((select jsonb_agg(jsonb_build_object('day', a.day, 'status', a.status, 'hw', a.hw, 'beh', a.beh) order by a.day desc)
                            from mg_attendance a where a.student_id = s.id and a.day >= current_date - 150), '[]'::jsonb),
    'payments',   coalesce((select jsonb_agg(jsonb_build_object('month', p.month, 'amount', p.amount, 'paid_on', p.paid_on, 'method', p.method) order by p.paid_on desc)
                            from mg_payments p where p.student_id = s.id), '[]'::jsonb),
    'lessons',    coalesce((select jsonb_agg(jsonb_build_object('day', l.day, 'cancelled', l.cancelled, 'topic', l.topic) order by l.day desc)
                            from mg_lessons l where l.group_id = s.group_id and l.day >= current_date - 150), '[]'::jsonb)
  );
  return r;
end $$;
grant execute on function mg_my_status(text) to anon, authenticated;
