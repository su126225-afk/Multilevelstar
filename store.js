import { CONFIG } from './config.js';

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
  async deleteGroup(code) { LS.set('groups', LS.get('groups', []).filter(g => g.code !== code)); },
  async saveResult(r) {
    const rec = { ...r, id: uid(), created_at: new Date().toISOString() };
    const all = LS.get('results', []); all.push(rec); LS.set('results', all);
    return rec.id;
  },
  async listResults() { return LS.get('results', []).slice().sort(byNewest).map(({ details, ...r }) => r); },
  async getResult(id) { return LS.get('results', []).find(r => r.id === id) || null; },
  async deleteResult(id) { LS.set('results', LS.get('results', []).filter(r => r.id !== id)); },
  async listWritingTasks({ published } = {}) { const t = LS.get('wtasks', []).slice().sort(byNewest); return published ? t.filter(x => x.published) : t; },
  async getWritingTask(id) { return LS.get('wtasks', []).find(t => t.id === id) || null; },
  async saveWritingTask(t) {
    const all = LS.get('wtasks', []), i = all.findIndex(x => x.id === t.id);
    const rec = { ...t, created_at: t.created_at || new Date().toISOString() };
    if (i >= 0) all[i] = rec; else all.push(rec);
    LS.set('wtasks', all); return rec;
  },
  async deleteWritingTask(id) { LS.set('wtasks', LS.get('wtasks', []).filter(t => t.id !== id)); },
  async listVocabSets({ published } = {}) { const t = LS.get('vsets', []).slice().sort(byNewest); return published ? t.filter(x => x.published) : t; },
  async getVocabSet(id) { return LS.get('vsets', []).find(t => t.id === id) || null; },
  async saveVocabSet(t) {
    const all = LS.get('vsets', []), i = all.findIndex(x => x.id === t.id);
    const rec = { ...t, created_at: t.created_at || new Date().toISOString() };
    if (i >= 0) all[i] = rec; else all.push(rec);
    LS.set('vsets', all); return rec;
  },
  async deleteVocabSet(id) { LS.set('vsets', LS.get('vsets', []).filter(t => t.id !== id)); },
  async saveVocabResult(r) { const rec = { ...r, id: uid(), created_at: new Date().toISOString() }; const a = LS.get('vres', []); a.push(rec); LS.set('vres', a); return rec.id; },
  async listVocabResults() { return LS.get('vres', []).slice().sort(byNewest); },
  async deleteVocabResult(id) { LS.set('vres', LS.get('vres', []).filter(r => r.id !== id)); },
  aiAvailable: false,
  async checkWriting() { throw new Error('AI tekshiruv faqat Supabase ulanganda ishlaydi (README ga qarang).'); },
  async saveWriting(r) { const rec = { ...r, id: uid(), created_at: new Date().toISOString() }; const a = LS.get('wsubs', []); a.push(rec); LS.set('wsubs', a); return rec.id; },
  async myWritings(name, group) { return LS.get('wsubs', []).filter(w => w.student_name.toLowerCase() === name.toLowerCase() && w.group_code.toUpperCase() === group.toUpperCase()).sort(byNewest); },
  async listWritings() { return LS.get('wsubs', []).slice().sort(byNewest); },
  async deleteWriting(id) { LS.set('wsubs', LS.get('wsubs', []).filter(w => w.id !== id)); },
  async addActivity(name, group, secs) {
    const day = new Date().toISOString().slice(0, 10), a = LS.get('activity', []);
    const r = a.find(x => x.student_name === name && x.group_code === group && x.day === day);
    if (r) r.seconds += secs; else a.push({ student_name: name, group_code: group, day, seconds: secs });
    LS.set('activity', a);
  },
  async listActivity() { return LS.get('activity', []); },
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
    async listWritingTasks({ published } = {}) {
      let q = sb.from('writing_tasks').select('*').order('created_at', { ascending: false });
      if (published) q = q.eq('published', true);
      return ok(q);
    },
    async getWritingTask(id) { return ok(sb.from('writing_tasks').select('*').eq('id', id).maybeSingle()); },
    async saveWritingTask(t) { return ok(sb.from('writing_tasks').upsert(t).select().single()); },
    async deleteWritingTask(id) { await ok(sb.from('writing_tasks').delete().eq('id', id)); },
    async listVocabSets({ published } = {}) {
      let q = sb.from('vocab_sets').select('*').order('created_at', { ascending: false });
      if (published) q = q.eq('published', true);
      return ok(q);
    },
    async getVocabSet(id) { return ok(sb.from('vocab_sets').select('*').eq('id', id).maybeSingle()); },
    async saveVocabSet(t) { return ok(sb.from('vocab_sets').upsert(t).select().single()); },
    async deleteVocabSet(id) { await ok(sb.from('vocab_sets').delete().eq('id', id)); },
    async saveVocabResult(r) { return (await ok(sb.from('vocab_results').insert(r).select('id').single())).id; },
    async listVocabResults() { return ok(sb.from('vocab_results').select('*').order('created_at', { ascending: false }).limit(5000)); },
    async deleteVocabResult(id) { await ok(sb.from('vocab_results').delete().eq('id', id)); },
    aiAvailable: true,
    async checkWriting(payload) {
      const { data, error } = await sb.functions.invoke('check-writing', { body: payload });
      let msg = data?.error;
      if (error && !msg) { try { msg = (await error.context.json()).error; } catch { msg = error.message; } }
      if (msg || !data?.feedback) throw new Error(msg || 'AI check failed');
      return data.feedback;
    },
    async saveWriting(r) { return (await ok(sb.from('writing_submissions').insert(r).select('id').single())).id; },
    async myWritings(name, group) { return ok(sb.rpc('my_writings', { n: name, g: group })); },
    async listWritings() { return ok(sb.from('writing_submissions').select('*').order('created_at', { ascending: false }).limit(1000)); },
    async deleteWriting(id) { await ok(sb.from('writing_submissions').delete().eq('id', id)); },
    async addActivity(name, group, secs) { await sb.rpc('add_activity', { n: name, g: group, secs }); },
    async listActivity() { return ok(sb.from('activity').select('*').limit(20000)); },
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
