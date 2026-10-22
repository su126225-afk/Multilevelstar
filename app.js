import './prefs.js';
import { CONFIG } from './config.js';
import { initStore, store } from './store.js';
import { esc } from './logic.js';
import { $, actions, inputs, icon, S, requireStudent, initials, toast, recheckMembership } from './ui.js';
import * as V from './views-student.js';
import * as A from './views-admin.js';
import * as W from './views-writing.js';
import * as VC from './views-vocab.js';
import * as SP from './views-speaking.js';
import * as IE from './views-ielts.js';
import { startActivity } from './activity.js';

const routes = [
  [/^\/?$/, V.home],
  [/^\/practice\/(reading|listening)$/, V.practice],
  [/^\/ielts$/, IE.ieltsHome],
  [/^\/ielts\/listening\/([\w-]+)$/, IE.ieltsListening],
  [/^\/speaking$/, SP.speakingList],
  [/^\/speaking\/run\/([\w-]+)$/, SP.speakingRun],
  [/^\/vocab$/, VC.vocabList],
  [/^\/vocab\/board$/, VC.vocabBoard],
  [/^\/vocab\/run\/([\w-]+)$/, VC.vocabRun],
  [/^\/writing$/, W.writingList],
  [/^\/writing\/([\w-]+)$/, W.writingEditor],
  [/^\/leaderboard$/, V.leaderboard],
  [/^\/me$/, V.me],
  [/^\/test\/([\w-]+)$/, V.testIntro],
  [/^\/run\/([\w-]+)$/, V.runTest],
  [/^\/result\/([\w-]+)$/, V.resultView],
  [/^\/admin$/, A.adminHome],
  [/^\/admin\/test\/([\w-]+)$/, A.adminEditor],
];

function renderNav(path) {
  const st = S.student;
  const link = (href, label, extra = '') => `<a href="${href}" class="${path === href.slice(1) || (href !== '#/' && path.startsWith(href.slice(1))) ? 'active' : ''}">${label}${extra}</a>`;
  $('#nav').innerHTML = `<div class="wrap">
    <a class="brand" href="#/"><span class="logo">${icon('spark', 20)}</span>${esc(CONFIG.brand)}</a>
    <nav class="navpills">${link('#/', 'Home')}${link('#/ielts', 'IELTS')}${link('#/practice/reading', 'Reading')}${link('#/practice/listening', 'Listening')}${link('#/writing', 'Writing')}${link('#/vocab', 'Vocabulary')}${link('#/speaking', 'Speaking')}${link('#/leaderboard', 'Leaderboard')}${st ? link('#/me', 'Profile') : ''}</nav>
    <div class="navright">
      <a class="icon-btn" href="${CONFIG.telegramPersonalUrl}" target="_blank" rel="noopener" title="${esc(CONFIG.coursesTitle)} · ${esc(CONFIG.telegramPersonal)}">${icon('user', 18)}</a>
      <a class="icon-btn" href="${CONFIG.telegramUrl}" target="_blank" rel="noopener" title="${esc(CONFIG.telegramChannel)}">${icon('send', 18)}</a>
      <button class="icon-btn" data-act="theme" title="Theme">${icon(document.documentElement.dataset.theme !== 'dark' ? 'moon' : 'sun', 18)}</button>
      ${st ? `<a class="studentchip" href="#/me"><span class="av">${esc(initials(st.name))}</span>${esc(st.name.split(' ')[0])}</a>`
        : '<button class="btn primary sm" data-act="signin">Start free</button>'}
    </div></div>`;
  $('#footBrand').innerHTML = `© ${new Date().getFullYear()} ${esc(CONFIG.brand)} · <a href="${CONFIG.telegramUrl}" target="_blank" rel="noopener">${esc(CONFIG.telegramChannel)}</a> · <a href="${CONFIG.telegramPersonalUrl}" target="_blank" rel="noopener">${esc(CONFIG.telegramPersonal)}</a>${store.mode === 'local' ? ' · <span class="badge draft">Demo mode</span>' : ''}`;
}

let navToken = 0;
async function render() {
  const token = ++navToken;
  try { S.cleanup?.(); } catch (e) { console.error(e); }
  S.cleanup = null;
  document.body.classList.remove('running');
  const path = (location.hash.slice(1) || '/').split('?')[0];
  renderNav(path);
  const root = $('#view');
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (!m) continue;
    window.scrollTo(0, 0);
    try { await fn(root, ...m.slice(1)); } catch (e) {
      console.error(e);
      if (token === navToken) root.innerHTML = `<div class="wrap page"><div class="empty">Something went wrong.<br><small>${esc(e.message)}</small><br><br><a class="btn" href="#/">Home</a></div></div>`;
    }
    return;
  }
  root.innerHTML = '<div class="wrap page"><div class="empty">Page not found.<br><br><a class="btn" href="#/">Home</a></div></div>';
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (fn) { if (el.tagName === 'A') e.preventDefault(); fn(el, e); }
});
const onInput = e => { const el = e.target.closest('[data-in]'); if (el && inputs[el.dataset.in]) inputs[el.dataset.in](el, e); };
document.addEventListener('input', onInput);
document.addEventListener('change', onInput);

actions.theme = () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('ma_theme', next); } catch { /* ignore */ }
  renderNav((location.hash.slice(1) || '/').split('?')[0]);
};
actions.signin = async () => { await requireStudent(); };
window.addEventListener('studentchange', () => renderNav((location.hash.slice(1) || '/').split('?')[0]));
window.addEventListener('hashchange', render);

(async () => {
  try {
    await initStore();
    startActivity();
    recheckMembership();
  } catch (e) {
    console.error(e);
    $('#view').innerHTML = `<div class="wrap page"><div class="empty">Could not connect to the database.<br><small>${esc(e.message)}</small></div></div>`;
    return;
  }
  document.title = `${CONFIG.brand} · IELTS & Multilevel practice`;
  render();
})();
