// Family page: a parent or student logs in with the personal number the teacher gave them and sees
// attendance, homework and payment status. Read-only. Uzbek by default, English on request.
import { store } from './store.js';
import { CONFIG } from './config.js';
import { esc, normalizeCode, formatCode, isValidCode, weekReport, weeklyTrend, latestWeekWithData, addDays, mondayOf, todayKey, monthOf, paymentStatus, fmtMoney, uzShort, uzDay } from './logic.js';
import { $, actions, inputs, icon, initials } from './ui.js';

const STR = {
  uz: {
    eyebrow: "Ota-onalar va o'quvchilar uchun", loginTitle: "Farzandingiz natijalari — bir joyda",
    loginSub: "Davomat, uy vazifasi va to'lov holatini ko'rish uchun o'qituvchingiz bergan shaxsiy raqamni kiriting.",
    codeLabel: 'Shaxsiy raqam', remember: 'Shu qurilmada eslab qolish', enter: 'Kirish',
    privacy: "Bu raqam faqat bitta o'quvchining ma'lumotini ochadi. Iltimos, uni boshqalarga bermang.",
    errShort: "Raqam 12 ta raqamdan iborat. Iltimos, tekshirib qayta kiriting.",
    errWrong: "Bunday raqam topilmadi yoki faol emas. Raqamni tekshiring yoki o'qituvchingizga murojaat qiling.",
    errMany: "Juda ko'p urinish bo'ldi. Iltimos, bir necha daqiqadan keyin qayta urinib ko'ring.",
    errNet: "Ulanishda xatolik yuz berdi. Internetni tekshirib, qayta urinib ko'ring.",
    expired: "Bu raqam endi ishlamaydi. Yangi raqam uchun o'qituvchingizga murojaat qiling.",
    retry: 'Qayta urinish', group: 'Guruh', logout: 'Chiqish', loading: 'Yuklanmoqda…',
    prev: 'Oldingi hafta', next: 'Keyingi hafta', thisWeek: 'Joriy hafta', latest: "Oxirgi darslar haftasi",
    attendance: 'Davomat', homework: 'Uy vazifasi', lessonsWord: 'dars', noData: "Ma'lumot yo'q",
    noLessons: "Bu hafta uchun darslar belgilanmagan.", topic: 'Mavzu', task: 'Berilgan vazifa', comment: "O'qituvchi izohi",
    trendTitle: "So'nggi 8 hafta", trendHint: "Haftani ochish uchun ustunni bosing.", trendAria: "So'nggi 8 hafta bo'yicha davomat va uy vazifasi foizlari",
    payTitle: "To'lovlar", month: 'Oy', due: "Summa", paid: "To'langan", left: 'Qoldiq', status: 'Holat', total: 'Jami',
    noPay: "To'lov ma'lumotlari hali kiritilmagan.", payNote: "To'lov holati o'qituvchi tomonidan kiritiladi. Savollaringiz bo'lsa, o'qituvchiga yozing.",
    contact: "O'qituvchiga yozish", reminder: "uchun to'lovdan qoldiq:", thanks: "Rahmat!",
    att: { present: 'Keldi', late: 'Kechikdi', absent: 'Kelmadi', excused: 'Sababli' }, hw: { done: 'Bajardi', partial: 'Qisman', missing: 'Bajarmadi' },
    pay: { paid: "To'langan", partial: "Qisman to'langan", unpaid: "To'lanmagan", none: '—' },
    months: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
    days: null, switchTo: 'English',
  },
  en: {
    eyebrow: 'For parents and students', loginTitle: "Your child's progress, in one place",
    loginSub: 'Enter the personal number your teacher gave you to see attendance, homework and payment status.',
    codeLabel: 'Personal number', remember: 'Remember me on this device', enter: 'Sign in',
    privacy: "This number opens one student's information only. Please do not share it with others.",
    errShort: 'The number has 12 digits. Please check it and try again.',
    errWrong: 'This number was not found or is not active. Check it, or ask your teacher.',
    errMany: 'Too many attempts. Please wait a few minutes and try again.',
    errNet: 'Could not connect. Check your internet and try again.',
    expired: 'This number no longer works. Ask your teacher for a new one.',
    retry: 'Try again', group: 'Group', logout: 'Sign out', loading: 'Loading…',
    prev: 'Previous week', next: 'Next week', thisWeek: 'This week', latest: 'Latest lessons',
    attendance: 'Attendance', homework: 'Homework', lessonsWord: 'lessons', noData: 'No data',
    noLessons: 'No lessons were recorded for this week.', topic: 'Topic', task: 'Homework given', comment: "Teacher's comment",
    trendTitle: 'Last 8 weeks', trendHint: 'Tap a column to open that week.', trendAria: 'Attendance and homework percentages for the last 8 weeks',
    payTitle: 'Payments', month: 'Month', due: 'Amount', paid: 'Paid', left: 'Balance', status: 'Status', total: 'Total',
    noPay: 'No payment information has been entered yet.', payNote: 'Payment status is entered by the teacher. If you have questions, message the teacher.',
    contact: 'Message the teacher', reminder: 'balance still to pay:', thanks: 'Thank you!',
    att: { present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused' }, hw: { done: 'Done', partial: 'Partly done', missing: 'Not done' },
    pay: { paid: 'Paid', partial: 'Partly paid', unpaid: 'Unpaid', none: '—' },
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], switchTo: "O'zbekcha",
  },
};
const lang = () => { try { return localStorage.getItem('ma_lang') === 'en' ? 'en' : 'uz'; } catch { return 'uz'; } };
const T = () => STR[lang()];
const dayName = d => (T().days ? T().days[new Date(d + 'T00:00:00Z').getUTCDay()] : uzDay(d));
const monthName = p => { const [y, m] = p.split('-').map(Number); return `${T().months[m - 1]} ${y}`; };
const weekLabel = w => { const e = addDays(w, 6); return `${uzShort(w)} – ${uzShort(e)}.${e.slice(0, 4)}`; };

// ── saved number: this tab only, or this device if the family ticks "remember" ──
const store_ = {
  get() { try { return sessionStorage.getItem('ma_fam') || localStorage.getItem('ma_fam') || ''; } catch { return ''; } },
  set(code, remember) { try { sessionStorage.setItem('ma_fam', code); remember ? localStorage.setItem('ma_fam', code) : localStorage.removeItem('ma_fam'); } catch { /* storage blocked */ } },
  clear() { try { sessionStorage.removeItem('ma_fam'); localStorage.removeItem('ma_fam'); } catch { /* ignore */ } },
};
const F = { lessons: [], payments: [], student: null, week: mondayOf(todayKey()) };
const setData = d => {
  F.student = d.student;
  F.lessons = (d.lessons || []).map(l => ({ ...l, date: String(l.date).slice(0, 10) }));
  F.payments = d.payments || [];
  F.week = latestWeekWithData(F.lessons);
};
const view = () => $('#view');

export async function family() {
  const code = store_.get();
  if (!code) return drawLogin();
  view().innerHTML = `<div class="loading">${T().loading}</div>`;
  try {
    const d = await store.portalReport(code);
    if (!d) { store_.clear(); return drawLogin(T().expired); }
    setData(d); drawReport();
  } catch (e) { drawError(e); }
}

const errText = e => (e?.message === 'too_many_attempts' ? T().errMany : T().errNet);
function drawError(e) {
  view().innerHTML = `<div class="wrap page"><div class="fam-login">${langBtn()}<div class="empty" role="alert">${esc(errText(e))}<br><br><button class="btn primary" data-act="famRetry">${T().retry}</button></div></div></div>`;
}
const langBtn = () => `<div class="row" style="justify-content:flex-end"><button class="btn sm" data-act="famLang" lang="${lang() === 'uz' ? 'en' : 'uz'}">${T().switchTo}</button></div>`;

function drawLogin(note = '') {
  const s = T();
  view().innerHTML = `<div class="wrap page"><div class="fam-login">${langBtn()}
    <span class="eyebrow"><i></i> ${s.eyebrow}</span>
    <h1 class="ptitle" style="margin-top:16px">${s.loginTitle}</h1>
    <p class="muted" style="margin-top:10px">${s.loginSub}</p>
    <form class="panel mt2" data-act-submit="famLogin" onsubmit="return false">
      <label class="lbl" for="famCode">${s.codeLabel}</label>
      <input class="inp famcode" id="famCode" data-in="famCode" inputmode="numeric" autocomplete="off" placeholder="0000-0000-0000" maxlength="14" aria-describedby="famErr">
      <div class="err" id="famErr" role="alert">${esc(note)}</div>
      <label class="check"><input type="checkbox" id="famRemember"> <span>${s.remember}</span></label>
      <button type="button" class="btn primary lg" id="famBtn" data-act="famLogin" style="width:100%;margin-top:14px">${s.enter} ${icon('arrow', 18)}</button>
    </form>
    <p class="note">${icon('lock', 14)} ${s.privacy}</p></div></div>`;
  setTimeout(() => $('#famCode')?.focus(), 30);
}
inputs.famCode = el => { el.value = formatCode(normalizeCode(el.value).slice(0, 12)); };
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target?.id === 'famCode') actions.famLogin(); });
actions.famLogin = async () => {
  const input = $('#famCode'), err = $('#famErr'), btn = $('#famBtn'); if (!input) return;
  err.textContent = '';
  if (!isValidCode(input.value)) { err.textContent = T().errShort; return; }
  btn.disabled = true;
  try {
    const code = normalizeCode(input.value), d = await store.portalReport(code);
    if (!d) { err.textContent = T().errWrong; btn.disabled = false; input.select(); return; }
    store_.set(code, $('#famRemember').checked); setData(d); drawReport();
  } catch (e) { err.textContent = errText(e); btn.disabled = false; }
};
actions.famRetry = () => family();
actions.famLogout = () => { store_.clear(); F.lessons = []; F.payments = []; drawLogin(); };
actions.famLang = () => { try { localStorage.setItem('ma_lang', lang() === 'uz' ? 'en' : 'uz'); } catch { /* ignore */ } F.student ? (store_.get() ? drawReport() : drawLogin()) : family(); };
actions.famShift = el => { F.week = addDays(F.week, 7 * Number(el.dataset.d)); drawReport(); };
actions.famWeek = el => { F.week = el.dataset.w; drawReport(); $('#famWeekTop')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); };
actions.famNow = () => { F.week = mondayOf(todayKey()); drawReport(); };

const pctBlock = (label, pct, sub, cls) => `<div class="fbig"><div class="mlabel"><span>${label}</span><span>${sub}</span></div>
  <div class="fval">${pct == null ? '—' : pct + '%'}</div><div class="meter ${cls}" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" ${pct == null ? '' : `aria-valuenow="${pct}"`}><i style="width:${pct ?? 0}%"></i></div></div>`;
const ATT_CLS = { present: 'ok', late: 'draft', absent: 'bad', excused: 'ielts' }, HW_CLS = { done: 'ok', partial: 'draft', missing: 'bad' };

function drawReport() {
  const s = T(), st = F.student, rep = weekReport(F.lessons, F.week), trend = weeklyTrend(F.lessons, new Date(), 8);
  const thisWeek = mondayOf(todayKey());
  const thisMonth = monthOf(todayKey()), cur = F.payments.find(p => p.period === thisMonth);
  const owe = cur ? Math.max(0, Number(cur.due) - Number(cur.paid)) : 0;
  const trendAria = `${s.trendAria}: ` + trend.map(w => `${uzShort(w.weekStart)} — ${w.attendedPct ?? '—'}% / ${w.homeworkPct ?? '—'}%`).join('; ');
  view().innerHTML = `<div class="wrap page"><div class="fam">
    <div class="row between wrapx"><div class="row"><span class="studentchip" style="padding:8px 18px 8px 8px"><span class="av" style="width:46px;height:46px;font-size:16px">${esc(initials(st.name))}</span><span><b style="font-size:18px">${esc(st.name)}</b><br><small class="muted">${s.group}: ${esc(st.group)}</small></span></span></div>
      <div class="row"><button class="btn sm" data-act="famLang" lang="${lang() === 'uz' ? 'en' : 'uz'}">${s.switchTo}</button><button class="btn sm" data-act="famLogout">${icon('logout', 16)} ${s.logout}</button></div></div>
    ${owe > 0 ? `<div class="banner pb mt2" role="status">${icon('clock', 22)}<div>${esc(monthName(thisMonth))} ${s.reminder} ${fmtMoney(owe)} ${esc(CONFIG.currency)}<small>${s.payNote}</small></div></div>` : ''}
    <div class="row between wrapx mt2" id="famWeekTop"><h2 class="ptitle" style="font-size:26px">${weekLabel(F.week)}</h2>
      <div class="row wrapx"><button class="btn sm" data-act="famShift" data-d="-1" aria-label="${s.prev}">← ${s.prev}</button><button class="btn sm" data-act="famShift" data-d="1" aria-label="${s.next}" ${F.week >= thisWeek ? 'disabled' : ''}>${s.next} →</button>
        ${F.week !== thisWeek ? `<button class="btn sm" data-act="famNow">${s.thisWeek}</button>` : ''}</div></div>
    <div class="fgrid mt">
      <div class="card">${pctBlock(s.attendance, rep.attendedPct, rep.total ? `${rep.present + rep.late} / ${rep.total - rep.excused} ${s.lessonsWord}` : s.noData, 'prim')}
        <div class="row wrapx" style="margin-top:14px;gap:8px">${['present', 'late', 'absent', 'excused'].filter(k => rep[k]).map(k => `<span class="badge ${ATT_CLS[k]}">${s.att[k]}: ${rep[k]}</span>`).join('') || `<span class="muted" style="font-size:13px">${s.noLessons}</span>`}</div></div>
      <div class="card">${pctBlock(s.homework, rep.homeworkPct, rep.homework.assigned ? `${rep.homework.done} / ${rep.homework.assigned}` : s.noData, 'gold')}
        <div class="row wrapx" style="margin-top:14px;gap:8px">${['done', 'partial', 'missing'].filter(k => rep.homework[k]).map(k => `<span class="badge ${HW_CLS[k]}">${s.hw[k]}: ${rep.homework[k]}</span>`).join('')}</div></div>
    </div>
    ${rep.lessons.length ? `<div class="rlist mt">${rep.lessons.map(l => `<div class="rrow lesson"><div class="rt"><b><span class="cap">${esc(dayName(l.date))}</span>, ${uzShort(l.date)}</b>
        ${l.topic ? `<small>${s.topic}: ${esc(l.topic)}</small>` : ''}${l.task ? `<small>${s.task}: ${esc(l.task)}</small>` : ''}${l.note ? `<small class="fnote">${icon('spark', 12)} ${s.comment}: ${esc(l.note)}</small>` : ''}</div>
        <div class="fchips"><span class="badge ${ATT_CLS[l.attendance]}">${s.att[l.attendance]}</span>${HW_CLS[l.homework] ? `<span class="badge ${HW_CLS[l.homework]}">${s.homework}: ${s.hw[l.homework]}</span>` : ''}</div></div>`).join('')}</div>` : `<div class="empty mt">${s.noLessons}</div>`}
    <div class="card mt2"><div class="row between wrapx"><div><h3>${s.trendTitle}</h3><div class="muted" style="font-size:13px">${s.trendHint}</div></div>
        <div class="legend"><span><i class="a"></i>${s.attendance}</span><span><i class="h"></i>${s.homework}</span></div></div>
      <div class="trend" role="group" aria-label="${esc(trendAria)}">${trend.map(w => `<button class="tcol ${w.weekStart === F.week ? 'on' : ''}" data-act="famWeek" data-w="${w.weekStart}" aria-label="${weekLabel(w.weekStart)}: ${s.attendance} ${w.attendedPct ?? '—'}%, ${s.homework} ${w.homeworkPct ?? '—'}%">
        <span class="tbars2"><i class="tb a ${w.attendedPct == null ? 'na' : ''}" style="height:${w.attendedPct == null ? 3 : Math.max(w.attendedPct, 3)}%"></i><i class="tb h ${w.homeworkPct == null ? 'na' : ''}" style="height:${w.homeworkPct == null ? 3 : Math.max(w.homeworkPct, 3)}%"></i></span><small>${uzShort(w.weekStart)}</small></button>`).join('')}</div></div>
    <div class="card mt2"><h3>${s.payTitle}</h3>
      ${F.payments.length ? `<div class="tablewrap" style="margin-top:12px"><table class="paytable"><thead><tr><th>${s.month}</th><th class="hm">${s.due}</th><th>${s.paid}</th><th>${s.left}</th><th>${s.status}</th></tr></thead><tbody>
        ${F.payments.map(p => { const stt = paymentStatus(p.due, p.paid); return `<tr class="${p.period === thisMonth ? 'me' : ''}"><td><b>${esc(monthName(p.period))}</b></td><td class="hm">${fmtMoney(p.due)}</td><td>${fmtMoney(p.paid)}</td><td>${fmtMoney(Math.max(0, p.due - p.paid))}</td>
          <td><span class="badge ${{ paid: 'ok', partial: 'draft', unpaid: 'bad', none: '' }[stt]}">${s.pay[stt]}</span></td></tr>`; }).join('')}</tbody></table></div>
        <p class="muted" style="font-size:13px;margin-top:10px">${esc(CONFIG.currency)} · ${s.payNote}</p>` : `<div class="empty" style="margin-top:12px">${s.noPay}</div>`}
      <a class="btn mt" href="${esc(CONFIG.telegramUrl)}" target="_blank" rel="noopener">${icon('send', 16)} ${s.contact}</a></div>
  </div></div>`;
}
