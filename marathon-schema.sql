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
