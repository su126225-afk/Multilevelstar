import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBlock, serializeBlock, prepare, grade, isCorrect, ieltsBand, multilevelScore, buildBoard, parseOptions, parseTime, fmtTime, rich } from '../js/logic.js';
import { xpTimeline, totalXp, levelInfo, streakInfo, dailyChallenge, weekInfo, achievements, progressSummary, buildStudentStats, typeBreakdown, XP } from '../js/logic.js';

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

// ───────── gamification (derived from stored results) ─────────
const R = (day, o = {}) => ({ id: o.id || `r${day}${o.test_id || 't'}`, test_id: 't1', section: 'reading', format: 'multilevel', student_name: 'Ana', group_code: 'G', correct: 20, total: 35, percent: 57.1, created_at: `2026-10-${String(day).padStart(2, '0')}T10:00:00`, ...o });
const NOW = new Date('2026-10-12T12:00:00');

test('xp: first clear beats repeats, quality bonus, daily cap', () => {
  const [a, b] = xpTimeline([R(1, { id: 'a', percent: 85, correct: 30 }), R(2, { id: 'b', percent: 85, correct: 30 })]);
  assert.equal(a.xp, 30 * XP.perCorrect + XP.firstClear + XP.high);
  assert.ok(a.first && !b.first);
  assert.equal(b.xp, Math.round(30 * XP.perCorrect * XP.repeatFactor) + XP.repeatClear + XP.high);
  assert.ok(b.xp < a.xp);
  const many = Array.from({ length: 30 }, (_, i) => R(3, { id: 'x' + i, test_id: 'u' + i, correct: 35, percent: 100 }));
  assert.equal(totalXp(many), XP.dailyCap);
  assert.equal(totalXp([]), 0);
});

test('levels grow with xp', () => {
  assert.equal(levelInfo(0).level, 1);
  assert.equal(levelInfo(50).level, 2);
  assert.equal(levelInfo(200).level, 3);
  const l = levelInfo(125);
  assert.equal(l.level, 2); assert.equal(l.into, 75); assert.equal(l.span, 150); assert.equal(l.pct, 50);
});

test('streaks: consecutive days, one forgiven gap, broken when stale', () => {
  const s = streakInfo([R(10), R(11), R(12)], NOW);
  assert.deepEqual([s.current, s.longest, s.doneToday], [3, 3, true]);
  assert.equal(streakInfo([R(8), R(10), R(11)], NOW).current, 3);            // one missed day forgiven
  assert.equal(streakInfo([R(6), R(8), R(10), R(11)], NOW).current, 3);      // second gap is not
  assert.equal(streakInfo([R(1), R(2)], NOW).current, 0);                    // stale
  assert.equal(streakInfo([R(1), R(2)], NOW).longest, 2);
  assert.equal(streakInfo([R(11)], NOW).current, 1);                          // yesterday still counts
  assert.deepEqual(streakInfo([], NOW), { current: 0, longest: 0, doneToday: false });
});

test('daily challenge and weekly goal use real attempts only', () => {
  assert.equal(dailyChallenge([], NOW).done, false);
  const c = dailyChallenge([R(12)], NOW);
  assert.ok(c.title && typeof c.done === 'boolean');
  assert.equal(weekInfo([R(12), R(12, { id: 'q' })], NOW).count, 2);
  assert.equal(weekInfo([R(1)], NOW).count, 0);
});

test('achievements unlock from real activity', () => {
  const none = achievements([], NOW);
  assert.ok(none.every(a => !a.earned));
  const rs = [R(5, { id: 'a', percent: 50 }), R(6, { id: 'b', percent: 90, test_id: 't2' }), R(7, { id: 'c', percent: 88, test_id: 't3' }), R(8, { id: 'd', percent: 91, test_id: 't4' }), R(9, { id: 'e', percent: 40, test_id: 't5' })];
  const got = Object.fromEntries(achievements(rs, NOW).map(a => [a.id, a.earned]));
  assert.equal(got.first, true); assert.equal(got.best, true); assert.equal(got.accuracy, true);
  assert.equal(got.streak7, false); assert.equal(got.reading, false); assert.equal(got.listening, false);
  assert.equal(got.weekly, true); // 5 attempts in Mon 5 – Sun 11 Oct… day 5 is a Monday
});

test('summary and student stats', () => {
  const rs = [R(5, { id: 'a', percent: 40 }), R(6, { id: 'b', percent: 50 }), R(7, { id: 'c', percent: 60 }), R(8, { id: 'd', percent: 90 }), R(9, { id: 'e', student_name: 'Bo' })];
  const sm = progressSummary(rs.filter(r => r.student_name === 'Ana'), NOW);
  assert.equal(sm.attempts, 4); assert.equal(sm.best.id, 'd'); assert.equal(sm.level.level >= 1, true);
  const st = buildStudentStats(rs);
  const ana = st.find(s => s.name === 'Ana'), bo = st.find(s => s.name === 'Bo');
  assert.equal(ana.improvement, Math.round(((50 + 60 + 90) / 3 - (40 + 50 + 60) / 3) * 10) / 10);
  assert.equal(bo.improvement, null);
});

test('typeBreakdown groups graded answers by question type', () => {
  const t = { format: 'multilevel', section: 'reading', data: { parts: [{ blocks: [{ questions: [
    { type: 'tfng', text: 'a', answer: 'True' }, { type: 'tfng', text: 'b', answer: 'False' }, { type: 'mcq', text: 'c', options: [{ label: 'A', text: 'x' }, { label: 'B', text: 'y' }], answer: 'A' }] }] }] } };
  const g = grade(t, { 1: 'True', 2: 'True', 3: 'A' });
  const b = typeBreakdown(t, g.details);
  const tf = b.find(x => x.type === 'tfng');
  assert.deepEqual([tf.correct, tf.total, tf.pct], [1, 2, 50]);
  assert.equal(b[0].type, 'tfng'); // weakest first
});
