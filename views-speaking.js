// Speaking (Multilevel new format): student list, voice runner, AI result + teacher tab.
import { store } from './store.js';
import { esc, fmtDateTime, fmtTime } from './logic.js';
import { PARTS, buildSteps, sayText, linesOf, hasAnswer } from './speaking.js';
import { $, $$, actions, inputs, toast, icon, go, S, requireStudent, confirmBox, modal, closeModal } from './ui.js';

const loading = root => { root.innerHTML = '<div class="loading">Loading…</div>'; };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + Math.random().toString(16).slice(2));

// ═════════════ AI result card (student + teacher) ═════════════
export function speakingFeedback(fb) {
  if (!fb) return '';
  const list = a => (a || []).length ? `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">—</p>';
  return `<div class="fb">
    <div class="fb-head"><div class="fb-score"><span>${esc(fb.total ?? '—')}</span><small>/ 75 · ${esc(fb.level || '')}</small></div><p>${esc(fb.summary || '')}</p></div>
    ${(fb.parts || []).map(p => `<div class="panel mt"><div class="row between"><h3>${esc(PARTS[p.part]?.label || 'Part ' + p.part)}</h3><span class="badge multi">${esc(p.score)}/${esc(p.max ?? PARTS[p.part]?.max ?? '')} · ${esc(p.cefr || '')}</span></div>
      <p class="muted" style="margin:6px 0 10px">${esc(p.comment || '')}</p>
      ${(p.transcript || []).map(t => `<div class="spq"><b>${esc(t.q)}</b><p>${t.said ? esc(t.said) : '<span class="muted">— no answer —</span>'}</p></div>`).join('')}
      <div class="fb-two"><div class="panel"><b>${icon('check', 16)} Strengths</b>${list(p.strengths)}</div><div class="panel"><b>${icon('spark', 16)} Improve next</b>${list(p.improvements)}</div></div>
      ${(p.corrections || []).length ? `<div class="tablewrap mt"><table><thead><tr><th>You said</th><th>Better</th><th>Why</th></tr></thead><tbody>${p.corrections.map(c => `<tr><td class="fb-bad">${esc(c.original)}</td><td class="fb-good">${esc(c.better)}</td><td class="muted">${esc(c.why)}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>`).join('')}
    ${fb.uzbek_tip ? `<p class="mt" style="font-weight:600">💡 ${esc(fb.uzbek_tip)}</p>` : ''}</div>`;
}

// ═════════════ test list ═════════════
export async function speakingList(root) {
  loading(root);
  const [tests, mine] = await Promise.all([store.listSpeakingTests({ published: true }), S.student ? store.mySpeakings(S.student.name, S.student.group).catch(() => []) : []]);
  root.innerHTML = `<div class="wrap page"><h1 class="ptitle">Speaking</h1>
    <p class="muted">Multilevel speaking, new format. Questions are read aloud, you answer into your microphone, and AI scores you out of 75. Use a quiet place and headphones if you can.</p>
    ${tests.length ? `<div class="vgrid mt2">${tests.map(t => { const best = mine.filter(m => m.test_id === t.id).sort((a, b) => b.total - a.total)[0]; return `<div class="panel vcard">
        <div class="row between"><span class="badge multi">Multilevel</span>${best ? `<span class="badge ok">Best ${best.total}/75</span>` : ''}</div>
        <h3>${esc(t.title)}</h3><p class="muted">Part 1.1 · 1.2 · 2 · 3 · about 9 minutes</p>
        <a class="btn primary" href="#/speaking/run/${t.id}" data-act="spStart" data-id="${t.id}">${best ? 'Try again' : 'Start'} ${icon('arrow', 16)}</a></div>`; }).join('')}</div>`
      : '<div class="empty mt2">No speaking tests yet. Your teacher will add them soon.</div>'}
    ${mine.length ? `<h2 class="ptitle mt2" style="font-size:22px">Your attempts</h2><div class="tablewrap mt"><table><thead><tr><th>Date</th><th>Test</th><th>Score</th><th class="r"></th></tr></thead><tbody>
      ${mine.map(m => `<tr><td class="muted">${fmtDateTime(m.created_at)}</td><td>${esc(m.test_title)}</td><td><b>${m.total}/75</b> <span class="badge">${esc(m.level)}</span></td><td class="r"><button class="btn sm" data-act="spView" data-id="${m.id}">View</button></td></tr>`).join('')}</tbody></table></div>` : ''}</div>`;
  speakingList.mine = mine;
}
actions.spStart = async (el, e) => { e?.preventDefault?.(); const st = S.student || await requireStudent(); if (st) go('#/speaking/run/' + el.dataset.id); };
actions.spView = el => { const m = speakingList.mine?.find(x => x.id === el.dataset.id); if (m) viewSpeaking(m); };
export function viewSpeaking(m) {
  modal(`<div class="row between"><h2>${esc(m.test_title)}</h2><button class="icon-btn" data-act="closeModal">${icon('x', 18)}</button></div>
    <p class="muted">${esc(m.student_name || '')} ${esc(m.group_code || '')} · ${fmtDateTime(m.created_at)} · <b>${m.total}/75 · ${esc(m.level)}</b></p><div class="mt">${speakingFeedback(m.feedback)}</div>`, true);
}

// ═════════════ runner ═════════════
let R = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pickMime = () => (window.MediaRecorder ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(m => MediaRecorder.isTypeSupported?.(m)) : '') || '';

export async function speakingRun(root, id) {
  if (!S.student) { const s = await requireStudent(); if (!s) return go('#/speaking'); }
  loading(root);
  const t = await store.getSpeakingTest(id);
  if (!t) { root.innerHTML = '<div class="wrap page"><div class="empty">Test not found.<br><br><a class="btn" href="#/speaking">Back</a></div></div>'; return; }
  const steps = buildSteps(t.data || {});
  if (!steps.length) { root.innerHTML = '<div class="wrap page"><div class="empty">This test has no questions yet.<br><br><a class="btn" href="#/speaking">Back</a></div></div>'; return; }
  R = { test: t, steps, segs: [], dead: false, stream: null, ctx: null, skip: false, busy: false };
  S.cleanup = () => { if (!R) return; R.dead = true; try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } R.stream?.getTracks().forEach(x => x.stop()); try { R.ctx?.close(); } catch { /* ignore */ } document.body.classList.remove('running'); window.onbeforeunload = null; };
  const parts = [...new Set(steps.map(s => s.part))];
  root.innerHTML = `<div class="wrap page"><div class="intro" style="max-width:640px">
    <a class="btn sm" href="#/speaking">← Speaking</a>
    <h1 class="ptitle mt">${esc(t.title)}</h1>
    <p class="muted">${parts.map(p => PARTS[p].label).join(' · ')}</p>
    <div class="panel mt"><b>Before you start</b><ul style="margin:8px 0 0 18px;line-height:1.9">
      <li>Find a quiet place. Allow the <b>microphone</b> when your browser asks.</li>
      <li>Each question is read aloud. When you hear the <b>beep</b>, start speaking.</li>
      <li>Part 1.1: 30 s per question · Part 1.2: first question 10 s to think + 45 s, others 30 s · Parts 2 and 3: 1 min to think + 2 min to speak.</li>
      <li>The test cannot be paused. Press <b>Next</b> if you finish early.</li></ul></div>
    <div class="panel mt"><b>Question voice</b> <small class="muted">— pick the clearest one, then press Test. Turn the phone volume up.</small>
      <div class="row mt" style="gap:8px"><select class="inp" id="spVoice" data-in="spVoicePick" style="flex:1;min-width:0"></select><button class="btn sm" data-act="spVoiceTest">${icon('play', 14)} Test</button></div></div>
    <div class="err" id="spErr"></div>
    <button class="btn primary mt" style="width:100%" data-act="spBegin">${icon('mic', 18)} Allow microphone and start</button></div></div>`;
  initVoices(); setTimeout(initVoices, 600);
}

function fillVoices() {
  const sel = $('#spVoice'); if (!sel) return;
  const vs = englishVoices(), cur = pickVoice();
  sel.innerHTML = vs.length ? vs.map(v => `<option value="${esc(v.name)}"${cur && v.name === cur.name ? ' selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('') : '<option>Default voice</option>';
}
const initVoices = () => { fillVoices(); try { window.speechSynthesis.onvoiceschanged = fillVoices; } catch { /* ignore */ } };
inputs.spVoicePick = el => vset(el.value);
actions.spVoiceTest = () => { if (R) R.dead = false; say('Hello! This is how the questions will sound. Can you hear me clearly?'); };
actions.spBegin = async () => {
  const err = $('#spErr'); err.textContent = '';
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { err.textContent = 'This browser cannot record audio. Please use Chrome (Android/PC) or Safari (iPhone), updated to the latest version.'; return; }
  try { const probe = await openMic(); probe.getTracks().forEach(x => x.stop()); }   // permission check only: phones play questions quietly while the mic is open
  catch { err.textContent = 'Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.'; return; }
  try { R.ctx = new (window.AudioContext || window.webkitAudioContext)(); R.ctx.resume?.(); } catch { /* beep is optional */ }
  window.speechSynthesis?.getVoices?.();
  document.body.classList.add('running');
  window.onbeforeunload = e => { if (R && !R.dead) { e.preventDefault(); e.returnValue = ''; } };
  runAll();
};

const openMic = () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
const closeMic = () => { try { R.stream?.getTracks().forEach(x => x.stop()); } catch { /* ignore */ } R.stream = null; };

function beep() {
  return new Promise(res => {
    try {
      const c = R.ctx, o = c.createOscillator(), g = c.createGain();
      o.frequency.value = 880; g.gain.value = 0.25; o.connect(g); g.connect(c.destination); o.start();
      setTimeout(() => { o.stop(); res(); }, 260);
    } catch { res(); }
  });
}
const VKEY = 'ma_spvoice';
const vget = () => { try { return localStorage.getItem(VKEY) || ''; } catch { return ''; } };
const vset = v => { try { localStorage.setItem(VKEY, v); } catch { /* optional */ } };
const englishVoices = () => (window.speechSynthesis?.getVoices?.() || []).filter(x => /^en/i.test(x.lang));
/** Picks the clearest English voice the device has (natural/neural voices first); the student's own choice wins. */
function pickVoice() {
  const all = englishVoices(), chosen = vget();
  const mine = chosen && all.find(x => x.name === chosen); if (mine) return mine;
  const score = x => (/natural|neural|online|premium|enhanced/i.test(x.name) ? 60 : 0) + (/google (us|uk) english/i.test(x.name) ? 45 : 0)
    + (/samantha|daniel|karen|serena|moira|aria|jenny|guy|libby|sonia|ryan/i.test(x.name) ? 30 : 0) + (/^en[-_](US|GB)/i.test(x.lang) ? 10 : 0) + (x.localService ? 0 : 5);
  return all.slice().sort((a, b) => score(b) - score(a))[0] || null;
}
function say(text) {
  return new Promise(res => {
    const ss = window.speechSynthesis;
    if (!ss || R.dead) return res();
    ss.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92; u.pitch = 1; u.volume = 1;
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
    let done = false, tm;
    const fin = () => { if (!done) { done = true; clearTimeout(tm); R.stopSay = null; res(); } };
    u.onend = fin; u.onerror = fin;
    tm = setTimeout(fin, Math.max(4000, text.split(/\s+/).length * 650 + 2500));   // some phones never fire "end"
    R.stopSay = () => { try { ss.cancel(); } catch { /* ignore */ } fin(); };
    ss.speak(u);
  });
}
/** Counts down `sec` seconds, updating the clock; ends early if the student presses Next. */
function countdown(sec) {
  return new Promise(res => {
    R.skip = false;
    const t0 = Date.now();
    const tick = () => {
      if (R.dead) return res();
      const left = Math.max(0, sec - (Date.now() - t0) / 1000);
      const c = $('#spClock'); if (c) c.textContent = fmtTime(Math.ceil(left));
      const b = $('#spBar'); if (b) b.style.width = (100 * (1 - left / sec)) + '%';
      if (left <= 0 || R.skip) return res();
      setTimeout(tick, 200);
    };
    tick();
  });
}
function setPhase(phase, nextLabel) {
  R.phase = phase;
  const el = $('#spPhase'); if (el) { el.className = 'spphase ' + phase; el.textContent = { listen: '🔊 Listen', think: '💭 Think', speak: '🎙 Speak now', wait: '' }[phase] || ''; }
  const n = $('#spNext'); if (n) { n.textContent = nextLabel || 'Next ›'; n.hidden = !nextLabel && phase === 'wait'; }
}
function record(sec, step, label) {
  return new Promise(async res => {
    const mime = pickMime(), chunks = [], t0 = Date.now();
    let rec;
    try { rec = new MediaRecorder(R.stream, { mimeType: mime || undefined, audioBitsPerSecond: 24000 }); } catch { rec = new MediaRecorder(R.stream); }
    rec.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
    rec.onstop = () => { const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }); res({ blob, size: blob.size, secs: (Date.now() - t0) / 1000, mime: blob.type }); };
    rec.start(1000);
    $('#spRec')?.removeAttribute('hidden');
    await countdown(sec);
    $('#spRec')?.setAttribute('hidden', '');
    if (rec.state !== 'inactive') rec.stop(); else res({ blob: new Blob([]), size: 0, secs: 0, mime });
  });
}

const partBar = cur => `<div class="spparts">${['1.1', '1.2', '2', '3'].filter(p => R.steps.some(s => s.part === p)).map(p => `<span class="${p === cur ? 'on' : R.done?.includes(p) ? 'done' : ''}">${p}</span>`).join('')}</div>`;
function frame(step, inner) {
  $('#view').innerHTML = `<div class="runner sp"><div class="run-top"><button class="icon-btn" data-act="spExit" title="Home">${icon('home', 18)}</button><h2>${esc(R.test.title)}</h2>${partBar(step.part)}<span class="sprec" id="spRec" hidden>● REC</span></div>
    <div class="spstage"><div class="spcard">${inner}</div></div>
    <div class="spfoot"><div class="spbar"><i id="spBar"></i></div><div class="row between"><span id="spPhase" class="spphase"></span><div class="spclock" id="spClock">0:00</div><button class="btn primary" id="spNext" data-act="spNext">Next ›</button></div></div></div>`;
}
const imgs = a => (a || []).length ? `<div class="spimgs">${a.map(u => `<img src="${esc(u)}" alt="">`).join('')}</div>` : '';

async function runStep(step) {
  if (step.kind === 'intro') {
    frame(step, `<h2>${esc(PARTS[step.part].label)}</h2><p class="spq-text" style="font-size:18px;line-height:1.7">${esc(step.text)}</p>`);
    setPhase('listen', 'Skip ›'); $('#spClock').textContent = '';
    R.skip = false; R.cur = 'say';
    await Promise.race([say(step.text), new Promise(r => { R.skipSay = r; })]);
    if (!R.dead && !R.skip) await sleep(600);
    return;
  }
  const label = step.kind === 'q' ? `Question ${step.n}` : step.part === '2' ? 'Long turn' : 'Argument';
  const question = step.kind === 'q' ? step.text : step.part === '2' ? step.questions.join(' / ') : step.title;
  let body;
  if (step.kind === 'q') body = `<p class="spmeta">Question ${step.n} of ${step.of}</p>${step.images ? imgs(step.images) : ''}<p class="spq-text">${esc(step.text)}</p>`;
  else if (step.part === '2') body = `<p class="spmeta">Questions</p>${step.image ? imgs([step.image]) : ''}<ul class="spqs">${step.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul>`;
  else body = `<p class="spq-text" style="font-weight:700">${esc(step.title)}</p><div class="sptable"><div><b>For</b><ul>${step.pros.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><div><b>Against</b><ul>${step.cons.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`;
  frame(step, body);
  // 1) the question is read aloud
  setPhase('listen', 'Skip ›'); $('#spClock').textContent = '';
  R.skip = false;
  await Promise.race([say(sayText(step)), new Promise(r => { R.skipSay = r; })]);
  if (R.dead) return;
  // 2) thinking time (only where the format has it)
  R.skip = false; // a Skip pressed while the question was read must not cut the next phases short
  if (step.think) { setPhase('think', 'Start speaking now ›'); await countdown(step.think); if (R.dead) return; }
  // 3) beep → record
  R.skip = false; // 'Start speaking now' must not end the recording instantly
  setPhase('wait');
  try { R.stream = await openMic(); } catch { R.dead = true; toast('Microphone was blocked. Allow it and try again.', 'bad'); go('#/speaking'); return; }
  await beep(); if (R.dead) return;
  setPhase('speak', step.kind === 'q' && step.n < step.of || step.part !== '3' ? 'Done · next ›' : 'Finish ›');
  const seg = await record(step.speak, step, label);
  closeMic();   // mic off again so the next question is played at full volume
  R.segs.push({ part: step.part, label, question, ...seg });
}
actions.spNext = () => { R.skip = true; R.skipSay?.(); R.stopSay?.(); };
actions.spExit = async () => { if (await confirmBox('Leave the test?', 'Your recordings will be lost.', 'Leave', true)) { R.dead = true; go('#/'); } };

async function runAll() {
  R.done = [];
  for (let i = 0; i < R.steps.length; i++) {
    if (R.dead) return;
    const s = R.steps[i];
    await runStep(s);
    if (i + 1 >= R.steps.length || R.steps[i + 1].part !== s.part) R.done.push(s.part);
  }
  if (R.dead) return;
  closeMic();
  document.body.classList.remove('running'); window.onbeforeunload = null;
  analyse();
}
const b64 = blob => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(blob); });

async function analyse() {
  const st = S.student, t = R.test;
  const answered = R.segs.filter(hasAnswer).length;
  $('#view').innerHTML = `<div class="wrap page"><div class="intro center" style="max-width:560px"><div class="loading">AI is listening to your answers… (20–60 seconds)<br><small class="muted">${answered} of ${R.segs.length} answers recorded. Please keep this page open.</small></div></div></div>`;
  try {
    const segments = [];
    for (const s of R.segs) segments.push({ part: s.part, label: s.label, question: s.question, mime: s.mime, secs: Math.round(s.secs), data: hasAnswer(s) ? await b64(s.blob) : '' });
    const fb = await store.checkSpeaking({ test_title: t.title, group: st.group, segments });
    try { await store.saveSpeaking({ test_id: t.id, test_title: t.title, student_name: st.name, group_code: st.group, total: fb.total || 0, level: fb.level || '', feedback: fb }); }
    catch (e) { toast('Result shown but not saved: ' + e.message, 'bad'); }
    $('#view').innerHTML = `<div class="wrap page"><div class="row"><a class="btn sm" href="#/">${icon('home', 15)} Home</a><a class="btn sm" href="#/speaking">All speaking tests</a><a class="btn sm primary" href="#/speaking/run/${t.id}">Try again</a></div>
      <h1 class="ptitle mt">${esc(t.title)}</h1>
      <div class="panel mt spclips"><b>Recorded on your device</b> <small class="muted">(if a long answer shows ✗ or a tiny size, the microphone did not record — tell your teacher)</small>
      ${R.segs.map(x => `<div class="row between"><span>Part ${esc(x.part)} · ${esc(x.label)}</span><span>${hasAnswer(x) ? '✓' : '✗'} ${Math.round(x.secs)} s · ${Math.round(x.size / 1024)} KB</span></div>`).join('')}</div>
      <div class="mt">${speakingFeedback(fb)}</div></div>`;
    window.scrollTo(0, 0);
  } catch (e) {
    $('#view').innerHTML = `<div class="wrap page"><div class="empty">${esc(e.message)}<br><br><a class="btn" href="#/speaking">Back</a></div></div>`;
  }
}

// ═════════════ teacher tab ═════════════
export async function speakingTab(body) {
  const [tests, subs] = await Promise.all([store.listSpeakingTests(), store.listSpeakings()]);
  body.innerHTML = `<div class="row between wrapx" style="margin-bottom:14px"><b>${tests.length} speaking tests</b>
      <div class="row">${tests.length ? '' : '<button class="btn sm" data-act="spSample">Add sample test</button>'}<button class="btn primary sm" data-act="spEdit">${icon('plus', 16)} New test</button></div></div>
    ${tests.length ? `<div class="tablewrap"><table><thead><tr><th>Title</th><th>Parts</th><th>Status</th><th class="r"></th></tr></thead><tbody>
      ${tests.map(t => `<tr><td><b>${esc(t.title)}</b></td><td class="muted">${[...new Set(buildSteps(t.data || {}).map(s => s.part))].join(' · ')}</td><td>${t.published ? '<span class="badge ok">Published</span>' : '<span class="badge draft">Draft</span>'}</td>
        <td class="r"><button class="btn sm" data-act="spEdit" data-id="${t.id}">${icon('edit', 14)} Edit</button> <button class="btn sm" data-act="spPub" data-id="${t.id}">${t.published ? 'Unpublish' : 'Publish'}</button> <button class="btn sm danger" data-act="spDel" data-id="${t.id}">${icon('trash', 14)}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No speaking tests yet.</div>'}
    <h2 class="ptitle mt2" style="font-size:22px">Student attempts</h2>
    <div class="mt">${subs.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Student</th><th>Group</th><th>Test</th><th>Score</th><th class="r"></th></tr></thead><tbody>
      ${subs.slice(0, 300).map(w => `<tr><td class="muted">${fmtDateTime(w.created_at)}</td><td><b>${esc(w.student_name)}</b></td><td>${esc(w.group_code)}</td><td>${esc(w.test_title)}</td><td><b>${w.total}/75</b> <span class="badge">${esc(w.level)}</span></td>
        <td class="r"><button class="btn sm" data-act="spSubOpen" data-id="${w.id}">View</button> <button class="btn sm danger" data-act="spSubDel" data-id="${w.id}">${icon('trash', 14)}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No attempts yet.</div>'}</div>`;
  speakingTab.tests = tests; speakingTab.subs = subs; speakingTab.body = body;
}
const refresh = () => speakingTab(speakingTab.body);
actions.spSample = async () => {
  let list = [];
  try { const r = await fetch('speaking.json?v=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error(); list = (await r.json()).tests; } catch { return toast('speaking.json not found', 'bad'); }
  const have = new Set((await store.listSpeakingTests()).map(t => t.title));
  const fresh = list.filter(t => !have.has(t.title));
  for (const t of fresh) await store.saveSpeakingTest({ id: uid(), ...t });
  toast(fresh.length ? `${fresh.length} sample test(s) added` : `Nothing new: all ${list.length} samples are already in the list`, fresh.length ? 'ok' : 'bad'); refresh();
};
actions.spPub = async el => { const t = speakingTab.tests.find(x => x.id === el.dataset.id); await store.saveSpeakingTest({ ...t, published: !t.published }); refresh(); };
actions.spDel = async el => { if (await confirmBox('Delete test?', 'Past attempts stay.', 'Delete', true)) { await store.deleteSpeakingTest(el.dataset.id); refresh(); } };
actions.spSubOpen = el => { const w = speakingTab.subs.find(x => x.id === el.dataset.id); if (w) viewSpeaking(w); };
actions.spSubDel = async el => { if (await confirmBox('Delete attempt?', 'This cannot be undone.', 'Delete', true)) { await store.deleteSpeaking(el.dataset.id); refresh(); } };

const imgField = (id, label, val) => `<label class="lbl">${label}</label><div class="row"><input class="inp" id="${id}" value="${esc(val || '')}" placeholder="https://… (or upload)" style="flex:1"><label class="btn sm" style="cursor:pointer">Upload<input type="file" accept="image/*" hidden data-in="spUp" data-t="${id}"></label></div>`;
inputs.spUp = async el => {
  const f = el.files?.[0]; if (!f) return;
  try { toast('Uploading…'); const url = await store.uploadFile(f); $('#' + el.dataset.t).value = url; toast('Uploaded', 'ok'); } catch (e) { toast(e.message, 'bad'); }
};
actions.spEdit = el => {
  const t = speakingTab.tests.find(x => x.id === el.dataset.id) || { title: '', published: true, data: {} };
  const d = t.data || {}, im = d.p12?.images || [];
  modal(`<h2>${t.id ? 'Edit' : 'New'} speaking test</h2>
    <label class="lbl">Title</label><input class="inp" id="spTitle" value="${esc(t.title)}" placeholder="Speaking Test 1">
    <h3 class="mt">Part 1.1 <small class="muted">— 3 questions, 30 s each</small></h3>
    <textarea class="inp" id="sp11" rows="3" placeholder="One question per line">${esc(linesOf(d.p11?.questions).join('\n'))}</textarea>
    <h3 class="mt">Part 1.2 <small class="muted">— 2 pictures, 3 questions (1st: 10 s + 45 s, others 30 s)</small></h3>
    ${imgField('sp12a', 'Picture 1', im[0])}${imgField('sp12b', 'Picture 2', im[1])}
    <label class="lbl">Questions (the 1st should be about the pictures)</label><textarea class="inp" id="sp12" rows="3">${esc(linesOf(d.p12?.questions).join('\n'))}</textarea>
    <h3 class="mt">Part 2 <small class="muted">— picture + 3 questions, 1 min to think + 2 min</small></h3>
    ${imgField('sp2img', 'Picture', d.p2?.image)}
    <label class="lbl">Questions</label><textarea class="inp" id="sp2" rows="3">${esc(linesOf(d.p2?.questions).join('\n'))}</textarea>
    <h3 class="mt">Part 3 <small class="muted">— argument, 1 min to think + 2 min</small></h3>
    <label class="lbl">Topic</label><input class="inp" id="sp3t" value="${esc(d.p3?.title || '')}">
    <div class="row"><div style="flex:1"><label class="lbl">For (one per line)</label><textarea class="inp" id="sp3p" rows="4">${esc(linesOf(d.p3?.pros).join('\n'))}</textarea></div>
      <div style="flex:1"><label class="lbl">Against (one per line)</label><textarea class="inp" id="sp3c" rows="4">${esc(linesOf(d.p3?.cons).join('\n'))}</textarea></div></div>
    <label class="row mt"><input type="checkbox" id="spPubc" ${t.published ? 'checked' : ''}> Published</label>
    <div class="row mt" style="justify-content:flex-end"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="spSave" data-id="${t.id || ''}">Save</button></div>`, true);
};
actions.spSave = async el => {
  const title = $('#spTitle').value.trim();
  if (!title) return toast('Title is required', 'bad');
  const data = {
    p11: { questions: linesOf($('#sp11').value) },
    p12: { images: [$('#sp12a').value.trim(), $('#sp12b').value.trim()].filter(Boolean), questions: linesOf($('#sp12').value) },
    p2: { image: $('#sp2img').value.trim(), questions: linesOf($('#sp2').value) },
    p3: { title: $('#sp3t').value.trim(), pros: linesOf($('#sp3p').value), cons: linesOf($('#sp3c').value) },
  };
  if (!buildSteps(data).length) return toast('Add at least one part', 'bad');
  const old = speakingTab.tests.find(x => x.id === el.dataset.id);
  await store.saveSpeakingTest({ ...(old || {}), id: el.dataset.id || uid(), title, published: $('#spPubc').checked, data });
  closeModal(); toast('Saved', 'ok'); refresh();
};
