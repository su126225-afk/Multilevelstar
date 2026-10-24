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
