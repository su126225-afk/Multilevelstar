-- ═══════════ MARAFON: LOGIN + PAROL (pullik kirish) ═══════════
-- marathon-schema.sql dan KEYIN bir marta ishga tushiring. Qayta ishga tushirsa ham xavfsiz.
-- Parollar shifrlangan (bcrypt) holda saqlanadi. Muddati tugagan yoki o'chirilgan login kira olmaydi.
create extension if not exists pgcrypto;

create table if not exists mar_accounts (
  id           uuid primary key default gen_random_uuid(),
  login        text not null unique,
  pass_hash    text not null,
  student_name text not null,
  group_code   text not null default '',
  expires_on   date not null,
  active       boolean not null default true,
  fails        int not null default 0,
  locked_until timestamptz,
  created_at   timestamptz not null default now(),
  last_login   timestamptz
);
create table if not exists mar_sessions (
  token      uuid primary key default gen_random_uuid(),
  account_id uuid not null references mar_accounts(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table mar_students add column if not exists account_id uuid unique references mar_accounts(id) on delete cascade;
alter table mar_settings add column if not exists promo_on boolean not null default true;

alter table mar_accounts enable row level security;
alter table mar_sessions enable row level security;
drop policy if exists mar_accounts_all on mar_accounts;
create policy mar_accounts_all on mar_accounts for all to authenticated using (true) with check (true);
-- mar_sessions: hech kimga to'g'ridan-to'g'ri ruxsat yo'q (faqat funksiyalar orqali)

-- Eski (ism + guruh bilan kirgan) marafon natijalari o'chiriladi
delete from mar_students where account_id is null;

-- Eski ism+guruh bilan ishlaydigan funksiyalar o'chiriladi (endi faqat login orqali)
drop function if exists mar_status(text, text);
drop function if exists mar_complete(text, text, int, text, numeric, numeric);

create or replace function mar_acc(tok uuid) returns mar_accounts
language sql security definer set search_path = public stable as $$
  select a.* from mar_sessions s join mar_accounts a on a.id = s.account_id where s.token = tok
$$;

-- Holat (umumiy yadro)
create or replace function mar_status_core(sid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s mar_students; st mar_settings;
begin
  perform mar_eval(sid);
  select * into s from mar_students where id = sid;
  select * into st from mar_settings where id = 1;
  return jsonb_build_object('enabled', true, 'id', s.id, 'name', s.student_name, 'open_upto', s.open_upto, 'locked', s.locked,
    'lock_reason', s.lock_reason, 'start_day', s.start_day, 'today', mar_today(), 'miss_limit', st.miss_limit, 'window_days', st.window_days,
    'missed', to_jsonb(mar_missed(s.id)),
    'progress', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'task', task, 'score', score, 'total', total, 'done_day', done_day)) from mar_progress where student_id = s.id), '[]'::jsonb),
    'days', coalesce((select jsonb_object_agg(day::text, to_jsonb(tasks)) from mar_days), '{}'::jsonb));
end $$;

create or replace function mar_complete_core(sid uuid, d int, t text, sc numeric, tot numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s mar_students; tasks_ text[]; last_day int; all_done boolean;
begin
  perform mar_eval(sid);
  select * into s from mar_students where id = sid;
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

-- Login tekshiruvi → har doim mar_students qatori (birinchi kirishda yaratiladi)
create or replace function mar_student_of(tok uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a mar_accounts; sid uuid;
begin
  a := mar_acc(tok);
  if a.id is null then return jsonb_build_object('error', 'auth'); end if;
  if not a.active then return jsonb_build_object('error', 'inactive'); end if;
  if a.expires_on < mar_today() then return jsonb_build_object('error', 'expired', 'expires', a.expires_on); end if;
  select id into sid from mar_students where account_id = a.id;
  if sid is null then
    insert into mar_students (student_name, group_code, account_id) values (a.student_name || ' #' || a.login, a.group_code, a.id) returning id into sid;
  end if;
  return jsonb_build_object('sid', sid, 'expires', a.expires_on);
end $$;

-- Kirish
create or replace function mar_login(l text, p text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a mar_accounts; tok uuid;
begin
  select * into a from mar_accounts where lower(login) = lower(trim(l));
  if not found then perform pg_sleep(0.5); return jsonb_build_object('error', 'bad'); end if;
  if a.locked_until is not null and a.locked_until > now() then return jsonb_build_object('error', 'wait'); end if;
  if a.pass_hash <> crypt(trim(p), a.pass_hash) then
    update mar_accounts set fails = fails + 1, locked_until = case when fails + 1 >= 5 then now() + interval '10 minutes' else null end
      where id = a.id;
    return jsonb_build_object('error', 'bad');
  end if;
  if not a.active then return jsonb_build_object('error', 'inactive'); end if;
  if a.expires_on < mar_today() then return jsonb_build_object('error', 'expired', 'expires', a.expires_on); end if;
  update mar_accounts set fails = 0, locked_until = null, last_login = now() where id = a.id;
  delete from mar_sessions where account_id = a.id and created_at < now() - interval '60 days';
  insert into mar_sessions (account_id) values (a.id) returning token into tok;
  return jsonb_build_object('token', tok, 'login', a.login, 'name', a.student_name, 'group', a.group_code, 'expires', a.expires_on);
end $$;

create or replace function mar_logout(tok uuid) returns void
language sql security definer set search_path = public as $$ delete from mar_sessions where token = tok $$;

create or replace function mar_status_t(tok uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  r := mar_student_of(tok);
  if r ? 'error' then return r; end if;
  return mar_status_core((r->>'sid')::uuid) || jsonb_build_object('expires', r->'expires');
end $$;

create or replace function mar_complete_t(tok uuid, d int, t text, sc numeric, tot numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  r := mar_student_of(tok);
  if r ? 'error' then return jsonb_build_object('ok', false, 'reason', r->>'error'); end if;
  return mar_complete_core((r->>'sid')::uuid, d, t, sc, tot);
end $$;

-- Hamma ko'ra oladigan: reklama pop-up yoqilganmi
create or replace function mar_public() returns jsonb
language sql security definer set search_path = public stable as $$
  select jsonb_build_object('promo', coalesce((select promo_on from mar_settings where id = 1), true))
$$;

-- ───── O'qituvchi ─────
create or replace function mar_admin_create(n text, g text, days int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare base text; lg text; pw text; i int := 1; aid uuid;
begin
  if auth.role() is distinct from 'authenticated' then raise exception 'not allowed'; end if;
  base := left(regexp_replace(lower(split_part(trim(n), ' ', 1)), '[^a-z0-9]', '', 'g'), 10);
  if length(base) < 3 then base := 'student'; end if;
  loop
    lg := base || lpad(i::text, 2, '0');
    exit when not exists (select 1 from mar_accounts where login = lg);
    i := i + 1;
  end loop;
  pw := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into mar_accounts (login, pass_hash, student_name, group_code, expires_on)
  values (lg, crypt(pw, gen_salt('bf')), regexp_replace(trim(n), '\s+', ' ', 'g'), upper(trim(coalesce(g, ''))), mar_today() + greatest(1, coalesce(days, 35)))
  returning id into aid;
  return jsonb_build_object('id', aid, 'login', lg, 'password', pw);
end $$;

create or replace function mar_admin_reset(aid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pw text; lg text;
begin
  if auth.role() is distinct from 'authenticated' then raise exception 'not allowed'; end if;
  pw := lpad((floor(random() * 1000000))::int::text, 6, '0');
  update mar_accounts set pass_hash = crypt(pw, gen_salt('bf')), fails = 0, locked_until = null where id = aid returning login into lg;
  delete from mar_sessions where account_id = aid;     -- eski qurilmalardan chiqarib yuboriladi
  return jsonb_build_object('login', lg, 'password', pw);
end $$;

create or replace function mar_admin_unlock(sid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'authenticated' then raise exception 'not allowed'; end if;
  update mar_students set locked = false, lock_reason = '', reset_at = mar_today() where id = sid;
end $$;

revoke all on function mar_acc(uuid), mar_status_core(uuid), mar_complete_core(uuid, int, text, numeric, numeric), mar_student_of(uuid) from public, anon, authenticated;
grant execute on function mar_login(text, text), mar_logout(uuid), mar_status_t(uuid), mar_complete_t(uuid, int, text, numeric, numeric), mar_public() to anon, authenticated;
revoke all on function mar_admin_create(text, text, int), mar_admin_reset(uuid), mar_admin_unlock(uuid) from public, anon;
grant execute on function mar_admin_create(text, text, int), mar_admin_reset(uuid), mar_admin_unlock(uuid) to authenticated;
