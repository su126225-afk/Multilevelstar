// Multilevel Speaking (new format) — pure logic: structure, timings, score conversion.
export const PARTS = {
  '1.1': { label: 'Part 1.1', max: 5, level: 'A1–A2' },
  '1.2': { label: 'Part 1.2', max: 6, level: 'B1' },
  '2':   { label: 'Part 2',   max: 6, level: 'B2' },
  '3':   { label: 'Part 3',   max: 6, level: 'C1' },
};
export const PART_KEYS = Object.keys(PARTS);

export const INTRO = {
  '1.1': "In this part, I'm going to ask you three short questions about yourself and your interests. And then, you will see some photos and answer some questions about them. You will have 30 seconds to reply to each question. Begin speaking when you hear this sound.",
  '1.2': 'Now look at the pictures. You will hear three questions about them. For the first question you will have ten seconds to think and forty-five seconds to answer. For the other questions you will have thirty seconds. Begin speaking when you hear this sound.',
  '2': "In this part, I'm going to show you a picture and ask you three questions. You will have one minute to think about your answers before you start speaking. You will have two minutes to answer all three questions. Begin speaking when you hear this sound.",
  '3': 'In this part, you are going to speak on a topic for two minutes. You can see the topic on the screen and two lists of points, for and against, related to the topic. Choose two items from each list and give a balanced argument to represent both sides of the topic. You have one minute to prepare your argument. You will then have two minutes to speak. Begin speaking when you hear this sound.',
};

const lines = v => (Array.isArray(v) ? v : String(v || '').split('\n')).map(s => String(s).trim()).filter(Boolean);
export const linesOf = lines;

/** Turns a test's data into the ordered list of steps the runner plays. */
export function buildSteps(d) {
  const steps = [];
  const q11 = lines(d.p11?.questions), q12 = lines(d.p12?.questions), q2 = lines(d.p2?.questions);
  if (q11.length) {
    steps.push({ kind: 'intro', part: '1.1', text: INTRO['1.1'] });
    q11.forEach((text, i) => steps.push({ kind: 'q', part: '1.1', n: i + 1, of: q11.length, text, think: 0, speak: 30 }));
  }
  if (q12.length) {
    steps.push({ kind: 'intro', part: '1.2', text: INTRO['1.2'] });
    q12.forEach((text, i) => steps.push({ kind: 'q', part: '1.2', n: i + 1, of: q12.length, text, images: lines(d.p12?.images), think: i === 0 ? 10 : 0, speak: i === 0 ? 45 : 30 }));
  }
  if (q2.length) {
    steps.push({ kind: 'intro', part: '2', text: INTRO['2'] });
    steps.push({ kind: 'long', part: '2', questions: q2, image: d.p2?.image || '', think: 60, speak: 120 });
  }
  if (d.p3?.title) {
    steps.push({ kind: 'intro', part: '3', text: INTRO['3'] });
    steps.push({ kind: 'long', part: '3', title: d.p3.title, pros: lines(d.p3.pros), cons: lines(d.p3.cons), think: 60, speak: 120 });
  }
  return steps;
}

/** Spoken text for a step (what the browser voice reads aloud). */
export const sayText = s => s.kind === 'intro' ? s.text : s.kind === 'q' ? s.text : s.part === '2' ? s.questions.join(' ') : s.title;

/** Part scores {'1.1':4,...} → {total (0-75), level}. Only parts that exist in the test count. */
export function toScore75(scores, present = PART_KEYS) {
  const keys = present.filter(k => PARTS[k]);
  const max = keys.reduce((a, k) => a + PARTS[k].max, 0);
  const got = keys.reduce((a, k) => a + Math.min(PARTS[k].max, Math.max(0, Number(scores[k]) || 0)), 0);
  const total = max ? Math.round(got / max * 75) : 0;
  return { total, got, max, level: levelOf75(total) };
}
export const levelOf75 = n => n >= 65 ? 'C1' : n >= 51 ? 'B2' : n >= 38 ? 'B1' : 'Below B1';

export const hasAnswer = seg => !!seg && seg.size > 1500 && seg.secs >= 2;
