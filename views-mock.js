// Teacher: IELTS Mock attempts (Listening + Reading + Writing) with Word download.
import { store } from './store.js';
import { esc, fmtDateTime } from './logic.js';
import { actions, inputs, toast, icon, confirmBox } from './ui.js';

const st = { rows: [], group: '', body: null };

function attempts(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.attempt_id)) map.set(r.attempt_id, { id: r.attempt_id, name: r.student_name, group: r.group_code, date: r.created_at, rows: [], listening: null, reading: null, writing: null });
    const a = map.get(r.attempt_id);
    a[r.section] = r; a.rows.push(r);
    if (r.created_at < a.date) a.date = r.created_at;
  }
  return [...map.values()].sort((x, y) => (y.date || '').localeCompare(x.date || ''));
}
const view = () => attempts(st.rows).filter(a => !st.group || a.group === st.group);
const cell = r => r ? `${r.correct}/${r.total}${r.band ? ` · <b>${esc(r.band)}</b>` : ''}` : '<span class="muted">—</span>';

export async function mockTab(body) {
  st.body = body;
  body.innerHTML = '<div class="loading">Loading…</div>';
  try { st.rows = await store.listMocks(); } catch (e) {
    body.innerHTML = `<div class="empty">Could not load mock results.<br><small>${esc(e.message || e)}</small><br><br>Run <b>mock-schema.sql</b> once in Supabase → SQL Editor.</div>`; return;
  }
  draw();
}

function draw() {
  const body = st.body; if (!body) return;
  const all = attempts(st.rows), groups = [...new Set(all.map(a => a.group))].sort();
  const list = view();
  body.innerHTML = `<div class="row between wrapx" style="margin-bottom:14px">
      <div class="row"><b>${list.length} mock attempts</b>
        <select data-in="mockGroup" style="margin-left:10px"><option value="">All groups</option>${groups.map(g => `<option value="${esc(g)}" ${g === st.group ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
      <div class="row">${list.length ? `<button class="btn primary sm" data-act="mockWordAll">${icon('download', 16)} Download all (Word)</button>` : ''}</div></div>
    ${list.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Student</th><th>Group</th><th>Listening</th><th>Reading</th><th>Writing</th><th class="r"></th></tr></thead><tbody>
      ${list.map(a => `<tr><td class="muted">${fmtDateTime(a.date)}</td><td><b>${esc(a.name)}</b></td><td>${esc(a.group)}</td><td>${cell(a.listening)}</td><td>${cell(a.reading)}</td>
        <td>${a.writing ? `${a.writing.correct || 0} + ${a.writing.total || 0} words` : '<span class="muted">—</span>'}</td>
        <td class="r"><button class="btn sm" data-act="mockWord" data-id="${esc(a.id)}">${icon('download', 14)} Word</button> <button class="btn sm danger" data-act="mockDel" data-id="${esc(a.id)}">${icon('trash', 14)}</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">No mock attempts yet. Students see only “Completed” — all answers come here.</div>'}`;
}

inputs.mockGroup = el => { st.group = el.value; draw(); };

const CSS = `body{font-family:Calibri,Arial,sans-serif;font-size:11pt}h1{font-size:20pt;margin:0 0 4pt}h2{font-size:14pt;margin:16pt 0 6pt;color:#1f4e79}
table{border-collapse:collapse;width:100%;margin:4pt 0 10pt}td,th{border:1px solid #999;padding:3pt 6pt;font-size:10pt;vertical-align:top}th{background:#e9eef5;text-align:left}
td.ok{background:#e6f4ea}td.bad{background:#fbe5e5}p.t{white-space:pre-wrap;border:1px solid #bbb;padding:8pt}.m{color:#555;font-size:10pt}`;

function qTable(title, r) {
  if (!r) return `<h2>${title}</h2><p class="m">Not completed.</p>`;
  const d = Array.isArray(r.details) ? r.details : [];
  return `<h2>${title}: ${r.correct}/${r.total}${r.band ? ` — band ${esc(r.band)}` : ''}</h2>
    <table border="1" cellspacing="0" cellpadding="4" width="100%"><tr><th width="40" bgcolor="#e9eef5">#</th><th bgcolor="#e9eef5">Student answer</th><th bgcolor="#e9eef5">Correct answer</th><th width="30" bgcolor="#e9eef5"></th></tr>
    ${d.map(x => `<tr><td>${x.n}</td><td bgcolor="${x.ok ? '#e6f4ea' : '#fbe5e5'}">${esc(x.user || '—')}</td><td>${esc(x.correct)}</td><td>${x.ok ? '✓' : '✗'}</td></tr>`).join('')}</table>`;
}
function writing(r) {
  if (!r) return '<h2>Writing</h2><p class="m">Not completed.</p>';
  const w = r.details || {};
  return `<h2>Writing — Task 1 (${w.w1 ?? r.correct ?? 0} words)</h2><p class="t">${esc(r.text1 || '')}</p>
    <h2>Writing — Task 2 (${w.w2 ?? r.total ?? 0} words)</h2><p class="t">${esc(r.text2 || '')}</p>`;
}
function attemptHtml(a) {
  return `<h1>IELTS Mock — ${esc(a.name)}</h1><p class="m">Group: ${esc(a.group)} · Date: ${esc(fmtDateTime(a.date))}</p>
    <table border="1" cellspacing="0" cellpadding="4" width="100%"><tr><th bgcolor="#e9eef5">Listening</th><th bgcolor="#e9eef5">Reading</th><th bgcolor="#e9eef5">Writing</th></tr><tr><td>${cell(a.listening).replace(/<[^>]+>/g, '')}</td><td>${cell(a.reading).replace(/<[^>]+>/g, '')}</td><td>${a.writing ? `${a.writing.correct || 0} + ${a.writing.total || 0} words` : '—'}</td></tr></table>
    ${qTable('Listening', a.listening)}${qTable('Reading', a.reading)}${writing(a.writing)}`;
}
function download(name, bodyHtml) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${esc(name)}</title><style>${CSS}</style></head><body>${bodyHtml}</body></html>`;
  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + '.doc'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const safe = s => String(s).replace(/[^\w\-]+/g, '_').slice(0, 40);

actions.mockWord = el => {
  const a = attempts(st.rows).find(x => x.id === el.dataset.id); if (!a) return;
  download(`IELTS_Mock_${safe(a.name)}`, attemptHtml(a));
};
actions.mockWordAll = () => {
  const list = view(); if (!list.length) return;
  download(`IELTS_Mock_${safe(st.group || 'all')}`, list.map(attemptHtml).join('<br clear="all" style="page-break-before:always">'));
};
actions.mockDel = async el => {
  const a = attempts(st.rows).find(x => x.id === el.dataset.id); if (!a) return;
  if (!(await confirmBox('Delete this mock attempt?', `${a.name} — all sections will be removed.`, 'Delete', true))) return;
  for (const r of a.rows) await store.deleteMock(r.id);
  st.rows = st.rows.filter(r => r.attempt_id !== a.id); draw(); toast('Deleted');
};
