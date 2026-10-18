// Reading comfort settings shared by the test runner and the writing page:
// colour theme (dark / light / high contrast), text size, audio volume.
import { $, $$, actions, inputs, icon } from './ui.js';

const get = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export const FS_MIN = 0.8, FS_MAX = 2, FS_STEP = 0.1;
export const THEMES = [['dark', 'Dark'], ['light', 'Light'], ['hc', 'High contrast']];

export const getTheme = () => document.documentElement.dataset.theme || 'dark';
export const getFs = () => { const v = parseFloat(get('ma_fs', '1')); return Number.isFinite(v) ? Math.min(FS_MAX, Math.max(FS_MIN, v)) : 1; };
export const getVolume = () => { const v = parseFloat(get('ma_vol', '1')); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1; };
export const getSplit = () => { const v = parseFloat(get('ma_split', '0.5')); return Number.isFinite(v) ? Math.min(0.8, Math.max(0.2, v)) : 0.5; };
export const saveSplit = v => set('ma_split', String(v));

export function applyPrefs() {
  document.documentElement.style.setProperty('--fs', String(getFs()));
  const a = $('#aud'); if (a) a.volume = getVolume();
}
export function setTheme(t) {
  document.documentElement.dataset.theme = t;
  set('ma_theme', t);
}
export function setFs(v) {
  v = Math.round(Math.min(FS_MAX, Math.max(FS_MIN, v)) * 10) / 10;
  set('ma_fs', String(v));
  applyPrefs();
  return v;
}

/** The ☰ button and its pop-over. Pass {audio:true} on listening tests to include the volume slider. */
export function settingsButton({ audio = false } = {}) {
  const fs = Math.round(getFs() * 100), th = getTheme();
  return `<div class="setwrap">
    <button class="icon-btn" data-act="openSettings" title="Display settings" aria-label="Display settings" aria-expanded="false">${icon('menu', 20)}</button>
    <div class="setpanel" id="setpanel" hidden>
      <div class="setsec"><div class="settitle">Colour</div>
        <div class="themerow">${THEMES.map(([k, l]) => `<button class="themebtn ${th === k ? 'on' : ''}" data-act="setTheme" data-v="${k}"><i class="sw sw-${k}"></i>${l}</button>`).join('')}</div></div>
      <div class="setsec"><div class="settitle">Text size</div>
        <div class="sizerow"><button class="btn sm" data-act="fsStep" data-d="-1" aria-label="Smaller text">A−</button><b id="fsval">${fs}%</b><button class="btn sm" data-act="fsStep" data-d="1" aria-label="Larger text">A+</button><button class="btn sm" data-act="fsStep" data-d="0">Reset</button></div></div>
      ${audio ? `<div class="setsec"><div class="settitle">Volume</div><input type="range" class="vol" min="0" max="1" step="0.05" value="${getVolume()}" data-in="vol" aria-label="Volume"></div>` : ''}
      <div class="setsec muted" style="font-size:12.5px">Tip: select any text in a passage or question to highlight it. Drag the middle bar to resize the two sides.</div>
    </div></div>`;
}

actions.openSettings = el => {
  const p = $('#setpanel'); if (!p) return;
  const open = p.hidden;
  p.hidden = !open;
  el.setAttribute('aria-expanded', String(open));
};
actions.setTheme = el => {
  setTheme(el.dataset.v);
  $$('.themebtn').forEach(b => b.classList.toggle('on', b === el));
};
actions.fsStep = el => {
  const d = Number(el.dataset.d);
  const v = setFs(d === 0 ? 1 : getFs() + d * FS_STEP);
  const o = $('#fsval'); if (o) o.textContent = Math.round(v * 100) + '%';
};
inputs.vol = el => {
  const v = Number(el.value);
  set('ma_vol', String(v));
  const a = $('#aud'); if (a) a.volume = v;
};
document.addEventListener('mousedown', e => {
  const p = $('#setpanel');
  if (p && !p.hidden && !e.target.closest('.setwrap')) { p.hidden = true; $('[data-act=openSettings]')?.setAttribute('aria-expanded', 'false'); }
});
