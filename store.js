import { CONFIG } from './config.js';
import { normalizeCode, addDays, todayKey } from './logic.js';

const LS = {
  get(k, d) { try { const v = localStorage.getItem('ma_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { localStorage.setItem('ma_' + k, JSON.stringify(v)); },
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + Math.random().toString(16).slice(2));
const byNewest = (a, b) => String(b.created_at).localeCompare(String(a.created_at));
const RESULT_LIST_COLS = 'id,test_id,test_title,section,format,student_name,group_code,correct,total,percent,band,points,time_sec,created_at';

export const cloudConfigured = () => !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);

// ───────────── DEMO (localStorage) ─────────────
const local = {
  mode: 'local',
  async init() {
    if (LS.get('seeded')) return;
    let tests = [];
    try { const r = await fetch('tests.json'); if (r.ok) tests = (await r.json()).tests || []; } catch { /* no bundle */ }
    const now = Date.now();
    LS.set('tests', tests.map((t, i) => ({ published: true, ...t, created_at: new Date(now - i * 1000).toISOString() })));
    LS.set('groups', [{ code: 'DEMO', name: 'Demo group' }]);
    LS.set('results', []);
    LS.set('seeded', 1);
  },
  isAdmin: () => sessionStorage.getItem('ma_admin') === '1',
  async adminLogin(_email, pw) {
    if (pw !== CONFIG.localAdminPassword) throw new Error('Wrong password');
    sessionStorage.setItem('ma_admin', '1');
  },
  async adminLogout() { sessionStorage.removeItem('ma_admin'); },
  async listTests({ published } = {}) {
    const t = LS.get('tests', []).slice().sort(byNewest);
    return published ? t.filter(x => x.published) : t;
  },
  async getTest(id) { return LS.get('tests', []).find(t => t.id === id) || null; },
  async saveTest(t) {
    const all = LS.get('tests', []);
    const i = all.findIndex(x => x.id === t.id);
    const rec = { ...t, created_at: t.created_at || new Date().toISOString() };
    if (i >= 0) all[i] = rec; else all.push(rec);
    LS.set('tests', all);
    return rec;
  },
  async saveTests(list) { for (const t of list) await this.saveTest(t); },
  async deleteTest(id) { LS.set('tests', LS.get('tests', []).filter(t => t.id !== id)); },
  async checkGroup(code) {
    const g = LS.get('groups', []).find(g => g.code.toUpperCase() === String(code).trim().toUpperCase());
    return g ? (g.name || g.code) : null;
  },
  async listGroups() { return LS.get('groups', []); },
  async saveGroup(g) {
    const all = LS.get('groups', []).filter(x => x.code !== g.code);
    all.push(g); LS.set('groups', all);
  },
  async deleteGroup(code) {
    if (LS.get('students', []).some(s => s.group_code === code)) throw new Error('This group still has students. Move or delete them first.');
    LS.set('groups', LS.get('groups', []).filter(g => g.code !== code));
    LS.set('lessons', LS.get('lessons', []).filter(l => l.group_code !== code));
  },
  async saveResult(r) {
    const rec = { ...r, id: uid(), created_at: new Date().toISOString() };
    const all = LS.get('results', []); all.push(rec); LS.set('results', all);
    return rec.id;
  },
  async listResults() { return LS.get('results', []).slice().sort(byNewest).map(({ details, ...r }) => r); },
  async getResult(id) { return LS.get('results', []).find(r => r.id === id) || null; },
  async deleteResult(id) { LS.set('results', LS.get('results', []).filter(r => r.id !== id)); },
  // ── family portal (demo mode keeps everything in this browser) ──
  async listStudents() { return LS.get('students', []).slice().sort((a, b) => a.group_code.localeCompare(b.group_code) || a.full_name.localeCompare(b.full_name)); },
  async saveStudents(list) {
    const all = LS.get('students', []), groups = LS.get('groups', []);
    for (const s of list) {
      if (!groups.some(g => g.code === s.group_code)) throw new Error('Unknown group');
      if (all.some(x => x.access_code === s.access_code && x.id !== s.id)) throw new Error('This personal number is already used');
      const i = all.findIndex(x => x.id === s.id);
      const rec = { parent_name: '', active: true, created_at: new Date().toISOString(), ...(i >= 0 ? all[i] : {}), ...s };
      if (i >= 0) all[i] = rec; else all.push(rec);
    }
    LS.set('students', all);
  },
  async deleteStudent(id) {
    LS.set('students', LS.get('students', []).filter(s => s.id !== id));
    LS.set('records', LS.get('records', []).filter(r => r.student_id !== id));
    LS.set('payments', LS.get('payments', []).filter(p => p.student_id !== id));
  },
  async getLesson(group, date) {
    const lesson = LS.get('lessons', []).find(l => l.group_code === group && l.lesson_date === date);
    return lesson ? { lesson, records: LS.get('records', []).filter(r => r.lesson_id === lesson.id) } : null;
  },
  async saveLesson(lesson, records) {
    const lessons = LS.get('lessons', []);
    let l = lessons.find(x => x.group_code === lesson.group_code && x.lesson_date === lesson.lesson_date);
    if (!l) { l = { id: uid(), created_at: new Date().toISOString() }; lessons.push(l); }
    Object.assign(l, { group_code: lesson.group_code, lesson_date: lesson.lesson_date, topic: lesson.topic || '', homework: lesson.homework || '' });
    LS.set('lessons', lessons);
    const mine = new Set(records.map(r => r.student_id));
    LS.set('records', LS.get('records', []).filter(r => !(r.lesson_id === l.id && mine.has(r.student_id))).concat(records.map(r => ({ note: '', ...r, lesson_id: l.id }))));
    return l;
  },
  async listLessons(group, from, to) {
    const recs = LS.get('records', []);
    return LS.get('lessons', []).filter(l => (!group || l.group_code === group) && l.lesson_date >= from && l.lesson_date <= to)
      .sort((a, b) => a.lesson_date.localeCompare(b.lesson_date)).map(l => ({ ...l, lesson_records: recs.filter(r => r.lesson_id === l.id) }));
  },
  async listPayments(period) { return LS.get('payments', []).filter(p => p.period === period); },
  async savePayment(p) {
    const all = LS.get('payments', []), i = all.findIndex(x => x.student_id === p.student_id && x.period === p.period);
    const rec = { id: uid(), note: '', paid_on: null, ...(i >= 0 ? all[i] : {}), ...p };
    if (i >= 0) all[i] = rec; else all.push(rec);
    LS.set('payments', all); return rec;
  },
  async portalReport(code) {
    const c = normalizeCode(code);
    const s = c && LS.get('students', []).find(x => x.access_code === c && x.active !== false);
    if (!s) return null;
    const lessons = LS.get('lessons', []), since = addDays(todayKey(), -200);
    return {
      student: { name: s.full_name, group: s.group_code },
      lessons: LS.get('records', []).filter(r => r.student_id === s.id).map(r => ({ r, l: lessons.find(x => x.id === r.lesson_id) }))
        .filter(x => x.l && x.l.lesson_date >= since).sort((a, b) => b.l.lesson_date.localeCompare(a.l.lesson_date))
        .map(({ r, l }) => ({ date: l.lesson_date, topic: l.topic || '', task: l.homework || '', attendance: r.attendance, homework: r.homework, note: r.note || '' })),
      payments: LS.get('payments', []).filter(p => p.student_id === s.id).sort((a, b) => b.period.localeCompare(a.period))
        .map(p => ({ period: p.period, due: p.amount_due, paid: p.amount_paid, paid_on: p.paid_on || null, note: p.note || '' })),
    };
  },
  async uploadFile() { throw new Error('Fayl yuklash faqat Supabase ulanganda ishlaydi. Hozircha fayl manzilini (URL) kiriting.'); },
  canUpload: false,
};

// ───────────── CLOUD (Supabase) ─────────────
async function makeCloud() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  let session = (await sb.auth.getSession()).data.session;
  sb.auth.onAuthStateChange((_e, s) => { session = s; });
  const ok = async p => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
  return {
    mode: 'cloud',
    async init() {},
    isAdmin: () => !!session,
    async adminLogin(email, pw) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
      if (error) throw new Error(error.message);
      session = data.session;
    },
    async adminLogout() { await sb.auth.signOut(); session = null; },
    async listTests({ published } = {}) {
      let q = sb.from('tests').select('*').order('created_at', { ascending: false });
      if (published) q = q.eq('published', true);
      return ok(q);
    },
    async getTest(id) { return ok(sb.from('tests').select('*').eq('id', id).maybeSingle()); },
    async saveTest(t) { return ok(sb.from('tests').upsert(t).select().single()); },
    async saveTests(list) { await ok(sb.from('tests').upsert(list)); },
    async deleteTest(id) { await ok(sb.from('tests').delete().eq('id', id)); },
    async checkGroup(code) { return ok(sb.rpc('check_group', { c: String(code).trim() })); },
    async listGroups() { return ok(sb.from('groups').select('code,name').order('code')); },
    async saveGroup(g) { await ok(sb.from('groups').upsert(g)); },
    async deleteGroup(code) { await ok(sb.from('groups').delete().eq('code', code)); },
    async saveResult(r) { return (await ok(sb.from('results').insert(r).select('id').single())).id; },
    async listResults() { return ok(sb.from('results').select(RESULT_LIST_COLS).order('created_at', { ascending: false }).limit(3000)); },
    async getResult(id) { return ok(sb.from('results').select('*').eq('id', id).maybeSingle()); },
    async deleteResult(id) { await ok(sb.from('results').delete().eq('id', id)); },
    // ── family portal ──
    async listStudents() { return ok(sb.from('students').select('*').order('group_code').order('full_name')); },
    async saveStudents(list) { await ok(sb.from('students').upsert(list)); },
    async deleteStudent(id) { await ok(sb.from('students').delete().eq('id', id)); },
    async getLesson(group, date) {
      const l = await ok(sb.from('lessons').select('*, lesson_records(*)').eq('group_code', group).eq('lesson_date', date).maybeSingle());
      if (!l) return null;
      const { lesson_records, ...lesson } = l;
      return { lesson, records: lesson_records || [] };
    },
    async saveLesson(lesson, records) {
      const row = { group_code: lesson.group_code, lesson_date: lesson.lesson_date, topic: lesson.topic || '', homework: lesson.homework || '' };
      const saved = await ok(sb.from('lessons').upsert(row, { onConflict: 'group_code,lesson_date' }).select().single());
      if (records.length) await ok(sb.from('lesson_records').upsert(records.map(r => ({ note: '', ...r, lesson_id: saved.id }))));
      return saved;
    },
    async listLessons(group, from, to) {
      let q = sb.from('lessons').select('*, lesson_records(*)').gte('lesson_date', from).lte('lesson_date', to).order('lesson_date');
      if (group) q = q.eq('group_code', group);
      return ok(q);
    },
    async listPayments(period) { return ok(sb.from('payments').select('*').eq('period', period)); },
    async savePayment(p) { return ok(sb.from('payments').upsert(p, { onConflict: 'student_id,period' }).select().single()); },
    async portalReport(code) {
      const { data, error } = await sb.rpc('portal_report', { c: String(code ?? '') });
      if (error) throw new Error(/too_many_attempts/.test(error.message) ? 'too_many_attempts' : error.message);
      return data;
    },
    async uploadFile(file) {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}.${ext}`;
      const { error } = await sb.storage.from('audio').upload(path, file, { contentType: file.type || undefined });
      if (error) throw new Error(error.message);
      return sb.storage.from('audio').getPublicUrl(path).data.publicUrl;
    },
    canUpload: true,
  };
}

export let store = local;
export async function initStore() {
  if (cloudConfigured()) store = await makeCloud();
  await store.init();
  return store;
}
