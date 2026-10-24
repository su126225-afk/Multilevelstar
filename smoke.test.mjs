// Drives the real app inside jsdom (local/demo store) and walks the main flows.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const bundle = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tests.json'), 'utf8')).tests;

const dom = new JSDOM('<!doctype html><html data-theme="dark"><body><header id="nav"></header><main id="view"></main><footer id="foot"><span id="footBrand"></span></footer><div id="toasts"></div><div id="modal" class="modal"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const w = dom.window;
for (const k of ['window', 'document', 'localStorage', 'sessionStorage', 'location', 'Event', 'Blob', 'HTMLElement']) {
  Object.defineProperty(globalThis, k, { value: k === 'window' ? w : w[k], configurable: true, writable: true });
}
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
w.scrollTo = () => {};
w.Element.prototype.scrollIntoView = () => {};
w.HTMLMediaElement.prototype.play = function () { this.dispatchEvent(new w.Event('play')); return Promise.resolve(); };
w.HTMLMediaElement.prototype.pause = () => {};
globalThis.fetch = async u => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(ROOT, String(u)), 'utf8')) });
const errors = []; w.addEventListener('error', e => errors.push(e.message));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = (s, r = w.document) => r.querySelector(s);
const $$ = (s, r = w.document) => [...r.querySelectorAll(s)];
const nav = async h => { w.location.hash = h; await sleep(120); };
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const waitFor = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(40); } throw new Error('timeout waiting: ' + fn); };

await import('../js/app.js');
const { prepare, grade, mondayOf, addDays, todayKey, formatCode } = await import('../js/logic.js');
const { toDraft, buildTest } = await import('../js/views-admin.js');

async function answerAll(t) {
  const { flat } = prepare(t);
  for (const pi of new Set(flat.map(q => q.pi))) {
    click($(`.ptab[data-i="${pi}"]`));
    await sleep(30);
    for (const q of flat.filter(q => q.pi === pi)) {
      const val = q.type === 'fill' ? q.answer.split('/')[0] : q.answer;
      const el = $(`[data-n="${q.n}"][data-in="ans"]`, w.document) ;
      assert.ok(el, `input for Q${q.n} (${q.type}) not rendered in part ${pi + 1}`);
      if (el.type === 'radio') { const r = $(`input[name="q${q.n}"][value="${val}"]`); assert.ok(r, `radio ${val} for Q${q.n}`); r.checked = true; r.dispatchEvent(new w.Event('change', { bubbles: true })); }
      else { el.value = val; el.dispatchEvent(new w.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }
    }
  }
}

test('home loads with 25 bundled tests', async () => {
  await waitFor(() => $('.hero'));
  assert.match($('.herostats').textContent, /25/);
});

test('practice lists: 21 reading and 4 listening', async () => {
  await nav('#/practice/reading'); await waitFor(() => $$('.tcard').length);
  assert.equal($$('.tcard').length, 21);
  await nav('#/practice/listening'); await waitFor(() => $$('.tcard').length === 4);
});

test('student gate rejects unknown group, accepts DEMO', async () => {
  const t = bundle.find(x => x.title === 'Multilevel Reading 15');
  await nav('#/test/' + t.id); await waitFor(() => $('[data-act=beginTest]'));
  click($('[data-act=beginTest]')); await waitFor(() => $('#stName'));
  $('#stName').value = 'Test Student'; $('#stCode').value = 'NOPE'; click($('#stBtn')); await waitFor(() => $('#stErr').textContent);
  assert.match($('#stErr').textContent, /not found/);
  $('#stCode').value = 'demo'; click($('#stBtn')); await waitFor(() => w.location.hash.startsWith('#/run/'));
});

test('reading run: every question renders and a perfect run scores C1', async () => {
  const t = bundle.find(x => x.title === 'Multilevel Reading 15');
  await waitFor(() => $('.runner'));
  assert.ok($('#tv').textContent.includes(':'));
  await answerAll(t);
  click($('[data-act=submitTest]')); await waitFor(() => $('[data-act=confirmYes]')); click($('[data-act=confirmYes]'));
  await waitFor(() => w.location.hash.startsWith('#/result/'));
  await waitFor(() => $('.ring'));
  assert.match($('.ring').textContent, /C1/);
  assert.equal($$('.rv.ok').length, 35);
});

test('listening run: audio bar, parts, perfect run scores C1', async () => {
  const t = bundle.find(x => x.title === 'Multilevel Listening N25');
  await nav('#/run/' + t.id); await waitFor(() => $('.runner'));
  assert.ok($('#aud') && $('#abtn'), 'audio bar rendered');
  await answerAll(t);
  click($('[data-act=submitTest]')); await waitFor(() => $('[data-act=confirmYes]')); click($('[data-act=confirmYes]'));
  await waitFor(() => $('.ring'));
  assert.match($('.ring').textContent, /C1/);
});

test('imperfect answers: wrong answer is graded and shown', async () => {
  const t = bundle.find(x => x.title === 'Multilevel Reading 03');
  await nav('#/run/' + t.id); await waitFor(() => $('.runner'));
  click($('[data-act=submitTest]')); await waitFor(() => $('[data-act=confirmYes]')); click($('[data-act=confirmYes]'));
  await waitFor(() => $('.ring'));
  assert.match($('.ring').textContent, /Below B1/);
  assert.equal($$('.rv.no').length, 35);
});

test('leaderboard and my results show the student', async () => {
  await nav('#/leaderboard'); await waitFor(() => $('#lbBody table'));
  assert.match($('#lbBody').textContent, /Test Student/);
  await nav('#/me'); await waitFor(() => $('.kv'));
  assert.match($('.kv').textContent, /3/);
});

test('admin: login, list 25 tests, editor round-trips every bundled test losslessly', async () => {
  await nav('#/admin'); await waitFor(() => $('#lgPw'));
  $('#lgPw').value = 'admin123'; click($('[data-act=adminLogin]'));
  await waitFor(() => $('#admBody table'));
  assert.equal($$('#admBody tbody tr').length, 25);
  for (const t of bundle) {
    const { test: back, errors: errs } = buildTest(toDraft(t));
    assert.deepEqual(errs, [], t.title);
    assert.equal(prepare(back).flat.length, prepare(t).flat.length, t.title);
    const perfect = Object.fromEntries(prepare(t).flat.map(q => [q.n, q.type === 'fill' ? q.answer.split('/')[0] : q.answer]));
    assert.equal(grade(back, perfect).correct, 35, t.title + ' round-trip grading');
  }
});

test('admin editor page renders for a bundled test and for a new test', async () => {
  const t = bundle.find(x => x.title === 'Multilevel Listening N3');
  await nav('#/admin/test/' + t.id); await waitFor(() => $('.ed-part'));
  assert.equal($$('.ed-part').length, 6);
  assert.ok($$('[data-status]').some(s => /recognised/.test(s.textContent)));
  await nav('#/admin/test/new'); await waitFor(() => $('.ed-part'));
  assert.equal($$('.ed-part').length, 1);
});

test('home shows real progress for the signed-in student', async () => {
  await nav('#/'); await waitFor(() => $('.pstats'));
  assert.match($('.welcome').textContent, /Test Student|Test/);
  assert.equal($('.pstat b').textContent.trim(), '3');             // 3 different tests completed
  assert.equal($$('.bdg').length, 7);
  assert.match($('.badgegrid .bdg.on').textContent, /First Test Completed/);
  assert.ok($$('.rrow').length >= 1, 'recent results listed');
  assert.match($('.daily').textContent, /challenge/i);
});

test('result page: XP, estimate wording and performance by type', async () => {
  await nav('#/me'); await waitFor(() => $('.kv'));
  assert.ok($$('.bdg').length === 7 && $('.xpbar'));
  const rev = $('a[href^="#/result/"]'); assert.ok(rev, 'history has a Review link');
  w.location.hash = rev.getAttribute('href'); await waitFor(() => $('.ring'));
  await waitFor(() => $('.banner.xp'));
  assert.match($('.banner.xp').textContent, /\+\d+ XP/);
  assert.match($('.estimate').textContent, /unofficial estimate/i);
  assert.ok($$('.tbar').length >= 1, 'question-type bars');
  assert.ok($('.reco'), 'recommendation');
});

test('leaderboard can rank by XP', async () => {
  await nav('#/leaderboard'); await waitFor(() => $('#lbBody table'));
  click($('[data-act=lbRank][data-v=xp]')); await waitFor(() => /XP/.test($('#lbBody thead').textContent));
  assert.match($('#lbBody').textContent, /Test Student/);
  assert.match($('.you-pos').textContent, /#1/);
});

test('runner: flag a question, move between parts with Next / Previous', async () => {
  const t = bundle.find(x => x.title === 'Multilevel Reading 15');
  await nav('#/run/' + t.id); await waitFor(() => $('.runner'));
  const flag = $('[data-act=flag]'); assert.ok(flag, 'flag button rendered');
  const n = flag.dataset.n;
  click(flag);
  assert.equal(flag.getAttribute('aria-pressed'), 'true');
  assert.ok($(`.dot.flag[data-n="${n}"]`), 'flagged dot in the navigator');
  assert.ok($('.ptab.on[data-i="0"]'));
  assert.ok($('[data-act=partStep][data-d="-1"]').disabled, 'Previous disabled on the first part');
  click($('[data-act=partStep][data-d="1"]'));
  await waitFor(() => $('.ptab.on[data-i="1"]'));
  click($('[data-act=partStep][data-d="-1"]'));
  await waitFor(() => $('.ptab.on[data-i="0"]'));
  assert.equal($(`[data-act=flag][data-n="${n}"]`).getAttribute('aria-pressed'), 'true', 'flag survives re-render');
  const last = $$('.ptab').length - 1;
  click($(`.ptab[data-i="${last}"]`)); await waitFor(() => $('.ptab.on[data-i="' + last + '"]'));
  assert.match($('#rfoot').textContent, /Review & submit/);
  assert.ok($$('[data-act=submitTest]').length >= 2, 'last part offers Review & submit');
});

// ───────── family portal: teacher tools + parent page ─────────
const toastText = () => $$('#toasts .toast').map(t => t.textContent).join(' | ');
const fire = (el, type = 'change') => el.dispatchEvent(new w.Event(type, { bubbles: true }));
const adminTab = async (k, ready) => { await nav('#/admin'); await waitFor(() => $('[data-act=admTab]')); click($(`[data-act=admTab][data-k=${k}]`)); await waitFor(ready); };
const MON = mondayOf(todayKey()), TUE = addDays(MON, 1);
let codes = {};

test('teacher adds students: personal numbers are 12 digits, unique; duplicates and junk are skipped', async () => {
  await adminTab('students', () => $('#stuNames'));
  $('#stuNames').value = 'Ali Valiyev; Karim Valiyev\nMadina Karimova\n  ali   VALIYEV \nX';
  click($('[data-act=addStudents]'));
  await waitFor(() => $$('#admBody tbody tr').length === 2);
  assert.match(toastText(), /2 students added, 2 skipped/);
  const rows = $$('#admBody tbody tr');
  const list = rows.map(r => ({ name: $('b', r).textContent, code: $('code.mono', r).textContent }));
  assert.deepEqual(list.map(x => x.name), ['Ali Valiyev', 'Madina Karimova']);
  for (const x of list) assert.match(x.code, /^\d{4}-\d{4}-\d{4}$/);
  assert.notEqual(list[0].code, list[1].code);
  assert.match(rows[0].textContent, /Parent: Karim Valiyev/);
  codes = { ali: list[0].code, madina: list[1].code };
});

test('family: group with students cannot be deleted', async () => {
  await adminTab('groups', () => $('[data-act=delGroup]'));
  click($('[data-act=delGroup][data-code=DEMO]')); await waitFor(() => $('[data-act=confirmYes]')); click($('[data-act=confirmYes]'));
  await waitFor(() => /still has students/.test(toastText()));
  assert.ok($('[data-act=delGroup][data-code=DEMO]'), 'DEMO group still listed');
});

test('teacher marks two lessons in the attendance register', async () => {
  const mark = async (date, topic, task, spec) => {
    await adminTab('attendance', () => $('#attRows') || $('[data-in=admf][data-k=date]'));
    const d = $('[data-in=admf][data-k=date]'); d.value = date; fire(d);
    await waitFor(() => $('#attTopic') && $('[data-in=admf][data-k=date]').value === date);
    $('#attTopic').value = topic; $('#attTask').value = task;
    for (const tr of $$('#attRows tr[data-stu]')) {
      const [a, h, note] = spec[$('b', tr).textContent];
      $(`input[name="a-${tr.dataset.stu}"][value="${a}"]`).checked = true; $(`input[name="h-${tr.dataset.stu}"][value="${h}"]`).checked = true; $('.note', tr).value = note;
    }
    click($('[data-act=attSave]'));
    await waitFor(() => /Lesson saved/.test(toastText()));
  };
  await mark(MON, 'Past Simple', 'Ex. 4', { 'Ali Valiyev': ['late', 'done', ''], 'Madina Karimova': ['absent', 'missing', 'Darsga kelmadi'] });
  await mark(TUE, 'Present Perfect', 'Ex. 7', { 'Ali Valiyev': ['present', 'done', ''], 'Madina Karimova': ['present', 'partial', ''] });
  // reopening a saved lesson shows what was saved
  await adminTab('attendance', () => $('#attRows'));
  const d = $('[data-in=admf][data-k=date]'); d.value = MON; fire(d);
  await waitFor(() => $('#attTopic')?.value === 'Past Simple');
  const mad = $$('#attRows tr[data-stu]').find(tr => /Madina/.test(tr.textContent));
  assert.equal($('input[name^="a-"]:checked', mad).value, 'absent'); assert.equal($('.note', mad).value, 'Darsga kelmadi');
  assert.match($('#admBody').textContent, /Saved lesson/);
});

test('weekly report: late counts as attended, only done counts as homework, parent message is written', async () => {
  await adminTab('weekly', () => $('#admBody tbody tr'));
  const rows = Object.fromEntries($$('#admBody tbody tr').map(tr => [$('b', tr).textContent, tr]));
  assert.match(rows['Ali Valiyev'].textContent, /100%.*2\/2.*100%.*2\/2/s);
  assert.match(rows['Madina Karimova'].textContent, /50%.*1\/2.*0%.*0\/2/s);
  assert.match($('#admBody .kv').textContent, /2\s*lessons held/);
  click($('[data-act=wkMsg]', rows['Madina Karimova']));
  await waitFor(() => $('#copyBox'));
  const msg = $('#copyBox').value;
  assert.match(msg, /^Assalomu alaykum!/); assert.match(msg, /Madina Karimova uchun/); assert.match(msg, /❌ kelmadi · uy vazifasi: ❌ bajarmadi/);
  assert.match(msg, /💬 Darsga kelmadi/); assert.match(msg, /Davomat: 50% \(1\/2\)/); assert.match(msg, /#\/family/); assert.match(msg, /Sardor Usmonov$/);
  click($('[data-act=closeModal]'));
});

test('payments: set a fee, record part and full payments, totals add up', async () => {
  await adminTab('payments', () => $('#payFee'));
  $('#payFee').value = '500000'; click($('[data-act=payFee]'));
  await waitFor(() => $$('#payRows .due').every(i => i.value === '500000') && $$('#payRows .due').length === 2);
  const trOf = name => $$('#payRows tr').find(tr => tr.textContent.includes(name));
  const ali = trOf('Ali'); $('.paid', ali).value = '200000'; click($('[data-act=paySave]', ali));
  await waitFor(() => /Partly paid/.test(trOf('Ali').textContent));
  click($('[data-act=payFull]', trOf('Madina')));
  await waitFor(() => />Paid</.test(trOf('Madina').innerHTML));
  assert.match($('#admBody .kv').textContent, /1 000 000\s*expected/); assert.match($('#admBody .kv').textContent, /700 000\s*received/); assert.match($('#admBody .kv').textContent, /300 000\s*outstanding/);
  $('.due', trOf('Ali')).value = '-5'; click($('[data-act=paySave]', trOf('Ali')));
  await waitFor(() => /cannot be negative/.test(toastText()));
});

const famLogin = async code => {
  await nav('#/family'); await waitFor(() => $('#famCode'));
  $('#famCode').value = code; fire($('#famCode'), 'input'); click($('#famBtn'));
};

test('family page: wrong, short and unknown numbers are rejected with clear messages', async () => {
  await nav('#/family'); await waitFor(() => $('#famCode'));
  assert.ok($('#nav').classList.contains('famnav'), 'simplified header on the family page');
  $('#famCode').value = '123'; click($('#famBtn')); await waitFor(() => $('#famErr').textContent);
  assert.match($('#famErr').textContent, /12 ta raqam/);
  await famLogin('0000-0000-0000'); await waitFor(() => /topilmadi/.test($('#famErr').textContent));
  assert.ok(!$('.fam'), 'not logged in');
  $('#famCode').value = '12345678901234567'; fire($('#famCode'), 'input');
  assert.equal($('#famCode').value, '1234-5678-9012', 'input is limited to 12 digits and formatted');
});

test('family page: a parent sees only their own child — attendance, homework, payment', async () => {
  await famLogin(codes.ali.replace(/\D/g, '')); await waitFor(() => $('.fam'));
  const txt = () => $('.fam').textContent;
  assert.match(txt(), /Ali Valiyev/); assert.ok(!/Madina/.test($('#view').textContent), "no other student's name");
  assert.ok(!/Karim Valiyev/.test($('#view').textContent), 'parent name is not shown');
  const vals = $$('.fval').map(e => e.textContent); assert.deepEqual(vals, ['100%', '100%']);
  assert.equal($$('.rrow.lesson').length, 2);
  assert.match(txt(), /Past Simple/); assert.match(txt(), /Ex\. 7/); assert.match(txt(), /Kechikdi/);
  assert.match(txt(), /Qisman to'langan/); assert.match($('.banner.pb').textContent, /300 000/);
  assert.equal($$('.tcol').length, 8);
  assert.ok(!$('#view').innerHTML.includes(codes.madina.replace(/\D/g, '')), "no other student's number");
  // English on request, and back
  click($('[data-act=famLang]')); await waitFor(() => /Attendance/.test($('.fam').textContent));
  assert.match($('.fam').textContent, /Partly paid/); assert.match($('.fam').textContent, /Late/);
  click($('[data-act=famLang]')); await waitFor(() => /Davomat/.test($('.fam').textContent));
  // week navigation
  click($('[data-act=famShift][data-d="-1"]')); await waitFor(() => /Bu hafta uchun darslar belgilanmagan/.test($('.fam').textContent));
  assert.deepEqual($$('.fval').map(e => e.textContent), ['—', '—']);
  click($('[data-act=famNow]')); await waitFor(() => $$('.rrow.lesson').length === 2);
  click($('[data-act=famLogout]')); await waitFor(() => $('#famCode'));
});

test('family page: second family sees only their own data, including the teacher comment', async () => {
  await famLogin(formatCode(codes.madina)); await waitFor(() => $('.fam'));
  const t = $('#view').textContent;
  assert.match(t, /Madina Karimova/); assert.ok(!/Ali Valiyev/.test(t));
  assert.deepEqual($$('.fval').map(e => e.textContent), ['50%', '0%']);
  assert.match(t, /Darsga kelmadi/); assert.match(t, /Kelmadi/); assert.match(t, /To'langan/);
  assert.ok(!$('.banner.pb'), 'no payment reminder when paid in full');
  click($('[data-act=famLogout]')); await waitFor(() => $('#famCode'));
});

test('teacher pauses a student: their number stops working at once; a new number replaces the old', async () => {
  await adminTab('students', () => $('#admBody tbody tr'));
  const rowOf = name => $$('#admBody tbody tr').find(tr => tr.textContent.includes(name));
  click($('[data-act=stuToggle]', rowOf('Ali'))); await waitFor(() => /Paused/.test(rowOf('Ali').textContent));
  await famLogin(codes.ali); await waitFor(() => /topilmadi/.test($('#famErr').textContent));
  await adminTab('students', () => $('#admBody tbody tr'));
  click($('[data-act=stuToggle]', rowOf('Ali'))); await waitFor(() => /Active/.test(rowOf('Ali').textContent));
  click($('[data-act=stuNewCode]', rowOf('Madina'))); await waitFor(() => $('[data-act=confirmYes]')); click($('[data-act=confirmYes]'));
  await waitFor(() => $('code.mono', rowOf('Madina')).textContent !== codes.madina);
  const fresh = $('code.mono', rowOf('Madina')).textContent;
  await famLogin(codes.madina); await waitFor(() => /topilmadi/.test($('#famErr').textContent));
  await famLogin(fresh); await waitFor(() => $('.fam'));
  assert.match($('.fam').textContent, /Madina Karimova/);
  click($('[data-act=famLogout]')); await waitFor(() => $('#famCode'));
});

test('teacher can copy an invitation and deleting a student removes their records', async () => {
  await adminTab('students', () => $('#admBody tbody tr'));
  const rowOf = name => $$('#admBody tbody tr').find(tr => tr.textContent.includes(name));
  click($('[data-act=stuInvite]', rowOf('Ali'))); await waitFor(() => $('#copyBox'));
  assert.match($('#copyBox').value, /Ali Valiyev uchun English with Usmonov/); assert.match($('#copyBox').value, /🔑 \d{4}-\d{4}-\d{4}/);
  click($('[data-act=closeModal]'));
  click($('[data-act=stuDelete]', rowOf('Ali'))); await waitFor(() => $('[data-act=confirmYes]')); click($('[data-act=confirmYes]'));
  await waitFor(() => !rowOf('Ali'));
  await famLogin(codes.ali); await waitFor(() => /topilmadi/.test($('#famErr').textContent));
  const left = JSON.parse(w.localStorage.getItem('ma_records') || '[]'); const pays = JSON.parse(w.localStorage.getItem('ma_payments') || '[]');
  assert.equal(left.length, 2); assert.equal(pays.length, 1);   // only Madina's two records and one payment remain
  assert.match(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), /<footer[\s\S]*href="#\/family"/, 'footer links to the family page');
});

test('no uncaught errors during the walk-through', () => { assert.deepEqual(errors, []); });
