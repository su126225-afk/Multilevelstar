// IELTS 30: AI Speaking — o'quvchi gapiradi (brauzer matnga aylantiradi), AI band va xatolarni ko'rsatadi.
import { store } from './store.js';
import { esc } from './logic.js';
import { $, $$, actions, inputs, toast, icon, S } from './ui.js';
import { marTaskDone, getAcc, reasonText } from './views-marathon.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let ST = null, REC = null;

const wc = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;
function items(t) {
  const parts = t.parts || [{ title: 'Savollar', questions: t.questions || [] }];
  const out = [];
  parts.forEach((p, pi) => {
    const qs = (p.questions || []).filter(Boolean);
    if (p.cue || !qs.length) out.push({ title: p.title, prompt: [p.cue, ...qs].filter(Boolean).join(' | '), label: p.cue ? 'Cue card — 1–2 daqiqa gapiring' : 'Javobingiz', text: '', part: pi });
    else qs.forEach(q => out.push({ title: p.title, prompt: q, label: q, text: '', part: pi }));
  });
  return out;
}

function renderReview(box, msg) {
  box.innerHTML = `<div class="panel mt" id="spaiPanel">
    <div class="row between wrapx"><b>🤖 Javoblarni tekshirish</b><span class="badge">Band + xatolar</span></div>
    <p class="muted" style="margin:6px 0 0">${msg}</p>
    <div id="spaiList">${ST.items.map((it, i) => `<div class="panel mt" style="background:var(--bg2,transparent)">
      <div class="row between wrapx"><span class="badge">${esc(it.title)}</span><span class="muted" id="spwc${i}">${wc(it.text)} so'z</span></div>
      <p style="margin:8px 0"><b>${esc(it.label)}</b></p>
      <textarea class="inp" id="spt${i}" rows="3" data-in="spaiText" data-i="${i}" placeholder="Javobingiz shu yerda ko'rinadi…" style="width:100%">${esc(it.text)}</textarea>
      <div class="ctas" style="margin-top:8px">${SR ? `<button class="btn sm" data-act="spaiMic" data-i="${i}" id="spmic${i}">${icon('mic', 15)} Qayta gapirish</button>` : ''}<button class="btn sm" data-act="spaiClear" data-i="${i}">Tozalash</button></div></div>`).join('')}</div>
    <div class="ctas mt"><button class="btn primary lg" data-act="spaiCheck" id="spaiGo">${icon('spark', 18)} AI tekshirsin</button></div>
    <div id="spaiOut"></div></div>`;
}
function stopRec() { try { REC?.stop(); } catch { /* */ } REC = null; $$('[id^=spmic]').forEach(b => b.classList.remove('primary')); }
inputs.spaiText = el => { const i = +el.dataset.i; ST.items[i].text = el.value; const w = $('#spwc' + i); if (w) w.textContent = wc(el.value) + " so'z"; };
actions.spaiClear = el => { const i = +el.dataset.i; stopRec(); ST.items[i].text = ''; $('#spt' + i).value = ''; $('#spwc' + i).textContent = "0 so'z"; };
actions.spaiMic = el => {
  const i = +el.dataset.i;
  if (REC && REC._i === i) return stopRec();
  stopRec();
  const r = new SR(); r.lang = 'en-US'; r.continuous = true; r.interimResults = true; r._i = i;
  const base = ST.items[i].text ? ST.items[i].text.trim() + ' ' : '';
  r.onresult = e => {
    let fin = '', tmp = '';
    for (let k = 0; k < e.results.length; k++) (e.results[k].isFinal ? (fin += e.results[k][0].transcript + ' ') : (tmp += e.results[k][0].transcript));
    const v = (base + fin + tmp).replace(/\s+/g, ' ').trim();
    ST.items[i].text = v; $('#spt' + i).value = v; $('#spwc' + i).textContent = wc(v) + " so'z";
  };
  r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast("Mikrofonga ruxsat bering", 'bad'); stopRec(); };
  r.onend = () => { if (REC === r) { try { r.start(); } catch { stopRec(); } } };   // jim qolsa ham davom etadi
  try { r.start(); REC = r; el.classList.add('primary'); el.innerHTML = icon('mic', 15) + ' To\'xtatish'; } catch { toast('Mikrofon ishga tushmadi', 'bad'); }
  const reset = () => { $$('[id^=spmic]').forEach(b => { b.innerHTML = icon('mic', 15) + ' Qayta gapirish'; }); };
  const old = r.onend; r.onend = () => { reset(); old(); };
};
const bar = (l, v) => `<div style="min-width:120px;text-align:center"><div class="muted" style="font-size:12px">${l}</div><div style="font-size:26px;font-weight:800">${esc(String(v ?? '—'))}</div></div>`;
actions.spaiCheck = async el => {
  if (ST.busy) return; stopRec();
  const parts = ST.items.filter(x => wc(x.text) > 0);
  if (wc(parts.map(x => x.text).join(' ')) < 20) return toast("Kamida 20 ta so'z gapiring yoki yozing", 'bad');
  ST.busy = true; el.disabled = true; el.innerHTML = 'AI tekshiryapti…';
  const out = $('#spaiOut');
  try {
    const a = getAcc();
    const fb = await store.checkIeSpeaking({ parts: parts.map(x => ({ title: x.title, prompt: x.prompt, text: x.text })), group: a?.group || 'IELTS30' });
    try { await store.saveIeSpeaking({ student_name: a?.name || 'Mehmon', group_code: a?.group || 'IELTSFREE', day: ST.day, task: ST.task.id, band: String(fb.overall ?? ''), transcripts: parts.map(x => ({ title: x.title, prompt: x.prompt, text: x.text })), feedback: fb }); } catch (e) { console.warn(e); }
    const r = await marTaskDone(ST.day, ST.task.id, parseFloat(fb.overall) || null, null);
    out.innerHTML = `<div class="panel mt2"><h2 style="margin:0 0 10px">Natija: Band ${esc(String(fb.overall))}</h2>
      <div class="row wrapx" style="gap:14px;justify-content:space-around">${bar('Fluency', fb.fluency)}${bar('Lexical', fb.lexical)}${bar('Grammar', fb.grammar)}</div>
      <p class="mt">${esc(fb.summary || '')}</p>
      ${(fb.strengths || []).length ? `<b>✅ Yaxshi tomonlar</b><ul>${fb.strengths.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${(fb.mistakes || []).length ? `<b>✏️ Xatolar</b><div class="tablewrap"><table><thead><tr><th>Siz aytdingiz</th><th>Yaxshiroq</th><th>Izoh</th></tr></thead><tbody>${fb.mistakes.map(m => `<tr><td>${esc(m.said)}</td><td><b>${esc(m.better)}</b></td><td class="muted">${esc(m.why)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${(fb.tips || []).length ? `<b>💡 Maslahatlar</b><ul>${fb.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${fb.model_answer ? `<b>🌟 Namuna javob (1-savol)</b><p class="muted">${esc(fb.model_answer)}</p>` : ''}
      <p class="note">Talaffuz AI bilan baholanmaydi — uni ustoz tekshiradi.</p>
      <div class="ctas mt">${r.ok ? `<a class="btn primary lg" href="#/marathon/${ST.day}">Kunga qaytish →</a>` : `<span class="badge bad">${esc(reasonText(r))}</span>`}</div></div>`;
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.innerHTML = 'Qayta tekshirish'; el.disabled = false; ST.busy = false;
  } catch (e) { toast(e.message, 'bad'); el.disabled = false; el.innerHTML = icon('spark', 18) + ' AI tekshirsin'; ST.busy = false; }
};

// ═════════ imtihondagidek suhbat: AI savol o'qiydi → o'quvchi javob beradi → jim qolsa keyingisi ═════════
export function mountSpeakingAI(box, day, task) {
  abortFlow(); stopRec();
  ST = { day, task, items: items(task), busy: false, done: false, box };
  S.cleanup = () => { abortFlow(); stopRec(); };
  if (!SR) return renderReview(box, "<b>Bu brauzerda ovoz→matn ishlamaydi.</b> Javoblarni yozing yoki Chrome (kompyuter / Android) da oching.");
  box.innerHTML = `<div class="panel mt"><div class="row between wrapx"><b>🤖 AI Speaking imtihoni</b><span class="badge">${ST.items.length} savol</span></div>
    <p class="muted" style="margin:6px 0 0">AI sizga savollarni ovoz chiqarib o'qiydi, siz inglizcha javob berasiz. Jim qolsangiz keyingi savolga o'tadi. Part 2 da 1 daqiqa tayyorgarlik beriladi (xohlasangiz o'tkazib yuborasiz). Part 1 va 3 da javob bergach «Keyingi» ni bosasiz. Oxirida AI hammasini tekshiradi. Naushnik taqing, mikrofonga ruxsat bering.</p>
    <div class="ctas mt"><button class="btn primary lg" data-act="spaiStart">${icon('play', 18)} Boshlash</button></div></div>`;
}
let RUN = null, TICK = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function abortFlow() { RUN = null; try { window.speechSynthesis?.cancel(); } catch { /* */ } clearInterval(TICK); }
function say(text) {
  return new Promise(res => {
    const ss = window.speechSynthesis; if (!ss) return res();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'en-GB'; u.rate = 0.95;
    const vs = ss.getVoices(); const v = vs.find(x => /en[-_]GB/i.test(x.lang)) || vs.find(x => /^en/i.test(x.lang)); if (v) u.voice = v;
    let done = false; const fin = () => { if (!done) { done = true; res(); } };
    u.onend = u.onerror = fin; setTimeout(fin, 30000);
    ss.cancel(); ss.speak(u);
  });
}
const stage = () => $('#spStage');
function setStage(i, html) {
  const it = ST.items[i];
  ST.box.innerHTML = `<div class="panel mt" id="spStage"><div class="row between wrapx"><span class="badge">${esc(it.title)}</span><span class="muted">Savol ${i + 1} / ${ST.items.length}</span></div>
    <div style="height:6px;border-radius:6px;background:var(--border,#ddd);margin:10px 0"><div style="height:100%;width:${Math.round(i / ST.items.length * 100)}%;border-radius:6px;background:var(--primary,#6366f1)"></div></div>${html}</div>`;
}
const cueCard = it => `<div class="ie-cue mt" style="font-size:18px;line-height:1.6">${esc(it.prompt).replace(/ \| /g, '<br>')}</div>`;
function listen(i, { silence, max }) {
  return new Promise(res => {
    const id = RUN?.id, it = ST.items[i]; let base = it.text ? it.text + ' ' : '', start = Date.now(), last = 0, has = false, ended = false;
    const finish = () => { if (ended) return; ended = true; clearInterval(TICK); try { r.onend = null; r.stop(); } catch { /* */ } REC = null; res(); };
    const r = new SR(); r.lang = 'en-US'; r.continuous = true; r.interimResults = true; REC = r;
    r.onresult = e => {
      let v = ''; for (let k = 0; k < e.results.length; k++) v += e.results[k][0].transcript + ' ';
      v = (base + v).replace(/\s+/g, ' ').trim(); it.text = v; has = wc(v) > 0; last = Date.now();
      const t = $('#spLive'); if (t) t.textContent = v;
    };
    r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { toast('Mikrofonga ruxsat bering', 'bad'); abortFlow(); ended = true; res(); } };
    r.onend = () => { if (!ended && RUN?.id === id) { base = it.text ? it.text + ' ' : ''; try { r.start(); } catch { /* */ } } };
    try { r.start(); } catch { return res(); }
    window.__spNext = finish;
    clearInterval(TICK);
    TICK = setInterval(() => {
      if (RUN?.id !== id) return finish();
      const now = Date.now(), left = Math.max(0, Math.round((max - (now - start)) / 1000)), t = $('#spLeft'); if (t) t.textContent = left + ' s';
      if (silence && ((has && now - last > silence) || (!has && now - start > 12000 + (silence > 6000 ? 8000 : 0)))) return finish();
      if (now - start > max) finish();
    }, 400);
  });
}
const listenUI = (i, extra = '') => setStage(i, `${extra}<div class="mt" style="display:flex;align-items:center;gap:10px"><span style="width:14px;height:14px;border-radius:50%;background:#ef4444;display:inline-block;animation:pulse 1s infinite"></span><b>Gapiring…</b><span class="muted">${ST.items[i].label.match(/cue card/i) ? '(jim qolsangiz keyingisiga o\'tadi)' : 'javob bergach «Keyingi» ni bosing'}</span><span class="muted" style="margin-left:auto" id="spLeft"></span></div>
  <p class="muted" id="spLive" style="min-height:48px;margin:10px 0"></p>
  <div class="ctas"><button class="btn" data-act="spaiNext">Keyingi →</button></div><style>@keyframes pulse{50%{opacity:.3}}</style>`);
actions.spaiSkipPrep = () => { if (RUN) RUN.skip = true; };
actions.spaiNext = () => { window.__spNext?.(); };
actions.spaiStart = async () => {
  const id = Date.now(); RUN = { id }; const alive = () => RUN?.id === id;
  if (!ST.items.some(x => x)) return;
  try { await navigator.mediaDevices?.getUserMedia?.({ audio: true }).then(s => s.getTracks().forEach(t => t.stop())); } catch { toast('Mikrofonga ruxsat bering', 'bad'); RUN = null; return; }
  setStage(0, `<p style="font-size:18px">🔊 AI: “Hello. Are you ready? Let's begin.”</p>`);
  await say("Hello. Are you ready? Let's begin the speaking test.");
  let lastPart = -1;
  for (let i = 0; i < ST.items.length && alive(); i++) {
    const it = ST.items[i], cue = /cue card/i.test(it.label);
    if (it.part !== lastPart) { lastPart = it.part; setStage(i, `<p style="font-size:18px">🔊 ${esc(it.title.split('—')[0].trim())}</p>`); await say(it.title.split('—')[0].trim() + '.'); if (!alive()) break; }
    if (cue) {
      setStage(i, `<p>🔊 AI topshiriqni o'qiyapti…</p>${cueCard(it)}`);
      await say('Now, I am going to give you a topic. You have one minute to prepare. You can make notes. Here is your topic. ' + it.prompt.split(' | ')[0]);
      RUN.skip = false;
      for (let s = 60; s > 0 && alive() && !RUN.skip; s--) { setStage(i, `<p><b>⏱ Tayyorgarlik: ${s} soniya</b></p>${cueCard(it)}<div class="ctas"><button class="btn" data-act="spaiSkipPrep">Tayyorman — o'tkazib yuborish →</button></div>`); await sleep(1000); }
      if (!alive()) break;
      setStage(i, `<p>🔊 Vaqt tugadi…</p>${cueCard(it)}`); await say('All right. Your time is up. Please start speaking now.'); if (!alive()) break;
      listenUI(i, cueCard(it)); await listen(i, { silence: 10000, max: 120000 });
    } else {
      setStage(i, `<p style="font-size:20px;margin:6px 0"><b>${esc(it.prompt)}</b></p><p class="muted">🔊 AI savolni o'qiyapti…</p>`);
      await say(it.prompt); if (!alive()) break;
      listenUI(i, `<p style="font-size:20px;margin:6px 0"><b>${esc(it.prompt)}</b></p>`); await listen(i, { silence: 0, max: 180000 });
    }
  }
  if (!alive()) return;
  RUN = null; window.__spNext = null;
  await say('Thank you. That is the end of the speaking test.');
  renderReview(ST.box, "Imtihon tugadi! AI javoblaringizni tekshiryapti… Matnda xato bo'lsa tuzating va «Qayta tekshirish» ni bosing.");
  ST.box.scrollIntoView({ behavior: 'smooth' });
  if (wc(ST.items.map(x => x.text).join(' ')) >= 20) setTimeout(() => $('#spaiGo')?.click(), 300);
  else toast("Javoblar juda qisqa — matnni to'ldirib «AI tekshirsin» ni bosing", 'bad');
};
