import { store, cloudConfigured } from './store.js';
import { CONFIG } from './config.js';
import { esc, parseBlock, parseOptions, serializeBlock, serializeOptions, parseTime, fmtTime, fmtDateTime, testMeta, setPath, csvCell, prepare } from './logic.js';
import { writingTab, studentsTab } from './views-writing.js';
import { vocabTab } from './views-vocab.js';
import { speakingTab } from './views-speaking.js';
import { mockTab } from './views-mock.js';
import { $, $$, actions, inputs, toast, icon, go, confirmBox, modal, closeModal } from './ui.js';

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
    <div class="tabs mt">${[['tests', 'Tests'], ['groups', 'Groups'], ['results', 'Results'], ['writing', 'Writing'], ['vocab', 'Vocabulary'], ['speaking', 'Speaking'], ['mock', 'IELTS Mock'], ['students', 'Students']].map(([k, l]) => `<button class="chip ${adm.tab === k ? 'on' : ''}" data-act="admTab" data-k="${k}">${l}</button>`).join('')}</div>
    <div class="mt2" id="admBody"><div class="loading">Loading…</div></div></div>`;
  const body = $('#admBody');
  try {
    if (adm.tab === 'tests') await testsTab(body);
    else if (adm.tab === 'groups') await groupsTab(body);
    else if (adm.tab === 'writing') await writingTab(body);
    else if (adm.tab === 'vocab') await vocabTab(body);
    else if (adm.tab === 'speaking') await speakingTab(body);
    else if (adm.tab === 'mock') await mockTab(body);
    else if (adm.tab === 'students') await studentsTab(body);
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
  try { const r = await fetch('tests.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error(); bundle = (await r.json()).tests; } catch { return toast('tests.json was not found next to index.html', 'bad'); }
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
  await store.deleteGroup(el.dataset.code); rerenderAdmin();
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
