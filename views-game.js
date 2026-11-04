// ⚽ Lug'at kubogi: reading/listening'dan keyingi so'z takrorlash o'yini.
// O'quvchi o'z klubini va zabt etmoqchi bo'lgan raqibni tanlaydi. To'g'ri javob = gol, xato yoki vaqt tugashi = raqib goli.
import { store } from './store.js';
import { esc } from './logic.js';
import { $, $$, actions, icon, go, S } from './ui.js';

const CLUBS = [
  ['Paxtakor', '#e11d48', '#fff'], ['Navbahor', '#16a34a', '#fff'], ['Nasaf', '#2563eb', '#fde047'], ['Real Madrid', '#f8fafc', '#1e293b'],
  ['Barcelona', '#7f1d1d', '#facc15'], ['Man City', '#38bdf8', '#0f172a'], ['Liverpool', '#dc2626', '#fff'], ['Bayern', '#b91c1c', '#e5e7eb'],
  ['PSG', '#1e3a8a', '#ef4444'], ['Inter', '#1d4ed8', '#111827'], ['Arsenal', '#ef4444', '#fff'], ['Juventus', '#111827', '#f9fafb'],
];
const QSEC = 12;           // har bir hujum uchun soniya
const QCOUNT = 9;          // 9 hujum = 90 daqiqa
const shuffle = a => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const LS = { get(k, d) { try { return JSON.parse(localStorage.getItem('ma_' + k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem('ma_' + k, JSON.stringify(v)); } catch { /* ignore */ } } };
const badge = (c, size = 44) => `<span class="clubb" style="--bg:${c[1]};--fg:${c[2]};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px">${esc(c[0].split(' ').map(w => w[0]).join('').slice(0, 2))}</span>`;
const club = n => CLUBS.find(c => c[0] === n) || CLUBS[0];

let G = null;

/** So'zlardan savollar: EN→UZ, UZ→EN va matndagi gapdan bo'sh joy. */
function buildQuestions(words) {
  const qs = [];
  const pool = shuffle(words);
  const opts = (right, all) => shuffle([right, ...shuffle(all.filter(x => x !== right)).slice(0, 3)]);
  const uzAll = words.map(w => w.uz), enAll = words.map(w => w.w);
  const gap = w => {
    const re = new RegExp('\\b' + w.w.split(' ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\w*', 'i');
    return w.where && re.test(w.where) ? w.where.replace(/^…|…$/g, '').replace(re, '_____') : null;
  };
  let k = 0;
  while (qs.length < QCOUNT && k < pool.length * 3) {
    const w = pool[k % pool.length], t = Math.floor(k / pool.length) % 3, kind = (k + t) % 3; k++;
    if (kind === 2 && gap(w)) qs.push({ kind: 'gap', prompt: gap(w), right: w.w, options: opts(w.w, enAll), w });
    else if (kind === 1) qs.push({ kind: 'uz', prompt: w.uz, right: w.w, options: opts(w.w, enAll), w });
    else qs.push({ kind: 'en', prompt: w.w, right: w.uz, options: opts(w.uz, uzAll), w });
  }
  return qs;
}

export async function gameView(root, id) {
  root.innerHTML = '<div class="loading">Yuklanmoqda…</div>';
  const t = await store.getTest(id);
  const words = (t?.data?.analysis?.words || []).filter(w => w.w && w.uz);
  if (!t || words.length < 4) { root.innerHTML = '<div class="wrap page"><div class="empty">Bu test uchun o\'yin so\'zlari yo\'q.<br><br><a class="btn" href="#/">Bosh sahifa</a></div></div>'; return; }
  G = { t, words, me: LS.get('club', null), rival: null, step: 'pick' };
  S.cleanup = () => clearInterval(G?.tm);
  drawPick(root);
}

function drawPick(root = $('#view')) {
  const won = LS.get('conquered', []);
  root.innerHTML = `<div class="wrap page game">
    <a class="muted" href="#/result-back" data-act="gBack">← Natijaga qaytish</a>
    <h1 class="ptitle mt" style="font-size:36px">⚽ Lug'at kubogi</h1>
    <p class="muted">${esc(G.t.title)} · ${G.words.length} ta so'z. 9 ta hujum = 90 daqiqa. To'g'ri javob — <b>gol</b>, xato yoki ${QSEC} soniyada javob bermasangiz — raqib gol uradi.</p>
    <h3 class="mt2">1. Sizning klubingiz</h3>
    <div class="clubs">${CLUBS.map(c => `<button class="clubc ${G.me === c[0] ? 'on' : ''}" data-act="gMe" data-c="${esc(c[0])}">${badge(c)}<span>${esc(c[0])}</span></button>`).join('')}</div>
    <h3 class="mt2">2. Qaysi klubni zabt etasiz?</h3>
    <div class="clubs">${CLUBS.filter(c => c[0] !== G.me).map(c => `<button class="clubc ${G.rival === c[0] ? 'on rival' : ''}" data-act="gRival" data-c="${esc(c[0])}">${badge(c)}<span>${esc(c[0])}</span>${won.includes(c[0]) ? '<i title="Zabt etilgan">🏆</i>' : ''}</button>`).join('')}</div>
    ${won.length ? `<p class="muted mt">Zabt etilgan klublar: ${won.map(n => badge(club(n), 26)).join(' ')} <b>${won.length}/${CLUBS.length - 1}</b></p>` : ''}
    <div class="ctas mt2"><button class="btn primary lg" data-act="gStart" ${G.me && G.rival ? '' : 'disabled'}>${icon('play', 18)} O'yinni boshlash</button></div></div>`;
}
actions.gMe = el => { G.me = el.dataset.c; LS.set('club', G.me); if (G.rival === G.me) G.rival = null; drawPick(); };
actions.gRival = el => { G.rival = el.dataset.c; drawPick(); };
actions.gBack = (el, e) => { e?.preventDefault(); history.back(); };

actions.gStart = () => {
  Object.assign(G, { qs: buildQuestions(G.words), i: 0, my: 0, op: 0, golden: false, log: [] });
  drawMatch();
  nextQ();
};

function drawMatch() {
  const me = club(G.me), op = club(G.rival);
  $('#view').innerHTML = `<div class="wrap page game">
    <div class="board"><div class="team">${badge(me, 52)}<b>${esc(me[0])}</b></div>
      <div class="score"><span id="sMy">${G.my}</span><i>:</i><span id="sOp">${G.op}</span><small id="gMin">0'</small></div>
      <div class="team r"><b>${esc(op[0])}</b>${badge(op, 52)}</div></div>
    <div class="pitch" id="pitch"><div class="half"></div><div class="circle"></div><div class="goal l"></div><div class="goal r"></div><div class="ball" id="ball">⚽</div><div class="flash" id="flash"></div></div>
    <div class="tbar"><i id="tbar"></i></div>
    <div class="gq panel" id="gq"></div></div>`;
}

function nextQ() {
  clearInterval(G.tm);
  if (G.i >= G.qs.length && !G.golden) return endMatch();
  const q = G.golden ? G.goldenQ : G.qs[G.i];
  G.cur = q; G.locked = false;
  const min = G.golden ? '90+' : Math.round((G.i + 1) * 10) + "'";
  $('#gMin').textContent = min;
  const label = { en: 'Tarjimasini toping', uz: 'Inglizchasini toping', gap: "Gapdagi bo'sh joyga mos so'z" }[q.kind];
  $('#gq').innerHTML = `<div class="row between"><small class="muted">${G.golden ? '🥇 Oltin gol!' : `Hujum ${G.i + 1} / ${G.qs.length}`} · ${label}</small><small class="muted" id="tleft">${QSEC}s</small></div>
    <div class="gprompt ${q.kind === 'gap' ? 'gap' : ''}">${esc(q.prompt)}</div>
    <div class="gopts">${q.options.map((o, k) => `<button class="gopt" data-act="gAns" data-k="${k}">${esc(o)}</button>`).join('')}</div>`;
  const ball = $('#ball'); ball.className = 'ball'; void ball.offsetWidth;
  const t0 = Date.now();
  G.tm = setInterval(() => {
    const left = Math.max(0, QSEC - (Date.now() - t0) / 1000);
    const b = $('#tbar'); if (!b) return clearInterval(G.tm);
    b.style.width = (left / QSEC * 100) + '%'; b.classList.toggle('low', left < 4);
    $('#tleft').textContent = Math.ceil(left) + 's';
    if (left <= 0) answer(-1);
  }, 100);
}
actions.gAns = el => answer(Number(el.dataset.k));

function answer(k) {
  if (G.locked) return; G.locked = true; clearInterval(G.tm);
  const q = G.cur, ok = k >= 0 && q.options[k] === q.right;
  $$('.gopt').forEach((b, j) => { if (q.options[j] === q.right) b.classList.add('ok'); else if (j === k) b.classList.add('bad'); b.disabled = true; });
  G.log.push({ q, ok });
  const ball = $('#ball'), flash = $('#flash');
  ball.classList.add(ok ? 'toR' : 'toL');
  if (ok) G.my++; else G.op++;
  setTimeout(() => {
    $('#sMy').textContent = G.my; $('#sOp').textContent = G.op;
    flash.className = 'flash show ' + (ok ? 'me' : 'op');
    flash.innerHTML = ok ? `GOOOL! ⚽<small>${esc(G.me)}</small>` : `${esc(G.rival)} gol urdi<small>To'g'ri javob: ${esc(q.right)}</small>`;
    try { navigator.vibrate?.(ok ? 60 : [30, 40, 30]); } catch { /* ignore */ }
  }, 550);
  setTimeout(() => {
    flash.className = 'flash';
    if (G.golden) return endMatch();
    G.i++; nextQ();
  }, ok ? 1500 : 2300);
}

function endMatch() {
  clearInterval(G.tm);
  if (G.my === G.op && !G.golden) {     // durang → oltin gol
    G.golden = true;
    const w = G.words[Math.floor(Math.random() * G.words.length)];
    G.goldenQ = { kind: 'en', prompt: w.w, right: w.uz, options: shuffle([w.uz, ...shuffle(G.words.filter(x => x !== w).map(x => x.uz)).slice(0, 3)]), w };
    $('#gq').innerHTML = `<div class="center"><h2>Durang ${G.my}:${G.op}!</h2><p class="muted">Oltin gol: kim birinchi to'g'ri javob bersa — g'olib.</p><button class="btn primary" data-act="gGolden">Davom etish</button></div>`;
    return;
  }
  const win = G.my > G.op;
  if (win) { const w = LS.get('conquered', []); if (!w.includes(G.rival)) { w.push(G.rival); LS.set('conquered', w); } }
  const wrong = G.log.filter(x => !x.ok);
  const seen = new Set();
  $('#gq').innerHTML = `<div class="center"><div class="gres ${win ? 'win' : 'lose'}">${win ? '🏆' : '😤'}</div>
    <h2>${win ? `${esc(G.rival)} zabt etildi!` : `${esc(G.rival)} bu safar yutdi`}</h2>
    <p class="muted">Hisob ${G.my} : ${G.op}. ${win ? 'Zo\'r! Endi kuchliroq raqib tanlang.' : 'Xato so\'zlarni takrorlab, revansh oling!'}</p></div>
    ${wrong.length ? `<h3 class="mt">Takrorlash kerak bo'lgan so'zlar</h3><div class="tablewrap"><table><tbody>${wrong.filter(x => !seen.has(x.q.w.w) && seen.add(x.q.w.w)).map(x => `<tr><td><b>${esc(x.q.w.w)}</b></td><td>${esc(x.q.w.uz)}</td><td class="muted">${esc(x.q.w.where || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="ctas mt" style="justify-content:center"><button class="btn primary" data-act="gStart">${icon('play', 16)} Revansh</button><button class="btn" data-act="gNewRival">Boshqa raqib</button><button class="btn" data-act="gBack">Natijaga qaytish</button></div>`;
}
actions.gGolden = () => nextQ();
actions.gNewRival = () => { G.rival = null; drawPick(); };
