import { esc } from './logic.js';
import { store } from './store.js';
import { CONFIG } from './config.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const actions = {};   // click handlers   (data-act="name")
export const inputs = {};    // input/change handlers (data-in="name")
export const go = h => { location.hash = h; };

// ───────── icons ─────────
const P = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  headphones: '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2zM3 15a2 2 0 0 0 2 2h1v-5H5a2 2 0 0 0-2 2z"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h7M8 11h7"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  trophy: '<path d="M8 4h8v6a4 4 0 0 1-8 0zM8 6H4v2a3 3 0 0 0 4 3M16 6h4v2a3 3 0 0 1-4 3M12 14v4M8 21h8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  spark: '<path d="M12 2l2.2 6.3L21 10l-6.8 1.7L12 18l-2.2-6.3L3 10l6.8-1.7z"/>',
  chart: '<path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6"/>',
  send: '<path d="M21.9 4.6 18.7 20c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-4.9 9-8.1L6 12.3l-4.8-1.5L20.6 3z"/>',
  logout: '<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>',
};
export const icon = (n, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

// ───────── toast / modal ─────────
export function toast(msg, type = 'info') {
  const d = document.createElement('div');
  d.className = 'toast ' + type;
  d.textContent = msg;
  $('#toasts').appendChild(d);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 320); }, 3400);
}
export function modal(html, wide = false) {
  const w = $('#modal');
  w.innerHTML = `<div class="backdrop" data-act="closeModal"></div><div class="sheet ${wide ? 'wide' : ''}">${html}</div>`;
  w.classList.add('open');
}
export function closeModal() { const w = $('#modal'); w.classList.remove('open'); w.innerHTML = ''; }
actions.closeModal = () => { closeModal(); resolvers.student?.(null); resolvers.student = null; resolvers.confirm?.(false); resolvers.confirm = null; };

const resolvers = {};
export function confirmBox(title, text, okLabel = 'Confirm', danger = false) {
  return new Promise(res => {
    resolvers.confirm = res;
    modal(`<h2>${esc(title)}</h2><p class="muted" style="margin:8px 0 22px">${esc(text)}</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-act="closeModal">Cancel</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-act="confirmYes">${esc(okLabel)}</button></div>`);
  });
}
actions.confirmYes = () => { const r = resolvers.confirm; resolvers.confirm = null; closeModal(); r?.(true); };

// ───────── student identity ─────────
const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)), del: k => localStorage.removeItem(k) };
export const S = {
  get student() { return ls.get('ma_student'); },
  set student(v) { v ? ls.set('ma_student', v) : ls.del('ma_student'); window.dispatchEvent(new Event('studentchange')); },
  cleanup: null,
};

export const tgGated = () => store.mode === 'cloud' && !!CONFIG.telegramBot && !!CONFIG.requireChannel;
let tgPending = null;   // verified Telegram user waiting for the group-code step

function groupStep(prefill = '') {
  modal(`<h2>Who is taking the test?</h2>
    <p class="muted">Enter your name and the group code your teacher gave you. Your results will be saved and shown on the leaderboard.</p>
    <label class="lbl">Full name</label><input class="inp" id="stName" placeholder="e.g. Azizbek Karimov" autocomplete="name" maxlength="60" value="${esc(prefill)}">
    <label class="lbl">Group code</label><input class="inp" id="stCode" placeholder="e.g. IELTS-7" autocomplete="off" maxlength="30" style="text-transform:uppercase">
    <div class="err" id="stErr"></div>
    <div class="row" style="margin-top:8px"><button class="btn primary grow" data-act="studentSubmit" id="stBtn">Continue ${icon('arrow', 18)}</button></div>`);
  setTimeout(() => (prefill ? $('#stCode') : $('#stName'))?.focus(), 50);
}

function tgStep() {
  modal(`<h2>Sign in with Telegram</h2>
    <p class="muted">${esc(CONFIG.brand)} is free for subscribers of <b>${esc(CONFIG.telegramChannel)}</b>. Sign in with Telegram — we only read your name and check that you are subscribed.</p>
    <div id="tgBox" style="min-height:54px;margin:18px 0;display:flex;justify-content:center"><span class="muted">Loading Telegram…</span></div>
    <div class="err" id="stErr"></div>
    <p class="note" style="text-align:center">Not subscribed yet? <a href="${CONFIG.telegramUrl}" target="_blank" rel="noopener">${icon('send', 14)} ${esc(CONFIG.telegramChannel)}</a></p>`);
  window.onTelegramAuth = tgDone;
  const sc = document.createElement('script');
  sc.async = true; sc.src = 'https://telegram.org/js/telegram-widget.js?22';
  sc.dataset.telegramLogin = CONFIG.telegramBot; sc.dataset.size = 'large'; sc.dataset.radius = '10';
  sc.dataset.onauth = 'onTelegramAuth(user)'; sc.dataset.requestAccess = 'write';
  sc.onerror = () => { const e = $('#stErr'); if (e) e.textContent = 'Telegram could not be loaded. Check your internet and try again.'; };
  const box = $('#tgBox'); if (box) { box.innerHTML = ''; box.appendChild(sc); }
}
async function tgDone(user) {
  const err = $('#stErr'); if (err) err.textContent = '';
  try {
    const r = await store.tgAuth({ mode: 'login', user });
    tgPending = { user, ...r };
    if (r.member) return groupStep(r.name);
    modal(`<h2>Please subscribe first</h2>
      <p class="muted">Hi ${esc(r.name || 'there')}! You are not a subscriber of <b>${esc(CONFIG.telegramChannel)}</b> yet. Join the channel, then come back and press the button below.</p>
      <div class="err" id="stErr"></div>
      <div class="row" style="margin-top:14px;flex-wrap:wrap"><a class="btn primary" href="${CONFIG.telegramUrl}" target="_blank" rel="noopener">${icon('send', 16)} Join ${esc(CONFIG.telegramChannel)}</a>
      <button class="btn" data-act="tgRecheck">I joined — check again</button></div>`);
  } catch (e) { const el = $('#stErr'); if (el) el.textContent = e.message; }
}
actions.tgRecheck = async () => {
  if (!tgPending) return tgStep();
  const err = $('#stErr'); if (err) err.textContent = '';
  try {
    const r = await store.tgAuth({ mode: 'recheck', id: tgPending.id });
    if (r.member) { tgPending.member = true; groupStep(tgPending.name); }
    else if (err) err.textContent = 'Still not subscribed. Join the channel first, then try again.';
  } catch (e) { if (err) err.textContent = e.message; }
};
/** On page load: a logged-in student who unsubscribed from the channel is signed out. */
export async function recheckMembership() {
  const st = S.student;
  if (!tgGated() || !st?.tg?.id) return;
  try { const r = await store.tgAuth({ mode: 'recheck', id: st.tg.id }); if (r && r.member === false) { S.student = null; toast('Subscribe to ' + CONFIG.telegramChannel + ' to keep using the site', 'bad'); } } catch { /* offline: keep going */ }
}

export function requireStudent() {
  return new Promise(res => {
    if (S.student && (!tgGated() || S.student.tg)) return res(S.student);
    resolvers.student = res;
    if (tgGated()) { tgPending = null; return tgStep(); }
    groupStep();
  });
}
actions.studentSubmit = async () => {
  const name = $('#stName').value.trim().replace(/\s+/g, ' '), code = $('#stCode').value.trim().toUpperCase();
  const err = $('#stErr');
  if (name.length < 2) return void (err.textContent = 'Please enter your full name.');
  if (!code) return void (err.textContent = 'Please enter your group code.');
  const btn = $('#stBtn'); btn.disabled = true; err.textContent = '';
  try {
    const gname = await store.checkGroup(code);
    if (gname == null) { err.textContent = 'This group code was not found. Ask your teacher.'; btn.disabled = false; return; }
    S.student = { name, group: code, groupName: gname, ...(tgPending?.member ? { tg: { id: tgPending.id, username: tgPending.username || '' } } : {}) }; tgPending = null;
    const r = resolvers.student; resolvers.student = null;
    closeModal(); r?.(S.student);
  } catch (e) { err.textContent = e.message; btn.disabled = false; }
};
document.addEventListener('keydown', e => { if (e.key === 'Enter' && $('#stBtn') && e.target.closest('#modal')) actions.studentSubmit(); });

// ───────── line chart (SVG) ─────────
let cid = 0;
export function lineChart(pts, { w = 520, h = 220, min = 0, max = 100, ticks = [0, 50, 100], fmt = v => v } = {}) {
  if (!pts.length) return '';
  const pad = { l: 40, r: 16, t: 14, b: 26 }, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const X = i => pad.l + (pts.length === 1 ? iw / 2 : iw * i / (pts.length - 1));
  const Y = v => pad.t + ih * (1 - (v - min) / (max - min));
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  const id = 'cg' + (++cid);
  const grid = ticks.map(t => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="currentColor" stroke-opacity=".12"/><text x="${pad.l - 8}" y="${Y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join('');
  const last = pts[pts.length - 1];
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Progress chart">
    <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#5b6cff" stop-opacity=".35"/><stop offset="1" stop-color="#5b6cff" stop-opacity="0"/></linearGradient></defs>
    ${grid}
    <path d="${d} L${X(pts.length - 1)},${pad.t + ih} L${X(0)},${pad.t + ih} Z" fill="url(#${id})"/>
    <path d="${d}" fill="none" stroke="#7c8cff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    ${pts.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.y)}" r="${i === pts.length - 1 ? 5.5 : 3.2}" fill="#7c8cff"/>`).join('')}
    <circle cx="${X(pts.length - 1)}" cy="${Y(last.y)}" r="10" fill="#7c8cff" opacity=".2"/>
  </svg>`;
}

export const initials = n => String(n).trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
export const mediaUrl = u => u || '';
