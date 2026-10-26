// Guruh boshqaruvi: davomat, to'lovlar, o'quvchilar. Router + sahifalar.
import { store, initStore } from './store.js';
import * as L from './logic.js';
import { CONFIG } from './config.js';
import { $, $$, actions, inputs, go, icon, toast, modal, closeModal, confirmBox, copyText, download } from './ui.js';
const { esc, money, monthLabel, fmtDate } = L;

// ───────── ma'lumot keshi ─────────
let D = null, stale = true;
async function load(force) {
  if (D && !force && !stale) return D;
  const names = ['groups', 'students', 'lessons', 'attendance', 'payments'];
  const r = await Promise.all(names.map(t => store.list(t)));
  D = Object.fromEntries(names.map((n, i) => [n, r[i]])); stale = false;
  return D;
}
const invalidate = () => { stale = true; };   // D ni null qilmaymiz: bir vaqtda ishlayotgan boshqa amallar xato qilmasin
const gmap = () => new Map(D.groups.map(g => [g.id, g]));
const smap = () => new Map(D.students.map(s => [s.id, s]));
/** Shu oy davomat jadvaliga kiradigan o'quvchilar: faol va oyni to'liq muzlatib o'tmagan (yoki shu oyda belgisi bor). */
const roster = (gid, mk) => D.students.filter(s => s.group_id === gid && s.active && (!L.frozenInMonth(s, mk) || D.attendance.some(a => a.student_id === s.id && a.day.startsWith(mk))));
const curMonth = () => L.monthOf(L.today());
const ST = { month: null, pg: '', sq: '', sg: '', sf: '', rg: '' };   // sahifalar orasida eslab qolinadigan filtrlar
const mkNow = () => ST.month || (ST.month = curMonth());
let Q = new URLSearchParams();
const root = () => $('#view');
const phoneOf = s => s.parent_phone || s.phone || '';
const digits = p => String(p || '').replace(/[^\d+]/g, '');
const head = (title, right = '') => `<div class="row between wrapx ph"><h1 class="ptitle">${title}</h1><div class="row wrapx">${right}</div></div>`;
const badge = (txt, cls = '') => `<span class="badge ${cls}">${esc(txt)}</span>`;
const payBadge = st => st === 'paid' ? badge("To'langan", 'ok') : st === 'partial' ? badge('Qisman', 'draft') : st === 'unpaid' ? badge("To'lanmagan", 'bad') : badge('—');
const dayNames = days => L.WD_ORDER.filter(d => (days || []).includes(d)).map(d => L.WDS[d]).join(' · ') || '—';
const pctBadge = p => p === null ? badge('—') : badge(p + '%', p >= 85 ? 'ok' : p >= 60 ? 'draft' : 'bad');

/** Qarzdorlar ro'yxati (faol o'quvchilar, tanlangan oy bo'yicha qolgan summa > 0). */
function debtors(mk) {
  const gm = gmap(), now = new Date();
  return D.students.filter(L.isLive).map(s => {
    const g = gm.get(s.group_id), bal = L.monthBalance(s, g, D.payments, mk);
    return { s, g, bal, total: L.totalDebt(s, g, D.payments, mk), due: g ? L.daysToDue(g, now) : 0 };
  }).filter(x => x.bal.left > 0).sort((a, b) => a.due - b.due || b.bal.left - a.bal.left);
}
const remindOf = (x, mk) => L.reminderText(x.s, x.g, mk, x.bal.left, CONFIG.teacher);
const contactBtns = (s, text) => {
  const ph = digits(phoneOf(s));
  return `<button class="btn sm" data-act="remindCopy" data-id="${s.id}" title="Eslatma matnini nusxalash">${icon('copy', 14)} Eslatma</button>
    ${ph ? `<a class="btn sm" href="tel:${esc(ph)}" title="Qo'ng'iroq">${icon('phone', 14)}</a><a class="btn sm" href="sms:${esc(ph)}?body=${encodeURIComponent(text)}" title="SMS">${icon('send', 14)}</a>` : ''}`;
};

// ───────── navigatsiya ─────────
const NAV = [['/', 'Bosh sahifa'], ['/groups', 'Guruhlar'], ['/students', "O'quvchilar"], ['/attendance', 'Davomat'], ['/payments', "To'lovlar"], ['/watch', 'Kuzatuv'], ['/schedule', 'Jadval'], ['/reports', 'Hisobot']];
function renderNav(portal, path) {
  const theme = document.documentElement.dataset.theme;
  $('#nav').innerHTML = `<div class="wrap"><a class="brand" href="${portal ? '#/me' : '#/'}"><span class="logo">${icon('group', 18)}</span><span>${esc(CONFIG.title)}</span></a>
    ${!portal && store.isAdmin() ? `<nav class="navpills">${NAV.map(([h, t]) => `<a href="#${h}" class="${(h === '/' ? path === '/' : path.startsWith(h)) ? 'active' : ''}">${t}</a>`).join('')}</nav>` : '<span style="flex:1"></span>'}
    <div class="navright"><button class="icon-btn" data-act="theme" title="Rejim">${icon(theme === 'light' ? 'moon' : 'sun')}</button>
    ${!portal && store.isAdmin() ? `<button class="icon-btn" data-act="logout" title="Chiqish">${icon('logout')}</button>` : ''}</div></div>`;
  $('#foot').innerHTML = `<div class="wrap"><span>${esc(CONFIG.brand)} · ${esc(CONFIG.telegram)} · ${esc(CONFIG.phone)}</span>${store.mode === 'local' ? `<span>DEMO rejim · ${store.isAdmin() ? '<a href="#" data-act="resetDemo" class="muted">demo ma\'lumotni tiklash</a>' : 'ma\'lumot shu brauzerda'}</span>` : `<a href="#/me" class="muted">O'quvchi kabineti</a>`}</div>`;
}
actions.theme = () => { const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = t; try { localStorage.setItem('mg_theme', t); } catch { /* ixtiyoriy */ } render(); };
actions.logout = async () => { await store.logout(); invalidate(); go('#/'); render(); };
actions.resetDemo = async () => { if (await confirmBox('Demo ma\'lumotni tiklash', 'Hamma kiritilgan ma\'lumot o\'chib, namuna ma\'lumot qaytadi.', 'Tiklash', true)) { await store.resetDemo(); invalidate(); render(); } };

function loginView() {
  const cloud = store.mode === 'cloud';
  root().innerHTML = `<div class="wrap page"><div class="intro" style="max-width:440px"><div class="panel">
    <h1 class="ptitle" style="font-size:28px">O'qituvchi kirishi</h1>
    <p class="muted" style="margin-top:6px">${cloud ? "Supabase'da yaratgan o'qituvchi email va parolingiz bilan kiring." : "DEMO rejim: parol <b>admin123</b> (config.js da o'zgartirasiz)."}</p>
    ${cloud ? '<label class="lbl">Email</label><input class="inp" id="lgEmail" type="email" autocomplete="username">' : ''}
    <label class="lbl">Parol</label><input class="inp" id="lgPw" type="password" autocomplete="current-password">
    <div class="err" id="lgErr"></div>
    <button class="btn primary" style="width:100%;margin-top:6px" data-act="login">Kirish</button>
    <p class="muted" style="margin-top:16px;font-size:13px">O'quvchi yoki ota-onamisiz? <a href="#/me" style="text-decoration:underline">Shaxsiy kabinetga kiring</a></p></div></div></div>`;
  $('#lgPw').addEventListener('keydown', e => { if (e.key === 'Enter') actions.login(); });
}
actions.login = async () => {
  const err = $('#lgErr'); err.textContent = '';
  try { await store.login($('#lgEmail')?.value.trim(), $('#lgPw').value); invalidate(); render(); }
  catch (e) { err.textContent = e.message; }
};

// ───────── bosh sahifa ─────────
async function dashboard() {
  await load();
  const mk = curMonth(), td = L.today(), wd = new Date().getDay(), gm = gmap();
  const active = D.students.filter(L.isLive), debt = debtors(mk);
  const income = D.payments.filter(p => String(p.paid_on).slice(0, 7) === mk).reduce((a, p) => a + Number(p.amount || 0), 0);
  const expected = active.reduce((a, s) => a + L.monthBalance(s, gm.get(s.group_id), D.payments, mk).due, 0);
  const debtSum = debt.reduce((a, x) => a + x.bal.left, 0);
  const todays = D.groups.filter(g => g.active && (g.days || []).includes(wd)).sort((a, b) => String(a.time).localeCompare(String(b.time)));
  const cancelledToday = new Set(D.lessons.filter(l => l.day === td && l.cancelled).map(l => l.group_id));
  root().innerHTML = `<div class="wrap page">${head(`Salom, ${esc(CONFIG.teacher.split(' ')[0])} 👋`, `<span class="muted">${L.WD[wd]}, ${fmtDate(td)}</span>`)}
    <div class="stats">
      <div class="stat"><span>Faol o'quvchilar</span><b>${active.length}</b><small>${D.groups.filter(g => g.active).length} ta guruh${D.students.filter(x => x.active && L.isFrozen(x)).length ? ` · ${D.students.filter(x => x.active && L.isFrozen(x)).length} muzlatilgan` : ''}</small></div>
      <div class="stat"><span>${monthLabel(mk)} tushum</span><b>${money(income)}</b><small>kutilgan: ${money(expected)}</small></div>
      <div class="stat ${debt.length ? 'warn' : ''}"><span>Qarzdorlar (shu oy)</span><b>${debt.length}</b><small>${money(debtSum)}</small></div>
    </div>
    <div class="grid2">
      <section class="panel"><h2 class="h2">Bugungi darslar</h2>
        ${todays.length ? todays.map(g => {
          const sts = active.filter(s => s.group_id === g.id), marked = D.attendance.filter(a => a.day === td && sts.some(s => s.id === a.student_id)).length;
          return `<div class="lrow"><div><b>${esc(g.name)}</b><div class="muted sm">${esc(g.time || '')} · ${sts.length} o'quvchi ${cancelledToday.has(g.id) ? badge('Dars bo\'lmadi', 'draft') : marked ? badge(`${marked}/${sts.length} belgilandi`, marked >= sts.length ? 'ok' : 'draft') : ''}</div></div>
            <a class="btn sm primary" href="#/attendance?g=${g.id}&d=${td}">Davomat</a></div>`;
        }).join('') : `<p class="muted">Bugun dars yo'q. <a href="#/schedule" style="text-decoration:underline">Haftalik jadval</a></p>`}
      </section>
      <section class="panel"><div class="row between"><h2 class="h2">${icon('bell', 18)} To'lov eslatmalari</h2><a class="btn sm" href="#/payments">Hammasi</a></div>
        ${debt.length ? debt.slice(0, 8).map(x => `<div class="lrow"><div><a href="#/students/${x.s.id}"><b>${esc(x.s.name)}</b></a>
          <div class="muted sm">${esc(x.g?.name || '—')} · ${money(x.bal.left)} ${x.due < 0 ? badge(`${-x.due} kun kechikdi`, 'bad') : x.due <= 3 ? badge(`${x.due} kun qoldi`, 'draft') : ''}</div></div>
          <div class="row" style="gap:6px">${contactBtns(x.s, remindOf(x, mk))}</div></div>`).join('') : '<p class="muted">Hamma o\'quvchi shu oy uchun to\'lagan 🎉</p>'}
      </section>
    </div></div>`;
}
actions.remindCopy = async el => {
  await load(); const mk = ST.month && location.hash.startsWith('#/payments') ? ST.month : curMonth();
  const s = D.students.find(x => x.id === el.dataset.id), g = gmap().get(s.group_id), bal = L.monthBalance(s, g, D.payments, mk);
  await copyText(L.reminderText(s, g, mk, bal.left, CONFIG.teacher), 'Eslatma matni nusxalandi');
};

// ───────── guruhlar ─────────
async function groupsView() {
  await load(); const mk = curMonth();
  const rows = D.groups.slice().sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  root().innerHTML = `<div class="wrap page">${head('Guruhlar', `<button class="btn primary" data-act="groupEdit">${icon('plus', 16)} Yangi guruh</button>`)}
    <div class="cards">${rows.map(g => {
      const sts = D.students.filter(s => s.group_id === g.id && L.isLive(s)), gdebt = sts.reduce((a, s) => a + L.monthBalance(s, g, D.payments, mk).left, 0);
      return `<div class="card ${g.active ? '' : 'off'}"><div class="row between"><h3><a href="#/groups/${g.id}">${esc(g.name)}</a></h3>${g.active ? '' : badge('Arxiv')}</div>
        <div class="muted sm">${dayNames(g.days)} ${g.time ? '· ' + esc(g.time) : ''}</div>
        <div class="kv"><span>Oylik narx</span><b>${money(g.price)}</b></div><div class="kv"><span>O'quvchilar</span><b>${sts.length}</b></div>
        <div class="kv"><span>${monthLabel(mk)} qarz</span><b class="${gdebt ? 'bad-t' : ''}">${money(gdebt)}</b></div>
        <div class="row" style="margin-top:6px"><a class="btn sm primary" href="#/groups/${g.id}">Ochish</a><button class="btn sm" data-act="groupEdit" data-id="${g.id}">${icon('edit', 14)}</button><button class="btn sm danger" data-act="groupDel" data-id="${g.id}">${icon('trash', 14)}</button></div></div>`;
    }).join('') || '<div class="empty">Hali guruh yo\'q. «Yangi guruh» tugmasini bosing.</div>'}</div></div>`;
}
actions.groupEdit = async el => {
  GF = []; await load(); const g = D.groups.find(x => x.id === el?.dataset?.id) || { name: '', price: '', days: [1, 3, 5], time: '18:00', pay_day: 5, note: '', active: true };
  modal(`<h2>${g.id ? 'Guruhni tahrirlash' : 'Yangi guruh'}</h2>
    <label class="lbl">Guruh nomi</label><input class="inp" id="gName" value="${esc(g.name)}" placeholder="Masalan: IELTS 6.5 (kechki)">
    <div class="two"><div><label class="lbl">Oylik narx (so'm)</label><input class="inp" id="gPrice" inputmode="numeric" value="${g.price}" placeholder="600000"></div>
    <div><label class="lbl">Dars vaqti</label><input class="inp" id="gTime" value="${esc(g.time)}" placeholder="18:00"></div></div>
    <label class="lbl">Dars kunlari</label><div class="tabs">${L.WD_ORDER.map(d => `<label class="chip dchip ${(g.days || []).includes(d) ? 'on' : ''}"><input type="checkbox" value="${d}" data-in="dayTog" ${(g.days || []).includes(d) ? 'checked' : ''}>${L.WDS[d]}</label>`).join('')}</div>
    <label class="lbl">To'lov muddati (har oyning nechanchi kuni)</label><input class="inp" id="gPay" inputmode="numeric" value="${g.pay_day}" style="max-width:120px">
    <label class="lbl">Izoh</label><input class="inp" id="gNote" value="${esc(g.note)}">
    <label class="chip ${g.active ? 'on' : ''} dchip" style="margin-top:14px"><input type="checkbox" id="gActive" data-in="dayTog" ${g.active ? 'checked' : ''}>Faol guruh</label>
    ${g.id ? '' : `<div class="panel" style="padding:14px;margin-top:14px"><b>O'quvchilarni shu yerda qo'shish</b> <small class="muted">(ixtiyoriy)</small>
      <label class="lbl">Excel fayldan</label><input class="inp" type="file" id="gFile" accept=".xlsx,.xls" multiple data-in="gFile"><div id="gFileInfo" class="muted sm"></div>
      <label class="lbl">yoki matn ro'yxatidan <small class="muted">(har qatorda: Ism Familiya; telefon)</small></label>
      <textarea class="inp" id="gList" rows="4" placeholder="Aliyev Vali; 90 123 45 67\nKarimova Madina"></textarea></div>`}
    <div class="err" id="mErr"></div>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-act="closeModal">Bekor qilish</button><button class="btn primary" data-act="groupSave" data-id="${g.id || ''}">Saqlash</button></div>`);
};
inputs.dayTog = el => el.closest('.chip')?.classList.toggle('on', el.checked);
actions.groupSave = async el => {
  const name = $('#gName').value.trim(), price = Number(String($('#gPrice').value).replace(/\s/g, ''));
  if (!name) { $('#mErr').textContent = 'Guruh nomini yozing'; return; }
  if (!(price >= 0) || $('#gPrice').value.trim() === '') { $('#mErr').textContent = "Oylik narxni raqam bilan yozing"; return; }
  const old = D.groups.find(x => x.id === el.dataset.id) || {};
  const list = el.dataset.id ? [] : [...GF, ...($('#gList')?.value || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [n, p] = l.split(/[;\t]/); return { name: (n || '').replace(/\s+/g, ' ').trim(), parent_phone: L.formatPhone(p || '') }; }).filter(x => x.name)];
  el.disabled = true;
  const saved = await store.save('groups', { ...old, id: el.dataset.id || undefined, name, price, time: $('#gTime').value.trim(), pay_day: Math.min(28, Math.max(1, Number($('#gPay').value) || 1)), note: $('#gNote').value.trim(), active: $('#gActive').checked, days: $$('#modal .dchip input[value]').filter(i => i.checked && i.value !== undefined && i.id !== 'gActive').map(i => Number(i.value)) });
  let msg = 'Saqlandi';
  if (list.length && saved?.id) { try { D.groups.push(saved); const r = await makeStudents(saved, list); msg = `Guruh saqlandi, ${r.added} ta o'quvchi qo'shildi${r.skipped ? ` (${r.skipped} ta takror o'tkazildi)` : ''}`; } catch (e) { msg = "Guruh saqlandi, lekin o'quvchilar qo'shilmadi: " + e.message; } }
  closeModal(); invalidate(); toast(msg, 'ok'); render();
};
let GF = [];
inputs.gFile = async el => {
  GF = []; const info = $('#gFileInfo');
  try {
    const X = await loadSheetJS();
    for (const f of [...el.files]) { const wb = X.read(await f.arrayBuffer(), { type: 'array' }); for (const sn of wb.SheetNames) { const r = L.parseRegister(X.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: true })); if (!r.error) GF.push(...r.students); } }
    info.textContent = GF.length ? `${GF.length} ta o'quvchi topildi — «Saqlash» bosilganda qo'shiladi` : "Fayldan o'quvchi topilmadi";
  } catch (e) { info.textContent = e.message; }
};
actions.groupDel = async el => {
  if (await confirmBox("Guruhni o'chirish", "Guruh o'chadi, o'quvchilar esa guruhsiz qoladi (ularning davomati va to'lovlari saqlanadi). Davom etasizmi?", "O'chirish", true)) { await store.remove('groups', el.dataset.id); invalidate(); toast("O'chirildi", 'ok'); render(); }
};

async function groupView(id) {
  await load(); const g = D.groups.find(x => x.id === id);
  if (!g) { root().innerHTML = '<div class="wrap page"><div class="empty">Guruh topilmadi.<br><br><a class="btn" href="#/groups">Orqaga</a></div></div>'; return; }
  const mk = mkNow(), sts = D.students.filter(s => s.group_id === id).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const grid = L.attendanceGrid(g, roster(id, mk), D.attendance, D.lessons, mk);
  root().innerHTML = `<div class="wrap page"><a class="btn sm" href="#/groups">← Guruhlar</a>
    ${head(esc(g.name), `<button class="btn" data-act="groupEdit" data-id="${g.id}">${icon('edit', 15)} Tahrirlash</button><button class="btn primary" data-act="studentEdit" data-g="${g.id}">${icon('plus', 15)} O'quvchi qo'shish</button>`)}
    <p class="muted">${dayNames(g.days)} ${g.time ? '· ' + esc(g.time) : ''} · ${money(g.price)} / oy · to'lov muddati: har oyning ${g.pay_day}-kuni</p>
    <h2 class="h2 mt">O'quvchilar (${sts.length})</h2>
    <div class="tablewrap"><table><thead><tr><th>Ism</th><th>Telefon</th><th>${monthLabel(mk)}</th><th class="r">Qolgan</th><th></th></tr></thead><tbody>
    ${sts.map(s => { const b = L.monthBalance(s, g, D.payments, mk); return `<tr class="${s.active ? '' : 'off'}"><td><a href="#/students/${s.id}"><b>${esc(s.name)}</b></a> ${s.active ? (L.isFrozen(s) ? badge('Muzlatilgan', 'draft') : '') : badge('Faol emas')}</td><td class="muted">${esc(phoneOf(s))}</td><td>${payBadge(b.status)}</td><td class="r">${b.left ? money(b.left) : '—'}</td><td class="r"><button class="btn sm" data-act="payAdd" data-id="${s.id}" data-m="${mk}">${icon('money', 14)}</button></td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">Bu guruhda hali o\'quvchi yo\'q.</td></tr>'}</tbody></table></div>
    <div class="row between wrapx mt"><h2 class="h2">Davomat jadvali</h2><div class="row wrapx">${monthPicker(mk)}<button class="btn sm" data-act="pdfGroup" data-id="${g.id}">${icon('download', 14)} PDF</button></div></div>
    ${gridHtml(grid)}</div>`;
}
const monthPicker = mk => `<div class="row" style="gap:6px"><button class="icon-btn" data-act="monthGo" data-n="-1">${icon('left', 16)}</button><b style="min-width:130px;text-align:center">${monthLabel(mk)}</b><button class="icon-btn" data-act="monthGo" data-n="1">${icon('right', 16)}</button></div>`;
actions.monthGo = el => { ST.month = L.addMonths(mkNow(), Number(el.dataset.n)); render(); };
const MARK = { p: '✓', a: '✗', e: 'С', l: '⏰' };
function gridHtml(grid) {
  if (!grid.days.length) return '<div class="empty">Bu oyda dars kunlari yo\'q.</div>';
  return `<div class="tablewrap"><table class="agrid"><thead><tr><th>Ism</th>${grid.days.map(d => `<th class="c">${L.parseYmd(d).getDate()}</th>`).join('')}<th class="c">%</th></tr></thead><tbody>
    ${grid.rows.map(r => `<tr><td>${esc(r.student.name)}</td>${r.cells.map((c, i) => `<td class="c st-${c || 'n'}">${MARK[c] || '·'}${r.hw?.[i] === 'n' ? '<sup class="flag" title="Vazifa bajarmadi">V</sup>' : ''}${r.beh?.[i] === 'b' ? '<sup class="flag" title="Tartib yomon">T</sup>' : ''}</td>`).join('')}<td class="c">${pctBadge(r.stats.pct)}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted sm">✓ keldi · ✗ kelmadi · С sababli · ⏰ kechikdi · · belgilanmagan. <sup class="flag">V</sup> uyga vazifa bajarilmagan · <sup class="flag">T</sup> tartib yomon. Bekor qilingan darslar ko'rsatilmaydi.</p>`;
}

// ───────── o'quvchilar ─────────
function studentTable() {
  const mk = curMonth(), gm = gmap();
  let rows = D.students.map(s => { const g = gm.get(s.group_id); return { s, g, bal: L.monthBalance(s, g, D.payments, mk), total: L.totalDebt(s, g, D.payments, mk) }; });
  const q = ST.sq.trim().toLowerCase();
  if (ST.sg) rows = rows.filter(x => x.s.group_id === ST.sg);
  if (q) rows = rows.filter(x => (x.s.name + ' ' + x.s.phone + ' ' + x.s.parent_phone + ' ' + x.s.code).toLowerCase().includes(q));
  if (ST.sf === 'debt') rows = rows.filter(x => L.isLive(x.s) && x.bal.left > 0);
  else if (ST.sf === 'frozen') rows = rows.filter(x => x.s.active && L.isFrozen(x.s));
  else if (ST.sf === 'off') rows = rows.filter(x => !x.s.active); else rows = rows.filter(x => x.s.active || ST.sf === 'all');
  rows.sort((a, b) => a.s.name.localeCompare(b.s.name));
  return { count: rows.length, html: `<table><thead><tr><th>Ism</th><th>Guruh</th><th>Telefon</th><th>${monthLabel(mk)}</th><th class="r">Jami qarz</th><th>Kod</th></tr></thead><tbody>
    ${rows.map(x => `<tr class="${x.s.active ? '' : 'off'}"><td><a href="#/students/${x.s.id}"><b>${esc(x.s.name)}</b></a> ${L.isFrozen(x.s) ? badge('Muzlatilgan', 'draft') : ''}</td><td class="muted">${esc(x.g?.name || '—')}</td><td class="muted">${esc(phoneOf(x.s))}</td><td>${L.isFrozen(x.s) ? '—' : payBadge(x.bal.status)}</td><td class="r ${x.total ? 'bad-t' : ''}">${x.total ? money(x.total) : '—'}</td><td><code>${esc(x.s.code)}</code></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Hech narsa topilmadi.</td></tr>'}</tbody></table>` };
}
async function studentsView() {
  await load(); const mk = curMonth(), t = studentTable();
  root().innerHTML = `<div class="wrap page">${head("O'quvchilar", `<button class="btn" data-act="bulkAdd">${icon('users', 16)} Ko'plab qo'shish / Excel</button><button class="btn primary" data-act="studentEdit">${icon('plus', 16)} Yangi o'quvchi</button>`)}
    <div class="filters"><input class="inp" id="sSearch" data-in="sFilter" placeholder="Ism, telefon yoki kod…" value="${esc(ST.sq)}">
      <select class="sel" id="sGroup" data-in="sFilter"><option value="">Hamma guruh</option>${D.groups.map(g => `<option value="${g.id}" ${ST.sg === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>
      <select class="sel" id="sFlt" data-in="sFilter"><option value="">Faol</option><option value="debt" ${ST.sf === 'debt' ? 'selected' : ''}>Qarzdor (${monthLabel(mk)})</option><option value="frozen" ${ST.sf === 'frozen' ? 'selected' : ''}>Muzlatilgan</option><option value="off" ${ST.sf === 'off' ? 'selected' : ''}>Faol emas (ketgan)</option><option value="all" ${ST.sf === 'all' ? 'selected' : ''}>Hammasi</option></select>
      <span class="muted" id="sCount">${t.count} ta</span></div>
    <div class="tablewrap" id="sTable">${t.html}</div></div>`;
}
inputs.sFilter = () => {
  ST.sq = $('#sSearch').value; ST.sg = $('#sGroup').value; ST.sf = $('#sFlt').value;
  if (!D || !$('#sTable')) return; const t = studentTable(); $('#sTable').innerHTML = t.html; $('#sCount').textContent = t.count + ' ta';
};
actions.studentEdit = async el => {
  await load(); const s = D.students.find(x => x.id === el?.dataset?.id) || { name: '', group_id: el?.dataset?.g || ST.sg || '', phone: '', parent_phone: '', price: null, joined: L.today(), active: true, note: '' };
  modal(`<h2>${s.id ? "O'quvchini tahrirlash" : "Yangi o'quvchi"}</h2>
    <label class="lbl">Ism familiya</label><input class="inp" id="sName" value="${esc(s.name)}">
    <label class="lbl">Guruh</label><select class="sel" id="sGrp"><option value="">— guruhsiz —</option>${D.groups.filter(g => g.active || g.id === s.group_id).map(g => `<option value="${g.id}" ${s.group_id === g.id ? 'selected' : ''}>${esc(g.name)} · ${money(g.price)}</option>`).join('')}</select>
    <div class="two"><div><label class="lbl">Telefon</label><input class="inp" id="sPhone" value="${esc(s.phone)}" placeholder="+998 90 123 45 67"></div>
    <div><label class="lbl">Ota-ona telefoni</label><input class="inp" id="sPPhone" value="${esc(s.parent_phone)}"></div></div>
    <div class="two"><div><label class="lbl">Shaxsiy narx (so'm, ixtiyoriy)</label><input class="inp" id="sPrice" inputmode="numeric" value="${s.price ?? ''}" placeholder="bo'sh = guruh narxi"></div>
    <div><label class="lbl">Qo'shilgan sana</label><input class="inp" id="sJoined" type="date" value="${esc(String(s.joined).slice(0, 10))}"></div></div>
    <label class="lbl">Izoh</label><input class="inp" id="sNote" value="${esc(s.note)}">
    <label class="chip dchip ${s.active ? 'on' : ''}" style="margin-top:14px"><input type="checkbox" id="sActive" data-in="dayTog" ${s.active ? 'checked' : ''}>Faol o'quvchi</label>
    <div class="err" id="mErr"></div>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-act="closeModal">Bekor qilish</button><button class="btn primary" data-act="studentSave" data-id="${s.id || ''}">Saqlash</button></div>`);
};
actions.studentSave = async el => {
  const name = $('#sName').value.trim(); if (!name) { $('#mErr').textContent = 'Ismni yozing'; return; }
  const old = D.students.find(x => x.id === el.dataset.id) || {}, pr = $('#sPrice').value.trim();
  const code = old.code || L.genCode(new Set(D.students.map(s => s.code)));
  await store.save('students', { ...old, id: el.dataset.id || undefined, name, group_id: $('#sGrp').value || null, phone: $('#sPhone').value.trim(), parent_phone: $('#sPPhone').value.trim(), price: pr === '' ? null : Number(pr.replace(/\s/g, '')), joined: $('#sJoined').value || L.today(), note: $('#sNote').value.trim(), active: $('#sActive').checked, code });
  closeModal(); invalidate(); toast('Saqlandi', 'ok'); render();
};

async function studentView(id) {
  await load(); const s = D.students.find(x => x.id === id);
  if (!s) { root().innerHTML = '<div class="wrap page"><div class="empty">O\'quvchi topilmadi.<br><br><a class="btn" href="#/students">Orqaga</a></div></div>'; return; }
  const g = gmap().get(s.group_id), now = curMonth(), pays = D.payments.filter(p => p.student_id === id).sort((a, b) => String(b.paid_on).localeCompare(String(a.paid_on)));
  const att = D.attendance.filter(a => a.student_id === id).sort((a, b) => b.day.localeCompare(a.day)), st = L.attStats(att.slice(0, 30));
  const months = L.monthsBetween(L.monthOf(s.joined), now).reverse().slice(0, 12);
  const link = `${location.origin}${location.pathname}#/me/${s.code}`, total = L.totalDebt(s, g, D.payments, now);
  root().innerHTML = `<div class="wrap page"><a class="btn sm" href="#/students">← O'quvchilar</a>
    ${head(`${esc(s.name)} ${s.active ? (L.isFrozen(s) ? badge('Muzlatilgan', 'draft') : '') : badge('Faol emas')}`, `<button class="btn" data-act="studentEdit" data-id="${s.id}">${icon('edit', 15)} Tahrirlash</button>${s.active ? (L.isFrozen(s) ? `<button class="btn" data-act="studentUnfreeze" data-id="${s.id}">Muzlatishni bekor qilish</button>` : `<button class="btn" data-act="studentFreeze" data-id="${s.id}">Muzlatish</button>`) : ''}<button class="btn primary" data-act="payAdd" data-id="${s.id}" data-m="${now}">${icon('money', 15)} To'lov qo'shish</button>`)}
    <div class="stats"><div class="stat"><span>Guruh</span><b style="font-size:20px">${g ? `<a href="#/groups/${g.id}">${esc(g.name)}</a>` : '—'}</b><small>${money(L.priceOf(s, g))} / oy</small></div>
      <div class="stat ${total ? 'warn' : ''}"><span>Jami qarz</span><b>${money(total)}</b><small>${monthLabel(now)}: ${money(L.monthBalance(s, g, D.payments, now).left)}</small></div>
      <div class="stat"><span>Davomat (oxirgi 30 dars)</span><b>${st.pct === null ? '—' : st.pct + '%'}</b><small>${st.p + st.l} keldi · ${st.a} kelmadi · ${st.e} sababli</small></div></div>
    <div class="panel mt"><div class="kv"><span>Telefon</span><b>${esc(s.phone) || '—'}</b></div><div class="kv"><span>Ota-ona</span><b>${esc(s.parent_phone) || '—'}</b></div><div class="kv"><span>Qo'shilgan</span><b>${fmtDate(s.joined)}</b></div>${s.note ? `<div class="kv"><span>Izoh</span><b>${esc(s.note)}</b></div>` : ''}
      <div class="kv"><span>Kabinet kodi</span><b><code>${esc(s.code)}</code> <button class="btn sm" data-act="copy" data-t="${esc(link)}">${icon('link', 14)} Havolani nusxalash</button></b></div></div>
    <h2 class="h2 mt">Oylar bo'yicha to'lov</h2>
    <div class="tablewrap"><table><thead><tr><th>Oy</th><th class="r">Kerak</th><th class="r">To'langan</th><th class="r">Qolgan</th><th></th></tr></thead><tbody>
    ${months.map(m => { const b = L.monthBalance(s, g, D.payments, m); return `<tr><td>${monthLabel(m)}</td><td class="r">${money(b.due)}</td><td class="r">${money(b.paid)}</td><td class="r ${b.left ? 'bad-t' : ''}">${b.left ? money(b.left) : '—'}</td><td class="r">${payBadge(b.status)} ${b.left ? `<button class="btn sm" data-act="payAdd" data-id="${s.id}" data-m="${m}">+</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>
    <h2 class="h2 mt">To'lovlar tarixi</h2>${payTable(pays, false)}
    <div class="row between wrapx mt"><h2 class="h2">Davomat (oxirgi 30 ta belgi)</h2><div class="row wrapx">${monthPicker(mkNow())}<button class="btn sm" data-act="pdfStudent" data-id="${s.id}">${icon('download', 14)} PDF (${monthLabel(mkNow())})</button></div></div>
    <div class="chips">${att.slice(0, 30).map(a => `<span class="dot st-${a.status}" title="${fmtDate(a.day)} · ${L.STATUS[a.status]}">${fmtDate(a.day).slice(0, 5)} ${MARK[a.status]}${a.hw === 'n' ? ' V' : ''}${a.beh === 'b' ? ' T' : ''}</span>`).join('') || '<span class="muted">Hali belgilanmagan.</span>'}</div>
    <div style="margin-top:28px"><button class="btn danger" data-act="studentDel" data-id="${s.id}">${icon('trash', 14)} O'quvchini o'chirish</button></div></div>`;
}
actions.copy = el => copyText(el.dataset.t, 'Havola nusxalandi');
actions.studentDel = async el => {
  if (await confirmBox("O'quvchini o'chirish", "O'quvchi, uning davomati va to'lov tarixi butunlay o'chadi. Odatda «Faol emas» qilish yaxshiroq. O'chiraymi?", "O'chirish", true)) { await store.remove('students', el.dataset.id); invalidate(); go('#/students'); toast("O'chirildi", 'ok'); }
};
function payTable(pays, withName) {
  const sm = smap();
  return `<div class="tablewrap"><table><thead><tr><th>Sana</th>${withName ? "<th>O'quvchi</th>" : ''}<th>Oy</th><th>Usul</th><th class="r">Summa</th><th></th></tr></thead><tbody>
    ${pays.map(p => `<tr><td>${fmtDate(p.paid_on)}</td>${withName ? `<td>${esc(sm.get(p.student_id)?.name || '?')}</td>` : ''}<td>${monthLabel(p.month)}</td><td class="muted">${esc(p.method)}${p.note ? ' · ' + esc(p.note) : ''}</td><td class="r"><b>${money(p.amount)}</b></td><td class="r"><button class="btn sm danger" data-act="payDel" data-id="${p.id}">${icon('trash', 13)}</button></td></tr>`).join('') || `<tr><td colspan="${withName ? 6 : 5}" class="muted">To'lov yo'q.</td></tr>`}</tbody></table></div>`;
}
actions.payDel = async el => { if (await confirmBox("To'lovni o'chirish", "Bu to'lov yozuvi o'chadi.", "O'chirish", true)) { await store.remove('payments', el.dataset.id); invalidate(); render(); } };
actions.payAdd = async el => {
  await load(); const s = D.students.find(x => x.id === el.dataset.id), g = gmap().get(s.group_id), mk = el.dataset.m || curMonth(), b = L.monthBalance(s, g, D.payments, mk);
  modal(`<h2>To'lov qo'shish</h2><p class="muted">${esc(s.name)} · ${monthLabel(mk)} · qolgan: <b>${money(b.left)}</b></p>
    <div class="two"><div><label class="lbl">Summa (so'm)</label><input class="inp" id="pAmt" inputmode="numeric" value="${b.left || L.priceOf(s, g) || ''}"></div>
    <div><label class="lbl">Qaysi oy uchun</label><input class="inp" id="pMonth" type="month" value="${mk}"></div></div>
    <div class="two"><div><label class="lbl">Sana</label><input class="inp" id="pDate" type="date" value="${L.today()}"></div>
    <div><label class="lbl">Usul</label><select class="sel" id="pMethod"><option>naqd</option><option>karta</option><option>o'tkazma</option><option>boshqa</option></select></div></div>
    <label class="lbl">Izoh</label><input class="inp" id="pNote">
    <div class="err" id="mErr"></div>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-act="closeModal">Bekor qilish</button><button class="btn primary" data-act="paySave" data-id="${s.id}">Saqlash</button></div>`);
  setTimeout(() => $('#pAmt')?.select(), 30);
};
actions.paySave = async el => {
  const amount = Number(String($('#pAmt').value).replace(/\s/g, '')), month = $('#pMonth').value;
  if (!(amount > 0)) { $('#mErr').textContent = "Summani yozing"; return; }
  if (!/^\d{4}-\d{2}$/.test(month)) { $('#mErr').textContent = 'Oyni tanlang'; return; }
  await store.save('payments', { student_id: el.dataset.id, month, amount: Math.round(amount), paid_on: $('#pDate').value || L.today(), method: $('#pMethod').value, note: $('#pNote').value.trim() });
  closeModal(); invalidate(); toast("To'lov saqlandi", 'ok'); render();
};

// ───────── davomat ─────────
function attState() {
  const act = D.groups.filter(g => g.active), wd = new Date().getDay();
  const g = D.groups.find(x => x.id === Q.get('g')) || act.find(x => (x.days || []).includes(wd)) || act[0] || D.groups[0];
  return { g, d: Q.get('d') || L.today() };
}
const attHash = (g, d) => `#/attendance?g=${g}&d=${d}`;
function attBody(g, d) {
  const sts = D.students.filter(s => s.group_id === g.id && s.active && !L.frozenOn(s, d) && L.monthOf(s.joined) <= L.monthOf(d)).sort((a, b) => a.name.localeCompare(b.name));
  const les = D.lessons.find(l => l.group_id === g.id && l.day === d) || {}, map = new Map(D.attendance.filter(a => a.day === d).map(a => [a.student_id, a.status])), ex = new Map(D.attendance.filter(a => a.day === d).map(a => [a.student_id, a]));
  const cnt = L.attStats(sts.map(s => ({ status: map.get(s.id) })).filter(x => x.status));
  const offDay = !(g.days || []).includes(L.parseYmd(d).getDay());
  return `${offDay ? `<div class="note">Bu kun (${L.WD[L.parseYmd(d).getDay()]}) guruhning dars kuni emas (${dayNames(g.days)}). Baribir belgilashingiz mumkin.</div>` : ''}
    <div class="panel"><div class="row between wrapx"><label class="chip dchip ${les.cancelled ? 'on' : ''}"><input type="checkbox" data-in="attCancel" ${les.cancelled ? 'checked' : ''}>Dars bo'lmadi (bekor qilindi)</label>
      <input class="inp" id="attTopic" data-in="attTopic" style="max-width:340px" placeholder="Dars mavzusi / uy vazifasi (ixtiyoriy)" value="${esc(les.topic || '')}"></div></div>
    ${les.cancelled ? '<div class="empty" style="margin-top:14px">Dars bekor qilingan, davomat hisobga olinmaydi.</div>' : `
    <div class="row between wrapx" style="margin:16px 0 10px"><span class="muted">${cnt.p} keldi · ${cnt.l} kechikdi · ${cnt.a} kelmadi · ${cnt.e} sababli · ${sts.length - cnt.total} belgilanmagan</span><button class="btn sm" data-act="attAll">${icon('check', 14)} Hammasi keldi</button></div>
    ${sts.map(s => { const v = map.get(s.id) || ''; return `<div class="arow"><div class="aname">${esc(s.name)}</div><div class="seg">${['p', 'l', 'e', 'a'].map(k => `<button class="stbtn st-${k} ${v === k ? 'on' : ''}" data-act="attSet" data-s="${s.id}" data-v="${k}">${L.STATUS[k]}</button>`).join('')}</div>${v ? `<div class="seg sub"><button class="stbtn st-hy ${ex.get(s.id)?.hw === 'y' ? 'on' : ''}" data-act="attHw" data-s="${s.id}" data-v="y">Vazifa ✓</button><button class="stbtn st-hn ${ex.get(s.id)?.hw === 'n' ? 'on' : ''}" data-act="attHw" data-s="${s.id}" data-v="n">Vazifa ✗</button><button class="stbtn st-hy ${ex.get(s.id)?.beh === 'g' ? 'on' : ''}" data-act="attBeh" data-s="${s.id}" data-v="g">Tartib yaxshi</button><button class="stbtn st-hn ${ex.get(s.id)?.beh === 'b' ? 'on' : ''}" data-act="attBeh" data-s="${s.id}" data-v="b">Tartib yomon</button></div>` : ''}</div>`; }).join('') || '<div class="empty">Bu guruhda o\'quvchi yo\'q.</div>'}`}`;
}
async function attendanceView() {
  await load(); const { g, d } = attState();
  if (!g) { root().innerHTML = `<div class="wrap page">${head('Davomat')}<div class="empty">Avval guruh yarating.<br><br><a class="btn primary" href="#/groups">Guruhlar</a></div></div>`; return; }
  const days = L.lessonDays(g, L.ymd(new Date(L.parseYmd(d).getTime() - 70 * 864e5)), L.ymd(new Date(L.parseYmd(d).getTime() + 70 * 864e5)));
  const prev = days.filter(x => x < d).pop(), next = days.find(x => x > d);
  root().innerHTML = `<div class="wrap page">${head('Davomat')}
    <div class="filters"><select class="sel" id="attG" data-in="attNav">${D.groups.filter(x => x.active || x.id === g.id).map(x => `<option value="${x.id}" ${x.id === g.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <button class="icon-btn" ${prev ? `data-act="goto" data-h="${attHash(g.id, prev)}"` : 'disabled'} title="Oldingi dars">${icon('left', 16)}</button>
      <input class="inp" id="attD" type="date" data-in="attNav" value="${d}" style="max-width:180px">
      <button class="icon-btn" ${next ? `data-act="goto" data-h="${attHash(g.id, next)}"` : 'disabled'} title="Keyingi dars">${icon('right', 16)}</button>
      <span class="muted">${L.WD[L.parseYmd(d).getDay()]}</span></div>
    <div id="attBody">${attBody(g, d)}</div></div>`;
}
actions.goto = el => go(el.dataset.h);
inputs.attNav = () => { const g = $('#attG').value, d = $('#attD').value; if (g && d) go(attHash(g, d)); };
const refreshAtt = () => { const { g, d } = attState(); const b = $('#attBody'); if (b) b.innerHTML = attBody(g, d); };
actions.attSet = async el => {
  const { d } = attState(), sid = el.dataset.s, v = el.dataset.v, cur = D.attendance.find(a => a.student_id === sid && a.day === d);
  if (cur && cur.status === v) { await store.delAttendance(sid, d); D.attendance = D.attendance.filter(a => a !== cur); }
  else { await store.saveAttendance([{ student_id: sid, day: d, status: v }]); if (cur) cur.status = v; else D.attendance.push({ student_id: sid, day: d, status: v }); }
  refreshAtt();
};
async function attExtra(el, field) {
  const { d } = attState(), sid = el.dataset.s, v = el.dataset.v, cur = D.attendance.find(a => a.student_id === sid && a.day === d); if (!cur) return;
  const nv = cur[field] === v ? null : v;
  await store.saveAttendance([{ student_id: sid, day: d, status: cur.status, [field]: nv }]); cur[field] = nv; refreshAtt();
}
actions.attHw = el => attExtra(el, 'hw');
actions.attBeh = el => attExtra(el, 'beh');
actions.attAll = async () => {
  const { g, d } = attState(), have = new Set(D.attendance.filter(a => a.day === d).map(a => a.student_id));
  const recs = D.students.filter(s => s.group_id === g.id && s.active && !L.frozenOn(s, d) && L.monthOf(s.joined) <= L.monthOf(d) && !have.has(s.id)).map(s => ({ student_id: s.id, day: d, status: 'p' }));
  await store.saveAttendance(recs); recs.forEach(r => D.attendance.push(r)); refreshAtt(); toast(`${recs.length} ta o'quvchi «keldi» deb belgilandi`, 'ok');
};
async function saveLesson(patch) {
  const { g, d } = attState(), cur = D.lessons.find(l => l.group_id === g.id && l.day === d);
  await store.saveLesson({ group_id: g.id, day: d, ...patch });
  if (cur) Object.assign(cur, patch); else D.lessons.push({ group_id: g.id, day: d, cancelled: false, topic: '', ...patch });
}
inputs.attCancel = async el => { await saveLesson({ cancelled: el.checked }); refreshAtt(); };
inputs.attTopic = async el => { await saveLesson({ topic: el.value.trim() }); };

// ───────── to'lovlar ─────────
async function paymentsView() {
  await load(); const mk = mkNow(), gm = gmap(), now = new Date();
  let rows = D.students.filter(s => s.active).map(s => { const g = gm.get(s.group_id); return { s, g, bal: L.monthBalance(s, g, D.payments, mk), due: g ? L.daysToDue(g, now) : 0 }; })
    .filter(x => x.bal.status !== 'none' && (!ST.pg || x.s.group_id === ST.pg));
  rows.sort((a, b) => ({ unpaid: 0, partial: 1, paid: 2 }[a.bal.status] - { unpaid: 0, partial: 1, paid: 2 }[b.bal.status]) || a.s.name.localeCompare(b.s.name));
  const sum = k => rows.reduce((a, x) => a + x.bal[k], 0), pays = D.payments.filter(p => p.month === mk && (!ST.pg || D.students.find(s => s.id === p.student_id)?.group_id === ST.pg)).sort((a, b) => String(b.paid_on).localeCompare(String(a.paid_on)));
  root().innerHTML = `<div class="wrap page">${head("To'lovlar", monthPicker(mk))}
    <div class="filters"><select class="sel" id="pgSel" data-in="pgFilter"><option value="">Hamma guruh</option>${D.groups.map(g => `<option value="${g.id}" ${ST.pg === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
    <div class="stats"><div class="stat"><span>Kerak</span><b>${money(sum('due'))}</b></div><div class="stat"><span>To'langan</span><b class="ok-t">${money(sum('paid'))}</b></div><div class="stat ${sum('left') ? 'warn' : ''}"><span>Qolgan</span><b>${money(sum('left'))}</b></div></div>
    <div class="tablewrap"><table><thead><tr><th>O'quvchi</th><th>Guruh</th><th class="r">Kerak</th><th class="r">To'langan</th><th class="r">Qolgan</th><th>Holat</th><th></th></tr></thead><tbody>
    ${rows.map(x => `<tr><td><a href="#/students/${x.s.id}"><b>${esc(x.s.name)}</b></a></td><td class="muted">${esc(x.g?.name || '—')}</td><td class="r">${money(x.bal.due)}</td><td class="r">${money(x.bal.paid)}</td><td class="r ${x.bal.left ? 'bad-t' : ''}">${x.bal.left ? money(x.bal.left) : '—'}</td>
      <td>${payBadge(x.bal.status)} ${x.bal.left && mk === curMonth() && x.due < 0 ? badge(`${-x.due} kun kech`, 'bad') : ''}</td>
      <td class="r"><div class="row" style="gap:6px;justify-content:flex-end">${x.bal.left ? contactBtns(x.s, remindOf(x, mk)) : ''}<button class="btn sm primary" data-act="payAdd" data-id="${x.s.id}" data-m="${mk}">${icon('plus', 14)} To'lov</button></div></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Bu oy uchun o\'quvchi yo\'q.</td></tr>'}</tbody></table></div>
    <h2 class="h2 mt">${monthLabel(mk)} oyi uchun kiritilgan to'lovlar</h2>${payTable(pays, true)}</div>`;
}
inputs.pgFilter = () => { ST.pg = $('#pgSel').value; render(); };

// ───────── haftalik jadval ─────────
async function scheduleView() {
  await load(); const wd = new Date().getDay();
  root().innerHTML = `<div class="wrap page">${head('Haftalik jadval', `<span class="muted">Bugun: ${L.WD[wd]}</span>`)}
    <div class="week">${L.WD_ORDER.map(d => { const gs = D.groups.filter(g => g.active && (g.days || []).includes(d)).sort((a, b) => String(a.time).localeCompare(String(b.time)));
      return `<div class="wcol ${d === wd ? 'today' : ''}"><div class="wh">${L.WD[d]}</div>${gs.map(g => { const n = D.students.filter(s => s.group_id === g.id && L.isLive(s)).length; return `<a class="wcard" href="#/groups/${g.id}"><b>${esc(g.time || '—')}</b><span>${esc(g.name)}</span><small>${n} o'quvchi</small></a>`; }).join('') || '<div class="muted sm">Dars yo\'q</div>'}</div>`; }).join('')}</div></div>`;
}

// ───────── hisobot ─────────
async function reportsView() {
  await load(); const mk = mkNow(), gm = gmap(); const rg = D.groups.find(g => g.id === ST.rg) || D.groups.find(g => g.active) || D.groups[0];
  const stats = D.groups.map(g => {
    const sts = D.students.filter(s => s.group_id === g.id && L.isLive(s)), bals = sts.map(s => L.monthBalance(s, g, D.payments, mk));
    const grid = L.attendanceGrid(g, roster(g.id, mk), D.attendance, D.lessons, mk), all = grid.rows.flatMap(r => grid.days.map((_, i) => ({ status: r.cells[i] }))).filter(x => x.status);
    return { g, n: sts.length, due: bals.reduce((a, b) => a + b.due, 0), paid: bals.reduce((a, b) => a + b.paid, 0), left: bals.reduce((a, b) => a + b.left, 0), pct: L.attStats(all).pct, lessons: grid.days.length };
  });
  const grid = rg ? L.attendanceGrid(rg, roster(rg.id, mk), D.attendance, D.lessons, mk) : null;
  root().innerHTML = `<div class="wrap page">${head('Hisobot', monthPicker(mk))}
    <h2 class="h2">Guruhlar bo'yicha (${monthLabel(mk)})</h2>
    <div class="tablewrap"><table><thead><tr><th>Guruh</th><th class="r">O'quvchi</th><th class="r">Dars</th><th class="r">Davomat</th><th class="r">Kerak</th><th class="r">To'langan</th><th class="r">Qolgan</th></tr></thead><tbody>
    ${stats.map(x => `<tr><td><a href="#/groups/${x.g.id}"><b>${esc(x.g.name)}</b></a></td><td class="r">${x.n}</td><td class="r">${x.lessons}</td><td class="r">${pctBadge(x.pct)}</td><td class="r">${money(x.due)}</td><td class="r">${money(x.paid)}</td><td class="r ${x.left ? 'bad-t' : ''}">${money(x.left)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Ma\'lumot yo\'q</td></tr>'}</tbody></table></div>
    <div class="row wrapx mt"><button class="btn" data-act="csvPay">${icon('download', 15)} To'lovlar (CSV)</button><button class="btn" data-act="csvAtt">${icon('download', 15)} Davomat (CSV)</button><button class="btn primary" data-act="pdfGroup">${icon('download', 15)} Davomat PDF (${rg ? esc(rg.name) : ''})</button></div>
    <div class="row between wrapx mt"><h2 class="h2">Davomat jadvali</h2><select class="sel" id="rgSel" data-in="rgFilter" style="width:auto">${D.groups.map(g => `<option value="${g.id}" ${rg && g.id === rg.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
    ${grid ? gridHtml(grid) : ''}</div>`;
}
inputs.rgFilter = () => { ST.rg = $('#rgSel').value; render(); };
actions.csvPay = async () => {
  await load(); const mk = mkNow(), sm = smap(), gm = gmap();
  const lines = [['Sana', 'Oy', "O'quvchi", 'Guruh', 'Summa', 'Usul', 'Izoh'].join(';')];
  D.payments.filter(p => p.month === mk).forEach(p => { const s = sm.get(p.student_id); lines.push([p.paid_on, p.month, s?.name, gm.get(s?.group_id)?.name, p.amount, p.method, p.note].map(L.csvCell).join(';')); });
  download(`tolovlar-${mk}.csv`, lines.join('\n'));
};
actions.csvAtt = async () => {
  await load(); const mk = mkNow(), rg = D.groups.find(g => g.id === ST.rg) || D.groups.find(g => g.active) || D.groups[0]; if (!rg) return;
  const grid = L.attendanceGrid(rg, roster(rg.id, mk), D.attendance, D.lessons, mk);
  const lines = [[`Ism`, ...grid.days.map(fmtDate), 'Davomat %', 'Vazifa bajarmagan', 'Tartib yomon'].join(';')];
  grid.rows.forEach(r => lines.push([r.student.name, ...r.cells.map((c, i) => [L.STATUS[c] || '', r.hw[i] === 'n' ? 'vazifa yo\'q' : '', r.beh[i] === 'b' ? 'tartib yomon' : ''].filter(Boolean).join(' + ')), r.stats.pct ?? '', r.hw.filter(x => x === 'n').length, r.beh.filter(x => x === 'b').length].map(L.csvCell).join(';')));
  download(`davomat-${rg.name}-${mk}.csv`, lines.join('\n'));
};

// ───────── o'quvchi / ota-ona kabineti ─────────
async function portalView(codeParam) {
  const saved = (() => { try { return localStorage.getItem('mg_code') || ''; } catch { return ''; } })();
  const code = (codeParam || saved || '').trim().toUpperCase();
  const form = (msg = '') => `<div class="wrap page"><div class="intro" style="max-width:440px"><div class="panel"><h1 class="ptitle" style="font-size:28px">Shaxsiy kabinet</h1>
    <p class="muted" style="margin-top:6px">O'qituvchingiz bergan kodni kiriting: davomat va to'lovlaringizni ko'rasiz.</p>
    <label class="lbl">Kod</label><input class="inp" id="mcCode" placeholder="Masalan: AB12CD" autocomplete="off" style="text-transform:uppercase;letter-spacing:.12em">
    <div class="err" id="mcErr">${esc(msg)}</div><button class="btn primary" style="width:100%" data-act="portalGo">Ko'rish</button>
    <p class="muted" style="margin-top:14px;font-size:13px"><a href="#/" style="text-decoration:underline">O'qituvchi kirishi</a></p></div></div></div>`;
  if (!code) { root().innerHTML = form(); return; }
  let r; try { r = await store.portal(code); } catch (e) { root().innerHTML = form(e.message); return; }
  if (!r) { try { localStorage.removeItem('mg_code'); } catch { /* ixtiyoriy */ } root().innerHTML = form("Bunday kod topilmadi. Kodni tekshiring."); return; }
  try { localStorage.setItem('mg_code', code); } catch { /* ixtiyoriy */ }
  const s = { ...r.student }, g = r.group, pays = (r.payments || []).map(p => ({ ...p, student_id: s.id })), now = curMonth();
  const att = (r.attendance || []).slice().sort((a, b) => b.day.localeCompare(a.day)), st = L.attStats(att.slice(0, 30));
  const bal = L.monthBalance(s, g, pays, now), debt = L.totalDebt(s, g, pays, now), months = L.monthsBetween(L.monthOf(s.joined), now).reverse().slice(0, 12);
  const cancelled = new Set((r.lessons || []).filter(l => l.cancelled).map(l => l.day));
  root().innerHTML = `<div class="wrap page"><div class="row between wrapx ph"><div><h1 class="ptitle">${esc(s.name)} ${L.isFrozen(s) ? badge('Muzlatilgan', 'draft') : ''}</h1><p class="muted">${g ? esc(g.name) + ' · ' + dayNames(g.days) + (g.time ? ' · ' + esc(g.time) : '') : 'Guruhsiz'}</p></div><button class="btn sm" data-act="portalOut">Chiqish</button></div>
    <div class="stats"><div class="stat ${bal.left ? 'warn' : ''}"><span>${monthLabel(now)} to'lov</span><b>${bal.status === 'paid' ? "To'langan ✓" : money(bal.left)}</b><small>${bal.status === 'paid' ? '' : `to'lash kerak${g ? ` · muddat: har oyning ${g.pay_day}-kuni` : ''}`}</small></div>
      <div class="stat ${debt ? 'warn' : ''}"><span>Jami qarz</span><b>${money(debt)}</b></div>
      <div class="stat"><span>Davomat (oxirgi 30 dars)</span><b>${st.pct === null ? '—' : st.pct + '%'}</b><small>${st.p + st.l} keldi · ${st.a} kelmadi · ${st.e} sababli</small></div></div>
    <h2 class="h2 mt">Oylar bo'yicha to'lov</h2>
    <div class="tablewrap"><table><thead><tr><th>Oy</th><th class="r">Kerak</th><th class="r">To'langan</th><th class="r">Qolgan</th><th>Holat</th></tr></thead><tbody>
    ${months.map(m => { const b = L.monthBalance(s, g, pays, m); return `<tr><td>${monthLabel(m)}</td><td class="r">${money(b.due)}</td><td class="r">${money(b.paid)}</td><td class="r ${b.left ? 'bad-t' : ''}">${b.left ? money(b.left) : '—'}</td><td>${payBadge(b.status)}</td></tr>`; }).join('')}</tbody></table></div>
    <h2 class="h2 mt">Oxirgi davomat</h2>
    <div class="chips">${att.slice(0, 40).map(a => `<span class="dot st-${a.status}" title="${L.STATUS[a.status]}">${fmtDate(a.day).slice(0, 5)} ${MARK[a.status]} ${L.STATUS[a.status]}${a.hw === 'n' ? ' · vazifa ✗' : a.hw === 'y' ? ' · vazifa ✓' : ''}${a.beh === 'b' ? ' · tartib yomon' : ''}</span>`).join('') || '<span class="muted">Hali belgilanmagan.</span>'}</div>
    ${cancelled.size ? `<p class="muted sm mt">Bekor qilingan darslar: ${[...cancelled].sort().reverse().slice(0, 6).map(fmtDate).join(', ')}</p>` : ''}
    <p class="muted sm mt">Savollar bo'lsa: ${esc(CONFIG.teacher)} · ${esc(CONFIG.telegram)} · ${esc(CONFIG.phone)}</p></div>`;
}
actions.portalGo = () => { const c = $('#mcCode').value.trim().toUpperCase(); if (!c) { $('#mcErr').textContent = 'Kodni kiriting'; return; } go('#/me/' + c); render(); };
actions.portalOut = () => { try { localStorage.removeItem('mg_code'); } catch { /* ixtiyoriy */ } go('#/me'); render(); };

// ───────── muzlatish ─────────
actions.studentFreeze = async el => {
  await load(); const s = D.students.find(x => x.id === el.dataset.id);
  modal(`<h2>Muzlatish</h2><p class="muted">${esc(s.name)}: muzlatilgan davrda to'lov hisoblanmaydi va davomat ro'yxatiga chiqmaydi.</p>
    <label class="lbl">Qaysi sanadan</label><input class="inp" id="fzDate" type="date" value="${L.today()}">
    <label class="lbl">Sabab (ixtiyoriy)</label><input class="inp" id="fzWhy" placeholder="Masalan: kasal, safarda">
    <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" data-act="closeModal">Bekor qilish</button><button class="btn primary" data-act="freezeSave" data-id="${s.id}">Muzlatish</button></div>`);
};
actions.freezeSave = async el => {
  const s = D.students.find(x => x.id === el.dataset.id), from = $('#fzDate').value || L.today();
  await store.save('students', { ...s, freezes: [...L.freezesOf(s), { from, to: null, why: $('#fzWhy').value.trim() }] });
  closeModal(); invalidate(); toast('Muzlatildi', 'ok'); render();
};
actions.studentUnfreeze = async el => {
  await load(); const s = D.students.find(x => x.id === el.dataset.id);
  modal(`<h2>Muzlatishni bekor qilish</h2><p class="muted">${esc(s.name)} yana darsga qaytadi. To'lov shu sana oyidan boshlab hisoblanadi.</p>
    <label class="lbl">Qaytgan sana</label><input class="inp" id="fzDate" type="date" value="${L.today()}">
    <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" data-act="closeModal">Bekor qilish</button><button class="btn primary" data-act="unfreezeSave" data-id="${s.id}">Qaytarish</button></div>`);
};
actions.unfreezeSave = async el => {
  const s = D.students.find(x => x.id === el.dataset.id), fr = L.freezesOf(s).map(f => ({ ...f })), last = fr[fr.length - 1], to = $('#fzDate').value || L.today();
  if (!last || last.to) { closeModal(); return; }
  if (to < last.from) { toast("Qaytgan sana muzlatilgan sanadan oldin bo'lmasin", 'bad'); return; }
  last.to = to; await store.save('students', { ...s, freezes: fr });
  closeModal(); invalidate(); toast('Qaytarildi', 'ok'); render();
};

// ───────── ko'plab qo'shish: matn ro'yxat va Excel ─────────
let IMP = [];
const loadSheetJS = () => window.XLSX ? Promise.resolve(window.XLSX) : new Promise((res, rej) => {
  const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  sc.onload = () => res(window.XLSX); sc.onerror = () => rej(new Error("Excel o'qish kutubxonasi yuklanmadi. Internetni tekshiring.")); document.head.appendChild(sc);
});
const cleanName = f => f.replace(/\.xlsx?$/i, '').replace(/[_]+/g, ' ').replace(/\(\d+\)/g, '').replace(/\bStudents?\b/i, '').replace(/\s+/g, ' ').trim();
actions.bulkAdd = async () => {
  await load(); IMP = [];
  modal(`<h2>Ko'plab o'quvchi qo'shish</h2>
    <div class="panel" style="padding:16px"><b>1) Excel fayldan</b> <small class="muted">(bir nechta fayl tanlash mumkin; fayl faqat brauzeringizda o'qiladi)</small>
      <input class="inp" type="file" id="impFile" accept=".xlsx,.xls" multiple data-in="impFiles" style="margin-top:8px">
      <div id="impList"></div></div>
    <div class="panel" style="padding:16px;margin-top:12px"><b>2) Matn ro'yxatidan</b> <small class="muted">har qatorda: Ism Familiya; telefon (telefon ixtiyoriy)</small>
      <select class="sel" id="txtGroup" style="margin-top:8px"><option value="">— guruhni tanlang —</option>${D.groups.map(g => `<option value="${g.id}" ${ST.sg === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>
      <textarea class="inp" id="txtList" rows="6" style="margin-top:8px" placeholder="Aliyev Vali; 90 123 45 67\nKarimova Madina"></textarea>
      <button class="btn primary" data-act="txtImport" style="margin-top:8px">Qo'shish</button></div>
    <div class="err" id="mErr"></div><div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn" data-act="closeModal">Yopish</button></div>`, true);
};
inputs.impFiles = async el => {
  const err = $('#mErr'); err.textContent = ''; IMP = [];
  try {
    const X = await loadSheetJS();
    for (const f of [...el.files]) {
      const wb = X.read(await f.arrayBuffer(), { type: 'array' });
      for (const sn of wb.SheetNames) {
        const rows = X.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: true }), r = L.parseRegister(rows);
        if (r.error || !r.students.length) continue;
        const name = /^sheet\d*$/i.test(sn) ? cleanName(f.name) : sn.trim();
        IMP.push({ name, price: '', students: r.students, skipped: r.skipped, include: true, file: f.name });
      }
    }
  } catch (e) { err.textContent = e.message; }
  drawImp();
};
function drawImp() {
  const box = $('#impList'); if (!box) return;
  if (!IMP.length) { box.innerHTML = '<p class="muted sm" style="margin-top:8px">Fayl tanlang. Har bir varaq alohida guruh bo\'ladi.</p>'; return; }
  const have = new Map(D.groups.map(g => [g.name.toLowerCase(), g]));
  box.innerHTML = `<div class="tablewrap" style="margin-top:10px"><table><thead><tr><th></th><th>Guruh nomi</th><th>Oylik narx</th><th class="r">O'quvchi</th><th class="r">Muzlatilgan</th></tr></thead><tbody>
    ${IMP.map((g, i) => `<tr><td><input type="checkbox" data-in="impRow" data-i="${i}" data-f="include" ${g.include ? 'checked' : ''}></td>
      <td><input class="inp" data-in="impRow" data-i="${i}" data-f="name" value="${esc(g.name)}" style="min-width:170px">${have.has(g.name.toLowerCase()) ? '<small class="muted"> mavjud guruhga qo\'shiladi</small>' : ''}</td>
      <td><input class="inp" data-in="impRow" data-i="${i}" data-f="price" inputmode="numeric" value="${esc(g.price)}" placeholder="so'm" style="width:120px"></td>
      <td class="r">${g.students.length}</td><td class="r">${g.students.filter(x => x.frozen).length}</td></tr>`).join('')}</tbody></table></div>
    <label class="lbl">Qarz hisobi qachondan boshlansin</label>
    <select class="sel" id="impStart"><option value="this">Shu oydan (shu oy to'lovini ham kiritaman)</option><option value="next">Keyingi oydan (shu oy hisobga olinmaydi)</option></select>
    <p class="muted sm" style="margin-top:8px">Eski to'lov holati («Paid to July» va h.k.) har bir o'quvchi izohiga yoziladi. Telefon ota-ona telefoniga qo'yiladi. «On Leave» toifasidagilar muzlatiladi.</p>
    <button class="btn primary" data-act="impGo" style="margin-top:8px">${icon('check', 15)} Import qilish (${IMP.filter(g => g.include).reduce((a, g) => a + g.students.length, 0)} o'quvchi)</button>`;
}
inputs.impRow = el => { const g = IMP[Number(el.dataset.i)]; if (!g) return; const f = el.dataset.f; g[f] = f === 'include' ? el.checked : el.value; if (f === 'include') drawImp(); };
const monthStart = () => { const mk = curMonth(); return `${$('#impStart')?.value === 'next' ? L.addMonths(mk, 1) : mk}-01`; };
async function makeStudents(group, list) {
  const exist = new Set(D.students.filter(s => s.group_id === group.id).map(s => s.name.toLowerCase())), taken = new Set(D.students.map(s => s.code)), td = L.today(), recs = [];
  for (const x of list) {
    if (exist.has(x.name.toLowerCase())) continue; exist.add(x.name.toLowerCase());
    const code = L.genCode(taken); taken.add(code);
    recs.push({ group_id: group.id, name: x.name, phone: '', parent_phone: x.parent_phone || '', code, price: null, joined: monthStart(), active: true, note: x.note || '', freezes: x.frozen ? [{ from: td, to: null, why: 'Excel: On Leave' }] : [] });
  }
  if (recs.length) await store.saveMany('students', recs);
  return { added: recs.length, skipped: list.length - recs.length };
}
actions.impGo = async el => {
  const todo = IMP.filter(g => g.include && g.name.trim()); if (!todo.length) { $('#mErr').textContent = 'Hech narsa tanlanmagan'; return; }
  el.disabled = true; el.textContent = 'Import qilinmoqda…';
  let added = 0, skipped = 0, groups = 0;
  try {
    for (const g of todo) {
      let grp = D.groups.find(x => x.name.toLowerCase() === g.name.trim().toLowerCase());
      if (!grp) { grp = await store.save('groups', { name: g.name.trim(), price: Math.max(0, Number(String(g.price).replace(/\s/g, '')) || 0), days: [], time: '', pay_day: 5, note: '', active: true }); D.groups.push(grp); groups++; }
      const r = await makeStudents(grp, g.students); added += r.added; skipped += r.skipped; await load(true);
    }
    closeModal(); invalidate(); toast(`${added} ta o'quvchi qo'shildi${groups ? `, ${groups} ta yangi guruh` : ''}${skipped ? `, ${skipped} ta takror o'tkazildi` : ''}`, 'ok'); go('#/students'); render();
  } catch (e) { $('#mErr').textContent = e.message; el.disabled = false; el.textContent = 'Qayta urinish'; invalidate(); }
};
actions.txtImport = async () => {
  const gid = $('#txtGroup').value, lines = $('#txtList').value.split('\n').map(l => l.trim()).filter(Boolean);
  if (!gid) { $('#mErr').textContent = 'Guruhni tanlang'; return; } if (!lines.length) { $('#mErr').textContent = "Ro'yxat bo'sh"; return; }
  const list = lines.map(l => { const [n, p] = l.split(/[;\t]/); return { name: (n || '').replace(/\s+/g, ' ').trim(), parent_phone: L.formatPhone(p || '') }; }).filter(x => x.name);
  const r = await makeStudents(D.groups.find(g => g.id === gid), list);
  closeModal(); invalidate(); toast(`${r.added} ta o'quvchi qo'shildi${r.skipped ? `, ${r.skipped} ta takror o'tkazildi` : ''}`, 'ok'); render();
};

// ───────── kuzatuv ─────────
async function watchView() {
  await load(); const mk = curMonth(), gm = gmap(), now = new Date(), td = L.today();
  const since = L.ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14));
  const flagged = D.students.filter(L.isLive).map(s => { const g = gm.get(s.group_id); return { s, g, bal: L.monthBalance(s, g, D.payments, mk), reasons: L.studentWatch(s, g, D.attendance, D.payments, now) }; })
    .filter(x => x.reasons.length).sort((a, b) => b.reasons.length - a.reasons.length || (b.reasons.find(r => r.k === 'streak')?.n || 0) - (a.reasons.find(r => r.k === 'streak')?.n || 0));
  const frozen = D.students.filter(s => s.active && L.isFrozen(s)), fresh = D.students.filter(s => s.active && String(s.created_at || '').slice(0, 10) >= since);
  const why = r => r.k === 'streak' ? badge(`${r.n} marta ketma-ket kelmadi`, 'bad') : r.k === 'low' ? badge(`Davomat ${r.pct}%`, 'draft') : badge(`Qarz ${money(r.left)}${r.overdue ? ' (kechikkan)' : ''}`, r.overdue ? 'bad' : 'draft');
  const gstat = D.groups.filter(g => g.active).map(g => {
    const live = D.students.filter(s => s.group_id === g.id && L.isLive(s)), from = L.ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
    return { g, n: live.length, st: L.attStats(D.attendance.filter(a => a.day >= from && live.some(s => s.id === a.student_id))) };
  });
  root().innerHTML = `<div class="wrap page">${head('Kuzatuv', `<span class="muted">Oxirgi 30 kun bo'yicha</span>`)}
    <div class="stats"><div class="stat ${flagged.length ? 'warn' : ''}"><span>E'tibor kerak</span><b>${flagged.length}</b><small>o'quvchi</small></div>
      <div class="stat"><span>Muzlatilgan</span><b>${frozen.length}</b><small>o'quvchi</small></div><div class="stat"><span>Yangi (14 kun)</span><b>${fresh.length}</b><small>o'quvchi</small></div></div>
    <section class="panel"><h2 class="h2">${icon('bell', 18)} E'tibor kerak bo'lgan o'quvchilar</h2>
    ${flagged.length ? flagged.map(x => `<div class="lrow"><div><a href="#/students/${x.s.id}"><b>${esc(x.s.name)}</b></a> <span class="muted sm">${esc(x.g?.name || '—')}</span><div class="chips" style="margin-top:6px">${x.reasons.map(why).join('')}</div></div>
      <div class="row" style="gap:6px">${x.bal.left ? contactBtns(x.s, remindOf(x, mk)) : (digits(phoneOf(x.s)) ? `<a class="btn sm" href="tel:${esc(digits(phoneOf(x.s)))}">${icon('phone', 14)} Qo'ng'iroq</a>` : '')}</div></div>`).join('') : "<p class=\"muted\">Hozircha hamma yaxshi: ketma-ket dars qoldirgan, davomati past yoki qarzdor o'quvchi yo'q 🎉</p>"}</section>
    <div class="grid2 mt2"><section class="panel"><h2 class="h2">Muzlatilgan o'quvchilar</h2>
      ${frozen.length ? frozen.map(s => { const f = L.freezesOf(s).slice(-1)[0]; return `<div class="lrow"><div><a href="#/students/${s.id}"><b>${esc(s.name)}</b></a><div class="muted sm">${esc(gm.get(s.group_id)?.name || '—')} · ${fmtDate(f.from)} dan${f.why ? ' · ' + esc(f.why) : ''}</div></div><button class="btn sm" data-act="studentUnfreeze" data-id="${s.id}">Qaytarish</button></div>`; }).join('') : '<p class="muted">Muzlatilgan o\'quvchi yo\'q.</p>'}</section>
    <section class="panel"><h2 class="h2">Guruhlar davomati (30 kun)</h2>
      ${gstat.map(x => `<div class="lrow"><div><a href="#/groups/${x.g.id}"><b>${esc(x.g.name)}</b></a><div class="muted sm">${x.n} o'quvchi · ${x.st.total} belgi</div></div>${pctBadge(x.st.pct)}</div>`).join('') || '<p class="muted">Guruh yo\'q.</p>'}</section></div>
    ${fresh.length ? `<section class="panel mt2"><h2 class="h2">Yangi qo'shilganlar</h2>${fresh.slice(0, 15).map(s => `<div class="lrow"><a href="#/students/${s.id}"><b>${esc(s.name)}</b></a><span class="muted sm">${esc(gm.get(s.group_id)?.name || '—')}</span></div>`).join('')}${fresh.length > 15 ? `<p class="muted sm" style="margin-top:8px">…va yana ${fresh.length - 15} ta</p>` : ''}</section>` : ''}</div>`;
}

// ───────── PDF (brauzerning «Save as PDF» i orqali) ─────────
function printDoc(html, landscape = false) {
  let host = $('#printArea'); if (!host) { host = document.createElement('div'); host.id = 'printArea'; document.body.appendChild(host); }
  host.innerHTML = `${html}<div class="pd-foot"><b>${esc(CONFIG.teacher)}</b> · Telegram: ${esc(CONFIG.telegram)} · ☎ ${esc(CONFIG.phone)}<br><span>Chop etilgan: ${fmtDate(L.today())}</span></div>`;
  let st = $('#pageStyle'); if (!st) { st = document.createElement('style'); st.id = 'pageStyle'; document.head.appendChild(st); }
  st.textContent = `@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:10mm}`;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); host.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 60);
}
const PMARK = { p: '✓', a: '✗', e: 'S', l: 'K' };
function pdfGroup(g, mk) {
  const grid = L.attendanceGrid(g, roster(g.id, mk), D.attendance, D.lessons, mk), cancelled = D.lessons.filter(l => l.group_id === g.id && l.cancelled && l.day.startsWith(mk)).map(l => fmtDate(l.day).slice(0, 5));
  const topics = D.lessons.filter(l => l.group_id === g.id && l.topic && l.day.startsWith(mk) && !l.cancelled).sort((a, b) => a.day.localeCompare(b.day));
  const all = grid.rows.flatMap(r => grid.days.map((_, i) => ({ status: r.cells[i] }))).filter(x => x.status), avg = L.attStats(all).pct;
  printDoc(`<h1>Davomat hisoboti</h1><p class="pd-sub"><b>${esc(g.name)}</b> · ${monthLabel(mk)} · ${dayNames(g.days)}${g.time ? ' · ' + esc(g.time) : ''}</p>
    <table class="pd-t"><thead><tr><th>№</th><th class="l">O'quvchi</th>${grid.days.map(d => `<th>${L.parseYmd(d).getDate()}<br><small>${L.WDS[L.parseYmd(d).getDay()].slice(0, 2)}</small></th>`).join('')}<th>Keldi</th><th>Kelmadi</th><th>Vazifa ✗</th><th>Tartib ✗</th><th>%</th></tr></thead><tbody>
    ${grid.rows.map((r, i) => `<tr><td>${i + 1}</td><td class="l">${esc(r.student.name)}</td>${r.cells.map((c, j) => `<td>${PMARK[c] || ''}${r.hw[j] === 'n' ? '<sup>V</sup>' : ''}${r.beh[j] === 'b' ? '<sup>T</sup>' : ''}</td>`).join('')}<td>${r.stats.p + r.stats.l}</td><td>${r.stats.a}</td><td>${r.hw.filter(x => x === 'n').length || ''}</td><td>${r.beh.filter(x => x === 'b').length || ''}</td><td><b>${r.stats.pct === null ? '' : r.stats.pct + '%'}</b></td></tr>`).join('')}</tbody></table>
    <p class="pd-leg">✓ keldi · K kechikdi · S sababli · ✗ kelmadi · <sup>V</sup> uyga vazifa bajarilmagan · <sup>T</sup> tartib yomon · bo'sh: belgilanmagan.${cancelled.length ? ` Bekor qilingan darslar: ${cancelled.join(', ')}.` : ''} O'tilgan darslar: ${grid.days.length}. O'rtacha davomat: <b>${avg === null ? '—' : avg + '%'}</b></p>
    ${topics.length ? `<p class="pd-leg"><b>Dars mavzulari:</b> ${topics.map(t => `${fmtDate(t.day).slice(0, 5)} — ${esc(t.topic)}`).join('; ')}</p>` : ''}`, true);
}
function pdfStudent(s, mk) {
  const g = gmap().get(s.group_id), rows = D.attendance.filter(a => a.student_id === s.id && a.day.startsWith(mk)).sort((a, b) => a.day.localeCompare(b.day)), st = L.attStats(rows), bal = L.monthBalance(s, g, D.payments, mk);
  printDoc(`<h1>Davomat — ${esc(s.name)}</h1><p class="pd-sub">${esc(g?.name || 'Guruhsiz')} · ${monthLabel(mk)}</p>
    <table class="pd-t"><thead><tr><th>Sana</th><th class="l">Kun</th><th class="l">Holat</th><th class="l">Uyga vazifa</th><th class="l">Tartib</th></tr></thead><tbody>
    ${rows.map(a => `<tr><td>${fmtDate(a.day)}</td><td class="l">${L.WD[L.parseYmd(a.day).getDay()]}</td><td class="l">${PMARK[a.status]} ${L.STATUS[a.status]}</td><td class="l">${a.hw === 'y' ? 'Bajardi' : a.hw === 'n' ? '<b>Bajarmadi</b>' : ''}</td><td class="l">${a.beh === 'g' ? 'Yaxshi' : a.beh === 'b' ? '<b>Yomon</b>' : ''}</td></tr>`).join('') || '<tr><td colspan="5">Bu oyda belgi yo\'q</td></tr>'}</tbody></table>
    <p class="pd-leg">Keldi: <b>${st.p}</b> · Kechikdi: <b>${st.l}</b> · Sababli: <b>${st.e}</b> · Kelmadi: <b>${st.a}</b> · Davomat: <b>${st.pct === null ? '—' : st.pct + '%'}</b> · Vazifa bajarmagan: <b>${rows.filter(a => a.hw === 'n').length}</b> · Tartib yomon: <b>${rows.filter(a => a.beh === 'b').length}</b></p>
    <p class="pd-leg">${monthLabel(mk)} to'lovi: kerak ${money(bal.due)}, to'langan ${money(bal.paid)}, qolgan ${money(bal.left)}.</p>`);
}
actions.pdfGroup = async el => { await load(); const g = D.groups.find(x => x.id === (el.dataset.id || ST.rg)) || D.groups.find(x => x.active) || D.groups[0]; if (g) pdfGroup(g, mkNow()); };
actions.pdfStudent = async el => { await load(); const s = D.students.find(x => x.id === el.dataset.id); if (s) pdfStudent(s, mkNow()); };

// ───────── router ─────────
const ROUTES = [[/^\/?$/, dashboard], [/^\/groups$/, groupsView], [/^\/groups\/([^/]+)$/, groupView], [/^\/students$/, studentsView], [/^\/students\/([^/]+)$/, studentView],
  [/^\/attendance$/, attendanceView], [/^\/payments$/, paymentsView], [/^\/watch$/, watchView], [/^\/schedule$/, scheduleView], [/^\/reports$/, reportsView], [/^\/me(?:\/([^/]+))?$/, portalView]];
let token = 0;
export async function render() {
  const my = ++token, raw = location.hash.slice(1) || '/', [path, qs] = raw.split('?');
  Q = new URLSearchParams(qs || '');
  const portal = path.startsWith('/me');
  renderNav(portal, path);
  if (!portal && !store.isAdmin()) return loginView();
  const rt = ROUTES.find(([re]) => re.test(path));
  if (!rt) { root().innerHTML = '<div class="wrap page"><div class="empty">Sahifa topilmadi.<br><br><a class="btn" href="#/">Bosh sahifa</a></div></div>'; return; }
  root().innerHTML = '<div class="loading">Yuklanmoqda…</div>';
  try { await rt[1](...path.match(rt[0]).slice(1)); if (my !== token) return; window.scrollTo?.(0, 0); }
  catch (e) { console.error(e); if (my === token) root().innerHTML = `<div class="wrap page"><div class="empty">Xatolik: ${esc(e.message)}<br><br><button class="btn" data-act="retry">Qayta urinish</button></div></div>`; }
}
actions.retry = () => { invalidate(); render(); };
window.addEventListener('hashchange', render);
export const ready = initStore().then(() => render());

export const __test = { setImp: v => { IMP = v; }, draw: () => drawImp(), invalidate };
