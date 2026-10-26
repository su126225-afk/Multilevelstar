// Ma'lumotlar qatlami: DEMO (shu brauzerda, localStorage) yoki Supabase (bulut). Ikkalasi bir xil metodlarga ega.
import { CONFIG } from './config.js';
import { genCode, ymd, addMonths, monthOf, today } from './logic.js';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + Math.random().toString(16).slice(2));
export const cloudConfigured = () => !globalThis.__MG_LOCAL && !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
const TABLES = ['groups', 'students', 'lessons', 'attendance', 'payments'];

const LS = {
  get(k, d) { try { const v = localStorage.getItem('mg_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { localStorage.setItem('mg_' + k, JSON.stringify(v)); },
};

// ───────────── DEMO ─────────────
const local = {
  mode: 'local',
  async init() {
    if (LS.get('seeded')) return;
    const now = new Date(), mk = monthOf(ymd(now)), prev = addMonths(mk, -1);
    const g1 = { id: uid(), name: 'IELTS 6.5 (kechki)', price: 600000, days: [1, 3, 5], time: '18:00', pay_day: 5, note: '', active: true, created_at: now.toISOString() };
    const g2 = { id: uid(), name: 'Multilevel B2', price: 450000, days: [2, 4, 6], time: '16:00', pay_day: 10, note: '', active: true, created_at: now.toISOString() };
    const names = [['Azizbek Karimov', g1], ['Madina Yusupova', g1], ['Jasur Toshmatov', g1], ['Dilnoza Rahimova', g2], ['Sherzod Aliyev', g2]];
    const taken = new Set();
    const students = names.map(([name, g], i) => { const code = genCode(taken); taken.add(code); return { id: uid(), group_id: g.id, name, phone: '+998 90 123 45 6' + i, parent_phone: '+998 91 765 43 2' + i, code, price: null, joined: prev + '-01', active: true, note: '', created_at: now.toISOString() }; });
    const payments = [
      { id: uid(), student_id: students[0].id, month: prev, amount: 600000, paid_on: prev + '-03', method: 'naqd', note: '', created_at: now.toISOString() },
      { id: uid(), student_id: students[0].id, month: mk, amount: 600000, paid_on: today(), method: 'karta', note: '', created_at: now.toISOString() },
      { id: uid(), student_id: students[1].id, month: prev, amount: 600000, paid_on: prev + '-04', method: 'naqd', note: '', created_at: now.toISOString() },
      { id: uid(), student_id: students[1].id, month: mk, amount: 250000, paid_on: today(), method: 'naqd', note: 'qolgani keyin', created_at: now.toISOString() },
      { id: uid(), student_id: students[3].id, month: prev, amount: 450000, paid_on: prev + '-08', method: 'karta', note: '', created_at: now.toISOString() },
    ];
    LS.set('groups', [g1, g2]); LS.set('students', students); LS.set('payments', payments);
    LS.set('lessons', []); LS.set('attendance', []); LS.set('seeded', 1);
  },
  isAdmin: () => sessionStorage.getItem('mg_admin') === '1',
  async login(_e, pw) { if (pw !== CONFIG.localAdminPassword) throw new Error("Parol noto'g'ri"); sessionStorage.setItem('mg_admin', '1'); },
  async logout() { sessionStorage.removeItem('mg_admin'); },
  async list(t) { return LS.get(t, []); },
  async save(t, rec) {
    const all = LS.get(t, []), i = all.findIndex(x => x.id === rec.id);
    const r = { ...rec, id: rec.id || uid(), created_at: rec.created_at || new Date().toISOString() };
    if (i >= 0) all[i] = r; else all.push(r);
    LS.set(t, all); return r;
  },
  async saveMany(t, recs) {
    const all = LS.get(t, []), now = new Date().toISOString(), out = recs.map(r => ({ ...r, id: r.id || uid(), created_at: r.created_at || now }));
    LS.set(t, all.concat(out)); return out;
  },
  async remove(t, id) {
    LS.set(t, LS.get(t, []).filter(x => x.id !== id));
    if (t === 'students') { LS.set('attendance', LS.get('attendance', []).filter(x => x.student_id !== id)); LS.set('payments', LS.get('payments', []).filter(x => x.student_id !== id)); }
    if (t === 'groups') { LS.set('lessons', LS.get('lessons', []).filter(x => x.group_id !== id)); LS.set('students', LS.get('students', []).map(s => s.group_id === id ? { ...s, group_id: null } : s)); }
  },
  async saveAttendance(recs) {
    const all = LS.get('attendance', []);
    for (const r of recs) { const i = all.findIndex(x => x.student_id === r.student_id && x.day === r.day); if (i >= 0) Object.assign(all[i], r); else all.push({ id: uid(), ...r }); }
    LS.set('attendance', all);
  },
  async delAttendance(student_id, day) { LS.set('attendance', LS.get('attendance', []).filter(x => !(x.student_id === student_id && x.day === day))); },
  async saveLesson(rec) {
    const all = LS.get('lessons', []), i = all.findIndex(x => x.group_id === rec.group_id && x.day === rec.day);
    if (i >= 0) all[i] = { ...all[i], ...rec }; else all.push({ id: uid(), cancelled: false, topic: '', ...rec });
    LS.set('lessons', all);
  },
  async portal(code) {
    const s = LS.get('students', []).find(x => x.code === String(code).trim().toUpperCase() && x.active);
    if (!s) return null;
    const g = LS.get('groups', []).find(x => x.id === s.group_id);
    return {
      student: { id: s.id, name: s.name, joined: s.joined, price: s.price, freezes: s.freezes || [] },
      group: g ? { name: g.name, price: g.price, days: g.days, time: g.time, pay_day: g.pay_day } : null,
      attendance: LS.get('attendance', []).filter(a => a.student_id === s.id).sort((a, b) => b.day.localeCompare(a.day)),
      payments: LS.get('payments', []).filter(p => p.student_id === s.id).sort((a, b) => b.paid_on.localeCompare(a.paid_on)),
      lessons: LS.get('lessons', []).filter(l => l.group_id === s.group_id),
    };
  },
  exportAll() { return Object.fromEntries(TABLES.map(t => [t, LS.get(t, [])])); },
  async resetDemo() { for (const t of TABLES) LS.set(t, []); LS.set('seeded', ''); await this.init(); },
};

// ───────────── BULUT (Supabase) ─────────────
async function makeCloud() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  let session = (await sb.auth.getSession()).data.session;
  sb.auth.onAuthStateChange((_e, s) => { session = s; });
  const ok = async p => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
  const T = t => 'mg_' + t;
  return {
    mode: 'cloud',
    async init() {},
    isAdmin: () => !!session,
    async login(email, pw) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? "Email yoki parol noto'g'ri" : error.message);
      session = data.session;
    },
    async logout() { await sb.auth.signOut(); session = null; },
    async list(t) {
      // PostgREST sukut bo'yicha 1000 qator beradi: katta jadvallarni sahifalab olamiz
      const out = []; for (let from = 0; ; from += 1000) { const rows = await ok(sb.from(T(t)).select('*').range(from, from + 999)); out.push(...rows); if (rows.length < 1000) break; }
      return out;
    },
    async save(t, rec) { const r = { ...rec }; if (!r.id) delete r.id; return ok(sb.from(T(t)).upsert(r).select().single()); },
    async saveMany(t, recs) {
      const out = []; for (let i = 0; i < recs.length; i += 200) out.push(...await ok(sb.from(T(t)).insert(recs.slice(i, i + 200)).select()));
      return out;
    },
    async remove(t, id) { await ok(sb.from(T(t)).delete().eq('id', id)); },
    async saveAttendance(recs) { if (recs.length) await ok(sb.from('mg_attendance').upsert(recs, { onConflict: 'student_id,day' })); },
    async delAttendance(student_id, day) { await ok(sb.from('mg_attendance').delete().eq('student_id', student_id).eq('day', day)); },
    async saveLesson(rec) { await ok(sb.from('mg_lessons').upsert(rec, { onConflict: 'group_id,day' })); },
    async portal(code) { return ok(sb.rpc('mg_my_status', { c: String(code).trim() })); },
    exportAll: null,
  };
}

export const store = {};
export async function initStore() {
  let impl;
  if (cloudConfigured()) { try { impl = await makeCloud(); } catch (e) { console.warn('Supabase ulanmadi, DEMO rejimi:', e); impl = local; } } else impl = local;
  Object.assign(store, impl);
  await store.init();
  return store;
}
