import { store } from './store.js';
import { CONFIG } from './config.js';
import { esc, rich, richGaps, prepare, grade, buildBoard, fmtTime, fmtDate, fmtDateTime, testMeta, progressSummary, achievements, xpTimeline, levelInfo, totalXp, buildStudentStats, typeBreakdown } from './logic.js';
import { $, $$, actions, inputs, toast, icon, lineChart, go, S, requireStudent, confirmBox, initials } from './ui.js';

const loading = root => { root.innerHTML = '<div class="loading">Loading…</div>'; };
const notFound = (msg = 'Not found') => `<div class="wrap page"><div class="empty">${esc(msg)}<br><br><a class="btn" href="#/">Back home</a></div></div>`;
const sameStudent = r => S.student && r.group_code === S.student.group && String(r.student_name).trim().toLowerCase() === S.student.name.trim().toLowerCase();
const myResults = rs => rs.filter(sameStudent);
const fmtLabel = t => t.format === 'multilevel' ? 'Multilevel' : 'IELTS';
const metaCache = new Map();
const meta = t => { const k = t.id + (t.created_at || ''); if (!metaCache.has(k)) metaCache.set(k, testMeta(t)); return metaCache.get(k); };
const secIcon = s => s === 'listening' ? 'headphones' : 'book';

// ═════════════════════ HOME ═════════════════════
const natural = (a, b) => String(a.title).localeCompare(String(b.title), undefined, { numeric: true });
const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';
const pctFmt = v => `${Math.round(Number(v) * 10) / 10}%`;
const badgeHTML = a => `<div class="bdg ${a.earned ? 'on' : ''}" title="${esc(a.desc)}"><span class="bi">${icon(a.earned ? a.icon : 'lock', 20)}</span><b>${esc(a.title)}</b><small>${esc(a.desc)}</small>${a.earned ? '' : `<div class="meter gold"><i style="width:${Math.round(a.have / a.target * 100)}%"></i></div>`}</div>`;
function nextTestFor(tests, mine) {
  const done = new Set(mine.map(r => r.test_id));
  const last = mine[mine.length - 1];
  const order = last ? [last.section, last.section === 'reading' ? 'listening' : 'reading'] : ['reading', 'listening'];
  for (const sec of order) { const t = tests.filter(t => t.section === sec).sort(natural).find(t => !done.has(t.id)); if (t) return t; }
  return null;
}

export async function home(root) {
  loading(root);
  const [tests, results] = await Promise.all([store.listTests({ published: true }), store.listResults()]);
  const st = S.student;
  const mine = myResults(results).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const sm = progressSummary(mine);
  const board = buildBoard(results).slice(0, 5);
  const pts = mine.slice(-12).map(r => ({ y: Number(r.percent) }));
  const students = new Set(results.map(r => r.group_code + '|' + String(r.student_name).toLowerCase())).size;
  const next = nextTestFor(tests, mine);
  const count = sec => tests.filter(t => t.section === sec).length;
  const L = sm.level, ch = sm.challenge;
  const progress = st ? `
      <div class="head"><div class="lab">Your progress</div><span class="lvlchip">${icon('bolt', 13)} Level ${L.level}</span></div>
      <div class="xpwrap"><div class="xpbar" role="progressbar" aria-label="XP to next level" aria-valuenow="${L.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${L.pct}%"></i></div>
        <small><span>${sm.xp} XP</span><span>${L.span - L.into} XP to Level ${L.level + 1}</span></small></div>
      <div class="bignum">${sm.best ? esc(sm.best.band) : '—'}<small>${sm.best ? (sm.best.format === 'multilevel' ? 'Best level' : 'Best band') : 'No result yet'}</small></div>
      ${pts.length ? lineChart(pts, { ticks: [0, 50, 100], fmt: v => v + '%' }) : '<div class="pempty">Your progress chart starts with your first test.</div>'}
      <div class="pstats">
        <div class="pstat"><b>${sm.tests}</b><span>Tests completed</span></div>
        <div class="pstat"><b>${sm.attempts ? pctFmt(sm.avg) : '—'}</b><span>Average accuracy</span></div>
        <div class="pstat"><b>${sm.best ? pctFmt(sm.best.percent) : '—'}</b><span>Personal best</span></div>
        <div class="pstat fire"><b>${icon('fire', 20)}${sm.streak.current}</b><span>Day streak</span></div>
      </div>
      <div class="foot">${pts.length ? 'The line redraws every time you submit a test. Bands and levels are estimates, not official results.' : ''}</div>`
    : `<div class="head"><div class="lab">Your progress</div></div>
      <div class="pempty">${icon('chart', 34)}<div><b style="color:var(--text);font-size:18px">Track your score, streak and level</b><br>Enter your name and group code to save every result.</div>
        <button class="btn primary" data-act="signin">Start free ${icon('arrow', 18)}</button></div>`;
  const recent = mine.slice(-4).reverse();
  root.innerHTML = `
  <div class="wrap">
    <section class="hero">
      <div>
        <div class="welcome">${icon('spark', 16)} ${st ? `Welcome back, <b>${esc(firstName(st.name))}</b>` : `Welcome to <b>${esc(CONFIG.brand)}</b>`}</div>
        <h1 class="h1">Your next level<br>starts <span class="grad-text">here.</span></h1>
        <p class="sub">Practise full Multilevel and IELTS Reading &amp; Listening tests on the screen you will sit the real thing on. Every result is saved, scored and ranked.</p>
        <div class="ctas">
          <a class="btn primary lg" href="#/practice/reading">${icon('book', 20)} Start a Mock Test</a>
          <a class="btn lg" href="${next ? '#/test/' + next.id : '#/practice/reading'}">${icon('play', 18)} Continue Practising</a>
        </div>
        <div class="herostats">
          <div><b>${tests.length}</b><span>full tests</span></div>
          <div><b>${students}</b><span>students ranked</span></div>
          <div><b>${results.length}</b><span>attempts saved</span></div>
        </div>
      </div>
      <div class="pcard">${progress}</div>
    </section>

    <section class="section">
      <h2 class="stitle">The whole exam. One section at a time.</h2>
      <p class="ssub">Reading, Listening, Speaking — a full test or a single part, exactly as you will see it.</p>
      <div class="grid4">
        <a class="feature" href="#/practice/reading"><div class="ic">${icon('book', 24)}</div><h3>Reading</h3><p>Passages with gap-fill, matching headings and True / False / Not Given. ${count('reading')} tests.</p><span class="go">Practice ${icon('arrow', 16)}</span></a>
        <a class="feature cy" href="#/practice/listening"><div class="ic">${icon('headphones', 24)}</div><h3>Listening</h3><p>One continuous recording, with reading and checking time between parts. ${count('listening')} tests.</p><span class="go">Practice ${icon('arrow', 16)}</span></a>
        <a class="feature pk soonc" href="#/speaking"><div class="ic">${icon('mic', 24)}</div><h3>Speaking <span class="badge draft" style="vertical-align:3px">Coming soon</span></h3><p>Topic cards and recorded answers.</p><span class="go">Preview ${icon('arrow', 16)}</span></a>
        <a class="feature gd" href="#/leaderboard"><div class="ic">${icon('trophy', 24)}</div><h3>Leaderboard</h3><p>See who is on top in your group and across the academy.</p><span class="go">Open ${icon('arrow', 16)}</span></a>
      </div>
    </section>

    <section class="section" style="padding-top:0">
      <a class="card famstrip" href="#/family"><span class="bi">${icon('user', 22)}</span><span class="grow"><b>Ota-onalar va o'quvchilar uchun</b><br><span class="muted">Shaxsiy raqam bilan kiring: davomat, uy vazifasi va to'lov holatini ko'ring · For parents &amp; students</span></span><span class="go">${icon('arrow', 18)}</span></a>
    </section>

    <section class="section" style="padding-top:0">
      <div class="dash">
        <div class="rcol">
          <div class="card daily">
            <div class="dtop"><div><div class="lab">Daily challenge</div><h3>${esc(ch.title)}</h3><div class="muted" style="font-size:14px">${esc(ch.hint)}</div></div>
              <span class="dstate ${st && ch.done ? 'on' : ''}">${icon(st && ch.done ? 'check' : 'target', 22)}</span></div>
            ${st ? `<div><div class="mlabel"><span>This week</span><b>${sm.week.count} / ${sm.week.goal} tests</b></div><div class="meter gold"><i style="width:${Math.min(100, Math.round(sm.week.count / sm.week.goal * 100))}%"></i></div></div>
            <div class="row" style="gap:10px;flex-wrap:wrap">${ch.done ? '<span class="badge ok">' + icon('check', 12) + ' Done for today</span>' : `<a class="btn primary sm" href="#/practice/${ch.section}">Take the challenge ${icon('arrow', 14)}</a>`}
              <span class="badge">${icon('fire', 12)} ${sm.streak.current}-day streak · best ${sm.streak.longest}</span></div>`
              : `<div><a class="btn primary sm" href="#/practice/${ch.section}">Take the challenge ${icon('arrow', 14)}</a> <button class="btn sm" data-act="signin">Sign in to track it</button></div>`}
          </div>
          <div class="card">
            <div class="row between"><div><div class="lab" style="margin:0">Recent results</div></div>${mine.length ? '<a class="btn sm" href="#/me">All results</a>' : ''}</div>
            ${recent.length ? `<div class="rlist">${recent.map(r => `<a class="rrow" href="#/result/${r.id}"><div class="rt"><b>${esc(r.test_title)}</b><small>${fmtDateTime(r.created_at)} · ${fmtTime(r.time_sec)}</small></div><div class="rs">${esc(r.band)}<small>${r.correct} / ${r.total} · ${pctFmt(r.percent)}</small></div></a>`).join('')}</div>`
              : `<div class="empty" style="margin-top:12px">${st ? 'No results yet — your first test will appear here.' : 'Sign in and take a test to see your results here.'}</div>`}
          </div>
        </div>
        <div class="card">
          <div class="row between"><div class="lab" style="margin:0">Achievements</div><span class="badge">${sm.achievements.filter(a => a.earned).length} / ${sm.achievements.length}</span></div>
          <div class="badgegrid">${sm.achievements.map(badgeHTML).join('')}</div>
        </div>
      </div>
    </section>

    <section class="section" style="padding-top:0">
      <div class="row between" style="margin-bottom:16px"><h2 class="ptitle" style="font-size:28px">Top students</h2><a class="btn sm" href="#/leaderboard">Full leaderboard</a></div>
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
  const all = tests.filter(t => t.section === section);
  root.innerHTML = `
  <div class="wrap page">
    <div class="tabs" style="margin-bottom:26px">
      <a class="chip ${section === 'listening' ? 'on' : ''}" href="#/practice/listening">${icon('headphones', 16)} Listening</a>
      <a class="chip ${section === 'reading' ? 'on' : ''}" href="#/practice/reading">${icon('book', 16)} Reading</a>
      <a class="chip" href="#/speaking">${icon('mic', 16)} Speaking <span class="badge draft" style="margin-left:6px">Soon</span></a>
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
const lf = { section: '', format: '', testId: '', group: '', period: '', rank: 'avg' };
const isMe = (name, group) => S.student && group === S.student.group && String(name).trim().toLowerCase() === S.student.name.trim().toLowerCase();
const nameCell = (name, group, me) => `<span class="nm"><span class="av" aria-hidden="true">${esc(initials(name))}</span><span><b>${esc(name)}</b>${me ? ' <span class="badge ok">You</span>' : ''}</span></span>`;
function boardTable(rows, { compact = false, single = false, me = true } = {}) {
  const body = rows.map((r, i) => {
    const rk = `<span class="rk ${i < 3 ? 'g' + (i + 1) : ''}">${i + 1}</span>`;
    const mine = me && isMe(r.name, r.group);
    return `<tr class="${mine ? 'me' : ''}"><td>${rk}</td><td>${nameCell(r.name, r.group, mine)}</td><td class="muted">${esc(r.group)}</td>
      ${single ? `<td>${r.top.correct} / ${r.top.total}</td><td><b>${esc(r.top.band)}</b></td><td class="r muted">${fmtTime(r.top.time_sec)}</td>`
        : `<td>${r.tests}</td><td><b>${Math.round(r.avg * 10) / 10}%</b></td><td><b>${esc(r.top.band)}</b></td>${compact ? '' : `<td class="r muted">${fmtTime(r.time)}</td>`}`}</tr>`;
  }).join('');
  const head = single ? '<th>#</th><th>Student</th><th>Group</th><th>Score</th><th>Band / Level</th><th class="r">Time</th>'
    : `<th>#</th><th>Student</th><th>Group</th><th>Tests</th><th>Average</th><th>Best</th>${compact ? '' : '<th class="r">Total time</th>'}`;
  return `<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function statsTable(rows, mode) {
  const body = rows.map((r, i) => {
    const mine = isMe(r.name, r.group);
    const val = mode === 'xp' ? `<b>${r.xp} XP</b>` : `<b style="color:${r.improvement >= 0 ? 'var(--ok)' : 'var(--bad)'}">${r.improvement > 0 ? '+' : ''}${r.improvement} pts</b>`;
    return `<tr class="${mine ? 'me' : ''}"><td><span class="rk ${i < 3 ? 'g' + (i + 1) : ''}">${i + 1}</span></td><td>${nameCell(r.name, r.group, mine)}</td><td class="muted">${esc(r.group)}</td><td>${r.attempts}</td><td>${mode === 'xp' ? 'Level ' + r.level : Math.round(r.avg * 10) / 10 + '%'}</td><td class="r">${val}</td></tr>`;
  }).join('');
  return `<div class="tablewrap"><table><thead><tr><th>#</th><th>Student</th><th>Group</th><th>Attempts</th><th>${mode === 'xp' ? 'Level' : 'Average'}</th><th class="r">${mode === 'xp' ? 'XP' : 'Improvement'}</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
export async function leaderboard(root) {
  loading(root);
  const [tests, results] = await Promise.all([store.listTests({ published: true }), store.listResults()]);
  const groups = [...new Set(results.map(r => r.group_code))].sort();
  root.innerHTML = `<div class="wrap page">
    <h1 class="ptitle">Leaderboard</h1><p class="muted" id="lbNote"></p>
    <div class="tabs rankby" role="tablist" aria-label="Rank by">${[['avg', 'Average score'], ['xp', 'XP'], ['improved', 'Most improved']].map(([k, l]) => `<button class="chip" role="tab" data-act="lbRank" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="filters">
      <select class="sel" data-in="lf" data-k="section" aria-label="Section"><option value="">All sections</option><option value="reading">Reading</option><option value="listening">Listening</option></select>
      <select class="sel" data-in="lf" data-k="format" aria-label="Format"><option value="">All formats</option><option value="multilevel">Multilevel</option><option value="ielts">IELTS</option></select>
      <select class="sel" data-in="lf" data-k="testId" id="lfTest" aria-label="Test"></select>
      <select class="sel" data-in="lf" data-k="group" aria-label="Group"><option value="">All groups</option>${groups.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('')}</select>
      <select class="sel" data-in="lf" data-k="period" aria-label="Period"><option value="">All time</option><option value="week">This week</option><option value="today">Today</option></select>
    </div><div id="lbBody"></div></div>`;
  const sync = () => { $$('select[data-in=lf]').forEach(s => { s.value = lf[s.dataset.k]; }); $$('.rankby .chip').forEach(c => { c.classList.toggle('on', c.dataset.v === lf.rank); c.setAttribute('aria-selected', c.dataset.v === lf.rank); }); };
  const draw = () => {
    const sel = $('#lfTest');
    const opts = tests.filter(t => (!lf.section || t.section === lf.section) && (!lf.format || t.format === lf.format));
    if (lf.testId && !opts.some(t => t.id === lf.testId)) lf.testId = '';
    sel.innerHTML = '<option value="">All tests</option>' + opts.map(t => `<option value="${t.id}">${esc(t.title)}</option>`).join('');
    if (lf.testId && lf.rank !== 'avg') lf.rank = 'avg';
    sync();
    $('#lbNote').textContent = lf.rank === 'xp' ? 'XP comes from completed tests: first attempts count most, repeats count less, and each day is capped.'
      : lf.rank === 'improved' ? 'Improvement compares your latest three attempts with your first three (needs 4+ attempts).'
      : "Each student's best attempt of every test counts. Ranked by average score.";
    const since = lf.period === 'today' ? new Date(new Date().setHours(0, 0, 0, 0)) : lf.period === 'week' ? new Date(Date.now() - 7 * 864e5) : null;
    const f = { ...lf, since };
    let rows, table, label;
    if (lf.rank === 'avg') {
      rows = buildBoard(results, f); label = r => lf.testId ? esc(r.top.band) : Math.round(r.avg) + '%';
      table = () => boardTable(rows, { single: !!lf.testId });
    } else {
      rows = buildStudentStats(results, f);
      if (lf.rank === 'improved') rows = rows.filter(r => r.improvement != null).sort((a, b) => b.improvement - a.improvement || b.attempts - a.attempts);
      else rows.sort((a, b) => b.xp - a.xp || b.attempts - a.attempts);
      label = r => lf.rank === 'xp' ? r.xp + ' XP' : (r.improvement > 0 ? '+' : '') + r.improvement + ' pts';
      table = () => statsTable(rows, lf.rank);
    }
    const top = rows.slice(0, 3);
    const pod = top.length === 3 ? `<div class="podium">${[1, 0, 2].map(i => { const r = top[i]; return `<div class="pod ${i === 0 ? 'p1' : ''}"><span class="medal g${i + 1}">${i + 1}</span><span class="av" aria-hidden="true">${esc(initials(r.name))}</span><b>${esc(r.name)}</b><span>${esc(r.group)}</span><div class="sc">${label(r)}</div></div>`; }).join('')}</div>` : '';
    const pos = rows.findIndex(r => isMe(r.name, r.group));
    const you = S.student ? (pos >= 0 ? `<div class="you-pos"><span>${icon('trophy', 16)} Your position</span><b>#${pos + 1} of ${rows.length}</b></div>` : '<div class="you-pos"><span>You are not ranked here yet.</span><a class="btn sm" href="#/practice/reading">Take a test</a></div>') : '';
    $('#lbBody').innerHTML = rows.length ? pod + table() + you : `<div class="empty">${lf.rank === 'improved' ? 'Improvement needs at least 4 attempts per student.' : 'No results for these filters yet.'}</div>`;
  };
  leaderboard.draw = draw; draw();
}
inputs.lf = el => { lf[el.dataset.k] = el.value; leaderboard.draw(); };
actions.lbRank = el => { lf.rank = el.dataset.v; leaderboard.draw(); };

// ═════════════════════ MY RESULTS / PROFILE ═════════════════════
export async function me(root) {
  if (!S.student) { const s = await requireStudent(); if (!s) return go('#/'); }
  loading(root);
  const results = await store.listResults();
  const mine = myResults(results);
  const chrono = mine.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const sm = progressSummary(chrono);
  const board = buildBoard(results);
  const rank = board.findIndex(r => isMe(r.name, r.group));
  const st = S.student, L = sm.level;
  root.innerHTML = `<div class="wrap page">
    <div class="row between wrapx"><div class="row"><span class="studentchip" style="padding:8px 16px 8px 8px"><span class="av" style="width:42px;height:42px;font-size:15px">${esc(initials(st.name))}</span><span><b>${esc(st.name)}</b><br><small class="muted">Group ${esc(st.group)}</small></span></span></div>
      <button class="btn sm" data-act="logoutStudent">${icon('logout', 16)} Switch student</button></div>
    <div class="kv" style="margin-top:22px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div><b>${mine.length}</b><span>attempts</span></div>
      <div><b>${mine.length ? sm.avg + '%' : '—'}</b><span>average score</span></div>
      <div><b>${sm.best ? esc(sm.best.band) : '—'}</b><span>best result</span></div>
      <div><b>${sm.xp}</b><span>XP · Level ${L.level}</span></div>
      <div><b>${sm.streak.current}</b><span>day streak (best ${sm.streak.longest})</span></div>
      <div><b>${rank >= 0 ? '#' + (rank + 1) : '—'}</b><span>${rank >= 0 ? 'of ' + board.length + ' on the leaderboard' : 'leaderboard rank'}</span></div>
    </div>
    <div class="dash mt2">
      <div class="rcol">
        <div class="card"><div class="lab">Level ${L.level}</div>
          <div class="xpwrap"><div class="xpbar" role="progressbar" aria-label="XP to next level" aria-valuenow="${L.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${L.pct}%"></i></div><small><span>${sm.xp} XP</span><span>${L.span - L.into} XP to Level ${L.level + 1}</span></small></div>
          <div style="margin-top:18px"><div class="mlabel"><span>Weekly goal</span><b>${sm.week.count} / ${sm.week.goal} tests</b></div><div class="meter gold"><i style="width:${Math.min(100, Math.round(sm.week.count / sm.week.goal * 100))}%"></i></div></div>
          <p class="muted" style="font-size:13px;margin-top:14px">XP: ${XP_NOTE}</p></div>
        ${chrono.length ? `<div class="card"><div class="lab">Score over time</div>${lineChart(chrono.slice(-20).map(r => ({ y: Number(r.percent) })), { fmt: v => v + '%' })}</div>` : ''}
      </div>
      <div class="card"><div class="row between"><div class="lab" style="margin:0">Achievements</div><span class="badge">${sm.achievements.filter(a => a.earned).length} / ${sm.achievements.length}</span></div>
        <div class="badgegrid">${sm.achievements.map(badgeHTML).join('')}</div></div>
    </div>
    <h2 class="ptitle mt2" style="font-size:24px">History</h2>
    <div class="mt">${mine.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Test</th><th>Score</th><th>Band / Level</th><th>Time</th><th></th></tr></thead><tbody>
      ${mine.map(r => `<tr><td class="muted">${fmtDateTime(r.created_at)}</td><td><b>${esc(r.test_title)}</b></td><td>${r.correct} / ${r.total} (${r.percent}%)</td><td><b>${esc(r.band)}</b></td><td class="muted">${fmtTime(r.time_sec)}</td><td class="r"><a class="btn sm" href="#/result/${r.id}">Review</a></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">You have not taken any test yet.</div>'}</div></div>`;
}
const XP_NOTE = 'about 2 per correct answer, a bonus for a first attempt and for 60%+ / 80%+ scores. Repeat attempts earn less and each day is capped, so XP reflects real practice.';
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
    <a class="muted" href="#/practice/${t.section}">← Back to ${t.section}</a>
    <div class="row mt"><span class="badge ${t.format === 'multilevel' ? 'multi' : 'ielts'}">${fmtLabel(t)}</span><span class="badge">${t.section === 'listening' ? 'Listening' : 'Reading'}</span></div>
    <h1 class="ptitle mt" style="font-size:40px">${esc(t.title)}</h1>
    <div class="kv"><div><b>${m.parts.length}</b><span>parts</span></div><div><b>${m.q}</b><span>questions</span></div><div><b>${t.duration_min} min</b><span>${timed ? 'recording length' : 'time limit'}</span></div></div>
    <div class="panel"><b>Before you start</b><ul>
      ${listening ? `<li>Use headphones and check your volume.</li>${timed ? '<li>The recording plays straight through, like the real exam. It cannot be paused or rewound.</li><li>You get time to read the questions before each part and time to check your answers after it. The next part opens by itself.</li><li>Your result appears automatically when the recording ends.</li>' : '<li>Press play on each part when you are ready.</li>'}`
        : `<li>You have ${t.duration_min} minutes. The test is submitted automatically when time runs out.</li><li>Move between parts with the tabs at the bottom.</li>${t.data?.glossary ? '<li>Double-click any word in a passage to see its Uzbek translation.</li>' : ''}`}
      <li>Your answers are saved to the leaderboard as <b>${S.student ? esc(S.student.name) : 'you'}</b>${S.student ? ` (${esc(S.student.group)})` : ''}.</li></ul></div>
    <div class="ctas"><button class="btn primary lg" data-act="beginTest" data-id="${t.id}">${icon('play', 18)} Start test</button></div>
  </div></div>`;
}
actions.beginTest = async el => { const s = await requireStudent(); if (s) go('#/run/' + el.dataset.id); };

// ═════════════════════ RUNNER ═════════════════════
let RUN = null;

function gapHTML(n, a) {
  return `<span class="gapwrap" id="q${n}"><b class="gnum">${n}</b><input class="gap" data-in="ans" data-n="${n}" value="${esc(a ?? '')}" maxlength="60" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Question ${n}"><button class="flagbtn mini" data-act="flag" data-n="${n}" aria-pressed="${!!RUN?.flags?.[n]}" aria-label="Flag question ${n} for review" title="Flag for review">${icon('flag', 13)}</button></span>`;
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
  const on = !!RUN?.flags?.[n];
  return `<div class="q" id="q${n}"><div class="qn">${n}</div><div class="qb">${body}</div><button class="flagbtn" data-act="flag" data-n="${n}" aria-pressed="${on}" aria-label="Flag question ${n} for review" title="Flag for review">${icon('flag', 16)}</button></div>`;
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
  const st = { test, prep, listening, globalAudio, answers: saved?.answers || {}, flags: saved?.flags || {}, part: Math.min(saved?.part || 0, prep.parts.length - 1), start: listening ? null : (saved?.start || Date.now()), done: false, auto: -1, mobileLeft: false };
  RUN = st;
  const persist = () => sessionStorage.setItem(key, JSON.stringify({ answers: st.answers, flags: st.flags, start: st.start, part: st.part }));
  st.persist = persist;
  const total = test.duration_min * 60;
  document.body.classList.add('running');
  window.onbeforeunload = () => (st.done ? undefined : 'Your test is in progress.');

  root.innerHTML = `<div class="runner">
    <div class="run-top"><button class="icon-btn" data-act="exitTest" title="Exit">${icon('x', 18)}</button><h2>${esc(test.title)}</h2>
      <div class="timer" id="timer">${icon('clock', 18)}<span id="tv">${listening ? '0:00' : fmtTime(total)}</span></div>
      <button class="btn primary" data-act="submitTest">Submit</button></div>
    ${globalAudio ? `<div class="audiobar"><button class="btn sm primary" id="abtn" data-act="audioToggle">${icon('play', 16)} Start recording</button>
        <div class="astatus" id="astatus">Press start when your headphones are ready</div><div class="aprog"><i id="aprog"></i></div><span class="atime" id="atime">0:00</span></div>` : ''}
    <div class="paneswitch"><button class="chip on" data-act="paneTab" data-v="q">Questions</button><button class="chip" data-act="paneTab" data-v="l">Material</button></div>
    <div class="run-main" id="rmain"></div>
    <div class="run-foot" id="rfoot"></div>
    ${globalAudio ? `<audio id="aud" preload="auto" src="${esc(test.data.audio_url)}"></audio>` : ''}
  </div>`;

  drawPart(); drawFoot();
  if (globalAudio) setupAudio(st);
  clearInterval(st.tm);
  st.tm = setInterval(() => tick(st, total), 250);
  S.cleanup = () => { clearInterval(st.tm); window.onbeforeunload = null; document.body.classList.remove('running'); $('#aud')?.pause(); $('#gloss')?.remove(); RUN = null; };
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
  const label = `<div class="plabel-top">PART ${p.pi + 1} · QUESTIONS ${p.from}–${p.to}</div>`;
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
  main.innerHTML = left + right;
}

function drawFoot() {
  const st = RUN;
  const count = ps => st.prep.flat.filter(q => q.pi === ps.pi).length;
  const doneN = ps => st.prep.flat.filter(q => q.pi === ps.pi && st.answers[q.n] != null && String(st.answers[q.n]).trim() !== '').length;
  const cur = st.prep.parts[st.part];
  const last = st.part >= st.prep.parts.length - 1;
  $('#rfoot').innerHTML = `<div class="fnav"><button class="btn" data-act="partStep" data-d="-1" ${st.part === 0 ? 'disabled' : ''}>← Previous</button></div>`
    + '<div class="ptabs">' + st.prep.parts.map(p => `<button class="ptab ${p.pi === st.part ? 'on' : ''}" data-act="gotoPart" data-i="${p.pi}">Part ${p.pi + 1}<small>${doneN(p)}/${count(p)}</small></button>`).join('') + '</div>'
    + `<div class="fnav">${last ? '<button class="btn primary" data-act="submitTest">Review &amp; submit</button>' : '<button class="btn primary" data-act="partStep" data-d="1">Next →</button>'}</div>`
    + `<div class="legend" aria-hidden="true"><span><i class="d"></i>Answered</span><span><i></i>Unanswered</span><span><i class="f"></i>Flagged</span></div>`
    + `<div class="dots" role="group" aria-label="Questions in part ${cur.pi + 1}">${st.prep.flat.filter(q => q.pi === cur.pi).map(q => { const ans = st.answers[q.n] != null && String(st.answers[q.n]).trim() !== ''; const fl = !!st.flags[q.n]; return `<button class="dot ${ans ? 'done' : ''} ${fl ? 'flag' : ''}" data-act="jump" data-n="${q.n}" aria-label="Question ${q.n}: ${ans ? 'answered' : 'unanswered'}${fl ? ', flagged' : ''}">${q.n}</button>`; }).join('')}</div>`;
}

inputs.ans = el => {
  if (!RUN) return;
  const n = el.dataset.n, v = el.value;
  if (v === '') delete RUN.answers[n]; else RUN.answers[n] = v;
  RUN.persist(); drawFoot();
};
actions.partStep = el => { if (!RUN) return; const i = Math.max(0, Math.min(RUN.prep.parts.length - 1, RUN.part + Number(el.dataset.d))); if (i === RUN.part) return; RUN.part = i; RUN.mobileLeft = false; RUN.persist(); drawPart(); drawFoot(); $('#rmain')?.scrollTo?.(0, 0); };
actions.flag = el => { if (!RUN) return; const n = el.dataset.n; if (RUN.flags[n]) delete RUN.flags[n]; else RUN.flags[n] = 1; el.setAttribute('aria-pressed', !!RUN.flags[n]); RUN.persist(); drawFoot(); };
actions.gotoPart = el => { if (!RUN) return; RUN.part = Number(el.dataset.i); RUN.mobileLeft = false; RUN.persist(); drawPart(); drawFoot(); };
actions.jump = el => { const t = document.getElementById('q' + el.dataset.n); if (t) { $('#rmain').classList.remove('showleft'); t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.querySelector('input,select')?.focus({ preventScroll: true }); } };
actions.paneTab = el => { const m = $('#rmain'); if (!m) return; m.classList.toggle('showleft', el.dataset.v === 'l'); if (RUN) RUN.mobileLeft = el.dataset.v === 'l'; $$('.paneswitch .chip').forEach(c => c.classList.toggle('on', c === el)); };
actions.exitTest = async () => {
  if (!(await confirmBox('Leave the test?', 'Your answers will not be saved.', 'Leave', true))) return;
  const t = RUN?.test; sessionStorage.removeItem('ma_run_' + t?.id); if (RUN) RUN.done = true; go('#/practice/' + (t?.section || 'reading'));
};
actions.submitTest = async () => {
  const st = RUN; if (!st) return;
  const blank = st.prep.flat.filter(q => st.answers[q.n] == null || String(st.answers[q.n]).trim() === '').length;
  const flagged = Object.keys(st.flags || {}).length;
  const msg = (blank ? `${blank} question${blank > 1 ? 's are' : ' is'} still empty.` : 'You answered every question.') + (flagged ? ` ${flagged} flagged for review.` : '');
  if (!(await confirmBox('Submit your answers?', msg, 'Submit'))) return;
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
export async function resultView(root, id) {
  loading(root);
  let rec = null;
  try { const l = JSON.parse(sessionStorage.getItem('ma_last')); if (l && l.id === id) rec = l; } catch { /* none */ }
  if (!rec) rec = await store.getResult(id);
  if (!rec) { root.innerHTML = notFound('Result not found.'); return; }
  const [results, test, tests] = await Promise.all([store.listResults().catch(() => []), rec.test_id ? store.getTest(rec.test_id).catch(() => null) : null, store.listTests({ published: true }).catch(() => [])]);
  const board = buildBoard(results, { testId: rec.test_id });
  const idx = board.findIndex(r => r.name.trim().toLowerCase() === String(rec.student_name).trim().toLowerCase() && r.group === rec.group_code);
  const wrong = rec.details.filter(d => !d.ok && !d.blank).length, blank = rec.details.filter(d => d.blank).length;
  const sub = rec.sub || (rec.format === 'multilevel' ? `${rec.points} / 75` : 'Band');
  const estLabel = rec.format === 'multilevel' ? 'Multilevel level' : 'IELTS band';

  // gamification for this student, from stored results (the result just saved is included)
  const same = r => r.group_code === rec.group_code && String(r.student_name).trim().toLowerCase() === String(rec.student_name).trim().toLowerCase();
  const mine = results.filter(same);
  const savedHere = mine.some(r => r.id === rec.id);
  const before = mine.filter(r => r.id !== rec.id);
  const prevSame = before.filter(r => r.test_id === rec.test_id);
  const isBest = savedHere && prevSame.length > 0 && Number(rec.percent) > Math.max(...prevSame.map(r => Number(r.percent)));
  const xpGain = savedHere ? (xpTimeline(mine).find(e => e.id === rec.id)?.xp ?? 0) : 0;
  const had = new Set(achievements(before).filter(a => a.earned).map(a => a.id));
  const fresh = savedHere ? achievements(mine).filter(a => a.earned && !had.has(a.id)) : [];
  const lvl = savedHere ? levelInfo(totalXp(mine)) : null;
  const leveledUp = lvl && levelInfo(totalXp(before)).level < lvl.level;

  // performance by question type + a recommendation
  const types = test ? typeBreakdown(test, rec.details) : [];
  const weak = types.find(t => t.total >= 3 && t.pct < 70);
  const solved = new Set(mine.map(r => r.test_id));
  const nextTest = tests.filter(t => t.section === rec.section && t.id !== rec.test_id && !solved.has(t.id)).sort((a, b) => String(a.title).localeCompare(String(b.title), undefined, { numeric: true }))[0];
  const reco = weak ? { ic: 'target', t: `Work on ${weak.label}`, d: `You got ${weak.correct} of ${weak.total} right (${weak.pct}%). Retake this test and focus on that question type, then check the explanations below.`, href: `#/test/${rec.test_id}`, cta: 'Try this test again' }
    : nextTest ? { ic: 'arrow', t: 'Try a new test', d: `You have not solved “${nextTest.title}” yet. A fresh test is the best way to find out where you really are.`, href: `#/test/${nextTest.id}`, cta: 'Start it' }
    : { ic: 'chart', t: 'Beat your best', d: 'You have solved every test in this section. Retake one and aim to beat your best score.', href: `#/practice/${rec.section}`, cta: 'Choose a test' };

  root.innerHTML = `<div class="wrap page"><div class="rwrap">
    <div class="rcol">
    <div class="panel center">
      <div class="ring" style="--p:${rec.percent}"><div><b>${esc(rec.band)}</b><span>${esc(sub)}</span></div></div>
      <h2 style="margin-top:18px;font-size:22px">${esc(rec.test_title)}</h2>
      <div class="muted">${esc(rec.student_name)} · ${esc(rec.group_code)}</div>
      <div class="stats"><div><b style="color:var(--ok)">${rec.correct}</b><span>correct</span></div><div><b style="color:var(--bad)">${wrong}</b><span>wrong</span></div><div><b>${blank}</b><span>unanswered</span></div></div>
      <div class="stats" style="grid-template-columns:1fr 1fr"><div><b>${rec.percent}%</b><span>raw score</span></div><div><b>${fmtTime(rec.time_sec)}</b><span>time used</span></div></div>
      <p class="estimate">Raw score is ${rec.correct} / ${rec.total}. The ${estLabel} shown is an <b>unofficial estimate</b> from a practice scale, not an official result.</p>
      ${idx >= 0 ? `<p class="mt"><span class="badge ok">${icon('trophy', 13)} Rank #${idx + 1} of ${board.length} on this test</span></p>` : ''}
      ${rec.saved === false ? '<p class="err">This result was not saved to the leaderboard.</p>' : ''}
      <div class="ctas" style="justify-content:center"><a class="btn primary" href="#/test/${rec.test_id}">Try again</a><a class="btn" href="#/practice/${rec.section}">More tests</a><a class="btn" href="#/leaderboard">Leaderboard</a></div>
      <p class="note"><a href="${CONFIG.telegramUrl}" target="_blank" rel="noopener">${icon('send', 14)} ${esc(CONFIG.telegramChannel)}</a></p>
    </div>
    </div>
    <div class="rcol">
      ${isBest ? `<div class="banner pb">${icon('trophy', 22)}<div>New personal best on this test!<small>Previous best: ${Math.round(Math.max(...prevSame.map(r => Number(r.percent))) * 10) / 10}% → now ${rec.percent}%</small></div></div>` : ''}
      ${savedHere ? `<div class="banner xp">${icon('bolt', 22)}<div>+${xpGain} XP earned${leveledUp ? ` · Level ${lvl.level} reached!` : ''}<small>${xpGain ? `Level ${lvl.level} · ${lvl.span - lvl.into} XP to the next level` : 'Daily XP limit reached — come back tomorrow for more.'}</small></div></div>` : ''}
      ${fresh.length ? `<div class="card"><div class="lab">New achievement${fresh.length > 1 ? 's' : ''} unlocked</div><div class="badgegrid">${fresh.map(badgeHTML).join('')}</div></div>` : ''}
      ${types.length ? `<div class="card"><h3>Performance by question type</h3><div class="muted" style="font-size:13px">Based on this attempt.</div><div class="tbars">${types.map(t => `<div class="tbar ${t.pct < 50 ? 'weak' : t.pct >= 80 ? 'strong' : ''}"><div class="mlabel"><span>${esc(t.label)}</span><b>${t.correct} / ${t.total} · ${t.pct}%</b></div><div class="meter"><i style="width:${t.pct}%"></i></div></div>`).join('')}</div></div>` : ''}
      <div class="card reco"><span class="bi">${icon(reco.ic, 22)}</span><div><div class="lab" style="margin-bottom:4px">Recommended next</div><h3>${esc(reco.t)}</h3><p class="muted" style="font-size:14px;margin:4px 0 12px">${esc(reco.d)}</p><a class="btn primary sm" href="${reco.href}">${esc(reco.cta)} ${icon('arrow', 14)}</a></div></div>
      <div><div class="row between"><h2 class="ptitle" style="font-size:24px">Answer review</h2>
        <div class="tabs"><button class="chip on" data-act="revFilter" data-v="">All</button><button class="chip" data-act="revFilter" data-v="no">Wrong</button><button class="chip" data-act="revFilter" data-v="blank">Unanswered</button></div></div>
        <div class="rev" id="rev">${rec.details.map(d => `<div class="rv ${d.ok ? 'ok' : 'no'}" data-k="${d.ok ? 'ok' : d.blank ? 'blank no' : 'no'}"><span class="mk">${icon(d.ok ? 'check' : 'x', 16)}</span><span class="n">${d.n}</span>
          <div class="grow"><div>${d.ok ? esc(d.your) : d.blank ? '<span class="muted">(no answer)</span>' : esc(d.your)}</div>${d.ok ? '' : `<small>Correct answer: <b>${esc(d.right)}</b></small>`}${d.q ? `<small>${esc(d.q.length > 140 ? d.q.slice(0, 140) + '…' : d.q)}</small>` : ''}${d.why ? `<small>Why: ${esc(d.why)}</small>` : ''}</div></div>`).join('')}</div></div>
    </div>
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
