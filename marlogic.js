// 35 kunlik marafon: qoidalar (SQL funksiyalarining JS nusxasi — demo rejim va testlar uchun).
// Asl himoya serverda (marathon-schema.sql); bu fayl faqat Supabase ulanmagan demo rejimda ishlaydi.

export const TASHKENT_OFFSET = 5 * 3600e3;
export const todayStr = (now = Date.now()) => new Date(now + TASHKENT_OFFSET).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
export const dm = d => d.slice(8, 10) + '.' + d.slice(5, 7);

export const newState = () => ({ settings: { miss_limit: 2, window_days: 10, promo_on: true }, groups: [], days: {}, students: [], progress: [], accounts: [], sessions: {} });

/** Qoldirilgan kunlar: oxirgi window_days kun, kecha gacha; boshlangan/qulf ochilgan kun hisoblanmaydi. */
export function missedDays(st, s, today) {
  const last = Math.max(0, ...Object.keys(st.days).map(Number));
  if (last && s.open_upto > last) return [];
  const base = addDays(s.start_day > s.reset_at ? s.start_day : s.reset_at, 1);
  const from = addDays(today, -st.settings.window_days);
  let d = base > from ? base : from;
  const out = [], done = new Set(st.progress.filter(p => p.student_id === s.id).map(p => p.done_day));
  for (; d <= addDays(today, -1); d = addDays(d, 1)) if (!(s.excused || []).includes(d) && !done.has(d)) out.push(d);
  return out;
}

export function evalLock(st, s, today) {
  if (s.locked) return;
  const m = missedDays(st, s, today);
  if (m.length >= st.settings.miss_limit) {
    s.locked = true;
    s.lock_reason = `Oxirgi ${st.settings.window_days} kun ichida ${m.length} kun dars qilinmadi: ${m.map(dm).join(', ')}`;
  }
}

/** Login (akkaunt) uchun marafon qatori: birinchi kirishda yaratiladi. */
export function accStudent(st, acc, today, uid) {
  let s = st.students.find(x => x.account_id === acc.id);
  if (!s) { s = { id: uid(), account_id: acc.id, student_name: acc.student_name + ' #' + acc.login, group_code: acc.group_code, start_day: today, open_upto: 1, reset_at: today, locked: false, lock_reason: '', excused: [] }; st.students.push(s); }
  return s;
}

export function statusCore(st, s, today) {
  evalLock(st, s, today);
  return { enabled: true, id: s.id, name: s.student_name, open_upto: s.open_upto, locked: s.locked, lock_reason: s.lock_reason, start_day: s.start_day, today,
    miss_limit: st.settings.miss_limit, window_days: st.settings.window_days, missed: missedDays(st, s, today),
    progress: st.progress.filter(p => p.student_id === s.id).map(({ day, task, score, total, done_day }) => ({ day, task, score, total, done_day })),
    days: st.days };
}

export function completeCore(st, s, day, task, score, total, today) {
  evalLock(st, s, today);
  if (s.locked) return { ok: false, reason: 'locked' };
  if (day < 1 || day > s.open_upto) return { ok: false, reason: 'day_locked' };
  const tasks = st.days[day];
  if (!tasks || !tasks.includes(task)) return { ok: false, reason: 'unknown_task' };
  const p = st.progress.find(x => x.student_id === s.id && x.day === day && x.task === task);
  if (p) { p.score = Math.max(p.score || 0, score || 0); p.total = total ?? p.total; } else st.progress.push({ student_id: s.id, day, task, score, total, done_day: today });
  const allDone = tasks.every(t => st.progress.some(x => x.student_id === s.id && x.day === day && x.task === t));
  const last = Math.max(...Object.keys(st.days).map(Number));
  if (allDone && day === s.open_upto && day <= last) s.open_upto = day + 1;
  return { ok: true, day_done: allDone };
}

export const unlock = (st, id, today) => { const s = st.students.find(x => x.id === id); if (s) { s.locked = false; s.lock_reason = ''; s.reset_at = today; } };

/** Kun holati (talaba sahifasi uchun): 'done' | 'open' | 'locked' */
export function dayState(status, day, tasks) {
  const done = new Set(status.progress.filter(p => p.day === day).map(p => p.task));
  const all = tasks.length > 0 && tasks.every(t => done.has(t));
  return { done: all, count: tasks.filter(t => done.has(t)).length, open: day <= status.open_upto, doneSet: done };
}
