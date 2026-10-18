// Counts the time a signed-in student is actually active on the site
// (tab visible AND some input in the last minute), and sends it to the store in small batches.
import { store } from './store.js';
import { S } from './ui.js';

const IDLE_MS = 60_000, TICK_MS = 5_000, FLUSH_S = 30;
let last = Date.now(), pending = 0, timer = null;

const touch = () => { last = Date.now(); };
['mousemove', 'keydown', 'pointerdown', 'scroll', 'touchstart', 'wheel'].forEach(ev => window.addEventListener(ev, touch, { passive: true, capture: true }));

async function flush() {
  const st = S.student;
  if (!st || pending < 1) return;
  const secs = Math.min(pending, 120); pending -= secs;
  try { await store.addActivity(st.name, st.group, secs); } catch { pending += secs; }
}
function tick() {
  const test = document.body.classList.contains('running');   // a running test counts even without mouse movement
  const active = !document.hidden && (test || Date.now() - last < IDLE_MS);
  if (active && S.student) pending += TICK_MS / 1000;
  if (pending >= FLUSH_S) flush();
}
export function startActivity() {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('pagehide', flush);
}
export const fmtHours = s => {
  s = Math.round(s || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};
export async function mySeconds(st) {
  const rows = await store.listActivity();
  const mine = rows.filter(r => r.student_name.toLowerCase() === st.name.toLowerCase() && r.group_code.toUpperCase() === st.group.toUpperCase());
  return { total: mine.reduce((a, r) => a + r.seconds, 0), byDay: Object.fromEntries(mine.map(r => [String(r.day).slice(0, 10), r.seconds])) };
}
