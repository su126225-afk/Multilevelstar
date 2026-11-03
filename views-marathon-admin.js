// Teacher panel → "Marathon" tab: kontent, guruhlar, qoidalar, o'quvchilar, kunlarni ochish, qulfni ochish.
import { store } from './store.js';
import { esc, fmtDateTime } from './logic.js';
import { missedDays, todayStr, dm } from './marlogic.js';
import { $, $$, actions, toast, icon, confirmBox } from './ui.js';

let ST = null, BODY = null;
const refresh = () => marathonTab(BODY);

export async function marathonTab(body) {
  BODY = body;
  const [st, groups, mj] = await Promise.all([store.marAdminLoad(), store.listGroups().catch(() => []), fetch('marathon.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)]);
  ST = st; ST._mj = mj;
  const today = todayStr(), daysSynced = Object.keys(st.days).length, bundled = mj?.days?.length || 0;
  const doneBy = id => new Set(st.progress.filter(p => p.student_id === id).map(p => p.day + ':' + p.task)).size;
  const doneDaysOf = s => Object.entries(st.days).filter(([d, tasks]) => tasks.length && tasks.every(t => st.progress.some(p => p.student_id === s.id && p.day === Number(d) && p.task === t))).length;
  const rows = st.students.slice().sort((a, b) => a.group_code.localeCompare(b.group_code) || a.student_name.localeCompare(b.student_name));
  body.innerHTML = `
    <div class="panel"><div class="row between wrapx"><div><b>1. Kontent</b><div class="muted" style="font-size:14px">Serverda ${daysSynced} kunlik reja bor · sayt faylida (marathon.json) ${bundled} kun. Yangi kunlar qo'shilganda shu tugmani bosing.</div></div>
      <button class="btn primary sm" data-act="marSync">${icon('arrow', 14)} Kontentni yuklash / yangilash</button></div></div>
    <div class="panel mt"><b>2. Marafon ochiq guruhlar</b>
      <div class="row wrapx mt">${groups.length ? groups.map(g => `<label class="chip ${st.groups.includes(g.code) ? 'on' : ''}" style="cursor:pointer"><input type="checkbox" data-act="marGroup" data-code="${esc(g.code)}" ${st.groups.includes(g.code) ? 'checked' : ''} style="margin-right:6px">${esc(g.code)}${g.name ? ' · ' + esc(g.name) : ''}</label>`).join('') : '<span class="muted">Avval "Groups" tabida guruh yarating.</span>'}</div>
      <small class="muted">Belgilangan guruh o'quvchilari birinchi kirishda marafonga avtomatik qo'shiladi (1-kundan boshlaydi).</small></div>
    <div class="panel mt"><b>3. Jarima qoidasi</b>
      <div class="row wrapx mt" style="align-items:center;gap:10px">Oxirgi <input class="inp" id="marWin" type="number" min="2" max="60" value="${st.settings.window_days}" style="width:80px"> kun ichida <input class="inp" id="marLim" type="number" min="1" max="10" value="${st.settings.miss_limit}" style="width:80px"> kun dars qilinmasa — qulflash.
        <button class="btn sm" data-act="marSettings">Saqlash</button></div>
      <small class="muted">Masalan 10 kun / 2 kun: ketma-ket 2 kun yoki 10 kun ichida har qanday 2 kun qoldirilsa qulflanadi. Bugungi kun hisoblanmaydi (kun tugaguncha).</small></div>
    <h2 class="ptitle mt2" style="font-size:22px">O'quvchilar (${rows.length})</h2>
    ${rows.length ? `<div class="tablewrap mt"><table><thead><tr><th>Ism</th><th>Guruh</th><th>Boshlagan</th><th>Ochiq kun</th><th>Bajarilgan</th><th>Qoldirilgan</th><th>Holat</th><th class="r"></th></tr></thead><tbody>
    ${rows.map(s => { const miss = missedDays(st, s, today); return `<tr>
      <td><b>${esc(s.student_name)}</b></td><td>${esc(s.group_code)}</td><td class="muted">${dm(s.start_day)}</td>
      <td><div class="row" style="gap:6px"><input class="inp" type="number" min="1" max="35" value="${s.open_upto}" id="mo-${s.id}" style="width:70px"><button class="btn sm" data-act="marOpenTo" data-id="${s.id}">OK</button></div></td>
      <td>${doneDaysOf(s)} kun · ${doneBy(s.id)} vazifa</td>
      <td>${miss.length ? `<span class="badge draft">${miss.length}</span> <small class="muted">${miss.map(dm).join(', ')}</small>` : '—'}</td>
      <td>${s.locked ? `<span class="badge" style="color:var(--bad);border-color:var(--bad)">${icon('lock', 12)} Qulflangan</span><br><small class="muted">${esc(s.lock_reason)}</small>` : '<span class="badge ok">Faol</span>'}</td>
      <td class="r"><div class="row" style="justify-content:flex-end;gap:6px;flex-wrap:wrap">${s.locked ? `<button class="btn sm primary" data-act="marUnlock" data-id="${s.id}">Qulfni ochish</button>` : ''}
        <input class="inp" type="date" id="ex-${s.id}" style="width:140px"><button class="btn sm" data-act="marExcuse" data-id="${s.id}" title="Shu sanani qoldirilgan hisobiga olmaslik">Kechirish</button>
        <button class="btn sm danger" data-act="marDel" data-id="${s.id}">${icon('trash', 14)}</button></div>${(s.excused || []).length ? `<small class="muted">kechirilgan: ${s.excused.map(dm).join(', ')}</small>` : ''}</td></tr>`; }).join('')}
    </tbody></table></div>` : '<div class="empty mt">Hozircha hech kim marafonga kirmagan.</div>'}`;
}

actions.marSync = async el => {
  const mj = ST?._mj; if (!mj?.days?.length) return toast('marathon.json topilmadi', 'bad');
  el.disabled = true;
  try {
    const refs = new Set();
    mj.days.forEach(d => d.tasks.forEach(t => { if (t.ref) refs.add(t.ref); }));
    // 1) testlar (tests.json dan, faqat marafonga tegishlilari)
    let nTests = 0;
    try {
      const tj = await (await fetch('tests.json?t=' + Date.now(), { cache: 'no-store' })).json();
      const list = tj.tests.filter(t => refs.has(t.id) || t.data?.marathon);
      if (list.length) { await store.saveTests(list.map(t => ({ published: true, ...t }))); nTests = list.length; }
    } catch { /* tests.json yo'q */ }
    // 2) writing vazifalari
    for (const w of mj.writing || []) await store.saveWritingTask({ published: true, image_url: '', ...w });
    // 3) kunlar rejasi
    await store.marSaveDays(Object.fromEntries(mj.days.map(d => [d.day, d.tasks.map(t => t.id)])));
    toast(`Tayyor: ${mj.days.length} kun, ${nTests} test, ${(mj.writing || []).length} writing`, 'ok');
  } catch (e) { toast(e.message, 'bad'); }
  refresh();
};
actions.marGroup = async el => {
  const set = new Set(ST.groups); el.checked ? set.add(el.dataset.code) : set.delete(el.dataset.code);
  try { await store.marSaveGroups([...set]); toast('Saqlandi', 'ok'); } catch (e) { toast(e.message, 'bad'); }
  refresh();
};
actions.marSettings = async () => {
  const w = Number($('#marWin').value), l = Number($('#marLim').value);
  if (!(w >= 2 && w <= 60 && l >= 1 && l <= 10)) return toast("Qiymatlar noto'g'ri", 'bad');
  try { await store.marSaveSettings({ window_days: w, miss_limit: l }); toast('Saqlandi', 'ok'); } catch (e) { toast(e.message, 'bad'); }
  refresh();
};
actions.marOpenTo = async el => {
  const v = Number($('#mo-' + el.dataset.id).value);
  if (!(v >= 1 && v <= 35)) return toast('1–35 oralig\'ida', 'bad');
  try { await store.marPatchStudent(el.dataset.id, { open_upto: v }); toast(`${v}-kungacha ochildi`, 'ok'); } catch (e) { toast(e.message, 'bad'); }
  refresh();
};
actions.marUnlock = async el => {
  if (!(await confirmBox('Qulfni ochish', "O'quvchi qaytadan boshlaydi: bugundan boshlab qoldirilgan kunlar hisoblanadi.", 'Ochish'))) return;
  try { await store.marUnlock(el.dataset.id); toast('Qulf ochildi', 'ok'); } catch (e) { toast(e.message, 'bad'); }
  refresh();
};
actions.marExcuse = async el => {
  const v = $('#ex-' + el.dataset.id).value; if (!v) return toast('Sanani tanlang', 'bad');
  const s = ST.students.find(x => x.id === el.dataset.id); if (!s) return;
  try { await store.marPatchStudent(s.id, { excused: [...new Set([...(s.excused || []), v])] }); toast('Kechirildi', 'ok'); } catch (e) { toast(e.message, 'bad'); }
  refresh();
};
actions.marDel = async el => {
  if (!(await confirmBox("O'quvchini o'chirish", "Uning marafondagi barcha natijalari o'chadi.", "O'chirish", true))) return;
  try { await store.marDeleteStudent(el.dataset.id); toast("O'chirildi", 'ok'); } catch (e) { toast(e.message, 'bad'); }
  refresh();
};
