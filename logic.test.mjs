import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBlock, serializeBlock, prepare, grade, isCorrect, ieltsBand, multilevelScore, buildBoard, parseOptions, parseTime, fmtTime, rich } from '../js/logic.js';

test('parseBlock handles every question type', () => {
  const shared = parseOptions('A) one\nB) two\nC) three');
  const { questions, errors } = parseBlock([
    'Pick :: A) x | B) y | C) z :: B',
    'It rains :: TFNG :: ng',
    'Is it so :: YNNG :: yes',
    'Para 1 :: MATCH :: c',
    'The sky is ___ :: GAP :: blue / azure',
    'Short ___ :: red',
  ].join('\n'), shared);
  assert.deepEqual(errors, []);
  assert.deepEqual(questions.map(q => q.type), ['mcq', 'tfng', 'ynng', 'match', 'fill', 'fill']);
  assert.equal(questions[1].answer, 'Not Given');
  assert.equal(questions[3].answer, 'C');
  assert.equal(parseBlock(serializeBlock(questions), shared).questions.length, 6);
});

test('parseBlock reports errors with line numbers', () => {
  const { errors } = parseBlock('bad line\nQ :: A) x | B) y :: Z\nQ :: MATCH :: A');
  assert.equal(errors.length, 3);
  assert.match(errors[1], /Line 2/);
});

test('roman numeral and numeric option labels', () => {
  const { questions } = parseBlock('Q :: i) first | ii) second | iii) third :: ii');
  assert.equal(questions[0].answer, 'ii');
});

test('prepare numbers inline gaps and questions in order', () => {
  const t = { format: 'multilevel', section: 'reading', data: { parts: [
    { text: 'A [[cave]] and a [[silence/quiet]].', blocks: [{ questions: [{ type: 'mcq', text: 'q', options: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }], answer: 'A' }] }] },
    { options: [{ label: 'A', text: 'x' }], blocks: [{ body: 'Also [[dark]]', questions: [{ type: 'match', text: 'm', answer: 'A' }] }] },
  ] } };
  const { parts, flat } = prepare(t);
  assert.deepEqual(flat.map(q => q.n), [1, 2, 3, 4, 5]);
  assert.equal(parts[0].text, 'A {{1}} and a {{2}}.');
  assert.equal(parts[1].blocks[0].body, 'Also {{4}}');
  assert.equal(flat[4].choices.length, 1);
  assert.equal(parts[1].from, 4);
});

test('grading, alternatives and normalisation', () => {
  const t = { format: 'ielts', section: 'listening', data: { parts: [{ text: '[[7.30/7:30/half past seven]] and [[$55/55]]', blocks: [] }] } };
  assert.equal(grade(t, { 1: '7:30', 2: ' $55. ' }).correct, 2);
  assert.equal(grade(t, { 1: 'seven', 2: '' }).correct, 0);
  assert.ok(isCorrect({ type: 'mcq', answer: 'B' }, 'b'));
  assert.ok(!isCorrect({ type: 'mcq', answer: 'B' }, ''));
});

test('band tables and multilevel levels', () => {
  assert.equal(ieltsBand('reading', 40, 40), 9);
  assert.equal(ieltsBand('reading', 30, 40), 7);
  assert.equal(ieltsBand('listening', 32, 40), 7.5);
  assert.equal(ieltsBand('reading', 0, 40), 0);
  assert.deepEqual(multilevelScore(35, 35), { pts: 75, level: 'C1' });
  assert.equal(multilevelScore(25, 35).level, 'B2');
  assert.equal(multilevelScore(20, 35).level, 'B1');
  assert.equal(multilevelScore(10, 35).level, 'Below B1');
});

test('leaderboard keeps each student best attempt per test', () => {
  const R = (n, g, t, p, s) => ({ student_name: n, group_code: g, test_id: t, percent: p, time_sec: s, created_at: '2026-01-01' });
  const b = buildBoard([R('Ali', 'G1', 't1', 50, 100), R('Ali', 'G1', 't1', 80, 90), R('Ali', 'G1', 't2', 60, 50), R('Vali', 'G1', 't1', 75, 10), R('ali', 'G1', 't1', 10, 1)]);
  assert.equal(b.length, 2);
  assert.equal(b[0].name, 'Vali');          // 75% average beats Ali's 70%
  const ali = b.find(x => x.name === 'Ali');
  assert.equal(ali.tests, 2);                // best of t1 (80) + t2 (60)
  assert.equal(ali.avg, 70);
  assert.equal(ali.attempts, 4);             // 'ali' merges with 'Ali'
  assert.equal(buildBoard([R('A', 'G1', 't1', 5, 1), R('B', 'G2', 't1', 9, 1)], { group: 'G2' }).length, 1);
});

test('time helpers and rich text escaping', () => {
  assert.equal(parseTime('1:05'), 65);
  assert.equal(parseTime(''), null);
  assert.equal(fmtTime(65), '1:05');
  assert.equal(fmtTime(3725), '1:02:05');
  assert.ok(!rich('<script>alert(1)</script>').includes('<script>'));
  assert.ok(rich('hi **there**').includes('<strong>there</strong>'));
});
