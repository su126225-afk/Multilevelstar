// Vocabulary Marathon: exam list, runner, result, leaderboard (student) + teacher tab.
import { store } from './store.js';
import { esc, fmtTime, fmtDateTime } from './logic.js';
import { buildAttempt, gradeAttempt, isOpenCorrect, marathonBoard } from './vocab.js';
import { $, $$, actions, inputs, toast, icon, go, S, requireStudent, confirmBox, modal, closeModal, initials } from './ui.js';

const loading = root => { root.innerHTML = '<div class="loading">Loading…</div>'; };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + Math.random().toString(16).slice(2));
const same = (r, st) => st && r.group_code === st.group && r.student_name.trim().toLowerCase() === st.name.trim().toLowerCase();
const tabs = on => `<div class="tabs" style="margin-bottom:26px">
  <a class="chip ${on === 'list' ? 'on' : ''}" href="#/vocab">${icon('book', 16)} Exams</a>
  <a class="chip ${on === 'board' ? 'on' : ''}" href="#/vocab/board">${icon('trophy', 16)} Marathon leaderboard</a></div>`;

// ═════════════ exam list ═════════════
export async function vocabList(root) {
  loading(root);
  const [sets, results] = await Promise.all([store.listVocabSets({ published: true }), store.listVocabResults()]);
  const mine = results.filter(r => same(r, S.student));
  const best = new Map();
  for (const r of mine) { const b = best.get(r.set_id); if (!b || r.score > b.score) best.set(r.set_id, r); }
  const pts = [...best.values()].reduce((a, r) => a + r.score, 0);
  root.innerHTML = `<div class="wrap page">${tabs('list')}
    <h1 class="ptitle">Vocabulary Marathon</h1>
    <p class="muted">Short timed vocabulary exams. Every attempt is a new random paper. Your best score on each exam counts towards the marathon leaderboard.</p>
    ${S.student ? `<div class="kv mt"><div><b>${best.size}</b><span>exams done</span></div><div><b>${pts}</b><span>marathon points</span></div><div><b>${mine.length}</b><span>attempts</span></div></div>` : ''}
    ${sets.length ? `<div class="vgrid mt2">${sets.map(s => { const b = best.get(s.id); return `<div class="panel vcard">
        <div class="row between"><span class="badge multi">${esc(s.topics || 'Vocabulary')}</span>${b ? `<span class="badge ok">Best ${b.score}/${b.total}</span>` : ''}</div>
        <h3>${esc(s.title)}</h3>
        <p class="muted">${(s.mc_count || 25) + (s.open_count || 15)} questions · ${Math.round((s.seconds || 480) / 60)} min · ${(s.words || []).length} words</p>
        <button class="btn primary" data-act="vStart" data-id="${s.id}">${b ? 'Try again' : 'Start'} ${icon('arrow', 16)}</button></div>`; }).join('')}</div>`
      : '<div class="empty mt2">No exams yet. Your teacher will add them soon.</div>'}</div>`;
}
actions.vStart = async el => {
  const st = S.student || await requireStudent();
  if (st) go('#/vocab/run/' + el.dataset.id);
};

// ═════════════ runner ═════════════
const KEY = id => 'ma_vx_' + id;
const ss = { get: k => { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }, del: k => { try { sessionStorage.removeItem(k); } catch { /* ignore */ } } };
let V = null;   // current run: { set, att, answers, end, name, group, done }

export async function vocabRun(root, id) {
  const st = S.student || await requireStudent();
  if (!st) return go('#/vocab');
  loading(root);
  const set = await store.getVocabSet(id);
  if (!set || !set.published && !store.isAdmin()) { root.innerHTML = '<div class="wrap page"><div class="empty">Exam not found.<br><br><a class="btn" href="#/vocab">Back</a></div></div>'; return; }
  let run = ss.get(KEY(id));
  if (!run || run.name !== st.name || run.group !== st.group) {
    const att = buildAttempt(set);
    run = { att, answers: { mc: att.mc.map(() => null), open: att.open.map(() => '') }, end: Date.now() + (set.seconds || 480) * 1000, start: Date.now(), name: st.name, group: st.group };
    ss.set(KEY(id), run);
  }
  V = { set, ...run, busy: false };
  document.body.classList.add('running');
  window.onbeforeunload = e => { if (!V?.done) { e.preventDefault(); e.returnValue = ''; } };
  drawRun(root);
  V.tm = setInterval(tick, 1000); tick();
  S.cleanup = () => { clearInterval(V?.tm); window.onbeforeunload = null; document.body.classList.remove('running'); };
}
function drawRun(root) {
  const { att, answers, set } = V;
  const mcQ = att.mc.map((q, i) => `<fieldset class="vq"><legend><span class="muted">${i + 1}.</span> What does <b>“${esc(q.word)}”</b> mean? <small class="muted">Topic ${esc(q.topic)}</small></legend>
    <div class="vopts">${q.options.map((o, oi) => `<label class="vopt"><input type="radio" name="m${i}" value="${oi}" data-in="vmc" data-i="${i}" ${answers.mc[i] === oi ? 'checked' : ''}><b>${'ABCD'[oi]}</b><span>${esc(o)}</span></label>`).join('')}</div></fieldset>`).join('');
  const opQ = att.open.map((o, i) => `<div class="vopen"><label for="o${i}"><span class="muted">${i + 1}.</span> <b>${esc(o.meaning)}</b> <small class="muted">Topic ${esc(o.topic)}</small></label>
    <input class="inp" id="o${i}" data-in="vopen" data-i="${i}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="type the English word" value="${esc(answers.open[i])}"></div>`).join('');
  root.innerHTML = `<div class="vrun"><div class="vhead"><div><b>${esc(set.title)}</b><br><small class="muted">${esc(V.name)}</small></div>
      <div class="row"><span class="muted" id="vprog"></span><div class="timer" id="vtimer">${icon('clock', 18)}<span id="vt">--:--</span></div></div></div>
    <div class="vbody"><h3>Part 1 — Multiple choice</h3><p class="muted">Choose the correct Uzbek meaning.</p>${mcQ}
      <h3 class="mt2">Part 2 — Open questions</h3><p class="muted">Read the Uzbek meaning and type the English word or phrase.</p><div class="panel">${opQ}</div>
      <div class="row mt2" style="justify-content:flex-end"><button class="btn" data-act="vExit">Exit</button><button class="btn primary" data-act="vSubmit">Submit exam</button></div></div></div>`;
  progress();
}
const answeredN = () => V.answers.mc.filter(a => a != null).length + V.answers.open.filter(a => String(a).trim()).length;
function progress() { const el = $('#vprog'); if (el) el.textContent = `${answeredN()} / ${V.att.mc.length + V.att.open.length} answered`; }
const persist = () => ss.set(KEY(V.set.id), { att: V.att, answers: V.answers, end: V.end, start: V.start, name: V.name, group: V.group });
inputs.vmc = el => { V.answers.mc[+el.dataset.i] = +el.value; persist(); progress(); };
inputs.vopen = el => { V.answers.open[+el.dataset.i] = el.value; persist(); progress(); };
function tick() {
  if (!V || V.done) return;
  const left = Math.max(0, Math.round((V.end - Date.now()) / 1000));
  const t = $('#vt'); if (t) t.textContent = fmtTime(left);
  $('#vtimer')?.classList.toggle('low', left <= 60);
  if (left <= 0) finishRun(true);
}
actions.vExit = async () => { if (await confirmBox('Leave the exam?', 'Your attempt will be lost.', 'Leave', true)) { ss.del(KEY(V.set.id)); V.done = true; go('#/vocab'); } };
actions.vSubmit = async () => {
  const left = V.att.mc.length + V.att.open.length - answeredN();
  if (left > 0 && !(await confirmBox('Submit now?', `${left} question${left > 1 ? 's are' : ' is'} still empty and will count as wrong.`, 'Submit'))) return;
  finishRun(false);
};
async function finishRun(timeUp) {
  if (V.done || V.busy) return;
  V.busy = true; clearInterval(V.tm);
  const g = gradeAttempt(V.att, V.answers);
  const time = Math.min(V.set.seconds || 480, Math.round((Date.now() - V.start) / 1000));
  const rec = { set_id: V.set.id, set_title: V.set.title, student_name: V.name, group_code: V.group, mc: g.mc, open: g.open, score: g.score, total: g.total, percent: g.percent, time_sec: time };
  let saved = true;
  try { await store.saveVocabResult(rec); } catch (e) { saved = false; console.error(e); }
  V.done = true; ss.del(KEY(V.set.id)); window.onbeforeunload = null; document.body.classList.remove('running');
  let rank = null;
  try { const rows = marathonBoard(await store.listVocabResults()); const i = rows.findIndex(r => r.group === V.group && r.name.toLowerCase() === V.name.toLowerCase()); rank = i >= 0 ? { n: i + 1, of: rows.length, pts: rows[i].points } : null; } catch { /* ignore */ }
  drawResult(g, { timeUp, saved, rank, time });
}
function drawResult(g, { timeUp, saved, rank, time }) {
  const { att, answers } = V;
  const mcRows = att.mc.map((q, i) => { const ok = answers.mc[i] === q.correct, given = answers.mc[i] == null ? '—' : q.options[answers.mc[i]];
    return `<div class="vrev ${ok ? 'ok' : 'bad'}"><span>${ok ? icon('check', 16) : icon('x', 16)}</span><b>${esc(q.word)}</b><span class="muted ${ok ? '' : 'strike'}">${esc(given)}</span>${ok ? '' : `<span class="good">→ ${esc(q.options[q.correct])}</span>`}</div>`; }).join('');
  const opRows = att.open.map((o, i) => { const ok = isOpenCorrect(o, answers.open[i]);
    return `<div class="vrev ${ok ? 'ok' : 'bad'}"><span>${ok ? icon('check', 16) : icon('x', 16)}</span><b>${esc(o.meaning)}</b><span class="muted ${ok ? '' : 'strike'}">${esc(answers.open[i] || '—')}</span>${ok ? '' : `<span class="good">→ ${esc((o.accept?.length ? o.accept : [o.answer]).join(' / '))}</span>`}</div>`; }).join('');
  $('#view').innerHTML = `<div class="wrap page"><div class="panel" style="text-align:center">
    ${timeUp ? '<p class="badge draft">Time was up — submitted automatically</p>' : ''}
    <h1 class="ptitle">${g.percent >= 80 ? 'Excellent' : g.percent >= 50 ? 'Nice work' : 'Keep practising'}, ${esc(V.name.split(' ')[0])}!</h1>
    <div class="vscore"><b>${g.score}</b><span>/ ${g.total}</span></div>
    <div class="kv" style="justify-content:center"><div><b>${g.mc}/${att.mc.length}</b><span>multiple choice</span></div><div><b>${g.open}/${att.open.length}</b><span>open</span></div><div><b>${g.percent}%</b><span>score</span></div><div><b>${fmtTime(time)}</b><span>time</span></div></div>
    ${rank ? `<p class="mt"><span class="badge ok">${icon('trophy', 13)} Marathon rank #${rank.n} of ${rank.of} · ${rank.pts} points</span></p>` : ''}
    ${saved ? '' : '<p class="err">This result could not be saved to the leaderboard.</p>'}
    <div class="ctas" style="justify-content:center"><a class="btn primary" href="#/vocab/run/${V.set.id}">Try again</a><a class="btn" href="#/vocab">All exams</a><a class="btn" href="#/vocab/board">Leaderboard</a></div></div>
    <h3 class="mt2">Answer review</h3><div class="panel"><h4>Part 1</h4>${mcRows}<h4 class="mt">Part 2</h4>${opRows}</div></div>`;
  window.scrollTo(0, 0);
}

// ═════════════ marathon leaderboard ═════════════
const vf = { setId: '', group: '', period: '' };
export async function vocabBoard(root) {
  loading(root);
  const [sets, results] = await Promise.all([store.listVocabSets({ published: true }), store.listVocabResults()]);
  const groups = [...new Set(results.map(r => r.group_code))].sort();
  root.innerHTML = `<div class="wrap page">${tabs('board')}
    <h1 class="ptitle">Vocabulary Marathon — Leaderboard</h1><p class="muted">Your best score on every exam is added up. Ranked by total points.</p>
    <div class="filters">
      <select class="sel" data-in="vf" data-k="setId"><option value="">All exams</option>${sets.map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join('')}</select>
      <select class="sel" data-in="vf" data-k="group"><option value="">All groups</option>${groups.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('')}</select>
      <select class="sel" data-in="vf" data-k="period"><option value="">All time</option><option value="week">This week</option><option value="today">Today</option></select>
    </div><div id="vbBody"></div></div>`;
  const draw = () => {
    $$('select[data-in=vf]').forEach(s => { s.value = vf[s.dataset.k]; });
    const since = vf.period === 'today' ? new Date(new Date().setHours(0, 0, 0, 0)) : vf.period === 'week' ? new Date(Date.now() - 7 * 864e5) : null;
    const rows = marathonBoard(results, { ...vf, since });
    $('#vbBody').innerHTML = rows.length ? `<div class="tablewrap"><table><thead><tr><th>#</th><th>Student</th><th>Group</th><th>Exams</th><th>Points</th><th>Average</th><th class="r">Time</th></tr></thead><tbody>
      ${rows.map((r, i) => { const me = S.student && r.group === S.student.group && r.name.toLowerCase() === S.student.name.trim().toLowerCase();
        return `<tr class="${me ? 'me' : ''}"><td><span class="rk ${i < 3 ? 'g' + (i + 1) : ''}">${i + 1}</span></td><td><b>${esc(r.name)}</b>${me ? ' <span class="badge ok">You</span>' : ''}</td><td class="muted">${esc(r.group)}</td><td>${r.exams}</td><td><b>${r.points}</b></td><td>${r.avg}%</td><td class="r muted">${fmtTime(r.time)}</td></tr>`; }).join('')}</tbody></table></div>`
      : '<div class="empty">No results yet. Be the first!</div>';
  };
  vocabBoard.draw = draw; draw();
}
inputs.vf = el => { vf[el.dataset.k] = el.value; vocabBoard.draw(); };

// ═════════════ teacher tab ═════════════
export async function vocabTab(body) {
  const [sets, results] = await Promise.all([store.listVocabSets(), store.listVocabResults()]);
  body.innerHTML = `<div class="row between wrapx" style="margin-bottom:14px"><b>${sets.length} vocabulary exams</b>
      <div class="row"><button class="btn sm" data-act="vBundle">Import sample exams</button><button class="btn primary sm" data-act="vEdit">${icon('plus', 16)} New exam</button></div></div>
    ${sets.length ? `<div class="tablewrap"><table><thead><tr><th>Title</th><th>Words</th><th>Questions</th><th>Time</th><th>Status</th><th class="r"></th></tr></thead><tbody>
      ${sets.map(s => `<tr><td><b>${esc(s.title)}</b></td><td>${(s.words || []).length}</td><td>${s.mc_count}+${s.open_count}</td><td>${Math.round(s.seconds / 60)} min</td><td>${s.published ? '<span class="badge ok">Published</span>' : '<span class="badge draft">Draft</span>'}</td>
        <td class="r"><button class="btn sm" data-act="vEdit" data-id="${s.id}">${icon('edit', 14)} Edit</button> <button class="btn sm" data-act="vPub" data-id="${s.id}">${s.published ? 'Unpublish' : 'Publish'}</button> <button class="btn sm danger" data-act="vDel" data-id="${s.id}">${icon('trash', 14)}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No exams yet. Import the samples or create one.</div>'}
    <h2 class="ptitle mt2" style="font-size:22px">Recent results</h2>
    <div class="mt">${results.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Student</th><th>Group</th><th>Exam</th><th>Score</th><th>Time</th><th class="r"></th></tr></thead><tbody>
      ${results.slice(0, 200).map(r => `<tr><td class="muted">${fmtDateTime(r.created_at)}</td><td><b>${esc(r.student_name)}</b></td><td>${esc(r.group_code)}</td><td>${esc(r.set_title)}</td><td><b>${r.score}/${r.total}</b></td><td class="muted">${fmtTime(r.time_sec)}</td>
        <td class="r"><button class="btn sm danger" data-act="vResDel" data-id="${r.id}">${icon('trash', 14)}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No results yet.</div>'}</div>`;
  vocabTab.sets = sets; vocabTab.body = body;
}
const refresh = () => vocabTab(vocabTab.body);
actions.vBundle = async () => {
  let list = [];
  try { const r = await fetch('vocab.json'); if (!r.ok) throw new Error(); list = (await r.json()).sets; } catch { return toast('vocab.json not found', 'bad'); }
  const have = new Set((await store.listVocabSets()).map(t => t.title));
  let n = 0;
  for (const s of list) { if (have.has(s.title)) continue; await store.saveVocabSet({ id: uid(), published: true, ...s }); n++; }
  toast(n ? `${n} exams added` : 'Already imported', 'ok'); refresh();
};
actions.vPub = async el => { const s = vocabTab.sets.find(x => x.id === el.dataset.id); await store.saveVocabSet({ ...s, published: !s.published }); refresh(); };
actions.vDel = async el => { if (await confirmBox('Delete exam?', 'Past results stay on the leaderboard.', 'Delete', true)) { await store.deleteVocabSet(el.dataset.id); refresh(); } };
actions.vResDel = async el => { if (await confirmBox('Delete result?', 'This cannot be undone.', 'Delete', true)) { await store.deleteVocabResult(el.dataset.id); refresh(); } };
actions.vEdit = el => {
  const s = vocabTab.sets.find(x => x.id === el.dataset.id) || { title: '', topics: '', mc_count: 25, open_count: 15, seconds: 480, published: true, words: [] };
  modal(`<h2>${s.id ? 'Edit' : 'New'} vocabulary exam</h2>
    <label class="lbl">Title</label><input class="inp" id="vsTitle" value="${esc(s.title)}" placeholder="Vocabulary Exam — Topics 51–60">
    <div class="row"><div style="flex:1"><label class="lbl">Topics label</label><input class="inp" id="vsTopics" value="${esc(s.topics)}" placeholder="51–60"></div>
      <div style="flex:1"><label class="lbl">Minutes</label><input class="inp" id="vsMin" type="number" min="1" value="${Math.round(s.seconds / 60)}"></div></div>
    <div class="row"><div style="flex:1"><label class="lbl">Multiple-choice questions</label><input class="inp" id="vsMc" type="number" min="1" value="${s.mc_count}"></div>
      <div style="flex:1"><label class="lbl">Open questions</label><input class="inp" id="vsOp" type="number" min="0" value="${s.open_count}"></div></div>
    <label class="lbl">Words — one per line: english | uzbek | topic number</label>
    <textarea class="inp" id="vsWords" rows="10" placeholder="repair | ta'mirlash | 11">${esc((s.words || []).map(w => `${w.word} | ${w.meaning} | ${w.topic || ''}`).join('\n'))}</textarea>
    <label class="row mt"><input type="checkbox" id="vsPub" ${s.published ? 'checked' : ''}> Published</label>
    <div class="row mt" style="justify-content:flex-end"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="vSave" data-id="${s.id || ''}">Save</button></div>`, true);
};
actions.vSave = async el => {
  const words = $('#vsWords').value.split('\n').map(l => l.split('|').map(x => x.trim())).filter(p => p[0] && p[1]).map(p => ({ word: p[0], meaning: p[1], topic: p[2] || '' }));
  const title = $('#vsTitle').value.trim(), mc = Number($('#vsMc').value) || 25, op = Number($('#vsOp').value) || 0;
  if (!title) return toast('Title is required', 'bad');
  if (words.length < mc + op) return toast(`Need at least ${mc + op} words (you have ${words.length})`, 'bad');
  const old = vocabTab.sets.find(x => x.id === el.dataset.id);
  await store.saveVocabSet({ ...(old || {}), id: el.dataset.id || uid(), title, topics: $('#vsTopics').value.trim(), mc_count: mc, open_count: op, seconds: (Number($('#vsMin').value) || 8) * 60, published: $('#vsPub').checked, words });
  closeModal(); toast('Saved', 'ok'); refresh();
};
