// Vocabulary Marathon — pure logic (no DOM): build a random attempt, grade it, rank students.

export const vnorm = s => String(s || '').trim().toLowerCase().replace(/[‘’']/g, "'").replace(/\s+/g, ' ');

export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** One random attempt: MC (English → Uzbek) + open (Uzbek → type English).
 *  A word listed twice is used once. Words sharing one Uzbek meaning are synonyms:
 *  any of them is accepted in open questions, and MC never shows two options with the same meaning. */
export function buildAttempt(set, rnd = Math.random) {
  const mcN = set.mc_count || 25, openN = set.open_count || 15;
  const seen = new Set(), words = [];
  for (const w of set.words || []) { const k = vnorm(w.word); if (k && !seen.has(k)) { seen.add(k); words.push(w); } }
  const syn = w => words.filter(x => vnorm(x.meaning) === vnorm(w.meaning)).map(x => x.word);
  const order = shuffle(words.map((_, i) => i), rnd);
  const mcIdx = order.slice(0, mcN);
  const openIdx = [], usedOpen = new Set();
  for (const i of order.slice(mcN)) {
    const k = vnorm(words[i].meaning);
    if (openIdx.length < openN && !usedOpen.has(k)) { usedOpen.add(k); openIdx.push(i); }
  }
  const mc = mcIdx.map(i => {
    const w = words[i], used = new Set([vnorm(w.meaning)]), dis = [];
    for (const d of shuffle(words, rnd)) { const k = vnorm(d.meaning); if (dis.length < 3 && !used.has(k)) { used.add(k); dis.push(d.meaning); } }
    const options = shuffle([w.meaning, ...dis], rnd);
    return { word: w.word, topic: w.topic, options, correct: options.indexOf(w.meaning) };
  });
  const open = openIdx.map(i => ({ meaning: words[i].meaning, topic: words[i].topic, answer: words[i].word, accept: syn(words[i]) }));
  return { mc: shuffle(mc, rnd), open: shuffle(open, rnd) };
}

export const isOpenCorrect = (o, given) => {
  const g = vnorm(given);
  return !!g && (o.accept?.length ? o.accept : [o.answer]).some(a => vnorm(a) === g);
};

export function gradeAttempt(att, answers) {
  const mc = att.mc.reduce((n, q, i) => n + (answers.mc[i] === q.correct ? 1 : 0), 0);
  const open = att.open.reduce((n, o, i) => n + (isOpenCorrect(o, answers.open[i]) ? 1 : 0), 0);
  const total = att.mc.length + att.open.length;
  return { mc, open, score: mc + open, total, percent: total ? Math.round((mc + open) / total * 1000) / 10 : 0 };
}

/** Marathon ranking. Each student's BEST attempt of every exam counts; points = sum of those bests.
 *  Tie-break: higher average %, then less total time. */
export function marathonBoard(results, { setId = '', group = '', since = null } = {}) {
  const m = new Map();
  for (const r of results) {
    if (setId && r.set_id !== setId) continue;
    if (group && r.group_code !== group) continue;
    if (since && new Date(r.created_at) < since) continue;
    const key = r.group_code + '|' + r.student_name.trim().toLowerCase();
    const s = m.get(key) || { name: r.student_name, group: r.group_code, best: new Map(), attempts: 0 };
    s.attempts++;
    const b = s.best.get(r.set_id);
    if (!b || r.score > b.score || (r.score === b.score && r.time_sec < b.time_sec)) s.best.set(r.set_id, r);
    m.set(key, s);
  }
  return [...m.values()].map(s => {
    const bests = [...s.best.values()];
    const points = bests.reduce((a, r) => a + Number(r.score), 0);
    const maxp = bests.reduce((a, r) => a + Number(r.total), 0);
    return { name: s.name, group: s.group, exams: bests.length, attempts: s.attempts, points, avg: maxp ? Math.round(points / maxp * 1000) / 10 : 0,
      time: bests.reduce((a, r) => a + (r.time_sec || 0), 0), top: bests.slice().sort((a, b) => b.score - a.score)[0] };
  }).sort((a, b) => b.points - a.points || b.avg - a.avg || a.time - b.time);
}
