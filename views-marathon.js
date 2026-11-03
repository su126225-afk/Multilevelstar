// 35 kunlik marafon: o'quvchi sahifalari (xarita, kun, lug'at, so'z o'yini, speaking) va vazifani belgilash.
import { store } from './store.js';
import { CONFIG } from './config.js';
import { esc } from './logic.js';
import { dayState, dm } from './marlogic.js';
import { $, $$, actions, toast, icon, go, S, requireStudent } from './ui.js';

const TOTAL_DAYS = 35;
const loading = root => { root.innerHTML = '<div class="loading">Yuklanmoqda…</div>'; };
const CTX = 'ma_mar';
const shuffle = a => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

let CONTENT = null;
async function content() {
  if (CONTENT) return CONTENT;
  try { const r = await fetch('marathon.json?v=1'); CONTENT = r.ok ? await r.json() : { days: [] }; } catch { CONTENT = { days: [] }; }
  return CONTENT;
}
export const getCtx = () => { try { return JSON.parse(sessionStorage.getItem(CTX)); } catch { return null; } };
const setCtx = c => { try { sessionStorage.setItem(CTX, JSON.stringify(c)); } catch { /* ignore */ } };

const TYPE = {
  vocab: { ic: 'book', name: "Mavzu lug'ati" }, reading: { ic: 'book', name: 'Reading' }, listening: { ic: 'headphones', name: 'Listening' },
  writing: { ic: 'edit', name: 'Writing (AI tekshiradi)' }, speaking: { ic: 'mic', name: 'Speaking' }, words: { ic: 'spark', name: "Yangi so'zlar o'yini" },
};

let ST = null; // oxirgi holat
async function load() {
  const st = S.student || await requireStudent();
  if (!st) return null;
  ST = await store.marStatus(st.name, st.group);
  return ST;
}

/** Vazifani bajarilgan deb belgilash (test/writing sahifalaridan ham chaqiriladi). */
export async function marTaskDone(day, task, score = null, total = null) {
  const st = S.student; if (!st) return { ok: false, reason: 'no_student' };
  try { return await store.marComplete(st.name, st.group, day, task, score, total); } catch (e) { return { ok: false, reason: 'error', message: e.message }; }
}
const REASONS = { locked: 'Tizim qulflangan — ustoz ochishi kerak.', day_locked: 'Bu kun hali ochilmagan.', unknown_task: 'Bu vazifa kunga biriktirilmagan.', not_enrolled: "Siz marafonga qo'shilmagansiz.", error: 'Xatolik, qayta urinib ko‘ring.' };
export const reasonText = r => REASONS[r?.reason] || 'Vazifa belgilanmadi.';

const warnBox = s => {
  const m = s.missed.length;
  if (s.locked || !m) return '';
  return `<div class="panel marwarn">⚠️ <b>Ogohlantirish:</b> oxirgi ${s.window_days} kun ichida <b>${m}</b> kun dars qilinmadi (${s.missed.map(dm).join(', ')}). Yana ${s.miss_limit - m} kun qoldirsangiz tizim <b>qulflanadi</b>. Bugun vazifalarni bajaring!</div>`;
};
const lockScreen = s => `<div class="wrap page"><div class="panel center marlock">
  <div class="lockic">${icon('lock', 44)}</div><h1 class="ptitle" style="font-size:30px">Marafon qulflandi</h1>
  <p style="margin:12px 0"><b>${esc(s.lock_reason || 'Darslar qoldirildi.')}</b></p>
  <p class="muted">Qoida: oxirgi ${s.window_days} kun ichida ${s.miss_limit} kun dars qilinmasa, tizim qulflanadi. Qulfni faqat ustoz ochadi.</p>
  <div class="ctas" style="justify-content:center"><a class="btn primary" href="${CONFIG.telegramPersonalUrl}" target="_blank" rel="noopener">${icon('send', 15)} Ustozga yozish ${esc(CONFIG.telegramPersonal)}</a></div></div></div>`;

// ═════════════ xarita ═════════════
export async function marathonHome(root) {
  loading(root);
  const [s, C] = await Promise.all([load(), content()]);
  if (!s) { root.innerHTML = '<div class="wrap page"><div class="empty">Marafonga kirish uchun ism va guruh kodini kiriting.<br><br><button class="btn primary" data-act="signin">Kirish</button></div></div>'; return; }
  if (s.error) { root.innerHTML = '<div class="wrap page"><div class="empty">Guruh topilmadi.</div></div>'; return; }
  if (!s.enabled) { root.innerHTML = `<div class="wrap page"><h1 class="ptitle">35 kunlik marafon</h1><div class="empty">Sizning guruhingiz uchun marafon hali ochilmagan.<br><small>Ustozingizdan so'rang.</small></div></div>`; return; }
  if (s.locked) { root.innerHTML = lockScreen(s); return; }
  const has = d => (s.days[d] || []).length > 0;
  const doneDays = [...Array(TOTAL_DAYS)].map((_, i) => i + 1).filter(d => has(d) && dayState(s, d, s.days[d]).done).length;
  const cur = Math.min(s.open_upto, TOTAL_DAYS);
  const tiles = [...Array(TOTAL_DAYS)].map((_, i) => {
    const d = i + 1, soon = !has(d), ds = soon ? null : dayState(s, d, s.days[d]);
    const cls = soon ? 'soon' : ds.done ? 'done' : !ds.open ? 'lockd' : d === cur ? 'cur' : 'open';
    const inner = soon ? `<b>${d}</b><small>tez kunda</small>` : ds.done ? `<b>${d}</b><small>${icon('check', 14)}</small>` : !ds.open ? `<b>${d}</b><small>${icon('lock', 13)}</small>` : `<b>${d}</b><small>${ds.count}/${s.days[d].length}</small>`;
    return soon || !ds.open ? `<div class="mday ${cls}">${inner}</div>` : `<a class="mday ${cls}" href="#/marathon/${d}">${inner}</a>`;
  }).join('');
  root.innerHTML = `<div class="wrap page"><h1 class="ptitle">35 kunlik marafon</h1>
    <p class="muted">Multilevel imtihoniga tayyorgarlik. Har kuni vazifalarni bajaring — keyingi kun faqat bugungi kun tugagach ochiladi. Bugun: <b>${dm(s.today)}</b> · ${esc(s.name)}</p>
    ${warnBox(s)}
    <div class="kv mt"><div><b>${doneDays}</b><span>kun bajarildi</span></div><div><b>${cur}</b><span>hozirgi kun</span></div><div><b>${s.miss_limit - s.missed.length}</b><span>qolgan "imkoniyat"</span></div></div>
    <div class="panel mt"><div class="row between"><b>Qoidalar</b></div><ul style="margin:8px 0 0;padding-left:20px;line-height:1.7"><li>Har kuni kamida bitta vazifa bajarilgan bo'lishi kerak.</li><li>Oxirgi ${s.window_days} kun ichida <b>${s.miss_limit} kun</b> dars qilmasangiz — tizim qulflanadi (ustoz ochadi).</li><li>Kunning barcha vazifalari tugagach, keyingi kun ochiladi.</li></ul></div>
    <div class="mgrid mt">${tiles}</div>
    ${cur <= TOTAL_DAYS && has(cur) ? `<div class="ctas mt2"><a class="btn primary lg" href="#/marathon/${cur}">${icon('play', 18)} ${cur}-kunni davom ettirish</a></div>` : ''}
  </div>`;
}

// ═════════════ kun sahifasi ═════════════
function dayDef(C, d) { return (C.days || []).find(x => x.day === d); }
export async function marathonDay(root, dStr) {
  const d = Number(dStr);
  loading(root);
  const [s, C] = await Promise.all([load(), content()]);
  if (!s || !s.enabled) return go('#/marathon');
  if (s.locked) { root.innerHTML = lockScreen(s); return; }
  const def = dayDef(C, d), ids = s.days[d] || [];
  if (!def || !ids.length) { root.innerHTML = '<div class="wrap page"><div class="empty">Bu kun kontenti tez kunda.<br><br><a class="btn" href="#/marathon">Xaritaga</a></div></div>'; return; }
  if (d > s.open_upto) { root.innerHTML = `<div class="wrap page"><div class="empty">${icon('lock', 36)}<br>${d}-kun hali ochilmagan.<br><small>Avval oldingi kun vazifalarini bajaring.</small><br><br><a class="btn" href="#/marathon">Xaritaga</a></div></div>`; return; }
  const ds = dayState(s, d, ids);
  const tasks = ids.map(id => def.tasks.find(t => t.id === id)).filter(Boolean);
  const nextUndone = tasks.find(t => !ds.doneSet.has(t.id));
  const prog = s.progress.filter(p => p.day === d);
  root.innerHTML = `<div class="wrap page"><a class="muted" href="#/marathon">← Xaritaga</a>
    <h1 class="ptitle mt" style="font-size:34px">${d}-kun · ${esc(def.title)}</h1>
    <p class="muted">${esc(def.focus || '')}</p>${warnBox(s)}
    <div class="meter mt"><i style="width:${Math.round(ds.count / tasks.length * 100)}%"></i></div><small class="muted">${ds.count} / ${tasks.length} vazifa bajarildi</small>
    <div class="mtasks mt">${tasks.map((t, i) => {
      const ty = TYPE[t.type] || TYPE.vocab, done = ds.doneSet.has(t.id), p = prog.find(x => x.task === t.id);
      const score = done && p && p.total ? `<span class="badge ok">${p.score}/${p.total}</span>` : done ? '<span class="badge ok">✓</span>' : '';
      return `<div class="mtask ${done ? 'done' : t === nextUndone ? 'next' : ''}"><span class="mnum">${done ? icon('check', 16) : i + 1}</span>
        <div class="grow"><b>${esc(t.title)}</b><small class="muted">${icon(ty.ic, 13)} ${ty.name}${t.minutes ? ' · ~' + t.minutes + ' daqiqa' : ''}</small></div>${score}
        <button class="btn sm ${t === nextUndone ? 'primary' : ''}" data-act="marOpen" data-day="${d}" data-task="${esc(t.id)}">${done ? 'Qayta' : 'Boshlash'}</button></div>`;
    }).join('')}</div>
    ${ds.done ? `<div class="panel mt2 center"><h2>🎉 ${d}-kun tugadi!</h2><p class="muted">${d < TOTAL_DAYS && (s.days[d + 1] || []).length ? 'Keyingi kun ochildi.' : 'Keyingi kun kontenti tez orada qo\'shiladi.'}</p>${d < TOTAL_DAYS && (s.days[d + 1] || []).length ? `<a class="btn primary" href="#/marathon/${d + 1}">${d + 1}-kunga o'tish ${icon('arrow', 14)}</a>` : ''}</div>` : ''}
  </div>`;
}

actions.marOpen = async el => {
  const day = Number(el.dataset.day), task = el.dataset.task;
  const C = await content(), def = dayDef(C, day), t = def?.tasks.find(x => x.id === task);
  if (!t) return;
  if (t.type === 'reading' || t.type === 'listening') { setCtx({ day, task, ref: t.ref }); return go('#/test/' + t.ref); }
  if (t.type === 'writing') { setCtx({ day, task, ref: t.ref }); return go('#/writing/' + t.ref); }
  go(`#/marathon/${day}/${task}`);
};

// ═════════════ ichki vazifalar: lug'at, o'yin, speaking ═════════════
let TK = null;
export async function marathonTask(root, dStr, task) {
  const day = Number(dStr);
  loading(root);
  const [s, C] = await Promise.all([load(), content()]);
  if (!s || !s.enabled || s.locked || day > s.open_upto) return go('#/marathon');
  const t = dayDef(C, day)?.tasks.find(x => x.id === task);
  if (!t) return go('#/marathon/' + day);
  TK = { day, t, seen: new Set(), s };
  if (t.type === 'vocab') drawVocab(root);
  else if (t.type === 'words') drawGame(root);
  else if (t.type === 'speaking') drawSpeaking(root);
  else go('#/marathon/' + day);
}
const backLink = () => `<a class="muted" href="#/marathon/${TK.day}">← ${TK.day}-kunga qaytish</a>`;

async function finishTask(sc = null, tot = null) {
  const r = await marTaskDone(TK.day, TK.t.id, sc, tot);
  if (!r.ok) { toast(reasonText(r), 'bad'); if (r.reason === 'locked') go('#/marathon'); return false; }
  toast(r.day_done ? `🎉 ${TK.day}-kun tugadi!` : 'Vazifa bajarildi ✓', 'ok');
  go('#/marathon/' + TK.day);
  return true;
}

// — lug'at: kartani bosganda tarjima chiqadi —
function drawVocab(root) {
  const { t } = TK;
  root.innerHTML = `<div class="wrap page">${backLink()}<h1 class="ptitle mt" style="font-size:30px">${esc(t.title)}</h1>
    <p class="muted">Har bir so'zni bosing — tarjimasi chiqadi. Hammasini ko'rib chiqsangiz, vazifa yakunlanadi. 🔊 — talaffuz.</p>
    <div class="meter mt"><i id="vprog" style="width:0"></i></div><small class="muted" id="vcount">0 / ${t.words.length}</small>
    <div class="vgrid mt">${t.words.map((w, i) => `<div class="vcard" data-act="vFlip" data-i="${i}" tabindex="0"><div class="vw"><b>${esc(w.w)}</b><button class="icon-btn sm" data-act="vSay" data-w="${esc(w.w)}" title="Talaffuz">🔊</button></div>
      <div class="vuz" hidden><b>${esc(w.uz)}</b>${w.ex ? `<small class="muted">${esc(w.ex)}</small>` : ''}</div><small class="muted vhint">bosing</small></div>`).join('')}</div>
    <div class="ctas mt2"><button class="btn primary lg" id="vdone" data-act="vDone" disabled>${icon('check', 18)} Hammasini ko'rdim</button></div></div>`;
}
actions.vSay = (el, e) => { e?.stopPropagation(); try { const u = new SpeechSynthesisUtterance(el.dataset.w); u.lang = 'en-US'; u.rate = 0.9; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* ignore */ } };
actions.vFlip = el => {
  if (!TK) return;
  const i = Number(el.dataset.i);
  el.classList.add('flipped'); $('.vuz', el).hidden = false; $('.vhint', el).hidden = true;
  TK.seen.add(i);
  const n = TK.t.words.length;
  $('#vprog').style.width = Math.round(TK.seen.size / n * 100) + '%'; $('#vcount').textContent = `${TK.seen.size} / ${n}`;
  if (TK.seen.size >= n) $('#vdone').disabled = false;
};
actions.vDone = async el => { el.disabled = true; if (!(await finishTask(TK.t.words.length, TK.t.words.length))) el.disabled = false; };

// — yangi so'zlar o'yini: ingliz so'zini, so'ng tarjimasini bosing —
function drawGame(root) {
  const { t } = TK;
  TK.game = { sel: null, matched: new Set(), tries: 0, firstTry: new Set(), wrongOnce: new Set(), en: shuffle(t.words.map((w, i) => ({ i, text: w.w }))), uz: shuffle(t.words.map((w, i) => ({ i, text: w.uz }))) };
  const g = TK.game;
  root.innerHTML = `<div class="wrap page">${backLink()}<h1 class="ptitle mt" style="font-size:30px">${esc(t.title)}</h1>
    <p class="muted">Matndan olingan yangi so'zlar. Avval inglizcha so'zni, keyin uning o'zbekcha tarjimasini bosing.</p>
    <div class="row between mt"><b id="gscore">0 / ${t.words.length}</b><small class="muted" id="gtries">Xato: 0</small></div>
    <div class="gamegrid mt"><div class="gcol">${g.en.map(x => `<button class="gcell" data-act="gPick" data-side="en" data-i="${x.i}">${esc(x.text)}</button>`).join('')}</div>
    <div class="gcol">${g.uz.map(x => `<button class="gcell" data-act="gPick" data-side="uz" data-i="${x.i}">${esc(x.text)}</button>`).join('')}</div></div></div>`;
}
actions.gPick = async el => {
  const g = TK?.game; if (!g || el.classList.contains('ok')) return;
  const side = el.dataset.side, i = Number(el.dataset.i);
  if (!g.sel || g.sel.side === side) { $$('.gcell.sel', el.closest('.gamegrid')).filter(x => x.dataset.side === side).forEach(x => x.classList.remove('sel')); el.classList.add('sel'); g.sel = { side, i, el }; return; }
  const a = g.sel; g.sel = null;
  if (a.i === i) {
    [a.el, el].forEach(x => { x.classList.remove('sel'); x.classList.add('ok'); x.disabled = true; });
    g.matched.add(i);
    $('#gscore').textContent = `${g.matched.size} / ${TK.t.words.length}`;
    if (g.matched.size === TK.t.words.length) {
      const good = TK.t.words.length - g.wrongOnce.size;
      toast("Barcha so'zlar topildi!", 'ok');
      setTimeout(() => finishTask(good, TK.t.words.length), 500);
    }
  } else {
    g.tries++; g.wrongOnce.add(a.side === 'en' ? a.i : i); g.wrongOnce.add(a.i); // xato qilingan juftlik "birinchi urinishda" hisobga olinmaydi
    $('#gtries').textContent = 'Xato: ' + g.tries;
    [a.el, el].forEach(x => { x.classList.remove('sel'); x.classList.add('bad'); });
    setTimeout(() => [a.el, el].forEach(x => x.classList.remove('bad')), 450);
  }
};

// — speaking: Telegram orqali —
function drawSpeaking(root) {
  const { t } = TK;
  root.innerHTML = `<div class="wrap page">${backLink()}<h1 class="ptitle mt" style="font-size:30px">${esc(t.title)}</h1>
    ${t.note ? `<p class="muted">${esc(t.note)}</p>` : ''}
    ${(t.images || []).length ? `<div class="row mt" style="gap:12px;flex-wrap:wrap">${t.images.map(u => `<img src="${esc(u)}" alt="Speaking rasmi" style="max-width:100%;width:360px;border-radius:14px;border:1px solid var(--border)">`).join('')}</div>` : ''}
    <div class="panel mt"><b>Savollar</b><ol style="margin:8px 0 0;padding-left:22px;line-height:1.8">${(t.questions || []).map(q => `<li>${esc(q)}</li>`).join('')}</ol></div>
    <div class="panel mt"><b>Qanday topshiriladi?</b><ol style="margin:8px 0 0;padding-left:22px;line-height:1.8"><li>Telefondan ovoz yozib oling (har bir javob ~30–60 soniya).</li><li>Ovozli xabarni Telegramda ustozga yuboring: <a href="${CONFIG.telegramPersonalUrl}" target="_blank" rel="noopener"><b>${esc(CONFIG.telegramPersonal)}</b></a>. Xabarga ismingiz, guruhingiz va kun raqamini yozing.</li><li>Yuborgach, pastdagi tugmani bosing.</li></ol>
      <div class="ctas"><a class="btn" href="${CONFIG.telegramPersonalUrl}" target="_blank" rel="noopener">${icon('send', 15)} Telegramni ochish</a><a class="btn" href="#/speaking">AI bilan mashq qilish</a></div></div>
    <label class="row mt" style="gap:10px;align-items:center"><input type="checkbox" id="spOk" data-act="spCheck"> <span>Ovozli xabarni ustozga yubordim</span></label>
    <div class="ctas mt"><button class="btn primary lg" id="spDone" data-act="spDone" disabled>${icon('check', 18)} Bajardim</button></div></div>`;
}
actions.spCheck = el => { $('#spDone').disabled = !el.checked; };
actions.spDone = async el => { el.disabled = true; if (!(await finishTask(null, null))) el.disabled = false; };
