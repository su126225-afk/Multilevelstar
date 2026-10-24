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

export function multilevelScore(correct, total) {
  const pts = total ? Math.round(correct / total * 75) : 0;
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
    return { n: q.n, q: q.text || '', ok, blank: a == null || String(a).trim() === '', your: show(q, a), right: show(q, q.answer, true) };
  });
  const total = flat.length;
  const percent = total ? Math.round(correct / total * 1000) / 10 : 0;
  let band, points, sub;
  if (test.format === 'multilevel') {
    const m = multilevelScore(correct, total);
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

// ═════════════════ progress, XP, streaks, achievements ═════════════════
// Everything below is derived from the stored results only (no extra storage), so it is
// deterministic: the same results always give the same XP, streak and badges, and a reward
// can never be granted twice. Repeat attempts and daily grinding are deliberately worth less.

const chronoOf = rs => rs.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
export const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const dayNum = key => { const [y, m, d] = key.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
const weekStart = now => { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d; };

export const XP = { perCorrect: 2, firstClear: 20, repeatClear: 5, repeatFactor: 0.25, good: 10, high: 25, dailyCap: 400 };

/** XP awarded to each result: [{id, xp, first}] in chronological order. */
export function xpTimeline(results) {
  const seen = new Set(), perDay = new Map();
  return chronoOf(results).map(r => {
    const first = !seen.has(r.test_id); seen.add(r.test_id);
    let xp = Math.round(Number(r.correct || 0) * XP.perCorrect * (first ? 1 : XP.repeatFactor))
      + (first ? XP.firstClear : XP.repeatClear) + (r.percent >= 80 ? XP.high : r.percent >= 60 ? XP.good : 0);
    const day = dayKey(r.created_at), used = perDay.get(day) || 0;
    xp = Math.max(0, Math.min(xp, XP.dailyCap - used));
    perDay.set(day, used + xp);
    return { id: r.id, xp, first };
  });
}

export const totalXp = results => xpTimeline(results).reduce((a, e) => a + e.xp, 0);

/** Level n starts at 50·(n-1)² XP. */
export function levelInfo(xp) {
  const level = Math.floor(Math.sqrt(xp / 50)) + 1;
  const floor = 50 * (level - 1) ** 2, next = 50 * level ** 2;
  return { level, xp, into: xp - floor, span: next - floor, pct: Math.round((xp - floor) / (next - floor) * 100) };
}

/** Consecutive practice days. One missed day inside a streak is forgiven (once per streak). */
export function streakInfo(results, now = new Date()) {
  const days = [...new Set(results.map(r => dayKey(r.created_at)))].map(dayNum).sort((a, b) => b - a);
  const chain = from => {
    let count = 1, forgiven = false;
    for (let i = from + 1; i < days.length; i++) {
      const gap = days[i - 1] - days[i];
      if (gap === 1) count++;
      else if (gap === 2 && !forgiven) { forgiven = true; count++; }
      else break;
    }
    return count;
  };
  if (!days.length) return { current: 0, longest: 0, doneToday: false };
  const today = dayNum(dayKey(now));
  let longest = 0;
  for (let i = 0; i < days.length; i++) longest = Math.max(longest, chain(i));
  const alive = days[0] >= today - 1;
  return { current: alive ? chain(0) : 0, longest, doneToday: days[0] === today };
}

const CHALLENGES = [
  { id: 'any', title: 'Complete any test today', hint: 'One full attempt keeps your streak alive.', test: r => true },
  { id: 'reading', title: 'Complete a Reading test today', hint: 'Pick a passage you have not tried yet.', test: r => r.section === 'reading' },
  { id: 'listening', title: 'Complete a Listening test today', hint: 'Headphones on — one recording, start to finish.', test: r => r.section === 'listening' },
  { id: 'score70', title: 'Score 70% or more today', hint: 'Slow down and check every answer.', test: r => Number(r.percent) >= 70 },
];
export function dailyChallenge(results, now = new Date()) {
  const key = dayKey(now);
  const c = CHALLENGES[dayNum(key) % CHALLENGES.length];
  const done = results.some(r => dayKey(r.created_at) === key && c.test(r));
  return { id: c.id, title: c.title, hint: c.hint, done, section: c.id === 'listening' ? 'listening' : 'reading' };
}

export const WEEKLY_GOAL = 5;
export function weekInfo(results, now = new Date()) {
  const start = weekStart(now);
  const count = results.filter(r => new Date(r.created_at) >= start).length;
  return { count, goal: WEEKLY_GOAL, done: count >= WEEKLY_GOAL };
}

export const ACHIEVEMENTS = [
  { id: 'first', title: 'First Test Completed', desc: 'Finish your first test.', icon: 'check' },
  { id: 'streak7', title: 'Seven-Day Streak', desc: 'Practise on 7 days in a row.', icon: 'fire' },
  { id: 'accuracy', title: 'Accuracy Master', desc: 'Score 85% or more three times.', icon: 'target' },
  { id: 'listening', title: 'Listening Specialist', desc: 'Complete 3 different Listening tests.', icon: 'headphones' },
  { id: 'reading', title: 'Reading Champion', desc: 'Complete 10 different Reading tests.', icon: 'book' },
  { id: 'best', title: 'Personal Best', desc: 'Beat your own best score.', icon: 'trophy' },
  { id: 'weekly', title: 'Weekly Goal Achieved', desc: `Complete ${WEEKLY_GOAL} tests in one week.`, icon: 'star' },
];

export function achievements(results, now = new Date()) {
  const rs = chronoOf(results);
  const distinct = sec => new Set(rs.filter(r => r.section === sec).map(r => r.test_id)).size;
  let best = -1, beat = false;
  rs.forEach((r, i) => { if (i > 0 && Number(r.percent) > best) beat = true; best = Math.max(best, Number(r.percent)); });
  const perWeek = new Map();
  rs.forEach(r => { const k = dayKey(weekStart(r.created_at)); perWeek.set(k, (perWeek.get(k) || 0) + 1); });
  const have = {
    first: Math.min(rs.length, 1),
    streak7: Math.min(streakInfo(rs, now).longest, 7),
    accuracy: Math.min(rs.filter(r => Number(r.percent) >= 85).length, 3),
    listening: Math.min(distinct('listening'), 3),
    reading: Math.min(distinct('reading'), 10),
    best: beat ? 1 : 0,
    weekly: Math.min(Math.max(0, ...perWeek.values()), WEEKLY_GOAL),
  };
  const target = { first: 1, streak7: 7, accuracy: 3, listening: 3, reading: 10, best: 1, weekly: WEEKLY_GOAL };
  return ACHIEVEMENTS.map(a => ({ ...a, have: have[a.id], target: target[a.id], earned: have[a.id] >= target[a.id] }));
}

/** Everything the home page and profile need, in one call. */
export function progressSummary(results, now = new Date()) {
  const rs = chronoOf(results);
  const xp = totalXp(rs);
  const best = rs.slice().sort((a, b) => b.percent - a.percent)[0] || null;
  return {
    attempts: rs.length,
    tests: new Set(rs.map(r => r.test_id)).size,
    avg: rs.length ? Math.round(rs.reduce((a, r) => a + Number(r.percent), 0) / rs.length * 10) / 10 : 0,
    best, xp, level: levelInfo(xp), streak: streakInfo(rs, now), week: weekInfo(rs, now),
    challenge: dailyChallenge(rs, now), achievements: achievements(rs, now),
  };
}

/** Per student: XP, level and improvement (last 3 attempts vs first 3, needs 4+ attempts). */
export function buildStudentStats(results, f = {}) {
  const rows = results.filter(r => (!f.section || r.section === f.section) && (!f.format || r.format === f.format)
    && (!f.testId || r.test_id === f.testId) && (!f.group || r.group_code === f.group) && (!f.since || new Date(r.created_at) >= f.since));
  const by = new Map();
  for (const r of rows) {
    const key = `${r.group_code}|${String(r.student_name).trim().toLowerCase()}`;
    if (!by.has(key)) by.set(key, { name: r.student_name, group: r.group_code, list: [] });
    by.get(key).list.push(r);
  }
  return [...by.values()].map(s => {
    const rs = chronoOf(s.list), avgOf = a => a.reduce((x, r) => x + Number(r.percent), 0) / a.length;
    const xp = totalXp(rs);
    const improvement = rs.length >= 4 ? Math.round((avgOf(rs.slice(-3)) - avgOf(rs.slice(0, 3))) * 10) / 10 : null;
    return { name: s.name, group: s.group, attempts: rs.length, xp, level: levelInfo(xp).level, improvement, avg: avgOf(rs) };
  });
}

// ---------- result analytics ----------
export const TYPE_LABEL = { mcq: 'Multiple choice', tfng: 'True / False / Not Given', ynng: 'Yes / No / Not Given', match: 'Matching', fill: 'Gap-fill' };

/** [{type,label,correct,total,pct}] for one graded attempt; `test` supplies each question's type. */
export function typeBreakdown(test, details) {
  const typeOf = new Map(prepare(test).flat.map(q => [q.n, q.type]));
  const acc = new Map();
  for (const d of details || []) {
    const t = typeOf.get(d.n); if (!t) continue;
    const a = acc.get(t) || { type: t, label: TYPE_LABEL[t] || t, correct: 0, total: 0 };
    a.total++; if (d.ok) a.correct++;
    acc.set(t, a);
  }
  return [...acc.values()].map(a => ({ ...a, pct: Math.round(a.correct / a.total * 100) })).sort((a, b) => a.pct - b.pct);
}

// ═════════════════ family portal: attendance, homework, payments ═════════════════
// Dates are plain 'YYYY-MM-DD' strings (no time zones involved). Everything here is pure and unit-tested.

export const ATTENDANCE = ['present', 'late', 'absent', 'excused'];
export const HOMEWORK = ['done', 'partial', 'missing', 'none'];

const pad = n => String(n).padStart(2, '0');
const parseDay = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const keyOf = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const addDays = (s, n) => keyOf(new Date(parseDay(s).getTime() + n * 864e5));
export const todayKey = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
/** Monday of the week that contains the given day. */
export const mondayOf = s => { const d = parseDay(s); return addDays(s, -((d.getUTCDay() + 6) % 7)); };
export const monthOf = s => String(s).slice(0, 7);
const pct = (a, b) => (b ? Math.round(a / b * 100) : null);

/** One student's lessons ({date, attendance, homework, ...}) -> numbers for a given week (Mon–Sun). */
export function weekReport(lessons, weekStart) {
  const end = addDays(weekStart, 6);
  const list = (lessons || []).filter(l => l.date >= weekStart && l.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  const c = { present: 0, late: 0, absent: 0, excused: 0 };
  const h = { done: 0, partial: 0, missing: 0 };
  for (const l of list) { c[l.attendance] = (c[l.attendance] || 0) + 1; if (h[l.homework] != null) h[l.homework]++; }
  const counted = list.length - c.excused;               // excused lessons are not held against the student
  const assigned = h.done + h.partial + h.missing;
  return {
    weekStart, weekEnd: end, lessons: list, total: list.length, ...c,
    attendedPct: pct(c.present + c.late, counted),         // present + late count as attended
    homework: { ...h, assigned }, homeworkPct: pct(h.done, assigned),   // only fully done counts as done
  };
}

/** Last n weeks (oldest first), for a small trend chart. */
export function weeklyTrend(lessons, now = new Date(), n = 8) {
  const thisWeek = mondayOf(todayKey(now));
  return Array.from({ length: n }, (_, i) => weekReport(lessons, addDays(thisWeek, -7 * (n - 1 - i))));
}

/** The most recent week that has lessons (so a family opening the page on Monday still sees something useful). */
export function latestWeekWithData(lessons, now = new Date()) {
  const last = (lessons || []).map(l => l.date).sort().pop();
  return last ? mondayOf(last) : mondayOf(todayKey(now));
}

export function paymentStatus(due, paid) {
  due = Number(due) || 0; paid = Number(paid) || 0;
  if (due <= 0 && paid <= 0) return 'none';
  if (paid >= due) return 'paid';
  return paid > 0 ? 'partial' : 'unpaid';
}
export const fmtMoney = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// ---------- personal numbers ----------
export const CODE_LEN = 12;
export const normalizeCode = s => String(s ?? '').replace(/\D/g, '');
export const formatCode = s => normalizeCode(s).replace(/(\d{4})(?=\d)/g, '$1-');
export const isValidCode = s => normalizeCode(s).length === CODE_LEN;
/** A random 12-digit number that is not in `taken`. `rnd(n)` must return n random bytes (defaults to Web Crypto). */
export function makeAccessCode(taken = new Set(), rnd = n => crypto.getRandomValues(new Uint8Array(n))) {
  for (let tries = 0; tries < 50; tries++) {
    let s = '';
    for (const b of rnd(CODE_LEN * 2)) { if (b < 250 && s.length < CODE_LEN) s += String(b % 10); }   // 250 = 25×10, no modulo bias
    if (s.length === CODE_LEN && !taken.has(s)) return s;
  }
  throw new Error('Could not generate a unique number');
}

// ---------- weekly message for parents (Uzbek) ----------
const UZ_DAY = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
export const uzShort = s => { const d = parseDay(s); return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}`; };
export const uzDay = s => UZ_DAY[parseDay(s).getUTCDay()];
const ATT_UZ = { present: 'keldi', late: 'kechikdi', absent: 'kelmadi', excused: 'sababli' };
const HW_UZ = { done: 'bajardi', partial: 'qisman', missing: 'bajarmadi', none: '—' };
const PAY_UZ = { paid: "to'langan", partial: "qisman to'langan", unpaid: "to'lanmagan", none: "ma'lumot yo'q" };
export const ATT_LABEL_UZ = ATT_UZ; export const HW_LABEL_UZ = HW_UZ; export const PAY_LABEL_UZ = PAY_UZ;

export function weeklyMessageUz({ name, report, payment, currency = "so'm", link = '', signature = '' }) {
  const r = report, out = ['Assalomu alaykum! 👋', `${name} uchun ${uzShort(r.weekStart)}–${uzShort(r.weekEnd)} haftalik hisobot:`, ''];
  const ATT_ICON = { present: '✅', late: '⏰', absent: '❌', excused: '🟦' }, HW_ICON = { done: '✅', partial: '🟡', missing: '❌' };
  if (!r.total) out.push('Bu hafta darslar belgilanmagan.', '');
  else {
    out.push('📚 Darslar:');
    for (const l of r.lessons) {
      out.push(`• ${uzShort(l.date)}, ${uzDay(l.date)} — ${ATT_ICON[l.attendance]} ${ATT_UZ[l.attendance]}${l.homework !== 'none' ? ` · uy vazifasi: ${HW_ICON[l.homework]} ${HW_UZ[l.homework]}` : ''}`);
      if (l.note) out.push(`  💬 ${l.note}`);
    }
    out.push('', `📊 Davomat: ${r.attendedPct == null ? '—' : r.attendedPct + '%'} (${r.present + r.late}/${r.total - r.excused})`);
    out.push(`📝 Uy vazifasi: ${r.homeworkPct == null ? '—' : r.homeworkPct + '%'} (${r.homework.done}/${r.homework.assigned})`);
  }
  if (payment) {
    const st = paymentStatus(payment.amount_due, payment.amount_paid);
    out.push(`💳 To'lov (${payment.period}): ${PAY_UZ[st]}${st === 'partial' ? ` — ${fmtMoney(payment.amount_paid)} / ${fmtMoney(payment.amount_due)} ${currency}` : ''}${st === 'unpaid' ? ` — ${fmtMoney(payment.amount_due)} ${currency}` : ''}`);
  }
  if (r.total && r.attendedPct === 100 && r.homeworkPct === 100) out.push('', 'Ajoyib natija, barakalla! 🎉');
  else if (r.total && r.homeworkPct != null && r.homeworkPct < 50) out.push('', "Uy vazifalariga e'tibor berishingizni iltimos qilamiz. Birgalikda natijani yaxshilaymiz! 💪");
  if (link) out.push('', `Batafsil ma'lumot: ${link}`);
  if (signature) out.push('', 'Hurmat bilan,', signature);
  return out.join('\n');
}

export const shiftMonth = (period, n) => { const [y, m] = String(period).split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };

/** The message the teacher sends once to a family with their personal number. */
export function inviteMessageUz({ name, code, link = '', brand = 'English with Usmonov', signature = '' }) {
  return ['Assalomu alaykum! 👋', `${name} uchun ${brand} platformasidagi shaxsiy raqam:`, '', `🔑 ${formatCode(code)}`, '',
    `Shu raqam bilan ${link ? 'quyidagi havola orqali ' : ''}farzandingizning davomati, uy vazifasi va to'lov holatini ko'rishingiz mumkin:`,
    ...(link ? [link] : []), '', "Iltimos, raqamni boshqa odamlarga bermang.",
    ...(signature ? ['', 'Hurmat bilan,', signature] : [])].join('\n');
}
