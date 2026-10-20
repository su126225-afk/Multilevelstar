// Supabase Edge Function: AI speaking check (Multilevel new format) through Google Gemini (audio input).
// Secrets: GEMINI_API_KEY (required), GEMINI_MODEL (optional). "Verify JWT" must be OFF.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const FALLBACKS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.1-flash-lite'];

// Max raw score per part, and the final 0-75 conversion (same numbers as js/speaking.js)
const MAX: Record<string, number> = { '1.1': 5, '1.2': 6, '2': 6, '3': 6 };
const levelOf = (n: number) => (n >= 65 ? 'C1' : n >= 51 ? 'B2' : n >= 38 ? 'B1' : 'Below B1');

const SCALE: Record<string, string> = {
  '1.1': `PART 1.1 (target level A1-A2), score 0-5:
5 (B2 or above): on topic; good control of simple grammar, errors only when attempting complex structures; vocabulary sufficient; simple cohesive devices, linear sequence.  (Performance is above B1.)
4 (Higher B1): on topic; good control of simple grammar, errors when attempting complex structures; vocabulary sufficient; simple linking.
3 (Lower B1): partially on topic; same features as 4 but weaker.
2 (A2): may be partially on topic; only simple sentence-level grammar, common errors that sometimes impede understanding; vocabulary insufficient, inappropriate word choices; not organised.
1 (A1 or lower): below A2, substantial use of Uzbek/Russian, memorised script, guessing, or off-topic.
0: no attempt / silence.`,
  '1.2': `PART 1.2 (target level B1), score 0-6. The student describes pictures, gives and justifies opinions.
6 (C2): above C1.
5 (C1): on topic; register consistently appropriate; a range of complex grammar used accurately, minor errors; a range of vocabulary, some awkward usage; a range of cohesive devices.
4 (Higher B2): on topic; register appropriate; some complex grammar used accurately, errors do not lead to misunderstanding; sufficient vocabulary; a limited number of cohesive devices.
3 (Lower B2): partially on topic; same as 4 but register may be inconsistent.
2 (B1): partially on topic; good control of simple grammar, errors with complex structures; vocabulary sufficient; simple cohesive devices, linear sequence.
1 (A2): simple sentence-level grammar, common errors sometimes impede understanding; insufficient vocabulary; not cohesive.
0: no meaningful language, substantial L1, off-topic, memorised, or no attempt.`,
  '2': `PART 2 (target level B2), score 0-6. Abstract topic, opinions, advantages and disadvantages, stance with reasons.
6 (C2): above C1.
5 (C1): fully addresses the question with clear stance and relevant arguments; a range of complex grammar used accurately; a range of vocabulary, some awkward usage; well-structured, smooth flow, linking expressions.
4 (Higher B2): addresses the question clearly, minor digressions, stance evident; some complex grammar accurate; sufficient vocabulary; clear structure with some connectors.
3 (Lower B2): mostly relevant but stance may be unclear or minor off-topic parts; some complex grammar accurate; sufficient vocabulary; some organisation, transitions unclear or mechanical.
2 (B1): mostly relevant, stance may be unclear; good control of simple grammar only; vocabulary choices sometimes cause misunderstanding; simple cohesive devices.
1 (A2): limited focus, ideas unclear or off-topic; simple sentence-level grammar with frequent errors; insufficient vocabulary; not cohesive.
0: no meaningful language, substantial L1, off-topic, memorised, or no attempt.`,
  '3': `PART 3 (target level C1), score 0-6. The student must analyse BOTH sides of the argument (for and against), choosing two items from each list, and give a balanced argument for 2 minutes. Use the same band descriptors as Part 2 (5 = C1: fully addresses both sides with clear, relevant, well-developed arguments, wide range of accurate complex grammar and vocabulary, well-structured with smooth linking; 4 = higher B2; 3 = lower B2; 2 = B1; 1 = A2; 0 = nothing). If only one side is discussed, or the lists are ignored, cap the score at 3.`,
};

type Seg = { part: string; label: string; question: string; mime: string; data: string; secs: number };

async function gemini(model: string, key: string, parts: unknown[]) {
  return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }),
  });
}

const audioMime = (m: string) => {
  const x = String(m || '').toLowerCase();
  if (x.includes('mp4') || x.includes('m4a') || x.includes('aac')) return 'audio/m4a';
  if (x.includes('ogg')) return 'audio/ogg';
  return 'audio/webm';
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { test_title, group, segments } = await req.json() as { test_title: string; group: string; segments: Seg[] };
    if (!Array.isArray(segments) || !segments.length) return json({ error: 'No recordings received.' }, 400);
    if (segments.length > 12) return json({ error: 'Too many recordings.' }, 400);
    const total = segments.reduce((a, s) => a + (s.data?.length || 0), 0);
    if (total > 12_000_000) return json({ error: 'Recordings are too large. Please try again.' }, 413);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: gname } = await sb.rpc('check_group', { c: String(group || '') });
    if (!gname) return json({ error: 'Invalid group code.' }, 403);
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json({ error: 'GEMINI_API_KEY is not set on the server.' }, 500);

    const present = [...new Set(segments.map(s => s.part))].filter(p => MAX[p]);
    const head = `You are an experienced, strict but fair examiner of the Uzbekistan Multilevel (CEFR) Speaking exam (new format), and a kind English teacher for Uzbek learners.
You will receive the student's recorded answers, one audio clip per question, each introduced by a text label with the exact question. Listen to every clip, transcribe what the student actually said (do not invent or fix words), and score each PART using ONLY the official scale below.
Judge: task relevance and stance, grammar range and accuracy, vocabulary range and appropriateness, organisation and linking (fluency, hesitation, length of the answer compared with the available time), and how easy the speech is to understand (accent is not penalised unless it impedes understanding). Ignore spelling and punctuation (this is speech).
A clip marked [NO ANSWER] is silence: if every clip of a part is empty, that part scores 0. Very short answers (a few words) must score low. Memorised scripts or answers in Uzbek/Russian score 1 or 0.

${present.map(p => SCALE[p]).join('\n\n')}

Reply with JSON only, in exactly this shape:
{
 "parts": [
  { "part": "1.1", "score": <integer within that part's range>, "cefr": "<A2|B1|B2|C1 ...>",
    "transcript": [ { "q": "<the question>", "said": "<what the student said, verbatim>" } ],
    "comment": "<2-3 sentences, plain English, specific to this part>",
    "strengths": ["..."], "improvements": ["... (most important first, max 4)"],
    "corrections": [ { "original": "<exact words the student said>", "better": "<corrected version>", "why": "<short reason>" } ] }
 ],
 "summary": "<2-3 sentences overall, plain English>",
 "uzbek_tip": "<one short, motivating tip in Uzbek>"
}
Include one entry in "parts" for each of these parts, in order: ${present.join(', ')}. Give 2-6 corrections per part, quoting real words. Never invent speech.`;

    const parts: unknown[] = [{ text: head }];
    for (const s of segments) {
      const q = String(s.question || '').slice(0, 800);
      const empty = !s.data || s.data.length < 2000 || (s.secs || 0) < 2;
      parts.push({ text: `--- Part ${s.part} · ${String(s.label || '').slice(0, 80)} · question: "${q}" · recorded ${Math.round(s.secs || 0)} s ${empty ? '[NO ANSWER]' : ''}` });
      if (!empty) parts.push({ inlineData: { mimeType: audioMime(s.mime), data: s.data } });
    }

    const models = [Deno.env.get('GEMINI_MODEL'), ...FALLBACKS].filter(Boolean) as string[];
    let last = 'No model answered';
    for (const m of [...new Set(models)]) {
      const r = await gemini(m, key, parts);
      if (!r.ok) { last = `${m}: ${r.status}`; if ([404, 429, 500, 503].includes(r.status)) continue; break; }
      const j = await r.json();
      const raw = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
      try {
        const fb = JSON.parse(raw.replace(/^```json\s*|```$/g, ''));
        // compute the 0-75 score ourselves (never trust the model's arithmetic)
        const scores: Record<string, number> = {};
        for (const p of fb.parts || []) {
          const k = String(p.part);
          if (!MAX[k]) continue;
          p.score = Math.min(MAX[k], Math.max(0, Math.round(Number(p.score) || 0)));
          p.max = MAX[k];
          scores[k] = p.score;
        }
        const maxSum = present.reduce((a, k) => a + MAX[k], 0);
        const got = present.reduce((a, k) => a + (scores[k] || 0), 0);
        fb.total = maxSum ? Math.round(got / maxSum * 75) : 0;
        fb.level = levelOf(fb.total);
        fb.raw = `${got}/${maxSum}`;
        return json({ feedback: fb, model: m });
      } catch { last = `${m}: unreadable reply`; }
    }
    return json({ error: 'AI is busy right now. Please try again in a minute. (' + last + ')' }, 502);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
