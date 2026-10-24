import { store } from './store.js';
import { CONFIG } from './config.js';
import { esc, rich, richGaps, prepare, grade, buildBoard, gamify, levelOf, xpFor, typeStats, fmtTime, fmtDate, fmtDateTime, testMeta } from './logic.js';
import { mySeconds, fmtHours } from './activity.js';
import { feedbackHTML, KINDS } from './views-writing.js';
import { settingsButton, applyPrefs, getSplit, saveSplit, getVSplit, saveVSplit } from './prefs.js';
import * as HL from './highlight.js';
import { $, $$, actions, inputs, toast, icon, lineChart, go, S, requireStudent, confirmBox, initials } from './ui.js';

const loading = root => { root.innerHTML = '<div class="loading">Loading…</div>'; };
const notFound = (msg = 'Not found') => `<div class="wrap page"><div class="empty">${esc(msg)}<br><br><a class="btn" href="#/">Back home</a></div></div>`;
const sameStudent = r => S.student && r.group_code === S.student.group && String(r.student_name).trim().toLowerCase() === S.student.name.trim().toLowerCase();
const myResults = rs => rs.filter(sameStudent);
const fmtLabel = t => t.format === 'multilevel' ? 'Multilevel' : 'IELTS';
const metaCache = new Map();
const meta = t => { const k = t.id + (t.created_at || ''); if (!metaCache.has(k)) metaCache.set(k, testMeta(t)); return metaCache.get(k); };
const secIcon = s => s === 'listening' ? 'headphones' : 'book';
const isRecentRes = r => String(r.test_title || '').startsWith('Recent Real');
const isRecentTest = t => !!t.data?.recent;
// PDFs live in the site root; tolerate older paths saved in the database (recent-pdf/…, recent-…)
const pdfUrl = u => String(u || '').split('/').pop().replace(/^recent-(?=\d{4}-)/, '');

// "Recent Real": tests that appeared in the latest real exams, grouped by exam date and shift.
const parseDM = s => { const [d, m, y] = String(s).split('.').map(Number); return new Date(y, m - 1, d).getTime() || 0; };
function recentGroups(tests, wtasks) {
  const g = new Map();
  const slot = (label, shift) => { const k = label + '|' + shift; if (!g.has(k)) g.set(k, { label, shift, parts: [], writing: [] }); return g.get(k); };
  for (const t of tests) if (isRecentTest(t)) slot(t.data.recent.label, t.data.recent.shift).parts.push(t);
  for (const w of wtasks) { const m = /^Recent Real (\d\d\.\d\d\.\d{4}) · (\d)-smena/.exec(w.title || ''); if (m) slot(m[1], Number(m[2])).writing.push(w); }
  return [...g.values()].sort((a, b) => parseDM(b.label) - parseDM(a.label) || a.shift - b.shift);
}
const taskName = w => String(w.title).replace(/^Recent Real [\d.]+ · \d-smena · /, '');
function recentCard(x, best) {
  const sec = k => x.parts.filter(t => t.section === k).sort((a, b) => a.data.recent.part - b.data.recent.part);
  const pdf = t => t.data.pdf ? `<a class="chip sm" href="${esc(pdfUrl(t.data.pdf))}" download="${esc(pdfUrl(t.data.pdf))}" title="Download PDF with answers">PDF</a>` : '';
  const chips = list => list.map(t => {
    const b = best?.get(t.id), n = t.data.recent.part;
    if (t.data.audioPending && !t.data.audio_url) return `<span class="pgrp"><span class="chip" style="opacity:.75" title="Audio coming soon">Part ${n}</span>${pdf(t)}</span>`;
    return `<span class="pgrp"><a class="chip ${b ? 'on' : ''}" href="#/test/${t.id}">Part ${n}${b ? ` · ${esc(b.band)}` : ''}</a>${pdf(t)}</span>`;
  }).join('');
  const wpdf = x.parts.filter(t => t.section === 'writing').map(pdf).join('');
  const row = (ic, name, inner) => inner ? `<div class="rrsec"><span class="rrname">${icon(ic, 15)} ${name}</span><div class="tabs">${inner}</div></div>` : '';
  return `<div class="tcard rrcard">
    <div class="row between"><span class="badge multi">Multilevel</span><span class="badge">${esc(x.shift)}-smena</span></div>
    <div><h3>${esc(x.label)}</h3><div class="tmeta">real exam · ${esc(x.shift)}-smena</div></div>
    ${row('headphones', 'Listening', chips(sec('listening')))}
    ${row('book', 'Reading', chips(sec('reading')))}
    ${row('edit', 'Writing', x.writing.map(w => `<a class="chip" href="#/writing/${w.id}">${esc(taskName(w))}</a>`).join('') + wpdf)}
  </div>`;
}
export async function recent(root) {
  loading(root);
  const [tests, results, wt] = await Promise.all([store.listTests({ published: true }), store.listResults().catch(() => []), store.listWritingTasks({ published: true }).catch(() => [])]);
  const best = new Map();
  for (const r of myResults(results)) { const c = best.get(r.test_id); if (!c || r.percent > c.percent) best.set(r.test_id, r); }
  const groups = recentGroups(tests, wt);
  root.innerHTML = `<div class="wrap page">
    <h1 class="ptitle">Recent Real</h1>
    <p class="muted">Tasks from the latest real Multilevel exams, collected by date and shift. Choose a part, work on it online, and download it as a PDF if you want to print it.</p>
    <div class="tgrid mt">${groups.length ? groups.map(x => recentCard(x, best)).join('') : '<div class="empty" style="grid-column:1/-1">New exam materials will appear here soon.</div>'}</div>
  </div>`;
}

// ═════════════════════ HOME ═════════════════════
export async function home(root) {
  loading(root);
  const [allTests, allResults, wtasks] = await Promise.all([store.listTests({ published: true }), store.listResults(), store.listWritingTasks({ published: true }).catch(() => [])]);
  const tests = allTests.filter(t => !isRecentTest(t)), results = allResults.filter(r => !isRecentRes(r));
  const rgroups = recentGroups(allTests, wtasks).slice(0, 3);
  const mine = myResults(results).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const board = buildBoard(results).slice(0, 5);
  const best = mine.slice().sort((a, b) => b.percent - a.percent)[0];
  const pts = mine.slice(-12).map(r => ({ y: Number(r.percent) }));
  const demo = [{ y: 38 }, { y: 46 }, { y: 52 }, { y: 61 }, { y: 70 }, { y: 83 }];
  const students = new Set(results.map(r => r.group_code + '|' + String(r.student_name).toLowerCase())).size;
  const st = S.student, G = gamify(mine);
  const recent = mine.slice().reverse().slice(0, 4);
  const first = st ? esc(st.name.split(' ')[0]) : '';
  const ach = G.achievements;
  root.innerHTML = `
  <div class="wrap">
    <section class="hero">
      <div>
        <span class="eyebrow2">${icon('spark', 14)} ${st ? `Welcome back, <b>${first}</b>` : 'Computer-delivered format'}</span>
        <h1 class="h1">Your next level<br>starts <span class="grad-text">here.</span></h1>
        <p class="sub">Practise full Multilevel and IELTS Reading &amp; Listening tests on the screen you will sit the real thing on. Every result is saved, scored and ranked.</p>
        <div class="ctas">
          <a class="btn primary lg" href="#/practice/reading">${icon('book', 18)} Start a Mock Test</a>
          <a class="btn lg" href="#/practice/${recent[0]?.section || 'listening'}">${icon('play', 16)} Continue Practising</a>
        </div>
        <div class="herostats">
          <div><b>${tests.length}</b><span>full tests</span></div>
          <div><b>${students}</b><span>students ranked</span></div>
          <div><b>${results.length}</b><span>attempts saved</span></div>
        </div>
      </div>
      <div class="pcard">
        <div class="row between"><div class="lab">Your progress</div><span class="lvlpill">${icon('spark', 13)} Level ${G.level}</span></div>
        <div class="xpbar"><i style="width:${Math.round(G.into / G.span * 100)}%"></i></div>
        <div class="row between xpnote"><span>${G.xp} XP</span><span>${G.toNext} XP to Level ${G.level + 1}</span></div>
        <div class="bignum">${best ? esc(best.band) : '—'}<small>${best ? (best.format === 'multilevel' ? 'Multilevel' : 'IELTS') : 'Sign in to track'}</small></div>
        ${lineChart(pts.length ? pts : demo, { ticks: [0, 50, 100], fmt: v => v + '%' })}
        <div class="mini4">
          <div><b>${G.count}</b><span>Tests completed</span></div>
          <div><b>${G.count ? Math.round(mine.reduce((a, r) => a + Number(r.percent), 0) / G.count) : 0}%</b><span>Average accuracy</span></div>
          <div><b>${best ? Math.round(best.percent) + '%' : '—'}</b><span>Personal best</span></div>
          <div><b>${icon('spark', 16)} ${G.streak}</b><span>Day streak</span></div>
        </div>
        <div class="foot">${pts.length ? 'The line redraws every time you submit a test. Bands and levels are estimates, not official results.' : 'Your progress chart starts with your first test.'}</div>
      </div>
    </section>

    <section class="section">${coursesCard()}</section>

    ${rgroups.length ? `<section class="section">
      <div class="row between"><div><h2 class="stitle">Recent Real</h2><p class="ssub">Tasks from the latest real exams — practise them online or download as PDF.</p></div><a class="btn sm" href="#/recent">All exams</a></div>
      <div class="tgrid">${rgroups.map(x => recentCard(x)).join('')}</div>
    </section>` : ''}

    <section class="section">
      <h2 class="stitle">The whole exam. One section at a time.</h2>
      <p class="ssub">Reading, Listening, Speaking — a full test or a single part, exactly as you will see it.</p>
      <div class="grid4">
        <a class="feature" href="#/practice/reading"><div class="ic">${icon('book', 24)}</div><h3>Reading</h3><p>Passages with gap-fill, matching headings and True / False / Not Given. ${tests.filter(t => t.section === 'reading').length} tests.</p><span class="go">Practice ${icon('arrow', 16)}</span></a>
        <a class="feature cy" href="#/practice/listening"><div class="ic">${icon('headphones', 24)}</div><h3>Listening</h3><p>One continuous recording, with reading and checking time between parts. ${tests.filter(t => t.section === 'listening').length} tests.</p><span class="go">Practice ${icon('arrow', 16)}</span></a>
        <a class="feature pk" href="#/writing"><div class="ic">${icon('edit', 24)}</div><h3>Writing</h3><p>Write Task 1, Task 2 or Multilevel answers and get instant AI feedback.</p><span class="go">Write ${icon('arrow', 16)}</span></a>
        <a class="feature gd" href="#/leaderboard"><div class="ic">${icon('trophy', 24)}</div><h3>Leaderboard</h3><p>See who is on top in your group and across the academy.</p><span class="go">Open ${icon('arrow', 16)}</span></a>
      </div>
    </section>

    <section class="duo">
      <div>
        <div class="panel daily">
          <div class="row between"><div><div class="lab2">Daily challenge</div><h3>Complete any test today</h3><p class="muted">One full attempt keeps your streak alive.</p></div>
            <span class="tick ${G.today ? 'on' : ''}">${icon(G.today ? 'check' : 'clock', 20)}</span></div>
          <div class="row between wk"><span class="muted">This week</span><b>${Math.min(G.week, 5)} / 5 tests</b></div>
          <div class="meter"><i style="width:${Math.min(100, G.week / 5 * 100)}%"></i></div>
          <div class="row" style="gap:8px;flex-wrap:wrap">${G.today ? `<span class="badge ok">${icon('check', 12)} Done for today</span>` : '<span class="badge draft">Not done yet</span>'}<span class="badge">${G.streak}-day streak · best ${G.bestStreak}</span></div>
        </div>
        <div class="panel mt2"><div class="row between"><div class="lab2">Recent results</div><a class="btn sm" href="#/me">All results</a></div>
          <div class="recent mt">${recent.length ? recent.map(r => `<a class="rrow" href="#/result/${r.id}"><div><b>${esc(r.test_title)}</b><small>${fmtDateTime(r.created_at)} · ${fmtTime(r.time_sec)}</small></div><div class="r"><b>${esc(r.band)}</b><small>${r.correct} / ${r.total} · ${Math.round(r.percent)}%</small></div></a>`).join('') : '<div class="muted">No attempts yet. Your results will appear here.</div>'}</div></div>
      </div>
      <div class="panel"><div class="row between"><div class="lab2">Achievements</div><span class="badge">${ach.filter(a => a.done).length} / ${ach.length}</span></div>
        <div class="achgrid mt">${ach.map(a => `<div class="ach ${a.done ? 'done' : ''}"><span class="aic">${icon(a.done ? 'check' : 'clock', 16)}</span><b>${a.title}</b><small>${a.text}</small><div class="meter sm"><i style="width:${Math.round(a.have / a.need * 100)}%"></i></div></div>`).join('')}</div></div>
    </section>

    <section class="section" style="padding-top:40px">
      <div class="row between" style="margin-bottom:16px"><h2 class="ptitle" style="font-size:26px">Top students</h2><a class="btn sm" href="#/leaderboard">Full leaderboard</a></div>
      ${board.length ? boardTable(board, { compact: true }) : '<div class="empty">No results yet. Be the first on the board!</div>'}
    </section>
  </div>`;
}

// ═════════════════════ PRACTICE (test list) ═════════════════════
const pf = { section: 'reading', format: '', status: '', q: '' };
export async function practice(root, section) {
  if (pf.section !== section) Object.assign(pf, { section, format: '', status: '', q: '' });
  loading(root);
  const [tests, results] = await Promise.all([store.listTests({ published: true }), store.listResults()]);
  const mine = myResults(results);
  const bestBy = new Map();
  for (const r of mine) { const c = bestBy.get(r.test_id); if (!c || r.percent > c.percent) bestBy.set(r.test_id, r); }
  const all = tests.filter(t => t.section === section && !isRecentTest(t));
  root.innerHTML = `
  <div class="wrap page">
    <div class="tabs" style="margin-bottom:26px">
      <a class="chip ${section === 'listening' ? 'on' : ''}" href="#/practice/listening">${icon('headphones', 16)} Listening</a>
      <a class="chip ${section === 'reading' ? 'on' : ''}" href="#/practice/reading">${icon('book', 16)} Reading</a>
      <a class="chip" href="#/speaking">${icon('mic', 16)} Speaking</a>
    </div>
    <div class="panel row between wrapx" style="margin-bottom:6px">
      <div class="row"><div class="feature" style="min-height:0;padding:0;border:0;background:none"><div class="ic" style="width:54px;height:54px">${icon(secIcon(section), 26)}</div></div>
        <div><h1 class="ptitle">${section === 'reading' ? 'Reading' : 'Listening'}</h1><div class="muted">Exam-style tests with an instant score · ${all.length} tests</div></div></div>
    </div>
    <div class="filters">
      <input class="inp" id="pq" placeholder="Search by test name" value="${esc(pf.q)}" data-in="pfilter" data-k="q">
      <div class="tabs" id="fmtChips"></div>
      <div class="tabs" id="stChips" style="margin-left:auto"></div>
    </div>
    <div class="tgrid" id="tgrid"></div>
  </div>`;
  const draw = () => {
    $('#fmtChips').innerHTML = [['', 'All'], ['multilevel', 'Multilevel'], ['ielts', 'IELTS']].map(([v, l]) => `<button class="chip ${pf.format === v ? 'on' : ''}" data-act="pfilter" data-k="format" data-v="${v}">${l}</button>`).join('');
    $('#stChips').innerHTML = [['', 'All'], ['todo', 'Not solved'], ['done', 'Solved']].map(([v, l]) => `<button class="chip ${pf.status === v ? 'on' : ''}" data-act="pfilter" data-k="status" data-v="${v}">${l}</button>`).join('');
    const list = all.filter(t => (!pf.format || t.format === pf.format) && (!pf.q || t.title.toLowerCase().includes(pf.q.toLowerCase()))
      && (!pf.status || (pf.status === 'done') === bestBy.has(t.id)));
    $('#tgrid').innerHTML = list.length ? list.map(t => testCard(t, bestBy.get(t.id))).join('') : '<div class="empty" style="grid-column:1/-1">No tests found.</div>';
  };
  practice.draw = draw; draw();
}
function testCard(t, best) {
  const m = meta(t);
  const parts = m.parts.slice(0, 5).map(p => `<span><b>Part ${p.pi + 1}:</b> ${esc(p.title || '')}</span>`).join('');
  return `<div class="tcard">
    <div class="row between"><span class="badge ${t.format === 'multilevel' ? 'multi' : 'ielts'}">${fmtLabel(t)}</span>
      <span class="row" style="gap:8px">${!t.published ? '<span class="badge draft">Draft</span>' : ''}${best ? `<span class="badge ok">${icon('check', 12)} ${esc(best.band)}</span>` : ''}</span></div>
    <div><h3>${esc(t.title)}</h3>
      <div class="tmeta">${icon(secIcon(t.section), 14)} ${m.q} questions <span>·</span> ${icon('clock', 14)} ${t.duration_min} min</div></div>
    <div class="tparts">${parts}</div>
    <a class="btn primary" href="#/test/${t.id}">${best ? 'Try again' : 'Start'} ${icon('arrow', 18)}</a>
  </div>`;
}
actions.pfilter = el => { pf[el.dataset.k] = el.dataset.v; practice.draw(); };
inputs.pfilter = el => { pf.q = el.value; practice.draw(); };

// ═════════════════════ SPEAKING (placeholder) ═════════════════════
export function speaking(root) {
  root.innerHTML = `<div class="wrap page"><div class="intro center">
    <div class="feature pk" style="min-height:0;border:0;background:none;align-items:center"><div class="ic" style="width:84px;height:84px;border-radius:26px">${icon('mic', 38)}</div></div>
    <h1 class="ptitle mt">Speaking is coming soon</h1>
    <p class="muted mt">Topic cards, timed answers and voice recording will be added in the next update. Meanwhile, keep practising Reading and Listening.</p>
    <div class="ctas" style="justify-content:center"><a class="btn primary" href="#/practice/reading">Reading</a><a class="btn" href="#/practice/listening">Listening</a></div>
  </div></div>`;
}

// ═════════════════════ LEADERBOARD ═════════════════════
const lf = { section: '', format: '', testId: '', group: '', period: '' };
function boardTable(rows, { compact = false, single = false, me = true } = {}) {
  const body = rows.map((r, i) => {
    const rk = `<span class="rk ${i < 3 ? 'g' + (i + 1) : ''}">${i + 1}</span>`;
    const isMe = me && S.student && r.group === S.student.group && r.name.trim().toLowerCase() === S.student.name.trim().toLowerCase();
    return `<tr class="${isMe ? 'me' : ''}"><td>${rk}</td><td><b>${esc(r.name)}</b>${isMe ? ' <span class="badge ok">You</span>' : ''}</td><td class="muted">${esc(r.group)}</td>
      ${single ? `<td>${r.top.correct} / ${r.top.total}</td><td><b>${esc(r.top.band)}</b></td><td class="r muted">${fmtTime(r.top.time_sec)}</td>`
        : `<td>${r.tests}</td><td><b>${Math.round(r.avg * 10) / 10}%</b></td><td><b>${esc(r.top.band)}</b></td>${compact ? '' : `<td class="r muted">${fmtTime(r.time)}</td>`}`}</tr>`;
  }).join('');
  const head = single ? '<th>#</th><th>Student</th><th>Group</th><th>Score</th><th>Band / Level</th><th class="r">Time</th>'
    : `<th>#</th><th>Student</th><th>Group</th><th>Tests</th><th>Average</th><th>Best</th>${compact ? '' : '<th class="r">Total time</th>'}`;
  return `<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function activeBoard(acts) {
  const m = new Map();
  for (const a of acts) { const k = a.group_code + '|' + a.student_name.toLowerCase(); const r = m.get(k) || { name: a.student_name, group: a.group_code, s: 0 }; r.s += a.seconds; m.set(k, r); }
  const top = [...m.values()].sort((a, b) => b.s - a.s).slice(0, 10);
  if (!top.length) return '';
  return `<h2 class="ptitle mt2" style="font-size:24px">Most active students</h2><p class="muted">Total time spent on the site.</p><div class="tablewrap mt"><table><thead><tr><th>#</th><th>Student</th><th>Group</th><th class="r">Time</th></tr></thead><tbody>${top.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.group)}</td><td class="r"><b>${fmtHours(r.s)}</b></td></tr>`).join('')}</tbody></table></div>`;
}
export async function leaderboard(root) {
  loading(root);
  const [tests0, results0, acts] = await Promise.all([store.listTests({ published: true }), store.listResults(), store.listActivity().catch(() => [])]);
  const tests = tests0.filter(t => !isRecentTest(t)), results = results0.filter(r => !isRecentRes(r));
  const groups = [...new Set(results.map(r => r.group_code))].sort();
  root.innerHTML = `<div class="wrap page">
    <h1 class="ptitle">Leaderboard</h1><p class="muted">Each student's best attempt of every test counts. Ranked by average score.</p>
    <div class="filters">
      <select class="sel" data-in="lf" data-k="section"><option value="">All sections</option><option value="reading">Reading</option><option value="listening">Listening</option></select>
      <select class="sel" data-in="lf" data-k="format"><option value="">All formats</option><option value="multilevel">Multilevel</option><option value="ielts">IELTS</option></select>
      <select class="sel" data-in="lf" data-k="testId" id="lfTest"></select>
      <select class="sel" data-in="lf" data-k="group"><option value="">All groups</option>${groups.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('')}</select>
      <select class="sel" data-in="lf" data-k="period"><option value="">All time</option><option value="week">This week</option><option value="today">Today</option></select>
    </div><div id="lbBody"></div>${activeBoard(acts)}</div>`;
  const sync = () => { $$('select[data-in=lf]').forEach(s => { s.value = lf[s.dataset.k]; }); };
  const draw = () => {
    const sel = $('#lfTest');
    const opts = tests.filter(t => (!lf.section || t.section === lf.section) && (!lf.format || t.format === lf.format));
    if (lf.testId && !opts.some(t => t.id === lf.testId)) lf.testId = '';
    sel.innerHTML = '<option value="">All tests</option>' + opts.map(t => `<option value="${t.id}">${esc(t.title)}</option>`).join('');
    sync();
    const since = lf.period === 'today' ? new Date(new Date().setHours(0, 0, 0, 0)) : lf.period === 'week' ? new Date(Date.now() - 7 * 864e5) : null;
    const rows = buildBoard(results, { ...lf, since });
    const top = rows.slice(0, 3);
    const pod = top.length === 3 ? `<div class="podium">${[1, 0, 2].map(i => { const r = top[i]; return `<div class="pod ${i === 0 ? 'p1' : ''}"><span class="rk g${i + 1}">${i + 1}</span><b>${esc(r.name)}</b><span>${esc(r.group)}</span><div class="sc">${lf.testId ? esc(r.top.band) : Math.round(r.avg) + '%'}</div></div>`; }).join('')}</div>` : '';
    $('#lbBody').innerHTML = rows.length ? pod + boardTable(rows, { single: !!lf.testId }) : '<div class="empty">No results for these filters yet.</div>';
  };
  leaderboard.draw = draw; draw();
}
inputs.lf = el => { lf[el.dataset.k] = el.value; leaderboard.draw(); };

// ═════════════════════ MY RESULTS ═════════════════════
export async function me(root) {
  if (!S.student) { const s = await requireStudent(); if (!s) return go('#/'); }
  loading(root);
  const [results, act, writings] = await Promise.all([store.listResults(), mySeconds(S.student), store.myWritings(S.student.name, S.student.group).catch(() => [])]);
  const mine = myResults(results);
  const chrono = mine.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const avg = mine.length ? Math.round(mine.reduce((a, r) => a + Number(r.percent), 0) / mine.length * 10) / 10 : 0;
  const best = mine.slice().sort((a, b) => b.percent - a.percent)[0];
  const st = S.student;
  root.innerHTML = `<div class="wrap page">
    <div class="row between wrapx"><div class="row"><span class="studentchip" style="padding:8px 16px 8px 8px"><span class="av" style="width:42px;height:42px;font-size:15px">${esc(initials(st.name))}</span><span><b>${esc(st.name)}</b><br><small class="muted">Group ${esc(st.group)}</small></span></span></div>
      <button class="btn sm" data-act="logoutStudent">${icon('logout', 16)} Switch student</button></div>
    <div class="kv" style="margin-top:22px"><div><b>${mine.length}</b><span>attempts</span></div><div><b>${avg}%</b><span>average score</span></div><div><b>${best ? esc(best.band) : '—'}</b><span>best result</span></div><div><b>${fmtHours(act.total)}</b><span>time on site</span></div></div>
    ${(() => { const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10); return { d, m: Math.round((act.byDay[d] || 0) / 60) }; }); const mx = Math.max(30, ...days.map(x => x.m)); return `<div class="panel mt2"><div class="lab muted" style="font-size:12px;letter-spacing:.1em;font-weight:700;margin-bottom:10px">MINUTES PER DAY · LAST 14 DAYS</div><div class="bars">${days.map(x => `<div class="bar" title="${x.d}: ${x.m} min"><i style="height:${Math.max(2, x.m / mx * 100)}%"></i><small>${x.d.slice(8)}</small></div>`).join('')}</div></div>`; })()}
    ${chrono.length ? `<div class="panel mt2"><div class="lab muted" style="font-size:12px;letter-spacing:.1em;font-weight:700;margin-bottom:8px">SCORE OVER TIME</div>${lineChart(chrono.slice(-20).map(r => ({ y: Number(r.percent) })), { fmt: v => v + '%' })}</div>` : ''}
    <h2 class="ptitle mt2" style="font-size:24px">History</h2>
    <div class="mt">${mine.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Test</th><th>Score</th><th>Band / Level</th><th>Time</th><th></th></tr></thead><tbody>
      ${mine.map(r => `<tr><td class="muted">${fmtDateTime(r.created_at)}</td><td><b>${esc(r.test_title)}</b></td><td>${r.correct} / ${r.total} (${r.percent}%)</td><td><b>${esc(r.band)}</b></td><td class="muted">${fmtTime(r.time_sec)}</td><td class="r"><a class="btn sm" href="#/result/${r.id}">Review</a></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">You have not taken any test yet.</div>'}</div>
    <h2 class="ptitle mt2" style="font-size:24px">Writing</h2><div class="mt">${writings.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Task</th><th>Type</th><th>Words</th><th>AI score</th><th></th></tr></thead><tbody>${writings.map(w => `<tr><td class="muted">${fmtDateTime(w.created_at)}</td><td><b>${esc(w.task_title)}</b></td><td>${KINDS[w.kind] || ''}</td><td>${w.words}</td><td><b>${esc(w.band)}</b></td><td class="r"><button class="btn sm" data-act="wView" data-id="${w.id}">Open</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No writing checked yet. <a href="#/writing">Try one</a>.</div>'}</div></div>`;
}
actions.logoutStudent = () => { S.student = null; go('#/'); };

// ═════════════════════ TEST INTRO ═════════════════════
export async function testIntro(root, id) {
  loading(root);
  const t = await store.getTest(id);
  if (!t) { root.innerHTML = notFound('This test was not found.'); return; }
  const m = meta(t);
  const listening = t.section === 'listening';
  const timed = listening && t.data?.audio_url;
  root.innerHTML = `<div class="wrap page"><div class="intro">
    <a class="muted" href="${isRecentTest(t) ? '#/recent' : '#/practice/' + t.section}">← Back to ${isRecentTest(t) ? 'Recent Real' : t.section}</a>
    <div class="row mt"><span class="badge ${t.format === 'multilevel' ? 'multi' : 'ielts'}">${fmtLabel(t)}</span><span class="badge">${t.section === 'listening' ? 'Listening' : 'Reading'}</span></div>
    <h1 class="ptitle mt" style="font-size:40px">${esc(t.title)}</h1>
    <div class="kv"><div><b>${m.parts.length}</b><span>parts</span></div><div><b>${m.q}</b><span>questions</span></div><div><b>${t.duration_min} min</b><span>${timed ? 'recording length' : 'time limit'}</span></div></div>
    <div class="panel"><b>Before you start</b><ul>
      ${listening ? `<li>Use headphones and check your volume.</li>${timed ? '<li>The recording plays straight through, like the real exam. It cannot be paused or rewound.</li><li>You get time to read the questions before each part and time to check your answers after it. The next part opens by itself.</li><li>Your result appears automatically when the recording ends.</li>' : '<li>Press play on each part when you are ready.</li>'}`
        : `<li>You have ${t.duration_min} minutes. The test is submitted automatically when time runs out.</li><li>Move between parts with the tabs at the bottom.</li>${t.data?.glossary ? '<li>Double-click any word in a passage to see its Uzbek translation.</li>' : ''}`}
      <li>Your answers are saved to the leaderboard as <b>${S.student ? esc(S.student.name) : 'you'}</b>${S.student ? ` (${esc(S.student.group)})` : ''}.</li></ul></div>
    <div class="ctas"><button class="btn primary lg" data-act="beginTest" data-id="${t.id}">${icon('play', 18)} Start test</button>${t.data?.pdf ? `<a class="btn lg" href="${esc(pdfUrl(t.data.pdf))}" download="${esc(pdfUrl(t.data.pdf))}">${icon('arrow', 16)} Download PDF</a>` : ''}</div>
  </div></div>`;
}
actions.beginTest = async el => { const s = await requireStudent(); if (s) go('#/run/' + el.dataset.id); };

// ═════════════════════ RUNNER ═════════════════════
let RUN = null;

function gapHTML(n, a) {
  return `<span class="gapwrap" id="q${n}"><b class="gnum">${n}</b><input class="gap" data-in="ans" data-n="${n}" value="${esc(a ?? '')}" maxlength="60" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Question ${n}"></span>`;
}
function qHTML(q, a) {
  const n = q.n; let body = '';
  const stem = q.text ? `<div class="qt">${esc(q.text)}</div>` : '';
  if (q.type === 'mcq') {
    body = stem + `<div class="opts">${q.options.map(o => `<label class="opt"><input type="radio" name="q${n}" value="${esc(o.label)}" data-in="ans" data-n="${n}" ${a === o.label ? 'checked' : ''}><span class="lab">${esc(o.label)}</span><span>${esc(o.text)}</span></label>`).join('')}</div>`;
  } else if (q.type === 'tfng' || q.type === 'ynng') {
    const vals = q.type === 'tfng' ? ['True', 'False', 'Not Given'] : ['Yes', 'No', 'Not Given'];
    body = stem + `<div class="seg">${vals.map(v => `<label class="opt"><input type="radio" name="q${n}" value="${v}" data-in="ans" data-n="${n}" ${a === v ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>`;
  } else if (q.type === 'match') {
    body = stem + `<select class="sel" data-in="ans" data-n="${n}" style="max-width:220px"><option value="">Choose…</option>${(q.choices || []).map(o => `<option value="${esc(o.label)}" ${a === o.label ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  } else {
    const parts = String(q.text).split('___');
    body = parts.length > 1 ? `<div class="qt">${esc(parts[0])}<input class="gap" data-in="ans" data-n="${n}" value="${esc(a ?? '')}" maxlength="60" autocomplete="off" spellcheck="false">${esc(parts.slice(1).join('___'))}</div>`
      : stem + `<input class="gap" style="margin:0;width:260px" data-in="ans" data-n="${n}" value="${esc(a ?? '')}" maxlength="60" autocomplete="off" spellcheck="false">`;
  }
  return `<div class="q" id="q${n}"><div class="qn">${n}</div><div class="qb">${body}</div></div>`;
}
const optionList = (title, opts) => {
  const shown = (opts || []).filter(o => o.text);
  return shown.length ? `<div class="optref"><div class="ref-title">${esc(title || 'Options')}</div>${shown.map(o => `<div class="opt-line"><b>${esc(o.label)}</b><span>${esc(o.text)}</span></div>`).join('')}</div>` : '';
};

export async function runTest(root, id) {
  loading(root);
  const test = await store.getTest(id);
  if (!test) { root.innerHTML = notFound('This test was not found.'); return; }
  if (!S.student) { const s = await requireStudent(); if (!s) return go('#/test/' + id); }
  const prep = prepare(test);
  if (!prep.flat.length) { root.innerHTML = notFound('This test has no questions yet.'); return; }
  const listening = test.section === 'listening';
  const globalAudio = listening && !!test.data?.audio_url;
  const key = 'ma_run_' + id;
  let saved = null; try { saved = JSON.parse(sessionStorage.getItem(key)); } catch { /* none */ }
  const st = { test, prep, listening, globalAudio, answers: saved?.answers || {}, part: Math.min(saved?.part || 0, prep.parts.length - 1), start: listening ? null : (saved?.start || Date.now()), done: false, auto: -1, mobileLeft: false, hl: saved?.hl || {} };
  RUN = st;
  const persist = () => sessionStorage.setItem(key, JSON.stringify({ answers: st.answers, start: st.start, part: st.part, hl: st.hl }));
  st.persist = persist;
  const total = test.duration_min * 60;
  document.body.classList.add('running');
  window.onbeforeunload = () => (st.done ? undefined : 'Your test is in progress.');

  root.innerHTML = `<div class="runner">
    <div class="run-top"><button class="icon-btn" data-act="exitTest" title="Exit test">${icon('x', 18)}</button><button class="icon-btn" data-act="exitHome" title="Home">${icon('home', 18)}</button><h2>${esc(test.title)}</h2>
      <div class="timer" id="timer">${icon('clock', 18)}<span id="tv">${listening ? '0:00' : fmtTime(total)}</span></div>
      <a class="icon-btn" href="${CONFIG.telegramUrl}" target="_blank" rel="noopener" title="${esc(CONFIG.telegramChannel)}">${icon('send', 18)}</a>
      <a class="btn sm coursebtn" href="${CONFIG.telegramPersonalUrl}" target="_blank" rel="noopener" title="${esc(CONFIG.coursesTitle)} — ${esc(CONFIG.telegramPersonal)}">${icon('user', 15)}<span>${esc(CONFIG.coursesTitle)}</span></a>
      ${settingsButton({ audio: listening })}<button class="btn primary" data-act="submitTest">Submit</button></div>
    ${globalAudio ? `<div class="audiobar"><button class="btn sm primary" id="abtn" data-act="audioToggle">${icon('play', 16)} Start recording</button>
        <div class="astatus" id="astatus">Press start when your headphones are ready</div><div class="aprog"><i id="aprog"></i></div><span class="atime" id="atime">0:00</span></div>` : ''}
    <div class="paneswitch"><button class="chip on" data-act="paneTab" data-v="q">Questions</button><button class="chip" data-act="paneTab" data-v="l">Material</button></div>
    <div class="run-main" id="rmain"></div>
    <div class="run-foot" id="rfoot"></div>
    ${globalAudio ? `<audio id="aud" preload="auto" src="${esc(test.data.audio_url)}"></audio>` : ''}
  </div>`;

  drawPart(); drawFoot(); applyPrefs();
  if (globalAudio) setupAudio(st);
  clearInterval(st.tm);
  st.tm = setInterval(() => tick(st, total), 250);
  S.cleanup = () => { clearInterval(st.tm); window.onbeforeunload = null; document.body.classList.remove('running'); $('#aud')?.pause(); $('#gloss')?.remove(); $('#hlpop')?.remove(); RUN = null; };
}

function tick(st, total) {
  if (st.done) return;
  const tv = $('#tv'), timer = $('#timer');
  if (!st.listening) {
    const left = Math.max(0, total - (Date.now() - st.start) / 1000);
    if (tv) tv.textContent = fmtTime(left);
    timer?.classList.toggle('low', left < 300);
    if (left <= 0) finish(st, true);
  } else if (st.start && tv) {
    tv.textContent = fmtTime((Date.now() - st.start) / 1000);
  }
  if (st.globalAudio) audioTick(st);
}

function drawPart() {
  const st = RUN, p = st.prep.parts[st.part];
  const gap = n => gapHTML(n, st.answers[n]);
  const hasQPane = p.blocks.some(b => b.qs.length || b.body || b.instruction);
  const material = [];
  if (p.text) material.push(`<div class="passage-body">${richGaps(p.text, gap)}</div>`);
  if (p.image) material.push(`<img class="plan" src="${esc(p.image)}" alt="Diagram or map for part ${p.pi + 1}">`);
  if (p.options?.some(o => o.text)) material.push(optionList(p.options_title, p.options));
  if (!st.globalAudio && p.audio_url) material.push(`<audio controls ${st.test.play_once ? 'controlsList="nodownload noplaybackrate"' : ''} src="${esc(p.audio_url)}" style="width:100%;margin-top:14px"></audio>`);
  const hasLeft = material.length > 0;
  const ins = p.instruction ? `<div class="qins">${rich(p.instruction)}</div>` : '';
  const partNo = st.test.data?.recent?.part || p.pi + 1;
  const label = `<div class="plabel-top">PART ${partNo} · QUESTIONS ${p.from}–${p.to}</div>`;
  const left = hasLeft ? `<div class="pane left${hasQPane ? '' : ' solo'}"><div class="passage">${label}<h2>${esc(p.title || '')}</h2>${ins}${material.join('')}</div></div>` : '';
  const right = hasQPane ? `<div class="pane right">${!hasLeft ? `${label}<h2 style="font-size:24px;margin-bottom:6px">${esc(p.title || '')}</h2>${ins}` : ''}${p.blocks.map(b => {
    if (!b.qs.length && !b.body && !b.instruction) return '';
    const qs = b.qs.filter(q => !q.inline);
    return `<div class="qblock">${b.qs.length ? `<div class="qhead">Questions ${b.from}–${b.to}</div>` : ''}${b.instruction ? `<div class="qins">${rich(b.instruction)}</div>` : ''}
      ${optionList('List of options', b.options)}${b.body ? `<div class="notes">${richGaps(b.body, gap)}</div>` : ''}${qs.map(q => qHTML(q, st.answers[q.n])).join('')}</div>`;
  }).join('')}</div>` : '';
  const main = $('#rmain');
  const single = !(hasLeft && hasQPane);
  main.className = 'run-main' + (single ? ' single' : '') + (st.mobileLeft ? ' showleft' : '');
  $('.paneswitch')?.classList.toggle('hide', single);
  main.innerHTML = left + (hasLeft && hasQPane ? '<div class="resizer" id="resizer" role="separator" aria-orientation="vertical" title="Drag to resize"></div>' : '') + right;
  main.style.setProperty('--split', getSplit() + 'fr');
  main.style.setProperty('--split2', (1 - getSplit()) + 'fr');
  main.style.setProperty('--vsplit', getVSplit() + 'fr');
  main.style.setProperty('--vsplit2', (1 - getVSplit()) + 'fr');
  paintAll();
}

// ---- highlighting ----
const hlKey = el => st_hlKey(el.classList.contains('left') ? 'l' : 'r');
const st_hlKey = side => RUN.part + side;
function paintAll() {
  if (!RUN) return;
  $$('#rmain .pane').forEach(el => HL.paint(el, RUN.hl[hlKey(el)] || []));
}
function hidePop() { $('#hlpop')?.remove(); }
const onSelectEnd = (delay = 0) => e => {
  if (!RUN || e.target.closest('#hlpop')) return;
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { hidePop(); return; }
    const r = sel.getRangeAt(0);
    const pane = (r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement)?.closest('#rmain .pane');
    if (!pane) { hidePop(); return; }
    hidePop();
    const rect = r.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.id = 'hlpop'; pop.className = 'hlpop';
    pop.innerHTML = ['yellow', 'green', 'pink'].map(c => `<button class="hlc hl-${c}" data-c="${c}" title="Highlight ${c}" aria-label="Highlight ${c}"></button>`).join('') + '<button class="hlx" data-c="x" title="Remove highlight" aria-label="Remove highlight">✕</button>';
    pop.style.left = Math.max(8, Math.min(window.innerWidth - 150, rect.left + rect.width / 2 - 70)) + 'px';
    pop.style.top = Math.max(8, rect.top - 46) + 'px';
    pop.addEventListener('mousedown', ev => ev.preventDefault());
    pop.addEventListener('click', ev => {
      const b = ev.target.closest('[data-c]'); if (!b) return;
      const { s, e: en } = HL.offsetsOf(pane, r);
      const k = hlKey(pane), list = RUN.hl[k] || [];
      RUN.hl[k] = b.dataset.c === 'x' ? HL.cut(list, s, en) : HL.add(list, s, en, b.dataset.c);
      sel.removeAllRanges(); hidePop(); HL.paint(pane, RUN.hl[k]); RUN.persist();
    });
    document.body.appendChild(pop);
  }, delay);
};
document.addEventListener('mouseup', onSelectEnd(0));
document.addEventListener('touchend', onSelectEnd(350));
document.addEventListener('mousedown', e => { if (!e.target.closest('#hlpop')) hidePop(); });

// ---- draggable divider (vertical bar on desktop, horizontal bar on phones) ----
document.addEventListener('pointerdown', e => {
  const h = e.target.closest('#resizer'); if (!h) return;
  e.preventDefault();
  const main = $('#rmain'), box = main.getBoundingClientRect();
  const stacked = !!window.matchMedia?.('(max-width:960px)').matches;
  h.setPointerCapture?.(e.pointerId);
  main.classList.add('dragging');
  const move = ev => {
    const f = Math.min(0.8, Math.max(0.2, stacked ? (ev.clientY - box.top) / box.height : (ev.clientX - box.left) / box.width));
    const [a, b] = stacked ? ['--vsplit', '--vsplit2'] : ['--split', '--split2'];
    main.style.setProperty(a, f + 'fr'); main.style.setProperty(b, (1 - f) + 'fr');
    main.dataset.split = f;
  };
  const up = () => {
    main.classList.remove('dragging');
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
    if (main.dataset.split) (stacked ? saveVSplit : saveSplit)(Number(main.dataset.split));
  };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
});

function drawFoot() {
  const st = RUN;
  const count = ps => st.prep.flat.filter(q => q.pi === ps.pi).length;
  const doneN = ps => st.prep.flat.filter(q => q.pi === ps.pi && st.answers[q.n] != null && String(st.answers[q.n]).trim() !== '').length;
  const cur = st.prep.parts[st.part];
  $('#rfoot').innerHTML = st.prep.parts.map(p => `<button class="ptab ${p.pi === st.part ? 'on' : ''}" data-act="gotoPart" data-i="${p.pi}">Part ${st.test.data?.recent?.part || p.pi + 1}<small>${doneN(p)}/${count(p)}</small></button>`).join('')
    + `<div class="dots">${st.prep.flat.filter(q => q.pi === cur.pi).map(q => `<button class="dot ${st.answers[q.n] ? 'done' : ''}" data-act="jump" data-n="${q.n}">${q.n}</button>`).join('')}</div>`;
}

inputs.ans = el => {
  if (!RUN) return;
  const n = el.dataset.n, v = el.value;
  if (v === '') delete RUN.answers[n]; else RUN.answers[n] = v;
  RUN.persist(); drawFoot();
};
actions.gotoPart = el => { if (!RUN) return; RUN.part = Number(el.dataset.i); RUN.mobileLeft = false; RUN.persist(); drawPart(); drawFoot(); };
actions.jump = el => { const t = document.getElementById('q' + el.dataset.n); if (t) { $('#rmain').classList.remove('showleft'); t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.querySelector('input,select')?.focus({ preventScroll: true }); } };
actions.paneTab = el => { const m = $('#rmain'); if (!m) return; m.classList.toggle('showleft', el.dataset.v === 'l'); if (RUN) RUN.mobileLeft = el.dataset.v === 'l'; $$('.paneswitch .chip').forEach(c => c.classList.toggle('on', c === el)); };
actions.exitTest = async () => {
  if (!(await confirmBox('Leave the test?', 'Your answers will not be saved.', 'Leave', true))) return;
  const t = RUN?.test; sessionStorage.removeItem('ma_run_' + t?.id); if (RUN) RUN.done = true; go('#/practice/' + (t?.section || 'reading'));
};
actions.exitHome = async () => {
  if (!(await confirmBox('Go to the home page?', 'Your answers in this test will not be saved.', 'Go home', true))) return;
  const t = RUN?.test; if (t) sessionStorage.removeItem('ma_run_' + t.id); if (RUN) RUN.done = true; go('#/');
};
actions.submitTest = async () => {
  const st = RUN; if (!st) return;
  const blank = st.prep.flat.filter(q => st.answers[q.n] == null || String(st.answers[q.n]).trim() === '').length;
  if (!(await confirmBox('Submit your answers?', blank ? `${blank} question${blank > 1 ? 's are' : ' is'} still empty.` : 'You answered every question.', 'Submit'))) return;
  finish(st, false);
};

// ── listening audio ──
function setupAudio(st) {
  const a = $('#aud');
  a.addEventListener('ended', () => { setTimeout(() => finish(st, true), 600); });
  a.addEventListener('error', () => toast('The audio file could not be loaded.', 'bad'));
}
actions.audioToggle = () => {
  const st = RUN, a = $('#aud'); if (!st || !a) return;
  if (!st.start) {
    a.play().then(() => { st.start = Date.now(); const b = $('#abtn'); b.disabled = true; b.innerHTML = `${icon('headphones', 16)} Playing`; })
      .catch(() => toast('Tap again to start the audio.', 'bad'));
    return;
  }
  if (!st.test.play_once) { if (a.paused) a.play(); else a.pause(); $('#abtn').innerHTML = a.paused ? `${icon('play', 16)} Resume` : `${icon('pause', 16)} Pause`; }
};
function audioTick(st) {
  const a = $('#aud'); if (!a) return;
  const t = a.currentTime, dur = a.duration || 0;
  $('#aprog').style.width = dur ? (t / dur * 100) + '%' : '0';
  $('#atime').textContent = `${fmtTime(t)} / ${fmtTime(dur)}`;
  if (!st.start) return;
  const parts = st.prep.parts;
  // follow the recording
  let idx = -1;
  parts.forEach((p, i) => { if (p.timing && t >= p.timing.start) idx = i; });
  if (idx >= 0 && idx !== st.auto) { st.auto = idx; if (idx !== st.part) { st.part = idx; st.mobileLeft = false; drawPart(); drawFoot(); } }
  const tm = parts[Math.max(idx, 0)]?.timing; let msg = 'Listening';
  if (tm) {
    const p = `Part ${idx + 1}`;
    if (t < tm.readStart) msg = `${p}: listen to the instructions`;
    else if (t < tm.readEnd) msg = `${p}: read the questions · ${Math.ceil(tm.readEnd - t)}s`;
    else if (t < tm.end) msg = `${p}: listen and answer`;
    else if (t < tm.checkEnd) msg = `${p}: check your answers · ${Math.ceil(tm.checkEnd - t)}s`;
  }
  const s = $('#astatus'); if (s && s.textContent !== msg) s.textContent = msg;
}

// ── finish & save ──
async function finish(st, auto) {
  if (st.done) return;
  st.done = true; clearInterval(st.tm); $('#aud')?.pause(); window.onbeforeunload = null;
  const t = st.test;
  const timeSec = st.listening ? Math.round((st.start ? (Date.now() - st.start) : 0) / 1000) : Math.min(t.duration_min * 60, Math.round((Date.now() - st.start) / 1000));
  const g = grade(t, st.answers);
  const rec = { test_id: t.id, test_title: t.title, section: t.section, format: t.format, student_name: S.student.name, group_code: S.student.group,
    correct: g.correct, total: g.total, percent: g.percent, band: g.band, points: g.points, time_sec: timeSec, details: g.details };
  let id = 'unsaved', saved = true;
  try { id = await store.saveResult(rec); } catch (e) { saved = false; toast('Result could not be saved: ' + e.message, 'bad'); }
  sessionStorage.setItem('ma_last', JSON.stringify({ ...rec, id, created_at: new Date().toISOString(), saved, sub: g.sub }));
  sessionStorage.removeItem('ma_run_' + t.id);
  if (auto) toast(st.listening ? 'The recording has finished.' : 'Time is up. Your test was submitted.', 'ok');
  go('#/result/' + id);
}

// ═════════════════════ RESULT ═════════════════════
function coursesCard(cls = '') {
  return `<div class="courses ${cls}"><div class="ci">${icon('spark', 22)}</div><div class="ct"><h3>${esc(CONFIG.coursesTitle)}</h3><p>${esc(CONFIG.coursesText)}</p></div>
    <a class="btn primary" href="${CONFIG.telegramPersonalUrl}" target="_blank" rel="noopener">${icon('send', 15)} ${esc(CONFIG.telegramPersonal)}</a></div>`;
}

export async function resultView(root, id) {
  loading(root);
  let rec = null;
  try { const l = JSON.parse(sessionStorage.getItem('ma_last')); if (l && l.id === id) rec = l; } catch { /* none */ }
  if (!rec) rec = await store.getResult(id);
  if (!rec) { root.innerHTML = notFound('Result not found.'); return; }
  const results = await store.listResults().catch(() => []);
  const board = buildBoard(results, { testId: rec.test_id });
  const idx = board.findIndex(r => r.name.trim().toLowerCase() === String(rec.student_name).trim().toLowerCase() && r.group === rec.group_code);
  const wrong = rec.details.filter(d => !d.ok && !d.blank).length, blank = rec.details.filter(d => d.blank).length;
  const sub = rec.sub || (rec.format === 'multilevel' ? `${rec.points} / 75` : 'Band');
  root.innerHTML = `<div class="wrap page"><div class="rwrap">
    <div class="panel center">
      <div class="ring" style="--p:${rec.percent}"><div><b>${esc(rec.band)}</b><span>${esc(sub)}</span></div></div>
      <h2 style="margin-top:18px;font-size:22px">${esc(rec.test_title)}</h2>
      <div class="muted">${esc(rec.student_name)} · ${esc(rec.group_code)}</div>
      <div class="stats"><div><b style="color:var(--ok)">${rec.correct}</b><span>correct</span></div><div><b style="color:var(--bad)">${wrong}</b><span>wrong</span></div><div><b>${blank}</b><span>empty</span></div></div>
      <div class="stats" style="grid-template-columns:1fr 1fr"><div><b>${rec.percent}%</b><span>score</span></div><div><b>${fmtTime(rec.time_sec)}</b><span>time</span></div></div>
      ${idx >= 0 ? `<p class="mt"><span class="badge ok">${icon('trophy', 13)} Rank #${idx + 1} of ${board.length} on this test</span></p>` : ''}
      ${rec.demo ? '<p class="muted">Demo test — this result is not saved to the leaderboard.</p>' : rec.saved === false ? '<p class="err">This result was not saved to the leaderboard.</p>' : ''}
      <div class="ctas" style="justify-content:center"><a class="btn primary" href="${rec.demo ? '#/ielts' : '#/test/' + rec.test_id}">Try again</a><a class="btn" href="${isRecentRes(rec) ? '#/recent' : rec.format === 'ielts' ? '#/ielts' : '#/practice/' + rec.section}">More tests</a><a class="btn" href="#/leaderboard">Leaderboard</a></div>
      <p class="note"><a href="${CONFIG.telegramUrl}" target="_blank" rel="noopener">${icon('send', 14)} ${esc(CONFIG.telegramChannel)}</a></p>
      ${coursesCard('small')}
    </div>
    <div>${(() => {
      const mineAll = myResults(results).filter(r => r.id !== id), mine0 = S.student && sameStudent(rec);
      const gain = xpFor(rec), before = levelOf(mineAll.reduce((a, r) => a + xpFor(r), 0)), after = levelOf(mineAll.reduce((a, r) => a + xpFor(r), 0) + gain);
      const ts = typeStats(rec.details), weak = ts.slice().sort((a, b) => a.pct - b.pct)[0];
      return (mine0 ? `<div class="xpban">${icon('spark', 22)}<div><b>+${gain} XP earned${after.level > before.level ? ` · Level ${after.level} reached!` : ''}</b><small>Level ${after.level} · ${after.toNext} XP to the next level</small></div></div>` : '')
      + (ts.length ? `<div class="panel mt"><h3 style="font-size:20px">Performance by question type</h3><small class="muted">Based on this attempt.</small><div class="perf mt">${ts.map(t => `<div><div class="row between"><span>${esc(t.name)}</span><b>${t.ok} / ${t.total} · ${t.pct}%</b></div><div class="meter ${t.pct >= 80 ? 'ok' : ''}"><i style="width:${t.pct}%"></i></div></div>`).join('')}</div></div>` : '')
      + (weak && weak.pct < 100 ? `<div class="panel mt rec"><span class="aic">${icon('arrow', 18)}</span><div><div class="lab2">Recommended next</div><h3 style="font-size:20px">Work on ${esc(weak.name)}</h3><p class="muted" style="margin:4px 0 12px">You got ${weak.ok} of ${weak.total} right (${weak.pct}%). Retake this test and focus on that question type, then check the explanations below.</p><a class="btn primary sm" href="${rec.demo ? '#/ielts' : '#/test/' + rec.test_id}">Try this test again ${icon('arrow', 14)}</a></div></div>` : '');
    })()}
      <div class="row between mt2"><h2 class="ptitle" style="font-size:24px">Answer review</h2>
      <div class="tabs"><button class="chip on" data-act="revFilter" data-v="">All</button><button class="chip" data-act="revFilter" data-v="no">Wrong</button><button class="chip" data-act="revFilter" data-v="blank">Empty</button></div></div>
      <div class="rev" id="rev">${rec.details.map(d => `<div class="rv ${d.ok ? 'ok' : 'no'}" data-k="${d.ok ? 'ok' : d.blank ? 'blank no' : 'no'}"><span class="mk">${icon(d.ok ? 'check' : 'x', 16)}</span><span class="n">${d.n}</span>
        <div class="grow"><div>${d.ok ? esc(d.your) : d.blank ? '<span class="muted">(no answer)</span>' : esc(d.your)}</div>${d.ok ? '' : `<small>Correct answer: <b>${esc(d.right)}</b></small>`}${d.q ? `<small>${esc(d.q.length > 140 ? d.q.slice(0, 140) + '…' : d.q)}</small>` : ''}</div></div>`).join('')}</div></div>
  </div></div>`;
}
actions.revFilter = el => {
  $$('.tabs .chip', el.parentElement).forEach(c => c.classList.toggle('on', c === el));
  const v = el.dataset.v;
  $$('#rev .rv').forEach(r => { r.style.display = !v || r.dataset.k.split(' ').includes(v) ? '' : 'none'; });
};

// ═════════════════════ glossary (double-click a word) ═════════════════════
document.addEventListener('dblclick', e => {
  if (!RUN || !RUN.test.data?.glossary || !e.target.closest('.passage')) return;
  const w = String(window.getSelection()).trim().toLowerCase().replace(/[^a-z'-]/g, '');
  if (!w) return;
  const g = RUN.test.data.glossary;
  const uz = g[w] || g[w.replace(/(ies)$/, 'y')] || g[w.replace(/(es|s|ed|ing)$/, '')];
  $('#gloss')?.remove();
  if (!uz) return;
  const r = window.getSelection().getRangeAt(0).getBoundingClientRect();
  const d = document.createElement('div');
  d.id = 'gloss'; d.className = 'gloss'; d.innerHTML = `<b>${esc(w)}</b> — ${esc(uz)}`;
  d.style.left = Math.min(r.left, innerWidth - 240) + 'px'; d.style.top = (r.bottom + 8) + 'px';
  document.body.appendChild(d);
});
document.addEventListener('mousedown', e => { if (!e.target.closest('#gloss')) $('#gloss')?.remove(); });
