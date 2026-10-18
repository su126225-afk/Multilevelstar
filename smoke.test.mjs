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
const { prepare, grade } = await import('../js/logic.js');
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

test('no uncaught errors during the walk-through', () => { assert.deepEqual(errors, []); });
