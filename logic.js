// Pure logic: no DOM, no network. Everything here is unit-tested in tests/logic.test.mjs

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

/** Tiny rich-text: blank line = paragraph, "# " heading, "## " label, **bold**, "- " bullet. */
export function rich(text) {
  const blocks = String(text || '').replace(/\r/g, '').split(/\n{2,}/);
  return blocks.map(b => {
    b = b.trim();
    if (!b) return '';
    if (b.startsWith('## ')) return `<h4 class="plabel">${inline(b.slice(3))}</h4>`;
    if (b.startsWith('# ')) return `<h3>${inline(b.slice(2))}</h3>`;
    if (/^- /.test(b)) return `<ul>${b.split('\n').map(l => `<li>${inline(l.replace(/^- /, ''))}</li>`).join('')}</ul>`;
    return `<p>${inline(b).replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

/** rich() and then swap {{n}} markers for whatever renderGap(n) returns. */
export function richGaps(text, renderGap) {
  return rich(text).replace(/\{\{(\d+)\}\}/g, (_, n) => renderGap(Number(n)));
}

// ---------- option + question text format ----------
const TF = { TRUE: 'True', T: 'True', FALSE: 'False', F: 'False', 'NOT GIVEN': 'Not Given', NG: 'Not Given' };
const YN = { YES: 'Yes', Y: 'Yes', NO: 'No', N: 'No', 'NOT GIVEN': 'Not Given', NG: 'Not Given' };

function parseOptionToken(o, k) {
  const m = o.match(/^([A-Za-z]|[ivxIVX]{2,5}|\d{1,2})\)\s*(.*)$/) || o.match(/^([A-Za-z])\.\s+(.*)$/);
  return m ? { label: m[1], text: m[2].trim() } : { label: String.fromCharCode(65 + k), text: o };
}

/** "A) text" per line (or separated by |) -> [{label,text}] */
export function parseOptions(text) {
  return String(text || '').split(/\n|\|/).map(s => s.trim()).filter(Boolean).map(parseOptionToken);
}
export function serializeOptions(opts) {
  return (opts || []).map(o => `${o.label}) ${o.text}`.trimEnd()).join('\n');
}

/**
 * One question per line:  text :: options-or-type :: answer
 *   Choose :: A) one | B) two | C) three :: B
 *   Statement :: TFNG :: True        (or YNNG)
 *   Heading for paragraph 1 :: MATCH :: C   (choices come from the shared option list)
 *   The cat is ___ :: GAP :: black / dark
 *   The cat is ___ :: black            (2 fields = gap shortcut)
 */
export function parseBlock(text, shared = []) {
  const questions = [], errors = [];
  String(text || '').split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const ln = i + 1;
    const f = line.split('::').map(s => s.trim());
    if (f.length < 2 || (!f[0] && f.length < 3)) return errors.push(`Line ${ln}: use  question :: options or type :: answer`);
    if (f.length === 2) {
      if (!f[1]) return errors.push(`Line ${ln}: the answer is empty`);
      return questions.push({ type: 'fill', text: f[0], answer: f[1] });
    }
    const [t, spec, ans] = f;
    const u = spec.toUpperCase();
    if (!ans) return errors.push(`Line ${ln}: the answer is empty`);
    if (u === 'TFNG' || u === 'YNNG') {
      const a = (u === 'TFNG' ? TF : YN)[ans.toUpperCase()];
      if (!a) return errors.push(`Line ${ln}: answer must be ${u === 'TFNG' ? 'True / False / Not Given' : 'Yes / No / Not Given'}`);
      return questions.push({ type: u.toLowerCase(), text: t, answer: a });
    }
    if (u === 'GAP') return questions.push({ type: 'fill', text: t, answer: ans });
    if (u === 'MATCH') {
      if (!shared.length) return errors.push(`Line ${ln}: MATCH needs a shared option list (fill the "Options" box of this part or group)`);
      const hit = shared.find(o => o.label.toLowerCase() === ans.toLowerCase());
      if (!hit) return errors.push(`Line ${ln}: "${ans}" is not one of the option letters`);
      return questions.push({ type: 'match', text: t, answer: hit.label });
    }
    const options = spec.split('|').map(s => s.trim()).filter(Boolean).map(parseOptionToken);
    if (options.length < 2) return errors.push(`Line ${ln}: need at least 2 options separated by |`);
    const hit = options.find(o => o.label.toLowerCase() === ans.toLowerCase());
    if (!hit) return errors.push(`Line ${ln}: answer "${ans}" is not one of the option letters`);
    questions.push({ type: 'mcq', text: t, options, answer: hit.label });
  });
  return { questions, errors };
}

export function serializeBlock(questions) {
  return (questions || []).map(q => {
    if (q.type === 'fill') return `${q.text} :: GAP :: ${q.answer}`;
    if (q.type === 'tfng') return `${q.text} :: TFNG :: ${q.answer}`;
    if (q.type === 'ynng') return `${q.text} :: YNNG :: ${q.answer}`;
    if (q.type === 'match') return `${q.text} :: MATCH :: ${q.answer}`;
    return `${q.text} :: ${q.options.map(o => `${o.label}) ${o.text}`).join(' | ')} :: ${q.answer}`;
  }).join('\n');
}

// ---------- numbering ----------
const GAP_RE = /\[\[(.+?)\]\]/g;

/**
 * Walks a test, numbers every question (including [[inline gaps]]) and returns
 * { parts, flat } ready for rendering and grading. Does not mutate the input.
 */
export function prepare(test) {
  let n = 0;
  const flat = [];
  const gapify = (txt, pi) => String(txt || '').replace(GAP_RE, (_, ans) => {
    n++;
    flat.push({ n, pi, type: 'fill', inline: true, text: '', answer: ans.trim() });
    return `{{${n}}}`;
  });
  const parts = (test.data?.parts || []).map((p, pi) => {
    const first = n + 1;
    const text = gapify(p.text, pi);
    const blocks = (p.blocks || []).map(b => {
      const from = n + 1;
      const body = gapify(b.body, pi);
      const choices = b.options?.length ? b.options : (p.options || []);
      const qs = (b.questions || []).map(q => {
        n++;
        const o = { ...q, n, pi, choices: q.type === 'match' ? choices : undefined };
        flat.push(o);
        return o;
      });
      return { ...b, body, qs, from, to: n };
    });
    return { ...p, pi, text, blocks, from: first, to: n };
  });
  return { parts, flat };
}

// ---------- grading ----------
export const norm = s => String(s ?? '').toLowerCase().replace(/[£$.,!?'’"]/g, '').replace(/\s+/g, ' ').trim();

export function isCorrect(q, a) {
  if (a == null || String(a).trim() === '') return false;
  if (q.type === 'fill') return String(q.answer).split('/').some(x => norm(x) === norm(a));
  return norm(q.answer) === norm(a);
}

function show(q, a, key) {
  if (a == null || String(a).trim() === '') return '';
  if (q.type === 'mcq') {
    const o = (q.options || []).find(o => o.label.toLowerCase() === String(a).toLowerCase());
    return o ? `${o.label}) ${o.text}` : String(a);
  }
  if (q.type === 'fill' && key) return String(a).split('/').map(s => s.trim()).join(' / ');
  return String(a);
}

const BAND_R = [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [2, 2], [1, 1]];
const BAND_L = [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [11, 4], [8, 3.5], [6, 3], [4, 2.5], [2, 2], [1, 1]];

export function ieltsBand(section, correct, total) {
  if (!total) return 0;
  const raw = Math.round(correct / total * 40);
  for (const [m, b] of (section === 'listening' ? BAND_L : BAND_R)) if (raw >= m) return b;
  return 0;
}

// Official Multilevel conversion table: number of correct answers (of 35) → score out of 75.
const ML_L = [0, 23, 26, 28, 30, 33, 34, 36, 38, 39, 41, 42, 44, 45, 47, 48, 50, 51, 53, 54, 55, 57, 58, 60, 61, 63, 65, 66, 68, 70, 72, 73, 74, 75, 75, 75];
const ML_R = [0, 20, 24, 27, 29, 32, 34, 36, 38, 39, 41, 42, 44, 45, 47, 48, 49, 51, 52, 54, 55, 57, 58, 60, 61, 63, 65, 66, 68, 70, 72, 73, 74, 75, 75, 75];
export function multilevelScore(correct, total, section = 'reading') {
  // the table is for 35 questions; a test with another length is scaled to 35 first
  const raw = total ? Math.min(35, Math.max(0, total === 35 ? correct : Math.round(correct / total * 35))) : 0;
  const pts = (section === 'listening' ? ML_L : ML_R)[raw];
  const level = pts >= 65 ? 'C1' : pts >= 51 ? 'B2' : pts >= 38 ? 'B1' : 'Below B1';
  return { pts, level };
}

export function grade(test, answers) {
  const { flat } = prepare(test);
  let correct = 0;
  const details = flat.map(q => {
    const a = answers[q.n];
    const ok = isCorrect(q, a);
    if (ok) correct++;
    return { n: q.n, type: q.type, q: q.text || '', ok, blank: a == null || String(a).trim() === '', your: show(q, a), right: show(q, q.answer, true) };
  });
  const total = flat.length;
  const percent = total ? Math.round(correct / total * 1000) / 10 : 0;
  let band, points, sub;
  if (test.format === 'multilevel') {
    const m = multilevelScore(correct, total, test.section);
    band = m.level; points = m.pts; sub = `${m.pts} / 75`;
  } else {
    const b = ieltsBand(test.section, correct, total);
    band = b.toFixed(1); points = b; sub = 'Band';
  }
  return { correct, total, percent, band, points, sub, details };
}

// ---------- leaderboard ----------
export function buildBoard(results, f = {}) {
  const rows = results.filter(r =>
    (!f.section || r.section === f.section) && (!f.format || r.format === f.format) &&
    (!f.testId || r.test_id === f.testId) && (!f.group || r.group_code === f.group) &&
    (!f.since || new Date(r.created_at) >= f.since));
  const by = new Map();
  for (const r of rows) {
    const key = `${r.group_code}|${String(r.student_name).trim().toLowerCase()}`;
    let s = by.get(key);
    if (!s) by.set(key, s = { name: r.student_name, group: r.group_code, tests: new Map(), attempts: 0 });
    s.attempts++;
    const cur = s.tests.get(r.test_id);
    if (!cur || r.percent > cur.percent || (r.percent === cur.percent && r.time_sec < cur.time_sec)) s.tests.set(r.test_id, r);
  }
  const out = [...by.values()].map(s => {
    const best = [...s.tests.values()];
    const avg = best.reduce((a, r) => a + Number(r.percent), 0) / best.length;
    const time = best.reduce((a, r) => a + (r.time_sec || 0), 0);
    const top = best.slice().sort((a, b) => b.percent - a.percent)[0];
    return { name: s.name, group: s.group, tests: best.length, attempts: s.attempts, avg, time, top };
  });
  out.sort((a, b) => b.avg - a.avg || b.tests - a.tests || a.time - b.time);
  return out;
}

// ---------- misc ----------
export const fmtTime = sec => {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
};
export const fmtDate = d => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
export const fmtDateTime = d => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** "1:05" or "65" or "1:02:03" -> seconds; '' -> null */
export function parseTime(v) {
  v = String(v ?? '').trim();
  if (!v) return null;
  const p = v.split(':').map(Number);
  if (p.some(isNaN)) return null;
  return p.reduce((a, x) => a * 60 + x, 0);
}

export function testMeta(test) {
  const { parts, flat } = prepare(test);
  return { q: flat.length, parts };
}

export function setPath(obj, path, val) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = val;
}

export const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

// ---------- progress: XP, levels, streak, achievements ----------
export const xpFor = r => 20 + Math.round(Number(r.percent) || 0);
export const levelStart = n => 75 * n * (n - 1) / 2;            // level 1 starts at 0 XP, 2 at 75, 3 at 225, 4 at 450 …
export function levelOf(xp) { let n = 1; while (levelStart(n + 1) <= xp) n++; return { level: n, into: xp - levelStart(n), span: levelStart(n + 1) - levelStart(n), toNext: levelStart(n + 1) - xp }; }
const dayKey = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
export function gamify(mine, now = new Date()) {
  const rs = mine.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const xp = rs.reduce((a, r) => a + xpFor(r), 0), lv = levelOf(xp);
  const days = new Set(rs.map(r => dayKey(r.created_at)));
  const step = d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  let streak = 0, d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(dayKey(d))) d = step(d);
  while (days.has(dayKey(d))) { streak++; d = step(d); }
  let bestStreak = 0, run = 0, prev = null;
  for (const k of [...days].sort()) { const t = new Date(k + 'T00:00:00'); run = prev && Math.round((t - prev) / 864e5) === 1 ? run + 1 : 1; bestStreak = Math.max(bestStreak, run); prev = t; }
  const weekAgo = now.getTime() - 7 * 864e5;
  const week = rs.filter(r => new Date(r.created_at).getTime() >= weekAgo).length;
  const uniq = sec => new Set(rs.filter(r => r.section === sec).map(r => r.test_id)).size;
  let pb = 0, beat = false; for (const r of rs) { if (pb && r.percent > pb) beat = true; pb = Math.max(pb, r.percent); }
  const hi = rs.filter(r => r.percent >= 85).length;
  const A = (id, title, text, have, need, done) => ({ id, title, text, have: Math.min(have, need), need, done: done ?? have >= need });
  return { xp, ...lv, streak, bestStreak, today: days.has(dayKey(now)), week, best: pb, count: rs.length,
    achievements: [
      A('first', 'First Test Completed', 'Finish your first test.', rs.length, 1),
      A('streak7', 'Seven-Day Streak', 'Practise on 7 days in a row.', bestStreak, 7),
      A('acc', 'Accuracy Master', 'Score 85% or more three times.', hi, 3),
      A('listen', 'Listening Specialist', 'Complete 3 different Listening tests.', uniq('listening'), 3),
      A('read', 'Reading Champion', 'Complete 10 different Reading tests.', uniq('reading'), 10),
      A('pb', 'Personal Best', 'Beat your own best score.', beat ? 1 : 0, 1),
      A('week', 'Weekly Goal Achieved', 'Complete 5 tests in one week.', week, 5),
    ] };
}
export const TYPE_NAMES = { fill: 'Gap-fill', mcq: 'Multiple choice', tfng: 'True / False / Not Given', ynng: 'Yes / No / Not Given', match: 'Matching' };
export function typeStats(details) {
  const m = new Map();
  for (const d of details || []) { if (!d.type) continue; const r = m.get(d.type) || { type: d.type, name: TYPE_NAMES[d.type] || d.type, ok: 0, total: 0 }; r.total++; if (d.ok) r.ok++; m.set(d.type, r); }
  return [...m.values()].map(r => ({ ...r, pct: Math.round(r.ok / r.total * 100) }));
}


// ---------- writing: inline error annotation ----------
/** Splits `text` into plain and marked segments using the AI's corrections ({original, better, why, type}). */
export function annotate(text, corrections) {
  const marks = [];
  let cursor = 0;
  const free = (i, e) => !marks.some(m => i < m.e && e > m.s);
  for (const c of corrections || []) {
    const o = String(c.original || '').trim();
    if (!o) continue;
    let i = text.indexOf(o, cursor);
    if (i < 0) { i = text.toLowerCase().indexOf(o.toLowerCase()); }
    if (i < 0 || !free(i, i + o.length)) continue;
    marks.push({ s: i, e: i + o.length, c });
    cursor = i + o.length;
  }
  marks.sort((a, b) => a.s - b.s);
  const segs = []; let p = 0;
  for (const m of marks) {
    if (m.s > p) segs.push({ t: text.slice(p, m.s) });
    segs.push({ t: text.slice(m.s, m.e), c: m.c });
    p = m.e;
  }
  if (p < text.length) segs.push({ t: text.slice(p) });
  return segs;
}
