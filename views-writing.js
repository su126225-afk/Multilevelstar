// Writing: student pages (task list, editor + AI feedback) and teacher tabs (tasks, submissions, students).
import { store } from './store.js';
import { esc, fmtDateTime, csvCell, annotate } from './logic.js';
import { $, $$, actions, inputs, toast, icon, go, S, requireStudent, confirmBox, modal, closeModal } from './ui.js';
import { fmtHours } from './activity.js';

const loading = root => { root.innerHTML = '<div class="loading">Loading…</div>'; };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + Math.random().toString(16).slice(2));
export const KINDS = { task1: 'IELTS Task 1', task2: 'IELTS Task 2', multilevel: 'Multilevel' };
export const limitText = t => t.max_words > t.min_words ? `${t.min_words}–${t.max_words} words` : `at least ${t.min_words} words`;
export const countWords = t => (String(t).trim().match(/[A-Za-z0-9’'-]+/g) || []).length;

const SAMPLES = [
  { kind: 'task2', title: 'Technology and education', min_words: 250, prompt: 'Some people think that technology has made learning easier and more effective, while others believe it distracts students and lowers the quality of education.\n\nDiscuss both views and give your own opinion.\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.' },
  { kind: 'task1', title: 'Describe the trend (line graph)', min_words: 150, prompt: 'The line graph below shows the percentage of households with internet access in three countries between 2000 and 2020.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.' },
  { kind: 'multilevel', title: 'Letter to a friend', min_words: 120, prompt: 'You are going to move to a new city next month. Write a letter to your friend.\n\nTell your friend why you are moving, what you expect from the new place, and invite him or her to visit you. Write at least 120 words.' },
];

// ═════════════ feedback card (shared by student page and teacher viewer) ═════════════
const TYPES = { grammar: 'Grammar', spelling: 'Spelling', vocabulary: 'Vocabulary', punctuation: 'Punctuation', style: 'Style' };
const typeOf = c => (TYPES[String(c.type || '').toLowerCase()] ? String(c.type).toLowerCase() : 'style');

/** The student's own text with every mistake marked in colour: "wrong → better" (hover/tap shows why). */
export function annotatedText(text, corrections) {
  if (!text || !(corrections || []).length) return '';
  const segs = annotate(text, corrections);
  const counts = {};
  const html = segs.map(g => {
    if (!g.c) return esc(g.t);
    const ty = typeOf(g.c); counts[ty] = (counts[ty] || 0) + 1;
    return `<mark class="ann t-${ty}" tabindex="0" title="${esc(g.c.why || '')}"><i>${TYPES[ty]}</i><s>${esc(g.t)}</s><b>→ ${esc(g.c.better || '')}</b></mark>`;
  }).join('');
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return `<h3 class="mt2">Your text, checked <small class="muted">· ${total} mistake${total === 1 ? '' : 's'} marked</small></h3>
    <div class="annlegend">${Object.keys(TYPES).filter(k => counts[k]).map(k => `<span class="t-${k}"><i></i>${TYPES[k]} ${counts[k]}</span>`).join('')}</div>
    <div class="panel annbox">${html}</div><p class="note">Tap a coloured mistake to see why. Red = grammar, yellow = spelling, blue = vocabulary, purple = punctuation, green = style.</p>`;
}

export function feedbackHTML(fb, text = '') {
  if (!fb) return '';
  const list = a => (a || []).length ? `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">—</p>';
  return `<div class="fb">
    <div class="fb-head"><div class="fb-score"><span>${esc(fb.overall ?? '—')}</span><small>overall</small></div><p>${esc(fb.summary || '')}</p></div>
    <div class="fb-crit">${(fb.criteria || []).map(c => `<div class="panel"><div class="row between"><b>${esc(c.name)}</b><span class="badge multi">${esc(c.score)}</span></div><p class="muted" style="font-size:14px;margin-top:6px">${esc(c.comment)}</p></div>`).join('')}</div>
    <div class="fb-two"><div class="panel"><b>${icon('check', 16)} Strengths</b>${list(fb.strengths)}</div><div class="panel"><b>${icon('spark', 16)} Improve next</b>${list(fb.improvements)}</div></div>
    ${annotatedText(text, fb.corrections)}
    ${(fb.corrections || []).length ? `<h3 class="mt2">All corrections</h3><div class="tablewrap"><table><thead><tr><th>You wrote</th><th>Better</th><th>Why</th></tr></thead><tbody>
      ${fb.corrections.map(c => `<tr><td class="fb-bad">${esc(c.original)}</td><td class="fb-good">${esc(c.better)}</td><td class="muted">${esc(c.why)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${fb.improved_version ? `<h3 class="mt2">Improved first paragraph</h3><div class="panel" style="white-space:pre-wrap">${esc(fb.improved_version)}</div>` : ''}
    ${[['sample_b2', 'B2'], ['sample_c1', 'C1'], ['sample_answer', '']].filter(([k]) => fb[k] && (k !== 'sample_answer' || (!fb.sample_b2 && !fb.sample_c1))).map(([k, lv]) => `<details class="panel mt"><summary style="cursor:pointer;font-weight:700">${icon('book', 16)} See sample answer${lv ? ' · ' + lv : ''}</summary><div style="white-space:pre-wrap;margin-top:10px;line-height:1.7">${esc(fb[k])}</div></details>`).join('')}
    ${fb.uzbek_tip ? `<p class="mt" style="font-weight:600">💡 ${esc(fb.uzbek_tip)}</p>` : ''}</div>`;
}

// ═════════════ student: list ═════════════
let wf = { kind: '' };
export async function writingList(root) {
  loading(root);
  const tasks = await store.listWritingTasks({ published: true });
  const mine = S.student ? await store.myWritings(S.student.name, S.student.group).catch(() => []) : [];
  const best = id => { const l = mine.filter(w => w.task_id === id); return l[0]; };
  root.innerHTML = `<div class="wrap page"><h1 class="ptitle">Writing</h1>
    <p class="muted">Write your answer and get instant feedback from AI: band score, mistakes, and how to improve.</p>
    ${store.aiAvailable ? '' : '<div class="panel mt" style="border-color:var(--warn)">⚠️ Demo mode: AI checking works only after Supabase and the Gemini key are connected (see README). You can still look around.</div>'}
    <div class="filters">${[['', 'All'], ...Object.entries(KINDS)].map(([k, l]) => `<button class="chip ${wf.kind === k ? 'on' : ''}" data-act="wfKind" data-k="${k}">${l}</button>`).join('')}</div>
    <div class="tgrid mt">${tasks.filter(t => !wf.kind || t.kind === wf.kind).map(t => { const b = best(t.id); return `<a class="tcard" href="#/writing/${t.id}">
      <span class="badge ${t.kind === 'multilevel' ? 'multi' : 'ielts'}">${KINDS[t.kind]}</span>
      <h3 style="margin:12px 0 6px">${esc(t.title)}</h3><p class="muted" style="font-size:14px">${esc(t.prompt.slice(0, 110))}${t.prompt.length > 110 ? '…' : ''}</p>
      <div class="row between mt"><small class="muted">min ${t.min_words} words</small>${b ? `<span class="badge ok">Last: ${esc(b.band)}</span>` : ''}</div></a>`; }).join('') || '<div class="empty" style="grid-column:1/-1">No writing tasks yet.</div>'}</div></div>`;
}
actions.wfKind = el => { wf.kind = el.dataset.k; writingList($('#view')); };

// ═════════════ student: editor ═════════════
let WR = null;
export async function writingEditor(root, id) {
  if (!S.student) { const s = await requireStudent(); if (!s) return go('#/writing'); }
  loading(root);
  const t = await store.getWritingTask(id);
  if (!t) { root.innerHTML = '<div class="wrap page"><div class="empty">Task not found.<br><br><a class="btn" href="#/writing">Back</a></div></div>'; return; }
  const key = 'ma_wr_' + id;
  WR = { task: t, key, start: Date.now(), busy: false };
  const draft = (() => { try { return localStorage.getItem(key) || ''; } catch { return ''; } })();
  const lsGet = (k, d) => { try { const v = Number(localStorage.getItem(k)); return v >= 0.2 && v <= 0.8 ? v : d; } catch { return d; } };
  const fw = lsGet('ma_wsplit', 0.5), fv = lsGet('ma_wvsplit', 0.4);
  root.innerHTML = `<div class="runner wr">
    <div class="run-top"><a class="icon-btn" href="#/" title="Home">${icon('home', 18)}</a><a class="icon-btn" href="#/writing" title="All writing tasks">${icon('x', 18)}</a>
      <h2>${esc(t.title)}</h2><span class="badge ${t.kind === 'multilevel' ? 'multi' : 'ielts'}">${KINDS[t.kind]}</span></div>
    <div class="wmain" id="wmain" style="--wl:${fw}fr;--wr:${1 - fw}fr;--wt:${fv}fr;--wb:${1 - fv}fr">
      <div class="wleft"><h2 style="margin-bottom:10px">${esc(t.title)}</h2>
        ${t.image_url ? `<img class="plan" src="${esc(t.image_url)}" alt="Task image">` : ''}<div style="white-space:pre-wrap;line-height:1.7">${esc(t.prompt)}</div>
        <p class="mt" style="font-size:14px"><b>Word limit:</b> ${limitText(t)}</p></div>
      <div class="resizer" id="wresizer" role="separator" aria-orientation="vertical" title="Drag to resize"></div>
      <div class="wright"><textarea id="wtext" class="inp wtext" placeholder="Start writing here…" spellcheck="true" data-in="wtext">${esc(draft)}</textarea>
        <div class="wbar"><div class="wcount" id="wcount"></div>
          <div class="row"><button class="btn sm" data-act="wLast" id="wlast" hidden>Last feedback</button><button class="btn primary" data-act="wCheck" id="wbtn">${icon('spark', 16)} Check with AI</button></div></div></div>
    </div></div>`;
  document.body.classList.add('running');
  S.cleanup = () => { document.body.classList.remove('running'); };
  inputs.wtext();
}
document.addEventListener('pointerdown', e => {
  const h = e.target.closest('#wresizer'); if (!h) return;
  e.preventDefault();
  const main = $('#wmain'), box = main.getBoundingClientRect();
  const stacked = !!window.matchMedia?.('(max-width:960px)').matches;
  h.setPointerCapture?.(e.pointerId); main.classList.add('dragging');
  let f = 0;
  const move = ev => {
    f = Math.min(0.8, Math.max(0.2, stacked ? (ev.clientY - box.top) / box.height : (ev.clientX - box.left) / box.width));
    const [x, y] = stacked ? ['--wt', '--wb'] : ['--wl', '--wr'];
    main.style.setProperty(x, f + 'fr'); main.style.setProperty(y, (1 - f) + 'fr');
  };
  const up = () => {
    main.classList.remove('dragging');
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
    if (f) try { localStorage.setItem(stacked ? 'ma_wvsplit' : 'ma_wsplit', String(f)); } catch { /* ignore */ }
  };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
});
inputs.wtext = () => {
  if (!WR) return;
  const ta = $('#wtext'), n = countWords(ta.value), min = WR.task.min_words, max = WR.task.max_words || 0;
  try { localStorage.setItem(WR.key, ta.value); } catch { /* ignore */ }
  const c = $('#wcount'); if (c) {
    const over = max && n > max, color = over ? 'var(--bad)' : n >= min ? 'var(--ok)' : 'inherit';
    c.innerHTML = `<b style="color:${color}">${n}</b> words · limit ${limitText(WR.task)}${over ? ` · <span style="color:var(--bad)">${n - max} over the limit</span>` : ''}`;
  }
};
actions.wCheck = async () => {
  if (!WR || WR.busy) return;
  const text = $('#wtext').value, words = countWords(text), st = S.student, t = WR.task;
  if (words < 20) return toast('Write at least 20 words first', 'bad');
  if (words < t.min_words * 0.5 && !(await confirmBox('Very short answer', `You wrote ${words} words, the task asks for ${limitText(t)}. Check anyway?`, 'Check'))) return;
  WR.busy = true;
  const btn = $('#wbtn');
  btn.disabled = true; btn.innerHTML = 'AI is reading… (10–30 s)';
  try {
    const fb = await store.checkWriting({ kind: t.kind, prompt: t.prompt, text, group: st.group, min_words: t.min_words, max_words: t.max_words || 0, part: (String(t.title).match(/(?:Task|Part)\s*(1\.1|1\.2|2)\b/i) || [])[1] || '' });
    WR.last = fb; WR.lastText = text; $('#wlast')?.removeAttribute('hidden');
    showFeedback(fb, text);
    try {
      await store.saveWriting({ task_id: t.id, task_title: t.title, kind: t.kind, student_name: st.name, group_code: st.group, body: text, words, band: String(fb.overall ?? ''), feedback: fb });
      toast('Saved to your history', 'ok');
    } catch (e) { toast('Feedback shown but not saved: ' + e.message, 'bad'); }
  } catch (e) { toast(e.message, 'bad'); }
  finally { WR.busy = false; if (btn) { btn.disabled = false; btn.innerHTML = `${icon('spark', 16)} Check with AI`; } }
};
const showFeedback = (fb, text) => modal(`<div class="row between noprint-x"><h2>AI feedback</h2><div class="row"><button class="btn sm" data-act="printFb">Save as PDF</button><button class="icon-btn" data-act="closeModal">${icon('x', 18)}</button></div></div><div class="mt">${feedbackHTML(fb, text)}</div>`, true);
actions.printFb = () => {
  // a closed <details> prints empty, so open the sample answer for the PDF and put it back afterwards
  const ds = [...document.querySelectorAll('#modal details')], was = ds.map(d => d.open);
  ds.forEach(d => { d.open = true; });
  const back = () => { ds.forEach((d, i) => { d.open = was[i]; }); window.removeEventListener('afterprint', back); };
  window.addEventListener('afterprint', back);
  window.print();
};
actions.wLast = () => { if (WR?.last) showFeedback(WR.last, WR.lastText); };
actions.wView = async el => {
  const w = (await store.myWritings(S.student.name, S.student.group)).find(x => x.id === el.dataset.id);
  if (w) viewWriting(w);
};
export function viewWriting(w) {
  modal(`<div class="row between"><h2>${esc(w.task_title)}</h2><button class="icon-btn" data-act="closeModal">${icon('x', 18)}</button></div>
    <p class="muted">${esc(w.student_name || '')} ${esc(w.group_code || '')} · ${fmtDateTime(w.created_at)} · ${w.words} words · <b>${esc(w.band)}</b></p>
    <div class="panel mt" style="white-space:pre-wrap;max-height:260px;overflow:auto">${esc(w.body)}</div><div class="mt">${feedbackHTML(w.feedback, w.body)}</div>`, true);
}

export const sample = SAMPLES;

// ═════════════ teacher: tasks tab ═════════════
export async function writingTab(body) {
  const [tasks, subs] = await Promise.all([store.listWritingTasks(), store.listWritings()]);
  body.innerHTML = `<div class="row between wrapx" style="margin-bottom:14px"><b>${tasks.length} writing tasks</b>
      <div class="row">${tasks.length ? '' : '<button class="btn sm" data-act="wSamples">Add 3 sample tasks</button>'}<button class="btn sm" data-act="wBundle">Import Multilevel Writing Sets 1–3</button><button class="btn primary sm" data-act="wEdit" data-id="">${icon('plus', 16)} New task</button></div></div>
    ${tasks.length ? `<div class="tablewrap"><table><thead><tr><th>Title</th><th>Type</th><th>Words</th><th>Status</th><th class="r"></th></tr></thead><tbody>
      ${tasks.map(t => `<tr><td><b>${esc(t.title)}</b></td><td><span class="badge">${KINDS[t.kind]}</span></td><td>${limitText(t)}</td><td>${t.published ? '<span class="badge ok">Published</span>' : '<span class="badge draft">Draft</span>'}</td>
        <td class="r"><button class="btn sm" data-act="wEdit" data-id="${t.id}">${icon('edit', 14)} Edit</button> <button class="btn sm danger" data-act="wDel" data-id="${t.id}">${icon('trash', 14)}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No tasks yet.</div>'}
    <h2 class="ptitle mt2" style="font-size:22px">Student submissions</h2>
    <div class="mt">${subs.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Student</th><th>Group</th><th>Task</th><th>Words</th><th>AI score</th><th class="r"></th></tr></thead><tbody>
      ${subs.slice(0, 300).map(w => `<tr><td class="muted">${fmtDateTime(w.created_at)}</td><td><b>${esc(w.student_name)}</b></td><td>${esc(w.group_code)}</td><td>${esc(w.task_title)}</td><td>${w.words}</td><td><b>${esc(w.band)}</b></td>
        <td class="r"><button class="btn sm" data-act="wOpen" data-id="${w.id}">View</button> <button class="btn sm danger" data-act="wSubDel" data-id="${w.id}">${icon('trash', 14)}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No submissions yet.</div>'}</div>`;
  writingTab.subs = subs; writingTab.tasks = tasks; writingTab.body = body;
}
const refreshW = () => writingTab(writingTab.body);
actions.wSamples = async () => { for (const s of SAMPLES) await store.saveWritingTask({ id: uid(), published: true, image_url: '', ...s }); refreshW(); };
actions.wBundle = async () => {
  let list = [];
  try { const r = await fetch('writing.json'); if (!r.ok) throw new Error(); list = (await r.json()).tasks; } catch { return toast('writing.json not found', 'bad'); }
  const have = new Set((await store.listWritingTasks()).map(t => t.title));
  let n = 0;
  for (const t of list) { if (have.has(t.title)) continue; await store.saveWritingTask({ id: uid(), published: true, image_url: '', ...t }); n++; }
  toast(n ? `${n} tasks added` : 'Already imported', 'ok'); refreshW();
};
actions.wOpen = el => { const w = writingTab.subs.find(x => x.id === el.dataset.id); if (w) viewWriting(w); };
actions.wSubDel = async el => { if (await confirmBox('Delete submission?', 'This cannot be undone.', 'Delete', true)) { await store.deleteWriting(el.dataset.id); refreshW(); } };
actions.wDel = async el => { if (await confirmBox('Delete task?', 'Past submissions stay.', 'Delete', true)) { await store.deleteWritingTask(el.dataset.id); refreshW(); } };
actions.wEdit = el => {
  const t = writingTab.tasks.find(x => x.id === el.dataset.id) || { kind: 'task2', title: '', prompt: '', image_url: '', min_words: 250, published: true };
  modal(`<h2>${t.id ? 'Edit' : 'New'} writing task</h2>
    <label class="lbl">Type</label><select class="sel" id="wtKind">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${t.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <label class="lbl">Title</label><input class="inp" id="wtTitle" value="${esc(t.title)}">
    <label class="lbl">Task text</label><textarea class="inp" id="wtPrompt" rows="7">${esc(t.prompt)}</textarea>
    <label class="lbl">Image URL (Task 1 chart, optional)</label><input class="inp" id="wtImg" value="${esc(t.image_url)}" placeholder="https://…">
    <div class="row"><div style="flex:1"><label class="lbl">Minimum words</label><input class="inp" id="wtMin" type="number" min="20" value="${t.min_words}"></div><div style="flex:1"><label class="lbl">Maximum words (0 = no maximum)</label><input class="inp" id="wtMax" type="number" min="0" value="${t.max_words || 0}"></div></div>
    <label class="row mt"><input type="checkbox" id="wtPub" ${t.published ? 'checked' : ''}> Published</label>
    <div class="row mt" style="justify-content:flex-end"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="wSave" data-id="${t.id || ''}">Save</button></div>`, true);
};
actions.wSave = async el => {
  const title = $('#wtTitle').value.trim(), prompt = $('#wtPrompt').value.trim();
  if (!title || !prompt) return toast('Title and task text are required', 'bad');
  await store.saveWritingTask({ id: el.dataset.id || uid(), kind: $('#wtKind').value, title, prompt, image_url: $('#wtImg').value.trim(), min_words: Number($('#wtMin').value) || 150, max_words: Number($('#wtMax').value) || 0, published: $('#wtPub').checked,
    ...(writingTab.tasks.find(x => x.id === el.dataset.id)?.created_at ? { created_at: writingTab.tasks.find(x => x.id === el.dataset.id).created_at } : {}) });
  closeModal(); toast('Saved', 'ok'); refreshW();
};

// ═════════════ teacher: students tab (time + progress) ═════════════
export async function studentsTab(body) {
  const [results, acts, subs] = await Promise.all([store.listResults(), store.listActivity(), store.listWritings().catch(() => [])]);
  const map = new Map();
  const get = (n, g) => { const k = g.toUpperCase() + '|' + n.trim().toLowerCase(); if (!map.has(k)) map.set(k, { name: n, group: g, secs: 0, days: new Set(), tests: 0, sum: 0, writings: 0, last: '' }); return map.get(k); };
  for (const a of acts) { const s = get(a.student_name, a.group_code); s.secs += a.seconds; s.days.add(a.day); if (String(a.day) > s.last) s.last = String(a.day); }
  for (const r of results) { const s = get(r.student_name, r.group_code); s.tests++; s.sum += Number(r.percent); }
  for (const w of subs) get(w.student_name, w.group_code).writings++;
  const rows = [...map.values()].sort((a, b) => b.secs - a.secs);
  studentsTab.rows = rows;
  body.innerHTML = `<div class="row between wrapx" style="margin-bottom:14px"><b>${rows.length} students</b><button class="btn sm" data-act="exportStudents">Export CSV</button></div>
    ${rows.length ? `<div class="tablewrap"><table><thead><tr><th>Student</th><th>Group</th><th>Time on site</th><th>Active days</th><th>Tests</th><th>Avg score</th><th>Writings</th><th>Last active</th></tr></thead><tbody>
    ${rows.map(s => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.group)}</td><td><b>${fmtHours(s.secs)}</b></td><td>${s.days.size}</td><td>${s.tests}</td><td>${s.tests ? Math.round(s.sum / s.tests) + '%' : '—'}</td><td>${s.writings}</td><td class="muted">${esc(s.last || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No student activity yet.</div>'}`;
}
actions.exportStudents = () => {
  const rows = [['Student', 'Group', 'Hours on site', 'Active days', 'Tests', 'Avg %', 'Writings'], ...studentsTab.rows.map(s => [s.name, s.group, (s.secs / 3600).toFixed(2), s.days.size, s.tests, s.tests ? Math.round(s.sum / s.tests) : '', s.writings])];
  const blob = new Blob(['﻿' + rows.map(r => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'students.csv'; a.click();
};
