// Sof (toza) funksiyalar: sana, to'lov balansi, davomat, eslatma. Testlanadi (tests/logic.test.mjs).
export const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;   // mahalliy sana (UTC emas)
export const parseYmd = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => ymd(new Date());
export const monthOf = s => String(s).slice(0, 7);
export const addMonths = (mk, n) => { const [y, m] = mk.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
export const monthLabel = mk => { const [y, m] = String(mk).split('-').map(Number); return `${MONTHS[m - 1] || '?'} ${y}`; };
export const monthsBetween = (from, to) => { const out = []; let c = from; while (c <= to && out.length < 120) { out.push(c); c = addMonths(c, 1); } return out; };
export const WD = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
export const WDS = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Juma', 'Shan'];
export const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];            // hafta dushanbadan boshlanadi
export const fmtDate = s => { if (!s) return ''; const d = parseYmd(s); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };
export const money = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const csvCell = v => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

/** Shaxsiy kod (o'xshash harflarsiz: 0/O, 1/I yo'q). */
export function genCode(taken = new Set(), rnd = Math.random) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let n = 0; n < 200; n++) { let c = ''; for (let i = 0; i < 6; i++) c += A[Math.floor(rnd() * A.length)]; if (!taken.has(c)) return c; }
  throw new Error('Kod yaratib bo\'lmadi');
}

/** O'quvchining oylik narxi: shaxsiy narx bo'lsa shu, bo'lmasa guruh narxi. */
export const priceOf = (s, g) => (s && s.price !== null && s.price !== undefined && s.price !== '') ? Number(s.price) : Number(g?.price || 0);

/** Muzlatish: s.freezes = [{from:'2026-10-01', to:'2026-11-01'|null}]. Oxirgisida `to` yo'q bo'lsa hozir muzlatilgan. */
export const freezesOf = s => (Array.isArray(s?.freezes) ? s.freezes : []);
export const isFrozen = s => { const f = freezesOf(s); return f.length > 0 && !f[f.length - 1].to; };
/** Shu oyda to'lov hisoblanmaydimi (muzlatilgan davr oyni qamrasa). `to` oyi o'zi hisoblanadi. */
export const frozenInMonth = (s, mk) => freezesOf(s).some(f => f.from && monthOf(f.from) <= mk && (!f.to || mk < monthOf(f.to)));
export const frozenOn = (s, day) => freezesOf(s).some(f => f.from && f.from <= day && (!f.to || day < f.to));
/** Hozir darsga qatnashadigan (faol va muzlatilmagan) o'quvchi. */
export const isLive = s => !!s && s.active !== false && !isFrozen(s);

/** Bir oy uchun: to'lashi kerak / to'lagan / qolgan. Qo'shilgan oyidan oldingi oylar uchun qarz yo'q. */
export function monthBalance(student, group, payments, mk) {
  const start = monthOf(student.joined || '0000-01-01');
  const due = mk < start || frozenInMonth(student, mk) ? 0 : priceOf(student, group);
  const paid = payments.filter(p => p.student_id === student.id && p.month === mk).reduce((a, p) => a + Number(p.amount || 0), 0);
  const left = Math.max(0, due - paid);
  const status = due === 0 && paid === 0 ? 'none' : left === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  return { due, paid, left, status };
}

/** Qo'shilgan oyidan hozirgi oygacha jami qarz (har oy alohida hisoblanadi, ortiqcha to'lov boshqa oyni yopmaydi). */
export function totalDebt(student, group, payments, nowMonth) {
  return monthsBetween(monthOf(student.joined || nowMonth), nowMonth).reduce((a, mk) => a + monthBalance(student, group, payments, mk).left, 0);
}

/** Davomat statistikasi. Foiz = (keldi + kechikdi) / belgilangan darslar. */
export function attStats(rows) {
  const c = { p: 0, a: 0, e: 0, l: 0 };
  for (const r of rows) if (c[r.status] !== undefined) c[r.status]++;
  const total = c.p + c.a + c.e + c.l;
  return { ...c, total, pct: total ? Math.round((c.p + c.l) / total * 100) : null };
}

/** [from..to] oralig'ida guruh dars kunlari (sana satrlari). */
export function lessonDays(group, from, to) {
  const out = [], set = new Set(group?.days || []);
  const d = parseYmd(from), end = parseYmd(to);
  for (let n = 0; d <= end && n < 400; n++, d.setDate(d.getDate() + 1)) if (set.has(d.getDay())) out.push(ymd(d));
  return out;
}

/** To'lov muddatigacha necha kun qoldi (manfiy = muddat o'tgan). */
export function daysToDue(group, now = new Date()) {
  const pd = Math.min(28, Math.max(1, Number(group?.pay_day) || 1));
  return pd - now.getDate();
}

export const reminderText = (student, group, mk, left, teacher = '') =>
  `Assalomu alaykum! ${student.name} uchun ${monthLabel(mk)} oyi kurs to'lovi (${money(left)}) hali to'lanmagan. Iltimos, to'lovni amalga oshirishingizni so'raymiz. Rahmat!${teacher ? ' — ' + teacher : ''}`;

export const STATUS = { p: 'Keldi', a: 'Kelmadi', e: 'Sababli', l: 'Kechikdi' };
export const HW = { y: 'Vazifa bajardi', n: 'Vazifa bajarmadi' };
export const BEH = { g: 'Tartib yaxshi', b: 'Tartib yomon' };

/** Guruh+oy bo'yicha jadval: o'quvchi qatorlari × dars kunlari ustunlari. */
export function attendanceGrid(group, students, attendance, lessons, mk) {
  const [y, m] = mk.split('-').map(Number), last = new Date(y, m, 0).getDate();
  const days = lessonDays(group, `${mk}-01`, `${mk}-${pad(last)}`);
  const cancelled = new Set(lessons.filter(l => l.group_id === group.id && l.cancelled).map(l => l.day));
  const held = days.filter(d => !cancelled.has(d));
  const map = new Map(attendance.map(a => [a.student_id + '|' + a.day, a.status]));
  const hwm = new Map(attendance.map(a => [a.student_id + '|' + a.day, a.hw || ''])), bhm = new Map(attendance.map(a => [a.student_id + '|' + a.day, a.beh || '']));
  return { days: held, rows: students.map(s => ({ student: s, cells: held.map(d => map.get(s.id + '|' + d) || ''), hw: held.map(d => hwm.get(s.id + '|' + d) || ''), beh: held.map(d => bhm.get(s.id + '|' + d) || ''), stats: attStats(held.map(d => ({ status: map.get(s.id + '|' + d) })).filter(x => x.status)) })) };
}

// ───────── Excel ro'yxatdan o'quvchilarni olish ─────────
/** "91.2626122" yoki "+998 91 262 61 22" → "+998 91 262 61 22". Tanib bo'lmasa o'zini qaytaradi. */
export function formatPhone(raw) {
  const t = String(raw ?? '').trim(); if (!t) return '';
  let d = t.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('998')) d = d.slice(3);
  return d.length === 9 ? `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : t;
}
const looksPhone = v => { const d = String(v ?? '').replace(/\D/g, ''); return typeof v !== 'object' && (d.length === 9 || (d.length === 12 && d.startsWith('998'))) && /^[\d\s.+()-]+$/.test(String(v).trim()); };

/** Excel varag'i (qatorlar massivi) → o'quvchilar. Sarlavha qatorini o'zi topadi (Student Name / Full Name, Parent's Phone, Category…). */
export function parseRegister(rows) {
  const lower = c => String(c ?? '').toLowerCase();
  let hi = rows.findIndex((r, i) => i < 15 && (r || []).some(c => /name/.test(lower(c))));
  if (hi < 0) return { students: [], skipped: 0, error: "Sarlavha qatori topilmadi (Student Name / Full Name ustuni kerak)" };
  const head = rows[hi], col = re => head.findIndex(c => re.test(lower(c)));
  const cName = col(/name/), cPhone = col(/phone/), cStart = col(/start/), cStatus = col(/tuition|status/), cCat = col(/categor/);
  const out = [], seen = new Set(); let skipped = 0;
  for (const r of rows.slice(hi + 1)) {
    if (!r) continue;
    let name = String(r[cName] ?? '').replace(/\s+/g, ' ').trim();
    if (!name) {   // ba'zi qatorlarda ism bir ustun chapga siljib ketgan
      const alt = r.find(c => typeof c === 'string' && /[A-Za-z\u0400-\u04FF]{3,}/.test(c) && !/^\s*(summary|total|paid|on leave|due|missing|no info|overdue)/i.test(c) && !/paid|due\b|overdue|leave|info/i.test(c));
      if (alt) name = alt.replace(/\s+/g, ' ').trim();
    }
    if (!name || /^\d+$/.test(name) || name.length < 2) { if (r.some(c => c != null && String(c).trim() && !/^\d+$/.test(String(c).trim()))) skipped++; continue; }
    const key = name.toLowerCase(); if (seen.has(key)) { skipped++; continue; } seen.add(key);
    let ph = cPhone >= 0 ? r[cPhone] : ''; if (!looksPhone(ph)) ph = r.find((c, i) => i !== cName && looksPhone(c)) ?? '';
    const cat = String(cPhone === cCat ? '' : (r[cCat] ?? '')).trim(), status = String(r[cStatus] ?? '').trim(), start = r[cStart];
    const startTxt = typeof start === 'string' && !looksPhone(start) ? start.trim() : '';
    const bits = [status && `To'lov (Excel): ${status}`, startTxt && `Boshlagan: ${startTxt}`, cat && `Toifa: ${cat}`].filter(Boolean);
    out.push({ name, parent_phone: formatPhone(ph), note: bits.join(' · '), frozen: /leave|freez|frozen|muzla/i.test(cat) });
  }
  return { students: out, skipped };
}

// ───────── Kuzatuv: e'tibor kerak bo'lgan o'quvchilar ─────────
/** Oxirgi darslardan boshlab ketma-ket «kelmadi» soni («sababli» zanjirni uzmaydi, hisoblanmaydi). */
export function absentStreak(rows) {
  let n = 0;
  for (const r of rows.slice().sort((a, b) => b.day.localeCompare(a.day))) { if (r.status === 'a') n++; else if (r.status === 'e') continue; else break; }
  return n;
}
/** O'quvchi uchun ogohlantirishlar: ketma-ket qoldirish, oxirgi 30 kunda past davomat, to'lov qarzi. */
export function studentWatch(student, group, att, payments, now = new Date()) {
  const mk = monthOf(ymd(now)), mine = att.filter(a => a.student_id === student.id), reasons = [];
  const streak = absentStreak(mine); if (streak >= 2) reasons.push({ k: 'streak', n: streak });
  const since = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)), st = attStats(mine.filter(a => a.day >= since));
  if (st.total >= 3 && st.pct < 70) reasons.push({ k: 'low', pct: st.pct });
  const bal = monthBalance(student, group, payments, mk);
  if (bal.left > 0) reasons.push({ k: 'debt', left: bal.left, overdue: group ? daysToDue(group, now) < 0 : false });
  return reasons;
}
