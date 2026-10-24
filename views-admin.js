import { store, cloudConfigured } from './store.js';
import { CONFIG } from './config.js';
import { esc, parseBlock, parseOptions, serializeBlock, serializeOptions, parseTime, fmtTime, fmtDateTime, testMeta, setPath, csvCell, prepare,
  ATTENDANCE, HOMEWORK, makeAccessCode, formatCode, mondayOf, addDays, todayKey, monthOf, shiftMonth, weekReport, paymentStatus, fmtMoney, weeklyMessageUz, inviteMessageUz, uzShort } from './logic.js';
import { $, $$, actions, inputs, toast, icon, go, confirmBox, modal, closeModal, copyText } from './ui.js';

const adm = { tab: 'tests', rf: { section: '', group: '' } };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + Math.random().toString(16).slice(2));
const loading = root => { root.innerHTML = '<div class="loading">Loading…</div>'; };
const rerenderAdmin = () => adminHome($('#view'));

// ═════════════════════ LOGIN + DASHBOARD ═════════════════════
export async function adminHome(root) {
  if (!store.isAdmin()) return loginView(root);
  loading(root);
  root.innerHTML = `<div class="wrap page">
    <div class="row between wrapx"><div><h1 class="ptitle">Teacher panel</h1><p class="muted">${store.mode === 'cloud' ? 'Connected to your database.' : 'Demo mode: data is stored only in this browser. Connect Supabase to go live (see README).'}</p></div>
      <button class="btn sm" data-act="adminLogout">${icon('logout', 16)} Log out</button></div>
    <div class="tabs mt">${[['tests', 'Tests'], ['groups', 'Groups'], ['results', 'Results'], ['students', 'Students'], ['attendance', 'Attendance'], ['weekly', 'Weekly report'], ['payments', 'Payments']].map(([k, l]) => `<button class="chip ${adm.tab === k ? 'on' : ''}" data-act="admTab" data-k="${k}">${l}</button>`).join('')}</div>
    <div class="mt2" id="admBody"><div class="loading">Loading…</div></div></div>`;
  const body = $('#admBody');
  try {
    if (adm.tab === 'tests') await testsTab(body);
    else if (adm.tab === 'groups') await groupsTab(body);
    else if (adm.tab === 'students') await studentsTab(body);
    else if (adm.tab === 'attendance') await attendanceTab(body);
    else if (adm.tab === 'weekly') await weeklyTab(body);
    else if (adm.tab === 'payments') await paymentsTab(body);
    else await resultsTab(body);
  } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
actions.admTab = el => { adm.tab = el.dataset.k; rerenderAdmin(); };
actions.adminLogout = async () => { await store.adminLogout(); toast('Logged out'); rerenderAdmin(); };

function loginView(root) {
  const cloud = store.mode === 'cloud';
  root.innerHTML = `<div class="wrap page"><div class="intro" style="max-width:440px">
    <h1 class="ptitle">Teacher login</h1><p class="muted">${cloud ? 'Sign in with the teacher account you created in Supabase.' : 'Demo mode: enter the demo password (see js/config.js).'}</p>
    <div class="panel mt">${cloud ? '<label class="lbl">Email</label><input class="inp" id="lgEmail" type="email" autocomplete="username">' : ''}
      <label class="lbl">Password</label><input class="inp" id="lgPw" type="password" autocomplete="current-password">
      <div class="err" id="lgErr"></div>
      <button class="btn primary" style="width:100%" data-act="adminLogin">Log in</button></div></div></div>`;
  $('#lgPw').addEventListener('keydown', e => { if (e.key === 'Enter') actions.adminLogin(); });
}
actions.adminLogin = async () => {
  const err = $('#lgErr'); err.textContent = '';
  try { await store.adminLogin($('#lgEmail')?.value.trim(), $('#lgPw').value); rerenderAdmin(); }
  catch (e) { err.textContent = e.message; }
};

// ═════════════════════ TESTS TAB ═════════════════════
async function testsTab(body) {
  const tests = await store.listTests();
  body.innerHTML = `<div class="row between wrapx" style="margin-bottom:14px">
      <b>${tests.length} tests</b>
      <div class="row"><button class="btn sm" data-act="importBundle">Import bundled tests</button><a class="btn primary sm" href="#/admin/test/new">${icon('plus', 16)} New test</a></div></div>
    ${tests.length ? `<div class="tablewrap"><table><thead><tr><th>Title</th><th>Type</th><th>Questions</th><th>Status</th><th class="r">Actions</th></tr></thead><tbody>
      ${tests.map(t => `<tr><td><b>${esc(t.title)}</b></td><td><span class="badge ${t.format === 'multilevel' ? 'multi' : 'ielts'}">${t.format === 'multilevel' ? 'Multilevel' : 'IELTS'}</span> <span class="badge">${t.section}</span></td>
        <td>${testMeta(t).q}</td><td>${t.published ? '<span class="badge ok">Published</span>' : '<span class="badge draft">Draft</span>'}</td>
        <td class="r"><a class="btn sm" href="#/test/${t.id}">Preview</a> <a class="btn sm" href="#/admin/test/${t.id}">${icon('edit', 14)} Edit</a>
          <button class="btn sm" data-act="togglePub" data-id="${t.id}">${t.published ? 'Unpublish' : 'Publish'}</button>
          <button class="btn sm" data-act="dupTest" data-id="${t.id}">Copy</button>
          <button class="btn sm danger" data-act="delTest" data-id="${t.id}">${icon('trash', 14)}</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">No tests yet. Create one or import the bundled tests.</div>'}`;
}
actions.togglePub = async el => { const t = await store.getTest(el.dataset.id); await store.saveTest({ ...t, published: !t.published }); rerenderAdmin(); };
actions.dupTest = async el => {
  const t = await store.getTest(el.dataset.id);
  const { created_at, ...rest } = t;
  await store.saveTest({ ...rest, id: uid(), title: t.title + ' (copy)', published: false });
  toast('Copied as a draft', 'ok'); rerenderAdmin();
};
actions.delTest = async el => {
  const t = await store.getTest(el.dataset.id);
  if (!(await confirmBox('Delete this test?', `"${t.title}" will be removed. Past results stay in the leaderboard history.`, 'Delete', true))) return;
  await store.deleteTest(t.id); toast('Deleted'); rerenderAdmin();
};
actions.importBundle = async () => {
  let bundle;
  try { const r = await fetch('tests.json'); if (!r.ok) throw new Error(); bundle = (await r.json()).tests; } catch { return toast('tests.json was not found next to index.html', 'bad'); }
  if (!(await confirmBox('Import bundled tests?', `${bundle.length} tests will be added (existing ones with the same id are updated).`, 'Import'))) return;
  try {
    for (let i = 0; i < bundle.length; i += 4) await store.saveTests(bundle.slice(i, i + 4));
    toast(`Imported ${bundle.length} tests`, 'ok');
  } catch (e) { toast(e.message, 'bad'); }
  rerenderAdmin();
};

// ═════════════════════ GROUPS TAB ═════════════════════
async function groupsTab(body) {
  const groups = await store.listGroups();
  body.innerHTML = `<div class="panel"><b>Add a group</b><p class="muted" style="font-size:14px">Students enter this code to join. Codes are not case-sensitive.</p>
    <div class="grid3 mt" style="grid-template-columns:1fr 2fr auto;align-items:end"><div><label class="lbl">Code</label><input class="inp" id="gCode" placeholder="IELTS-7" maxlength="30"></div>
      <div><label class="lbl">Name (optional)</label><input class="inp" id="gName" placeholder="Evening group, Mon/Wed/Fri" maxlength="60"></div>
      <button class="btn primary" data-act="addGroup">${icon('plus', 16)} Add</button></div></div>
    <div class="mt2">${groups.length ? `<div class="tablewrap"><table><thead><tr><th>Code</th><th>Name</th><th class="r"></th></tr></thead><tbody>
      ${groups.map(g => `<tr><td><b>${esc(g.code)}</b></td><td class="muted">${esc(g.name || '')}</td><td class="r"><button class="btn sm danger" data-act="delGroup" data-code="${esc(g.code)}">${icon('trash', 14)}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No groups yet.</div>'}</div>`;
}
actions.addGroup = async () => {
  const code = $('#gCode').value.trim().toUpperCase().replace(/\s+/g, '-');
  if (!code) return toast('Enter a code', 'bad');
  try { await store.saveGroup({ code, name: $('#gName').value.trim() }); toast('Group added', 'ok'); rerenderAdmin(); } catch (e) { toast(e.message, 'bad'); }
};
actions.delGroup = async el => {
  if (!(await confirmBox('Delete group?', `Students will no longer be able to join with "${el.dataset.code}". Their old results stay.`, 'Delete', true))) return;
  try { await store.deleteGroup(el.dataset.code); } catch (e) { return toast(e.message, 'bad'); }
  rerenderAdmin();
};

// ═════════════════════ RESULTS TAB ═════════════════════
let lastResults = [];
async function resultsTab(body) {
  lastResults = await store.listResults();
  const groups = [...new Set(lastResults.map(r => r.group_code))].sort();
  body.innerHTML = `<div class="filters" style="margin-top:0">
    <select class="sel" data-in="rf" data-k="section"><option value="">All sections</option><option value="reading">Reading</option><option value="listening">Listening</option></select>
    <select class="sel" data-in="rf" data-k="group"><option value="">All groups</option>${groups.map(g => `<option>${esc(g)}</option>`).join('')}</select>
    <button class="btn sm" data-act="exportCsv" style="margin-left:auto">Export CSV</button></div><div id="resBody"></div>`;
  $$('select[data-in=rf]').forEach(s => { s.value = adm.rf[s.dataset.k]; });
  drawResults();
}
const filteredResults = () => lastResults.filter(r => (!adm.rf.section || r.section === adm.rf.section) && (!adm.rf.group || r.group_code === adm.rf.group));
function drawResults() {
  const rs = filteredResults();
  $('#resBody').innerHTML = rs.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Student</th><th>Group</th><th>Test</th><th>Score</th><th>Band / Level</th><th>Time</th><th></th></tr></thead><tbody>
    ${rs.slice(0, 500).map(r => `<tr><td class="muted">${fmtDateTime(r.created_at)}</td><td><b>${esc(r.student_name)}</b></td><td>${esc(r.group_code)}</td><td>${esc(r.test_title)}</td>
      <td>${r.correct}/${r.total} (${r.percent}%)</td><td><b>${esc(r.band)}</b></td><td class="muted">${fmtTime(r.time_sec)}</td>
      <td class="r"><a class="btn sm" href="#/result/${r.id}">View</a> <button class="btn sm danger" data-act="delResult" data-id="${r.id}">${icon('trash', 14)}</button></td></tr>`).join('')}
    </tbody></table></div>${rs.length > 500 ? `<p class="muted mt">Showing the newest 500 of ${rs.length}. Export CSV for everything.</p>` : ''}` : '<div class="empty">No results yet.</div>';
}
inputs.rf = el => { adm.rf[el.dataset.k] = el.value; drawResults(); };
actions.delResult = async el => {
  if (!(await confirmBox('Delete this result?', 'It will disappear from the leaderboard too.', 'Delete', true))) return;
  await store.deleteResult(el.dataset.id); lastResults = lastResults.filter(r => r.id !== el.dataset.id); drawResults();
};
actions.exportCsv = () => {
  const rows = [['Date', 'Student', 'Group', 'Test', 'Section', 'Format', 'Correct', 'Total', 'Percent', 'Band/Level', 'Time (s)']]
    .concat(filteredResults().map(r => [r.created_at, r.student_name, r.group_code, r.test_title, r.section, r.format, r.correct, r.total, r.percent, r.band, r.time_sec]));
  const blob = new Blob(['﻿' + rows.map(r => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'results.csv'; a.click();
};

// ═════════════════════ TEST EDITOR ═════════════════════
let E = null;
const T = v => { if (v == null) return ''; const m = Math.floor(v / 60), sec = v - m * 60; return `${m}:${sec < 10 ? '0' : ''}${Number.isInteger(sec) ? sec : sec.toFixed(2).replace(/0+$/, '')}`; };
const TIMING_KEYS = [['start', 'Part starts'], ['readStart', 'Reading time starts'], ['readEnd', 'Reading time ends'], ['end', 'Part ends'], ['checkEnd', 'Checking ends']];

const blankBlock = () => ({ instruction: '', body: '', optionsText: '', qtext: '' });
const blankPart = () => ({ title: '', instruction: '', text: '', image: '', audio_url: '', options_title: '', optionsText: '', timing: {}, blocks: [blankBlock()] });

export function toDraft(t) {
  return {
    id: t.id, title: t.title, section: t.section, format: t.format, duration_min: t.duration_min, play_once: !!t.play_once, published: t.published !== false,
    audio_url: t.data?.audio_url || '', glossary: t.data?.glossary, created_at: t.created_at,
    parts: (t.data?.parts || []).map(p => ({
      title: p.title || '', instruction: p.instruction || '', text: p.text || '', image: p.image || '', audio_url: p.audio_url || '',
      options_title: p.options_title || '', optionsText: serializeOptions(p.options),
      timing: Object.fromEntries(TIMING_KEYS.map(([k]) => [k, p.timing?.[k] == null ? '' : T(p.timing[k])])),
      blocks: (p.blocks || []).map(b => ({ instruction: b.instruction || '', body: b.body || '', optionsText: serializeOptions(b.options), qtext: serializeBlock(b.questions) })),
    })),
  };
}

function sharedFor(p, b) { const bo = parseOptions(b.optionsText); return bo.length ? bo : parseOptions(p.optionsText); }

export function buildTest(d) {
  const errors = [];
  if (!d.title.trim()) errors.push('Give the test a title.');
  const parts = d.parts.map((p, pi) => {
    const out = { title: p.title.trim(), instruction: p.instruction.trim(), text: p.text.trim(), blocks: [] };
    if (p.image.trim()) out.image = p.image.trim();
    if (p.audio_url.trim()) out.audio_url = p.audio_url.trim();
    if (p.options_title.trim()) out.options_title = p.options_title.trim();
    const po = parseOptions(p.optionsText); if (po.length) out.options = po;
    const tm = {}; let any = false;
    for (const [k] of TIMING_KEYS) { const v = parseTime(p.timing[k]); if (v != null) { tm[k] = v; any = true; } else if (String(p.timing[k] || '').trim()) errors.push(`Part ${pi + 1}: "${p.timing[k]}" is not a valid time (use m:ss).`); }
    if (any) out.timing = tm;
    p.blocks.forEach((b, bi) => {
      const { questions, errors: errs } = parseBlock(b.qtext, sharedFor(p, b));
      errs.forEach(e => errors.push(`Part ${pi + 1}, group ${bi + 1}: ${e}`));
      const blk = { instruction: b.instruction.trim(), questions };
      if (b.body.trim()) blk.body = b.body.trim();
      const bo = parseOptions(b.optionsText); if (bo.length) blk.options = bo;
      if (blk.questions.length || blk.body || blk.instruction) out.blocks.push(blk);
    });
    return out;
  });
  const data = { parts };
  if (d.audio_url.trim()) data.audio_url = d.audio_url.trim();
  if (d.glossary) data.glossary = d.glossary;
  const test = { id: d.id, section: d.section, format: d.format, title: d.title.trim(), duration_min: Math.max(1, Number(d.duration_min) || 60), play_once: d.section === 'listening' && !!d.play_once, published: !!d.published, data };
  if (d.created_at) test.created_at = d.created_at;
  if (!errors.length && !prepare(test).flat.length) errors.push('Add at least one question.');
  return { test, errors };
}

export async function adminEditor(root, id) {
  if (!store.isAdmin()) return go('#/admin');
  loading(root);
  if (id === 'new') {
    E = { id: uid(), title: '', section: 'reading', format: 'multilevel', duration_min: 60, play_once: false, published: false, audio_url: '', parts: [blankPart()] };
  } else {
    const t = await store.getTest(id);
    if (!t) { root.innerHTML = '<div class="wrap page"><div class="empty">Test not found.</div></div>'; return; }
    E = toDraft(t);
  }
  drawEditor(root);
}

function fieldPath(path, ph = '', cls = 'inp', extra = '') {
  const keys = path.split('.'); let v = E; for (const k of keys) v = v?.[k];
  return `<input class="${cls}" data-in="ed" data-path="${path}" value="${esc(v ?? '')}" placeholder="${esc(ph)}" ${extra}>`;
}
function areaPath(path, ph = '', cls = 'inp', rows = 4, handler = 'ed') {
  const keys = path.split('.'); let v = E; for (const k of keys) v = v?.[k];
  return `<textarea class="${cls}" data-in="${handler}" data-path="${path}" rows="${rows}" placeholder="${esc(ph)}" style="min-height:0">${esc(v ?? '')}</textarea>`;
}

function drawEditor(root) {
  const y = window.scrollY;
  const lst = E.section === 'listening';
  root.innerHTML = `<div class="wrap page">
    <a class="muted" href="#/admin">← Teacher panel</a>
    <div class="row between wrapx mt"><h1 class="ptitle">${E.created_at ? 'Edit test' : 'New test'}</h1>
      <div class="row"><button class="btn" data-act="edSave" data-pub="0">Save</button><button class="btn primary" data-act="edSave" data-pub="1">Save &amp; publish</button></div></div>

    <details class="help"><summary>How to write questions (read once)</summary>
      <p><b>Each question is one line:</b> <code>question :: options or type :: answer</code></p>
      <pre class="code">Why did she leave? :: A) She was tired | B) She was late | C) She was ill :: B
The author supports the plan. :: TFNG :: Not Given
The museum is in the ___ of town. :: GAP :: centre / center
Paragraph 15 :: MATCH :: D</pre>
      <p><b>TFNG</b> = True/False/Not Given, <b>YNNG</b> = Yes/No/Not Given. <b>MATCH</b> picks a letter from the "Options" list of the part (or of the question group), written as <code>A) text</code> one per line.</p>
      <p><b>Gaps inside a passage or notes:</b> type the answer in double square brackets, e.g. <code>Going into a dark [[cave]] needs courage</code>. Use <code>/</code> between accepted answers: <code>[[7.30/7:30/half past seven]]</code>. They are numbered automatically, in order, together with the other questions.</p>
      <p>Passage text: blank line = new paragraph, <code># Heading</code>, <code>## Small label</code>, <code>**bold**</code>.</p>
    </details>

    <div class="panel mt">
      <div class="grid2"><div><label class="lbl">Title</label>${fieldPath('title', 'e.g. Multilevel Reading 22')}</div>
        <div class="grid3" style="grid-template-columns:1fr 1fr 1fr"><div><label class="lbl">Section</label><select class="sel" data-in="ed" data-path="section" data-redraw="1"><option value="reading" ${E.section === 'reading' ? 'selected' : ''}>Reading</option><option value="listening" ${lst ? 'selected' : ''}>Listening</option></select></div>
          <div><label class="lbl">Format</label><select class="sel" data-in="ed" data-path="format"><option value="multilevel" ${E.format === 'multilevel' ? 'selected' : ''}>Multilevel</option><option value="ielts" ${E.format === 'ielts' ? 'selected' : ''}>IELTS</option></select></div>
          <div><label class="lbl">Minutes</label><input class="inp" type="number" min="1" max="240" data-in="ed" data-path="duration_min" value="${esc(E.duration_min)}"></div></div></div>
      <div class="row wrapx mt"><label class="row"><input type="checkbox" data-in="ed" data-path="published" ${E.published ? 'checked' : ''}> Published (students can see it)</label>
        ${lst ? `<label class="row"><input type="checkbox" data-in="ed" data-path="play_once" ${E.play_once ? 'checked' : ''}> Exam mode: audio cannot be paused</label>` : ''}</div>
      ${lst ? `<label class="lbl">Audio file (one recording for the whole test)</label>
        <div class="row">${fieldPath('audio_url', 'audio/my-test.mp3 or https://…')}${store.canUpload ? `<label class="btn sm" style="cursor:pointer">Upload<input type="file" accept="audio/*" hidden data-in="upload" data-path="audio_url"></label>` : ''}</div>
        <p class="muted" style="font-size:13px;margin-top:6px">Tip: with one recording, fill in the times of each part below and parts will switch automatically.</p>` : ''}
    </div>

    ${E.parts.map((p, pi) => partHTML(p, pi, lst)).join('')}
    <div class="row mt2"><button class="btn" data-act="addPart">${icon('plus', 16)} Add part</button><div class="grow"></div>
      <button class="btn" data-act="edSave" data-pub="0">Save</button><button class="btn primary" data-act="edSave" data-pub="1">Save &amp; publish</button></div>
  </div>`;
  $$('textarea[data-in=edq]').forEach(updateStatus);
  window.scrollTo(0, y);
}

function partHTML(p, pi, lst) {
  const i = `parts.${pi}`;
  return `<div class="ed-part"><div class="row between"><h3>Part ${pi + 1}</h3>${E.parts.length > 1 ? `<button class="btn sm danger" data-act="delPart" data-i="${pi}">${icon('trash', 14)} Remove part</button>` : ''}</div>
    <div class="grid2"><div><label class="lbl">Part title</label>${fieldPath(`${i}.title`, 'e.g. Types of Museums')}</div>
      <div><label class="lbl">Instruction (shown at the top)</label>${fieldPath(`${i}.instruction`, 'e.g. Read the text and fill in each gap with ONE WORD.')}</div></div>
    <label class="lbl">Passage / notes <span style="font-weight:500">(optional, use [[answer]] for gaps)</span></label>${areaPath(`${i}.text`, 'Paste the reading passage or listening notes here…', 'inp', 8)}
    <div class="grid2"><div><label class="lbl">Options list title (optional)</label>${fieldPath(`${i}.options_title`, 'e.g. List of situations')}</div>
      <div><label class="lbl">Image / map URL (optional)</label><div class="row">${fieldPath(`${i}.image`, 'img/map.png or https://…')}${store.canUpload ? `<label class="btn sm" style="cursor:pointer">Upload<input type="file" accept="image/*" hidden data-in="upload" data-path="${i}.image"></label>` : ''}</div></div></div>
    <label class="lbl">Options for this part <span style="font-weight:500">(one per line: A) text) — used by MATCH questions</span></label>${areaPath(`${i}.optionsText`, 'A) first option\nB) second option', 'inp', 3)}
    ${lst ? `<label class="lbl">Timing in the recording (m:ss, optional)</label><div class="grid3" style="grid-template-columns:repeat(5,1fr)">${TIMING_KEYS.map(([k, l]) => `<div><small class="muted">${l}</small>${fieldPath(`${i}.timing.${k}`, '0:00')}</div>`).join('')}</div>
      <label class="lbl">Separate audio for this part (only if the test has no single recording)</label>${fieldPath(`${i}.audio_url`, 'audio/part1.mp3')}` : ''}
    ${p.blocks.map((b, bi) => blockHTML(b, pi, bi)).join('')}
    <button class="btn sm mt" data-act="addBlock" data-i="${pi}">${icon('plus', 14)} Add question group</button></div>`;
}
function blockHTML(b, pi, bi) {
  const i = `parts.${pi}.blocks.${bi}`;
  return `<div class="ed-block"><div class="row between"><b>Question group ${bi + 1}</b>${E.parts[pi].blocks.length > 1 ? `<button class="btn sm danger" data-act="delBlock" data-i="${pi}" data-j="${bi}">${icon('trash', 14)}</button>` : ''}</div>
    <label class="lbl">Instruction for this group</label>${fieldPath(`${i}.instruction`, 'e.g. Choose the correct letter, A, B, C or D.')}
    <label class="lbl">Notes with gaps (optional)</label>${areaPath(`${i}.body`, 'e.g. Summary text with [[answer]] gaps', 'inp', 3)}
    <label class="lbl">Options just for this group (optional; overrides the part's list)</label>${areaPath(`${i}.optionsText`, 'A) heading one\nB) heading two', 'inp', 2)}
    <label class="lbl">Questions (one per line)</label>${areaPath(`${i}.qtext`, 'Question :: A) one | B) two | C) three :: B', 'inp', 6, 'edq')}
    <div class="parse" data-status></div></div>`;
}

function updateStatus(el) {
  const m = el.dataset.path.match(/^parts\.(\d+)\.blocks\.(\d+)\.qtext$/);
  if (!m) return;
  const p = E.parts[+m[1]], b = p.blocks[+m[2]];
  const { questions, errors } = parseBlock(b.qtext, sharedFor(p, b));
  const st = el.closest('.ed-block').querySelector('[data-status]');
  st.className = 'parse ' + (errors.length ? 'bad' : questions.length ? 'ok' : '');
  st.textContent = errors.length ? errors.join('\n') : questions.length ? `✓ ${questions.length} question${questions.length > 1 ? 's' : ''} recognised` : '';
}

inputs.ed = el => {
  if (!E) return;
  const v = el.type === 'checkbox' ? el.checked : el.value;
  setPath(E, el.dataset.path, v);
  if (el.dataset.redraw) drawEditor($('#view'));
  $$('textarea[data-in=edq]').forEach(updateStatus);   // options changes can affect MATCH validation
};
inputs.edq = el => { if (!E) return; setPath(E, el.dataset.path, el.value); updateStatus(el); };
inputs.upload = async el => {
  const f = el.files?.[0]; if (!f) return;
  toast('Uploading…');
  try {
    const url = await store.uploadFile(f);
    setPath(E, el.dataset.path, url);
    const t = $(`input[data-path="${el.dataset.path}"]:not([type=file])`); if (t) t.value = url;
    toast('Uploaded', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
};
actions.addPart = () => { E.parts.push(blankPart()); drawEditor($('#view')); };
actions.delPart = async el => { if (await confirmBox('Remove this part?', 'Its questions will be deleted.', 'Remove', true)) { E.parts.splice(+el.dataset.i, 1); drawEditor($('#view')); } };
actions.addBlock = el => { E.parts[+el.dataset.i].blocks.push(blankBlock()); drawEditor($('#view')); };
actions.delBlock = async el => { if (await confirmBox('Remove this group?', 'Its questions will be deleted.', 'Remove', true)) { E.parts[+el.dataset.i].blocks.splice(+el.dataset.j, 1); drawEditor($('#view')); } };
actions.edSave = async el => {
  const draft = { ...E, published: el.dataset.pub === '1' ? true : E.published };
  const { test, errors } = buildTest(draft);
  if (errors.length) {
    modal(`<h2>Please fix these first</h2><pre class="code" style="white-space:pre-wrap;margin:14px 0">${esc(errors.slice(0, 12).join('\n'))}${errors.length > 12 ? `\n… and ${errors.length - 12} more` : ''}</pre><button class="btn primary" data-act="closeModal">OK</button>`);
    return;
  }
  try {
    const saved = await store.saveTest(test);
    E.created_at = saved?.created_at || E.created_at; E.published = test.published;
    toast(test.published ? 'Saved and published' : 'Saved', 'ok');
    go('#/admin');
  } catch (e) { toast(e.message, 'bad'); }
};

// ═════════════════════ FAMILY PORTAL TOOLS: STUDENTS / ATTENDANCE / WEEKLY REPORT / PAYMENTS ═════════════════════
Object.assign(adm, { stu: { group: '' }, att: { group: '', date: todayKey() }, wk: { group: '', week: mondayOf(todayKey()) }, pay: { group: '', period: monthOf(todayKey()) } });
const familyLink = () => `${location.origin}${location.pathname}#/family`;
const ATT_LABEL = { present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused' };
const HW_LABEL = { done: 'Done', partial: 'Partly', missing: 'Not done', none: 'None given' };
const pickGroup = (groups, cur) => (groups.some(g => g.code === cur) ? cur : groups[0]?.code || '');
const groupSelect = (key, groups, cur, all = false) => `<select class="sel" data-in="admf" data-s="${key}" data-k="group" aria-label="Group">${all ? '<option value="">All groups</option>' : ''}${groups.map(g => `<option value="${esc(g.code)}" ${g.code === cur ? 'selected' : ''}>${esc(g.code)}${g.name ? ' · ' + esc(g.name) : ''}</option>`).join('')}</select>`;
const noGroups = '<div class="empty">Create a group first (Groups tab), then add its students.</div>';
const payBadge = st => ({ paid: '<span class="badge ok">Paid</span>', partial: '<span class="badge draft">Partly paid</span>', unpaid: '<span class="badge bad">Unpaid</span>', none: '<span class="badge">—</span>' }[st]);
inputs.admf = el => { adm[el.dataset.s][el.dataset.k] = el.value; rerenderAdmin(); };
const downloadCsv = (name, rows) => {
  const blob = new Blob(['﻿' + rows.map(r => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
};

// ───── Students ─────
let stuAll = [];
async function studentsTab(body) {
  const [groups, all] = await Promise.all([store.listGroups(), store.listStudents()]);
  if (!groups.length) { body.innerHTML = noGroups; return; }
  stuAll = all;
  const g = adm.stu.group, list = all.filter(s => !g || s.group_code === g);
  body.innerHTML = `<div class="panel"><b>Add students</b>
      <p class="muted" style="font-size:14px">One student per line. You can add the parent's name after a semicolon: <code>Ali Valiyev; Karim Valiyev</code>. Every student gets a personal 12-digit number to log in to the family page.</p>
      <div class="grid2 mt" style="grid-template-columns:minmax(160px,220px) 1fr;align-items:start">
        <div><label class="lbl" for="stuGroup">Group</label><select class="sel" id="stuGroup">${groups.map(x => `<option value="${esc(x.code)}" ${x.code === (g || groups[0].code) ? 'selected' : ''}>${esc(x.code)}</option>`).join('')}</select></div>
        <div><label class="lbl" for="stuNames">Students</label><textarea class="inp" id="stuNames" rows="4" placeholder="Ali Valiyev; Karim Valiyev&#10;Madina Karimova"></textarea></div></div>
      <button class="btn primary mt" data-act="addStudents">${icon('plus', 16)} Add and create numbers</button></div>
    <div class="row between wrapx mt2"><div class="row wrapx"><b>${list.length} student${list.length === 1 ? '' : 's'}</b>${groupSelect('stu', groups, g, true)}</div>
      <button class="btn sm" data-act="exportCodes">Export numbers (CSV)</button></div>
    <div class="mt">${list.length ? `<div class="tablewrap"><table><thead><tr><th>Student</th><th>Group</th><th>Personal number</th><th>Status</th><th class="r">Actions</th></tr></thead><tbody>
      ${list.map(s => `<tr><td><b>${esc(s.full_name)}</b>${s.parent_name ? `<br><small class="muted">Parent: ${esc(s.parent_name)}</small>` : ''}</td><td>${esc(s.group_code)}</td>
        <td><code class="mono">${esc(formatCode(s.access_code))}</code></td><td>${s.active === false ? '<span class="badge draft">Paused</span>' : '<span class="badge ok">Active</span>'}</td>
        <td class="r"><button class="btn sm" data-act="stuInvite" data-id="${s.id}">Copy invitation</button> <button class="btn sm" data-act="stuNewCode" data-id="${s.id}">New number</button>
          <button class="btn sm" data-act="stuToggle" data-id="${s.id}">${s.active === false ? 'Activate' : 'Pause'}</button> <button class="btn sm danger" data-act="stuDelete" data-id="${s.id}" aria-label="Delete ${esc(s.full_name)}">${icon('trash', 14)}</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">No students yet. Add some above.</div>'}</div>
    <p class="muted mt" style="font-size:13px">Personal numbers give read-only access to one student's attendance, homework and payment status. Pausing a student or issuing a new number stops the old number immediately.</p>`;
}
actions.addStudents = async () => {
  const group = $('#stuGroup').value;
  const lines = $('#stuNames').value.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return toast('Type at least one name', 'bad');
  const taken = new Set(stuAll.map(s => s.access_code)), have = new Set(stuAll.filter(s => s.group_code === group).map(s => s.full_name.toLowerCase()));
  const fresh = []; let skipped = 0;
  for (const line of lines) {
    const [n, ...rest] = line.split(';');
    const name = n.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (name.length < 2 || have.has(name.toLowerCase())) { skipped++; continue; }
    have.add(name.toLowerCase());
    const code = makeAccessCode(taken); taken.add(code);
    fresh.push({ id: uid(), full_name: name, group_code: group, access_code: code, parent_name: rest.join(';').trim().slice(0, 80), active: true });
  }
  if (!fresh.length) return toast('Nothing to add: those names are already in the group', 'bad');
  try { await store.saveStudents(fresh); toast(`${fresh.length} student${fresh.length > 1 ? 's' : ''} added${skipped ? `, ${skipped} skipped (already in the group)` : ''}`, 'ok'); adm.stu.group = group; rerenderAdmin(); } catch (e) { toast(e.message, 'bad'); }
};
const stuById = id => stuAll.find(s => s.id === id);
actions.stuInvite = el => { const s = stuById(el.dataset.id); if (s) copyText(inviteMessageUz({ name: s.full_name, code: s.access_code, link: familyLink(), brand: CONFIG.brand, signature: CONFIG.teacher }), 'Invitation copied'); };
actions.stuNewCode = async el => {
  const s = stuById(el.dataset.id); if (!s) return;
  if (!(await confirmBox('Issue a new number?', `The old number of ${s.full_name} stops working immediately. Send the new number to the family.`, 'Issue new number'))) return;
  try { await store.saveStudents([{ ...s, access_code: makeAccessCode(new Set(stuAll.map(x => x.access_code))) }]); toast('New number issued', 'ok'); rerenderAdmin(); } catch (e) { toast(e.message, 'bad'); }
};
actions.stuToggle = async el => { const s = stuById(el.dataset.id); if (!s) return; try { await store.saveStudents([{ ...s, active: s.active === false }]); rerenderAdmin(); } catch (e) { toast(e.message, 'bad'); } };
actions.stuDelete = async el => {
  const s = stuById(el.dataset.id); if (!s) return;
  if (!(await confirmBox('Delete this student?', `${s.full_name} and ALL their attendance, homework and payment records will be removed. This cannot be undone. Use "Pause" to keep the history.`, 'Delete', true))) return;
  try { await store.deleteStudent(s.id); toast('Student deleted'); rerenderAdmin(); } catch (e) { toast(e.message, 'bad'); }
};
actions.exportCodes = () => downloadCsv('student-numbers.csv', [['Student', 'Group', 'Parent', 'Personal number']].concat(stuAll.filter(s => !adm.stu.group || s.group_code === adm.stu.group).map(s => [s.full_name, s.group_code, s.parent_name, formatCode(s.access_code)])));

// ───── Attendance register ─────
const seg = (name, vals, labels, cur) => `<div class="seg sm" role="radiogroup">${vals.map(v => `<label class="opt"><input type="radio" name="${name}" value="${v}" ${cur === v ? 'checked' : ''}><span>${labels[v]}</span></label>`).join('')}</div>`;
async function attendanceTab(body) {
  const [groups, students] = await Promise.all([store.listGroups(), store.listStudents()]);
  if (!groups.length) { body.innerHTML = noGroups; return; }
  adm.att.group = pickGroup(groups, adm.att.group);
  const { group, date } = adm.att;
  const roster = students.filter(s => s.group_code === group && s.active !== false);
  const existing = await store.getLesson(group, date);
  const rec = new Map((existing?.records || []).map(r => [r.student_id, r])), les = existing?.lesson || {};
  body.innerHTML = `<div class="filters" style="margin-top:0">${groupSelect('att', groups, group)}
      <input class="inp" type="date" value="${esc(date)}" data-in="admf" data-s="att" data-k="date" aria-label="Lesson date" style="max-width:190px">
      ${existing ? '<span class="badge ok">Saved lesson — editing</span>' : '<span class="badge">New lesson</span>'}</div>
    ${roster.length ? `<div class="panel"><div class="grid2"><div><label class="lbl" for="attTopic">Lesson topic</label><input class="inp" id="attTopic" maxlength="120" value="${esc(les.topic || '')}" placeholder="e.g. Past Simple vs Present Perfect"></div>
        <div><label class="lbl" for="attTask">Homework given</label><input class="inp" id="attTask" maxlength="200" value="${esc(les.homework || '')}" placeholder="e.g. Workbook p. 42, ex. 3–5"></div></div>
      <div class="row wrapx mt"><button class="btn sm" data-act="attAll" data-k="a" data-v="present">Everyone present</button><button class="btn sm" data-act="attAll" data-k="h" data-v="done">Everyone did the homework</button></div></div>
      <div class="tablewrap mt"><table><thead><tr><th>Student</th><th>Attendance</th><th>Homework</th><th>Comment for parents</th></tr></thead><tbody id="attRows">
      ${roster.map(s => { const r = rec.get(s.id) || {}; return `<tr data-stu="${s.id}"><td><b>${esc(s.full_name)}</b></td><td>${seg('a-' + s.id, ATTENDANCE, ATT_LABEL, r.attendance || 'present')}</td>
        <td>${seg('h-' + s.id, HOMEWORK, HW_LABEL, r.homework || 'none')}</td><td><input class="inp note" maxlength="200" value="${esc(r.note || '')}" aria-label="Comment for ${esc(s.full_name)}" placeholder="optional"></td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="row mt" style="justify-content:flex-end"><button class="btn primary" data-act="attSave">Save lesson</button></div>
      <p class="muted" style="font-size:13px">The comment is visible to the family. Do not write anything private here. "Excused" lessons are not counted against attendance; "None given" means no homework for this student.</p>`
      : '<div class="empty" style="margin-top:16px">This group has no active students. Add them in the Students tab.</div>'}`;
}
actions.attAll = el => { $$('#attRows tr[data-stu]').forEach(tr => { const r = $(`input[name="${el.dataset.k}-${tr.dataset.stu}"][value="${el.dataset.v}"]`, tr); if (r) r.checked = true; }); };
actions.attSave = async () => {
  const { group, date } = adm.att, rows = $$('#attRows tr[data-stu]');
  if (!rows.length) return toast('This group has no active students', 'bad');
  const records = rows.map(tr => { const id = tr.dataset.stu; return { student_id: id, attendance: $(`input[name="a-${id}"]:checked`, tr)?.value || 'present', homework: $(`input[name="h-${id}"]:checked`, tr)?.value || 'none', note: $('.note', tr).value.trim().slice(0, 200) }; });
  const task = $('#attTask').value.trim();
  try {
    await store.saveLesson({ group_code: group, lesson_date: date, topic: $('#attTopic').value.trim(), homework: task }, records);
    const unset = task ? records.filter(r => r.homework === 'none').length : 0;
    toast(unset ? `Lesson saved. ${unset} student${unset > 1 ? 's have' : ' has'} no homework status although homework was given.` : 'Lesson saved', 'ok');
    rerenderAdmin();
  } catch (e) { toast(e.message, 'bad'); }
};

// ───── Weekly report ─────
let wkRows = [];
async function weeklyTab(body) {
  const [groups, students] = await Promise.all([store.listGroups(), store.listStudents()]);
  if (!groups.length) { body.innerHTML = noGroups; return; }
  adm.wk.group = pickGroup(groups, adm.wk.group);
  const { group, week } = adm.wk, end = addDays(week, 6), period = monthOf(week);
  const [lessons, pays] = await Promise.all([store.listLessons(group, week, end), store.listPayments(period)]);
  const payBy = new Map(pays.map(p => [p.student_id, p]));
  wkRows = students.filter(s => s.group_code === group && s.active !== false).map(s => {
    const items = lessons.flatMap(l => { const r = (l.lesson_records || []).find(x => x.student_id === s.id); return r ? [{ date: l.lesson_date, topic: l.topic, task: l.homework, attendance: r.attendance, homework: r.homework, note: r.note }] : []; });
    const pay = payBy.get(s.id);
    return { s, rep: weekReport(items, week), pay, st: pay ? paymentStatus(pay.amount_due, pay.amount_paid) : 'none' };
  });
  const avg = k => { const v = wkRows.map(r => r.rep[k]).filter(x => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) + '%' : '—'; };
  const behind = wkRows.filter(r => r.st === 'unpaid' || r.st === 'partial').length;
  const cell = (v, bad) => `<b ${v != null && v < bad ? 'style="color:var(--bad)"' : ''}>${v == null ? '—' : v + '%'}</b>`;
  body.innerHTML = `<div class="filters" style="margin-top:0">${groupSelect('wk', groups, group)}
      <button class="btn sm" data-act="wkShift" data-d="-1" aria-label="Previous week">← Previous</button><b aria-live="polite">${uzShort(week)} – ${uzShort(end)}.${end.slice(0, 4)}</b>
      <button class="btn sm" data-act="wkShift" data-d="1" aria-label="Next week">Next →</button><button class="btn sm" data-act="wkNow">This week</button>
      <button class="btn sm" data-act="wkCsv" style="margin-left:auto">Export CSV</button></div>
    <div class="kv" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))"><div><b>${lessons.length}</b><span>lessons held</span></div><div><b>${avg('attendedPct')}</b><span>average attendance</span></div><div><b>${avg('homeworkPct')}</b><span>homework completed</span></div><div><b>${behind}</b><span>payments to follow up (${period})</span></div></div>
    <div class="mt2">${wkRows.length ? `<div class="tablewrap"><table><thead><tr><th>Student</th><th>Lessons</th><th>Attendance</th><th>Late</th><th>Absent</th><th>Homework</th><th>Payment ${period}</th><th class="r"></th></tr></thead><tbody>
      ${wkRows.map(({ s, rep, st }) => `<tr><td><b>${esc(s.full_name)}</b></td><td>${rep.total}</td><td>${cell(rep.attendedPct, 70)} <small class="muted">${rep.present + rep.late}/${rep.total - rep.excused}</small></td><td>${rep.late}</td><td>${rep.absent}</td>
        <td>${cell(rep.homeworkPct, 50)} <small class="muted">${rep.homework.done}/${rep.homework.assigned}</small></td><td>${payBadge(st)}</td>
        <td class="r"><button class="btn sm" data-act="wkMsg" data-id="${s.id}">Copy message for parents</button></td></tr>`).join('')}
      </tbody></table></div><p class="muted mt" style="font-size:13px">Attendance counts "late" as attended and ignores "excused" lessons. Homework counts only "done". Red = attendance under 70% or homework under 50%. Weeks run Monday to Sunday.</p>`
      : '<div class="empty">This group has no active students.</div>'}</div>`;
}
actions.wkShift = el => { adm.wk.week = addDays(adm.wk.week, 7 * Number(el.dataset.d)); rerenderAdmin(); };
actions.wkNow = () => { adm.wk.week = mondayOf(todayKey()); rerenderAdmin(); };
actions.wkMsg = el => {
  const r = wkRows.find(x => x.s.id === el.dataset.id); if (!r) return;
  copyText(weeklyMessageUz({ name: r.s.full_name, report: r.rep, payment: r.pay, currency: CONFIG.currency, link: familyLink(), signature: CONFIG.teacher }), 'Message copied');
};
actions.wkCsv = () => downloadCsv(`weekly-${adm.wk.group}-${adm.wk.week}.csv`, [['Student', 'Week', 'Lessons', 'Present', 'Late', 'Absent', 'Excused', 'Attendance %', 'Homework done', 'Homework assigned', 'Homework %', 'Payment']]
  .concat(wkRows.map(({ s, rep, st }) => [s.full_name, rep.weekStart, rep.total, rep.present, rep.late, rep.absent, rep.excused, rep.attendedPct ?? '', rep.homework.done, rep.homework.assigned, rep.homeworkPct ?? '', st])));

// ───── Payments ─────
let payRows = [];
async function paymentsTab(body) {
  const [groups, students] = await Promise.all([store.listGroups(), store.listStudents()]);
  if (!groups.length) { body.innerHTML = noGroups; return; }
  adm.pay.group = pickGroup(groups, adm.pay.group);
  const { group, period } = adm.pay;
  const pays = await store.listPayments(period), by = new Map(pays.map(p => [p.student_id, p]));
  payRows = students.filter(s => s.group_code === group && s.active !== false).map(s => ({ s, p: by.get(s.id) }));
  const sum = k => payRows.reduce((a, { p }) => a + (Number(p?.[k]) || 0), 0), due = sum('amount_due'), paid = sum('amount_paid');
  body.innerHTML = `<div class="filters" style="margin-top:0">${groupSelect('pay', groups, group)}
      <button class="btn sm" data-act="payShift" data-d="-1" aria-label="Previous month">←</button><b aria-live="polite">${esc(period)}</b><button class="btn sm" data-act="payShift" data-d="1" aria-label="Next month">→</button>
      <div class="row" style="margin-left:auto"><input class="inp" id="payFee" type="number" min="0" step="1000" placeholder="Monthly fee (${esc(CONFIG.currency)})" aria-label="Monthly fee" style="width:200px"><button class="btn sm" data-act="payFee">Set for students without a record</button></div></div>
    <div class="kv"><div><b>${fmtMoney(due)}</b><span>expected (${esc(CONFIG.currency)})</span></div><div><b>${fmtMoney(paid)}</b><span>received</span></div><div><b>${fmtMoney(Math.max(0, due - paid))}</b><span>outstanding</span></div></div>
    <div class="mt2">${payRows.length ? `<div class="tablewrap"><table><thead><tr><th>Student</th><th>Amount due</th><th>Paid</th><th>Paid on</th><th>Status</th><th class="r"></th></tr></thead><tbody id="payRows">
      ${payRows.map(({ s, p }) => `<tr data-stu="${s.id}"><td><b>${esc(s.full_name)}</b></td><td><input class="inp due" type="number" min="0" step="1000" value="${p ? Number(p.amount_due) : ''}" aria-label="Amount due for ${esc(s.full_name)}" style="width:130px"></td>
        <td><input class="inp paid" type="number" min="0" step="1000" value="${p ? Number(p.amount_paid) : ''}" aria-label="Amount paid by ${esc(s.full_name)}" style="width:130px"></td>
        <td><input class="inp paidon" type="date" value="${esc(p?.paid_on || '')}" aria-label="Payment date" style="width:160px"></td><td>${payBadge(p ? paymentStatus(p.amount_due, p.amount_paid) : 'none')}</td>
        <td class="r"><button class="btn sm" data-act="payFull" data-id="${s.id}">Mark paid in full</button> <button class="btn sm primary" data-act="paySave" data-id="${s.id}">Save</button></td></tr>`).join('')}
      </tbody></table></div><p class="muted mt" style="font-size:13px">This page only records payments you received. Nothing is charged online.</p>` : '<div class="empty">This group has no active students.</div>'}</div>`;
}
actions.payShift = el => { adm.pay.period = shiftMonth(adm.pay.period, Number(el.dataset.d)); rerenderAdmin(); };
const rowOf = id => $(`#payRows tr[data-stu="${id}"]`);
async function savePaymentRow(id) {
  const tr = rowOf(id); if (!tr) return;
  const due = Number($('.due', tr).value || 0), paid = Number($('.paid', tr).value || 0);
  if (!(due >= 0) || !(paid >= 0)) return toast('Amounts cannot be negative', 'bad');
  try { await store.savePayment({ student_id: id, period: adm.pay.period, amount_due: due, amount_paid: paid, paid_on: $('.paidon', tr).value || null }); toast('Payment saved', 'ok'); rerenderAdmin(); } catch (e) { toast(e.message, 'bad'); }
}
actions.paySave = el => savePaymentRow(el.dataset.id);
actions.payFull = el => {
  const tr = rowOf(el.dataset.id); if (!tr) return;
  const due = Number($('.due', tr).value || 0); if (!(due > 0)) return toast('Enter the amount due first', 'bad');
  $('.paid', tr).value = due; if (!$('.paidon', tr).value) $('.paidon', tr).value = todayKey();
  savePaymentRow(el.dataset.id);
};
actions.payFee = async () => {
  const fee = Number($('#payFee').value);
  if (!(fee > 0)) return toast('Enter the monthly fee first', 'bad');
  const todo = payRows.filter(r => !r.p);
  if (!todo.length) return toast('Every student already has a record for this month', 'bad');
  try { for (const { s } of todo) await store.savePayment({ student_id: s.id, period: adm.pay.period, amount_due: fee, amount_paid: 0, paid_on: null }); toast(`Fee set for ${todo.length} student${todo.length > 1 ? 's' : ''}`, 'ok'); rerenderAdmin(); } catch (e) { toast(e.message, 'bad'); }
};
