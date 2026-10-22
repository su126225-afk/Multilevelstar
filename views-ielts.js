// IELTS computer-delivered style simulator (Listening first; Reading and Writing plug in later).
// Own branding: it imitates how the exam *works* (sound check, instructions, one-play audio,
// numbered question bar, review flags, 2-minute check), not the logos of the exam owners.
import { CONFIG } from './config.js';
import { store } from './store.js';
import { esc, rich, richGaps, prepare, grade, fmtTime } from './logic.js';
import { $, $$, actions, inputs, icon, go, S, requireStudent, toast, modal, closeModal, confirmBox } from './ui.js';
import { getVolume } from './prefs.js';

export const CHECK_SEC = 120;          // time to check answers after the recording ends
export const NOAUDIO_MIN = 10;         // timer used when a test has no audio file (demo)

// ───────── built-in demo test (original content, no audio) ─────────
const mapSvg = (() => {
  const b = (x, y, w, h, l) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#444"/><text x="${x + w / 2}" y="${y + h / 2 + 5}" font-size="14" text-anchor="middle" font-family="Arial" font-weight="700">${l}</text>`;
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="280" viewBox="0 0 460 280"><rect width="460" height="280" fill="#eef1ea"/>
  <rect x="0" y="118" width="460" height="38" fill="#b9bdc2"/><rect x="214" y="0" width="38" height="280" fill="#b9bdc2"/>
  ${b(20, 20, 80, 70, 'A')}${b(120, 20, 70, 70, 'B')}${b(272, 20, 80, 70, 'C')}${b(372, 20, 70, 70, 'D')}
  ${b(20, 186, 80, 70, 'E')}${b(120, 186, 70, 70, 'F')}${b(272, 186, 80, 70, 'G')}${b(372, 186, 70, 70, 'H')}
  <text x="230" y="272" font-size="11" font-family="Arial" text-anchor="middle" fill="#333">Main Street</text><text x="6" y="141" font-size="11" font-family="Arial" fill="#333">Park Road</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
})();
const MC = (text, opts, answer) => ({ type: 'mcq', text, options: opts.map((t, i) => ({ label: String.fromCharCode(65 + i), text: t })), answer });
export const DEMO = {
  id: 'demo', demo: true, title: 'IELTS Listening — interface demo', section: 'listening', format: 'ielts', duration_min: NOAUDIO_MIN, published: true,
  data: { parts: [
    { title: 'Part 1', instruction: 'You will hear a phone call about a gym membership.', blocks: [
      { instruction: 'Complete the notes. Write **ONE WORD AND/OR A NUMBER** for each answer.', body: '**Gym membership enquiry**\n\nName: Daniel [[Harper]]\n\nMembership type: [[annual]]\n\nStarts on: [[3 March]]\n\nMonthly fee: £[[35]]', questions: [] },
      { instruction: 'Choose the correct letter, **A**, **B** or **C**.', questions: [MC('Why did Daniel choose this gym?', ['It is close to his office', 'It has a swimming pool', 'A friend recommended it'], 'B')] }] },
    { title: 'Part 2', instruction: 'You will hear a guide describing a small town centre.', image: mapSvg, options_title: 'Buildings',
      options: ['Library', 'Bakery', 'Post office', 'Cinema', 'Museum', 'Café', 'Bank', 'Market'].map((t, i) => ({ label: String.fromCharCode(65 + i), text: t })),
      blocks: [{ instruction: 'Label the map. Choose the correct letter, **A–H**, next to Questions 6–8.', questions: [
        { type: 'match', text: 'Post office', answer: 'C' }, { type: 'match', text: 'Museum', answer: 'E' }, { type: 'match', text: 'Café', answer: 'F' }] }] },
    { title: 'Part 3', instruction: 'You will hear two students talking about a project.', blocks: [{ instruction: 'Choose the correct letter, **A**, **B** or **C**.', questions: [
      MC('What do the students agree about the topic?', ['It is too broad', 'It is very recent', 'It needs more research'], 'A'),
      MC('The tutor suggests they should', ['reduce the word count', 'add more graphs', 'change the title'], 'B'),
      MC('When will they present the project?', ['Monday', 'Wednesday', 'Friday'], 'C')] }] },
    { title: 'Part 4', instruction: 'You will hear part of a lecture about bees.', blocks: [{ instruction: 'Answer the questions. Write **ONE WORD ONLY** for each answer.', questions: [
      { type: 'fill', text: 'Bees communicate by a type of ___', answer: 'dance' },
      { type: 'fill', text: 'A colony is led by one ___', answer: 'queen' }] }] },
  ] },
};

// Ready-made full tests (single HTML files uploaded next to index.html). Add a line per file.
export const EXTERNAL = [{ title: 'CDI Listening 1', file: 'cdi-listening-1.html', note: 'Full computer-delivered Listening test · 4 parts · 40 questions' }];

// ───────── helpers ─────────
const SIM = { s: null };
const cur = () => SIM.s;
const loading = root => { root.innerHTML = '<div class="loading">Loading…</div>'; };
const notFound = msg => `<div class="wrap page"><div class="empty">${esc(msg)}<br><br><a class="btn" href="#/ielts">IELTS Mock</a></div></div>`;
const candidate = () => `${S.student?.name || 'Candidate'} - ${S.student?.group || 'XX'}`;
const monitor = (s = 34) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/></svg>`;
const speaker = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M16 8.5a5 5 0 0 1 0 7" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/></svg>`;
const brandStrip = () => `<div class="sim-brand"><span class="sim-logo">${monitor(26)}</span><b>IELTS Mock</b><i>computer-delivered simulator</i><span class="sim-by">${esc(CONFIG.brand)} · ${esc(CONFIG.telegramChannel)}</span></div>`;
const hasAudio = t => !!t.data?.audio_url;

// ───────── landing page  #/ielts ─────────
export async function ieltsHome(root) {
  loading(root);
  const all = await store.listTests({ published: true }).catch(() => []);
  const ls = all.filter(t => t.format === 'ielts' && t.section === 'listening');
  const card = t => `<div class="tcard"><div class="row between"><span class="badge ielts">IELTS</span><span class="badge">Listening</span></div>
    <h3>${esc(t.title)}</h3><div class="muted sm">${hasAudio(t) ? '≈ 30 min · 40 questions · plays once' : t.demo ? 'Interface demo · no audio · ' + NOAUDIO_MIN + ' min' : 'No audio file yet'}</div>
    <div class="ctas"><button class="btn primary sm" data-act="simStart" data-id="${esc(t.id)}">${icon('play', 14)} Start simulator</button></div></div>`;
  root.innerHTML = `<div class="wrap page">
    <div class="panel" style="margin-bottom:22px"><div class="row" style="gap:18px;align-items:center">
      <div class="feature" style="min-height:0;padding:0;border:0;background:none"><div class="ic" style="width:64px;height:64px">${monitor(30)}</div></div>
      <div><h1 class="ptitle">IELTS Mock — computer-delivered</h1>
      <div class="muted">A real exam-day experience on screen: sound check, instructions, a recording that plays once, a numbered question bar, <b>Review</b> flags and the final 2-minute check.</div></div></div></div>
    <div class="panel" style="margin-bottom:22px"><h2 style="font-size:20px;margin-bottom:12px">Full mock test</h2>
      <div class="simsteps"><div class="st on"><b>1</b><span>Listening<small>≈ 30 min + 2 min check · available now</small></span></div>
        <div class="st"><b>2</b><span>Reading<small>60 min · coming next</small></span></div>
        <div class="st"><b>3</b><span>Writing<small>60 min · coming next</small></span></div></div>
      <p class="muted sm" style="margin-top:10px">Start with Listening below. Reading and Writing will join this sequence in the next update.</p></div>
    ${EXTERNAL.length ? `<h2 style="font-size:20px;margin:0 0 12px">Full tests</h2><div class="tgrid" style="margin-bottom:26px">${EXTERNAL.map(e => `<div class="tcard"><div class="row between"><span class="badge ielts">IELTS</span><span class="badge">Listening</span></div><h3>${esc(e.title)}</h3><div class="muted sm">${esc(e.note || '')}</div><div class="ctas"><a class="btn primary sm" href="${esc(e.file)}" target="_blank" rel="noopener">${icon('play', 14)} Open test</a></div></div>`).join('')}</div>` : ''}
    <h2 style="font-size:20px;margin:0 0 12px">Listening simulator</h2>
    <div class="tgrid">${[DEMO, ...ls].map(card).join('')}</div>
    ${ls.length ? '' : '<p class="muted sm" style="margin-top:14px">No IELTS Listening tests with audio yet. Teacher: Admin → New test → Format “IELTS”, Section “Listening”, add the audio URL and part timings.</p>'}
  </div>`;
}
actions.simStart = async el => { const s = await requireStudent(); if (s) go('#/ielts/listening/' + el.dataset.id); };

// ───────── simulator entry  #/ielts/listening/:id ─────────
export async function ieltsListening(root, id) {
  loading(root);
  const test = id === 'demo' ? DEMO : await store.getTest(id);
  if (!test || test.section !== 'listening') { root.innerHTML = notFound('This test was not found.'); return; }
  if (!S.student) { const s = await requireStudent(); if (!s) return go('#/ielts'); }
  const prep = prepare(test);
  if (!prep.flat.length) { root.innerHTML = notFound('This test has no questions yet.'); return; }
  const s = { test, prep, root, step: 'details', answers: {}, flags: {}, curQ: prep.flat[0].n, part: 0, audioOn: false, phase: 'idle', t0: 0, checkEnd: 0, done: false, auto: -1, tm: null };
  SIM.s = s;
  document.body.classList.add('running');
  window.onbeforeunload = () => (s.done ? undefined : 'Your test is in progress.');
  S.cleanup = () => { clearInterval(s.tm); s.done = true; window.onbeforeunload = null; document.body.classList.remove('running'); $('#simAud')?.pause(); stopBeep(); SIM.s = null; };
  drawDetails();
}

// ───────── screen 1: details ─────────
function drawDetails() {
  const s = cur(); if (!s) return;
  s.root.innerHTML = `<div class="sim sim-page">${brandStrip()}
    <div class="sim-center"><div class="sim-card">
      <h2>Check your details</h2>
      <p class="muted">Make sure these details are correct. If something is wrong, tell your teacher before you start.</p>
      <div class="sim-kv"><span>Name</span><b>${esc(S.student.name)}</b><span>Group</span><b>${esc(S.student.group)}</b><span>Test</span><b>${esc(s.test.title)}</b><span>Section</span><b>Listening</b></div>
      <div class="sim-actions"><button class="sim-btn" data-act="simExit">Cancel</button><button class="sim-btn pri" data-act="simToSound">Yes, this is me — Continue</button></div>
    </div></div></div>`;
}
actions.simToSound = () => drawSound();
actions.simExit = async () => { const s = cur(); if (s?.step === 'test' && !(await confirmBox('Leave the test?', 'Your answers will not be saved.', 'Leave', true))) return; if (s) s.done = true; go('#/ielts'); };

// ───────── screen 2: sound test ─────────
let beep = null;
function stopBeep() { try { beep?.ctx.close(); } catch { /* ignore */ } beep = null; }
function drawSound() {
  const s = cur(); if (!s) return;
  s.step = 'sound';
  s.root.innerHTML = `<div class="sim sim-page">${brandStrip()}
    <div class="sim-bar"><span>${esc(candidate())}</span><span class="sim-vol">${speaker}<input type="range" min="0" max="1" step="0.05" value="${getVolume()}" data-in="simVol" aria-label="Volume"></span></div>
    <div class="sim-center blue"><div class="sim-card narrow"><div class="sim-card-head">${icon('headphones', 18)} Test sound</div>
      <p>Put on your headphones and click on the <b>Play sound</b> button to play a sample sound.</p>
      <p><button class="sim-btn" data-act="simBeep" id="simBeepBtn">Play sound</button></p>
      <p class="sim-warn">${icon('check', 15)} If you cannot hear the sound clearly, please tell your teacher.</p>
      <p><button class="sim-btn" data-act="simToInstr">Continue</button></p></div></div></div>`;
}
actions.simBeep = () => {
  stopBeep();
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(), g = ctx.createGain(); g.gain.value = Math.max(0.02, getVolume()) * 0.35; g.connect(ctx.destination);
    [523.25, 659.25, 783.99, 659.25, 523.25].forEach((f, i) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(ctx.currentTime + i * 0.45); o.stop(ctx.currentTime + i * 0.45 + 0.4); });
    beep = { ctx, g };
  } catch { toast('Your browser cannot play the sample sound.', 'bad'); }
};
inputs.simVol = el => {
  const v = Number(el.value); try { localStorage.setItem('ma_vol', String(v)); } catch { /* ignore */ }
  const a = $('#simAud'); if (a) a.volume = v;
  if (beep) beep.g.gain.value = Math.max(0.02, v) * 0.35;
};
actions.simToInstr = () => { stopBeep(); drawInstr(); };

// ───────── screen 3: instructions ─────────
function drawInstr() {
  const s = cur(); if (!s) return;
  s.step = 'instr';
  const n = s.prep.flat.length, aud = hasAudio(s.test);
  s.root.innerHTML = `<div class="sim sim-page">${brandStrip()}
    <div class="sim-bar"><span>${esc(candidate())}</span></div>
    <div class="sim-center"><div class="sim-card wide">
      <h2>IELTS Listening</h2><p>Time: ${aud ? 'Approximately 30 minutes' : NOAUDIO_MIN + ' minutes (demo, no recording)'}</p>
      <h3>INSTRUCTIONS TO CANDIDATES</h3>
      <ul><li>Answer <b>all</b> questions.</li><li>You can change your answers at any time during the test.</li></ul>
      <h3>INFORMATION FOR CANDIDATES</h3>
      <ul><li>There are ${n} questions in this test.</li><li>Each question carries one mark.</li><li>There are ${s.prep.parts.length} parts to the test.</li>
        <li>${aud ? 'You will hear each part <b>once</b>. The recording cannot be paused.' : 'This demo has no recording; the timer counts down instead.'}</li>
        <li>For each part of the test there will be time for you to look through the questions and time for you to check your answers.</li></ul>
      <p class="sim-warn">${icon('check', 15)} Do not click “Start test” until you are told to do so.</p>
      <div class="sim-actions"><button class="sim-btn" data-act="simToSound">Back</button><button class="sim-btn pri" data-act="simBegin">Start test</button></div>
    </div></div></div>`;
}

// ───────── the test ─────────
actions.simBegin = () => {
  const s = cur(); if (!s) return;
  s.step = 'test'; s.t0 = Date.now(); s.phase = 'audio';
  drawTest();
  const a = $('#simAud');
  if (a) {
    a.volume = getVolume();
    a.addEventListener('ended', () => startCheck());
    a.addEventListener('error', () => toast('The audio file could not be loaded.', 'bad'));
    a.play().then(() => { s.audioOn = true; }).catch(() => { toast('Tap anywhere on the page to start the recording.', 'bad'); document.addEventListener('click', () => { if (a.paused && s.phase === 'audio') a.play().then(() => { s.audioOn = true; }).catch(() => {}); }, { once: true }); });
  } else { s.checkEnd = Date.now() + NOAUDIO_MIN * 60000; s.phase = 'check'; s.noAudio = true; }
  clearInterval(s.tm); s.tm = setInterval(tick, 250);
  tick();
};
function startCheck() {
  const s = cur(); if (!s || s.phase !== 'audio') return;
  s.phase = 'check'; s.checkEnd = Date.now() + CHECK_SEC * 1000; tick();
}
function tick() {
  const s = cur(); if (!s || s.done || s.step !== 'test') return;
  const a = $('#simAud'), st = $('#simStatus'), tm = $('#simTimer');
  if (s.phase === 'audio' && a) {
    const t = a.currentTime, dur = a.duration || 0;
    st.textContent = s.audioOn ? `Recording playing · ${fmtTime(t)}${dur ? ' / ' + fmtTime(dur) : ''}` : 'Waiting for the recording to start…';
    const parts = s.prep.parts; let idx = -1;
    parts.forEach((p, i) => { if (p.timing && t >= p.timing.start) idx = i; });
    if (idx >= 0 && idx !== s.auto) { s.auto = idx; if (idx !== s.part) { s.part = idx; s.curQ = parts[idx].from; drawQuestions(); drawFoot(); } }
    tm.textContent = '';
  } else if (s.phase === 'check') {
    const left = Math.max(0, (s.checkEnd - Date.now()) / 1000);
    st.textContent = s.noAudio ? 'Demo mode — no recording' : 'The recording has finished. Check your answers.';
    tm.textContent = `Time left: ${fmtTime(left)}`; tm.classList.toggle('low', left < 30);
    $('#simFinish')?.removeAttribute('disabled');
    if (left <= 0) finish(true);
  }
}
function drawTest() {
  const s = cur(); if (!s) return;
  s.root.innerHTML = `<div class="sim sim-test">${brandStrip()}
    <div class="sim-bar"><span>${esc(candidate())}</span><span class="sim-mid" id="simStatus"></span><span class="sim-timer" id="simTimer"></span>
      <button class="sim-btn sm" data-act="simHelp">Help ?</button><span class="sim-vol">${speaker}<input type="range" min="0" max="1" step="0.05" value="${getVolume()}" data-in="simVol" aria-label="Volume"></span></div>
    <div class="sim-title" id="simTitle"></div>
    <div class="sim-body" id="simBody"></div>
    <div class="sim-foot" id="simFoot"></div>
    ${hasAudio(s.test) ? `<audio id="simAud" preload="auto" src="${esc(s.test.data.audio_url)}"></audio>` : ''}</div>`;
  drawQuestions(); drawFoot();
}

const gapHTML = (n, a) => `<span class="gapwrap" id="q${n}"><b class="gnum">${n}</b><input class="sim-gap" data-in="simAns" data-n="${n}" value="${esc(a ?? '')}" maxlength="60" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Question ${n}"></span>`;
function qHTML(q, a) {
  const n = q.n; let body = '';
  const stem = q.text ? `<div class="qt">${esc(q.text)}</div>` : '';
  if (q.type === 'mcq') body = stem + `<div class="sim-opts">${q.options.map(o => `<label class="sim-opt"><input type="radio" name="q${n}" value="${esc(o.label)}" data-in="simAns" data-n="${n}" ${a === o.label ? 'checked' : ''}><span>${esc(o.text)}</span></label>`).join('')}</div>`;
  else if (q.type === 'tfng' || q.type === 'ynng') body = stem + `<div class="sim-opts">${(q.type === 'tfng' ? ['True', 'False', 'Not Given'] : ['Yes', 'No', 'Not Given']).map(v => `<label class="sim-opt"><input type="radio" name="q${n}" value="${v}" data-in="simAns" data-n="${n}" ${a === v ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>`;
  else if (q.type === 'match') body = `<div class="sim-match"><span class="qt">${esc(q.text)}</span><select class="sim-sel" data-in="simAns" data-n="${n}"><option value="">—</option>${(q.choices || []).map(o => `<option value="${esc(o.label)}" ${a === o.label ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>`;
  else {
    const p = String(q.text).split('___');
    body = p.length > 1 ? `<div class="qt">${esc(p[0])}<input class="sim-gap" data-in="simAns" data-n="${n}" value="${esc(a ?? '')}" maxlength="60" autocomplete="off" spellcheck="false">${esc(p.slice(1).join('___'))}</div>`
      : stem + `<input class="sim-gap" data-in="simAns" data-n="${n}" value="${esc(a ?? '')}" maxlength="60" autocomplete="off" spellcheck="false">`;
  }
  return `<div class="sim-q" id="q${n}" data-q="${n}"><span class="sim-qn">${n}</span><div class="sim-qb">${body}</div></div>`;
}
const optionList = (title, opts) => { const shown = (opts || []).filter(o => o.text); return shown.length ? `<div class="sim-optlist"><b>${esc(title || 'Options')}</b>${shown.map(o => `<div><b>${esc(o.label)}</b> ${esc(o.text)}</div>`).join('')}</div>` : ''; };

function drawQuestions() {
  const s = cur(); if (!s) return;
  const p = s.prep.parts[s.part], gap = n => gapHTML(n, s.answers[n]);
  $('#simTitle').innerHTML = `<b>${esc(p.title || 'Part ' + (s.part + 1))}</b> <span>${p.from === p.to ? 'Question ' + p.from : `Questions ${p.from}–${p.to}`}</span>${p.instruction ? `<em>${esc(p.instruction)}</em>` : ''}`;
  const left = [];
  if (p.image) left.push(`<img class="sim-img" src="${esc(p.image)}" alt="Map or diagram">`);
  if (p.options?.some(o => o.text)) left.push(optionList(p.options_title, p.options));
  if (p.text) left.push(`<div class="sim-notes">${richGaps(p.text, gap)}</div>`);
  const right = p.blocks.map(b => {
    const qs = b.qs.filter(q => !q.inline);
    if (!qs.length && !b.body && !b.instruction) return '';
    return `<div class="sim-block">${b.qs.length ? `<div class="sim-qhead">${b.from === b.to ? 'Question ' + b.from : `Questions ${b.from} – ${b.to}`}</div>` : ''}${b.instruction ? `<div class="sim-ins">${rich(b.instruction)}</div>` : ''}${optionList('List of options', b.options)}${b.body ? `<div class="sim-notes">${richGaps(b.body, gap)}</div>` : ''}${qs.map(q => qHTML(q, s.answers[q.n])).join('')}</div>`;
  }).join('');
  $('#simBody').className = 'sim-body' + (left.length ? ' two' : '');
  $('#simBody').innerHTML = (left.length ? `<div class="sim-left">${left.join('')}</div>` : '') + `<div class="sim-right">${right}</div>`;
  markCur();
}
function markCur() { $$('.sim-q').forEach(e => e.classList.toggle('cur', Number(e.dataset.q) === cur()?.curQ)); }

function drawFoot() {
  const s = cur(); if (!s) return;
  const flagged = !!s.flags[s.curQ];
  const nums = p => s.prep.flat.filter(q => q.pi === p.pi).map(q => `<button class="sim-n ${s.answers[q.n] ? 'done' : ''} ${s.flags[q.n] ? 'flag' : ''} ${q.n === s.curQ ? 'cur' : ''}" data-act="simGo" data-n="${q.n}" aria-label="Question ${q.n}">${q.n}</button>`).join('');
  $('#simFoot').innerHTML = `<label class="sim-rev"><input type="checkbox" data-in="simFlag" ${flagged ? 'checked' : ''}> Review</label>
    <div class="sim-nums">${s.prep.parts.map(p => `<div class="sim-pg ${p.pi === s.part ? 'on' : ''}"><button class="sim-pl" data-act="simPart" data-i="${p.pi}">Part ${p.pi + 1}</button>${p.pi === s.part ? nums(p) : `<small data-i="${p.pi}">${s.prep.flat.filter(q => q.pi === p.pi && s.answers[q.n]).length} of ${p.to - p.from + 1}</small>`}</div>`).join('')}</div>
    <div class="sim-arrows"><button class="sim-arr" data-act="simPrev" aria-label="Previous question">←</button><button class="sim-arr" data-act="simNext" aria-label="Next question">→</button>
    <button class="sim-btn pri" id="simFinish" data-act="simFinish" ${s.phase === 'check' ? '' : 'disabled'} title="Available when the recording ends">Finish</button></div>`;
}
// update the number bar in place (re-rendering it would swallow a click that is in progress)
function refreshFoot() {
  const s = cur(); if (!s) return;
  $$('.sim-n').forEach(b => { const n = Number(b.dataset.n); b.classList.toggle('done', !!s.answers[n]); b.classList.toggle('flag', !!s.flags[n]); b.classList.toggle('cur', n === s.curQ); });
  $$('.sim-pg small').forEach(e => { const p = s.prep.parts[Number(e.dataset.i)]; e.textContent = `${s.prep.flat.filter(q => q.pi === p.pi && s.answers[q.n]).length} of ${p.to - p.from + 1}`; });
  const cb = $('.sim-rev input'); if (cb) cb.checked = !!s.flags[s.curQ];
}
function focusQ(n) {
  const s = cur(); if (!s) return;
  const q = s.prep.flat.find(x => x.n === n); if (!q) return;
  s.curQ = n;
  if (q.pi !== s.part) { s.part = q.pi; drawQuestions(); }
  markCur(); drawFoot();
  const el = document.getElementById('q' + n); el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el?.querySelector('input,select')?.focus({ preventScroll: true });
}
actions.simGo = el => focusQ(Number(el.dataset.n));
actions.simPart = el => { const s = cur(); const p = s?.prep.parts[Number(el.dataset.i)]; if (p) focusQ(p.from); };
actions.simPrev = () => { const s = cur(); if (s) focusQ(Math.max(1, s.curQ - 1)); };
actions.simNext = () => { const s = cur(); if (s) focusQ(Math.min(s.prep.flat.length, s.curQ + 1)); };
inputs.simFlag = el => { const s = cur(); if (!s) return; if (el.checked) s.flags[s.curQ] = 1; else delete s.flags[s.curQ]; refreshFoot(); };
inputs.simAns = el => {
  const s = cur(); if (!s) return;
  const n = Number(el.dataset.n); s.curQ = n;
  if (el.value === '') delete s.answers[n]; else s.answers[n] = el.value;
  markCur(); refreshFoot();
};
document.addEventListener('focusin', e => {
  const s = cur(); const q = e.target.closest?.('.sim-q'); if (!s || !q || s.step !== 'test') return;
  const n = Number(q.dataset.q); if (n !== s.curQ) { s.curQ = n; markCur(); refreshFoot(); }
});

actions.simHelp = () => modal(`<h2>Help</h2><ul style="line-height:1.8;margin:10px 0 16px 18px"><li>The recording plays <b>once</b> and cannot be paused.</li><li>Click a number at the bottom to jump to that question; use the arrows to move one by one.</li><li>Tick <b>Review</b> to mark a question you want to come back to.</li><li>You can change any answer until the test ends.</li><li>When the recording ends you have ${CHECK_SEC / 60} minutes to check your answers, then the test submits automatically. <b>Finish</b> becomes active at that point.</li></ul><div class="row" style="gap:8px"><button class="btn" data-act="closeModal">Close</button><button class="btn danger" data-act="simExit">Leave the test</button></div>`);

actions.simFinish = async () => {
  const s = cur(); if (!s || s.phase !== 'check') return;
  const blank = s.prep.flat.filter(q => !s.answers[q.n]).length, fl = Object.keys(s.flags).length;
  const msg = [blank ? `${blank} question${blank > 1 ? 's are' : ' is'} still empty.` : 'You answered every question.', fl ? `${fl} marked for review.` : ''].filter(Boolean).join(' ');
  if (await confirmBox('Finish the test?', msg + ' You will not be able to change your answers.', 'Finish')) finish(false);
};

async function finish(auto) {
  const s = cur(); if (!s || s.done) return;
  s.done = true; clearInterval(s.tm); $('#simAud')?.pause(); window.onbeforeunload = null; closeModal();
  const t = s.test, g = grade(t, s.answers), timeSec = Math.round((Date.now() - s.t0) / 1000);
  const rec = { test_id: t.demo ? null : t.id, test_title: t.title, section: 'listening', format: 'ielts', student_name: S.student.name, group_code: S.student.group,
    correct: g.correct, total: g.total, percent: g.percent, band: g.band, points: g.points, time_sec: timeSec, details: g.details };
  let id = 'sim-' + Date.now(), saved = false;
  if (!t.demo) { try { id = await store.saveResult(rec); saved = true; } catch (e) { toast('Result could not be saved: ' + e.message, 'bad'); } }
  try { sessionStorage.setItem('ma_last', JSON.stringify({ ...rec, id, created_at: new Date().toISOString(), saved: t.demo ? true : saved, sub: 'Band', demo: !!t.demo })); } catch { /* ignore */ }
  if (auto) toast('Time is up. Your test was submitted.', 'ok');
  go('#/result/' + id);
}
