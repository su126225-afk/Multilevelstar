// Supabase Edge Function: AI writing check through Google Gemini.
// Secrets (Edge Functions → Secrets): GEMINI_API_KEY (required), GEMINI_MODEL (optional).
// The API key never reaches the browser.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const FALLBACKS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.1-flash-lite'];

const RUBRIC: Record<string, string> = {
  task1: `IELTS Academic Writing Task 1 (report on a chart/graph/table/process/map). Score with the four official criteria, each 0-9 in half-bands: "Task Achievement", "Coherence and Cohesion", "Lexical Resource", "Grammatical Range and Accuracy". Overall band = average rounded to nearest 0.5.`,
  task2: `IELTS Writing Task 2 (essay). Score with the four official criteria, each 0-9 in half-bands: "Task Response", "Coherence and Cohesion", "Lexical Resource", "Grammatical Range and Accuracy". Overall band = average rounded to nearest 0.5.`,
  multilevel: `Uzbekistan Multilevel (CEFR) Writing. Give each criterion a CEFR level (A2, B1, B2, C1) and an overall CEFR level. Criteria: "Task Achievement", "Coherence and Cohesion", "Lexical Resource", "Grammatical Range and Accuracy".`,
};


// Official Multilevel writing rating scales (per task): used for kind "multilevel"
const W_MAX: Record<string, number> = { '1.1': 5, '1.2': 6, '2': 6 };
const W_SCALE: Record<string, string> = {
  '1.1': `TASK 1.1 official scale, score 0-5:
5 (B2 or above): above B1. On topic.
4 (Higher B1): on topic; good control of simple grammar, errors when attempting complex structures; punctuation and spelling mostly accurate; vocabulary sufficient; simple cohesive devices, linear sequence; register may not be consistently appropriate.
3 (Lower B1): partially on topic; same features as 4 but weaker.
2 (A2): may be partially on topic; simple sentence-level grammar, common errors sometimes impede understanding; noticeable spelling/punctuation mistakes; insufficient vocabulary; not cohesive.
1 (A1 or lower): below A2, substantial use of L1, memorised script, guessing or off-topic.
0: no attempt.`,
  '1.2': `TASK 1.2 official scale, score 0-6:
6 (C2): above C1.
5 (C1): on topic; register consistently appropriate; a range of complex grammar used accurately, minor errors; no errors in spelling and punctuation; a range of vocabulary, some awkward usage; a range of cohesive devices.
4 (Higher B2): on topic; register consistently appropriate; some complex grammar accurate; minor spelling/punctuation errors; sufficient vocabulary; limited number of cohesive devices.
3 (Lower B2): partially on topic; same as 4 but register may be inconsistent.
2 (B1): partially on topic; good control of simple grammar, errors with complex structures; spelling/punctuation mostly accurate; vocabulary sufficient; simple cohesive devices.
1 (A2): no evidence of awareness of register; simple sentence-level grammar, common errors; noticeable spelling mistakes; insufficient vocabulary; not cohesive.
0: no meaningful language, substantial L1, off-topic, memorised or no attempt.`,
  '2': `TASK 2 official scale, score 0-6:
6 (C2): above C1.
5 (C1): fully addresses the question with clear stance and relevant arguments; a range of complex grammar accurate; a range of vocabulary, some awkward usage; well-structured with clear paragraphs, smooth flow, linking expressions.
4 (Higher B2): addresses the question clearly with minor digressions, stance evident; some complex grammar accurate; sufficient vocabulary; clear structure with some connectors and logical flow.
3 (Lower B2): mostly relevant but stance may be unclear or minor off-topic parts; some complex grammar accurate; some organisation, transitions unclear or mechanical.
2 (B1): mostly relevant, stance may be unclear; good control of simple grammar only; some lexical choices cause misunderstanding; simple cohesive devices.
1 (A2): limited focus, ideas unclear or partly off-topic; simple sentence-level grammar with common errors; insufficient vocabulary; not cohesive.
0: no meaningful language, substantial L1, off-topic, memorised or no attempt.`,
};

async function gemini(model: string, key: string, prompt: string) {
  return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
    }),
  });
}

const body0 = (t: unknown) => String(t || '').trim().split(/\s+/).filter(Boolean).length;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { kind, prompt, text, group, min_words, max_words, part } = await req.json();
    const minW = Number(min_words) || 0, maxW = Number(max_words) || 0;
    const words = body0(text);
    if (!RUBRIC[kind]) return json({ error: 'Unknown writing type' }, 400);
    const body = String(text || '').trim();
    if (body.split(/\s+/).length < 20) return json({ error: 'Write at least 20 words first.' }, 400);
    if (body.length > 12000) return json({ error: 'Text is too long (max 12,000 characters).' }, 400);

    // Only students of a real group may use the AI (protects your free quota)
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: gname } = await sb.rpc('check_group', { c: String(group || '') });
    if (!gname) return json({ error: 'Invalid group code.' }, 403);

    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json({ error: 'GEMINI_API_KEY is not set on the server.' }, 500);

    const instructions = `You are a strict, fair, encouraging examiner and English teacher for Uzbek learners.
${RUBRIC[kind]}
${kind === 'multilevel' && W_SCALE[String(part)] ? `\nUse THIS official scale to decide the overall score of this task. Set "overall" to "<score>/${W_MAX[String(part)]} (<CEFR level>)" and give each criterion a CEFR level:\n${W_SCALE[String(part)]}\n` : ''}
TASK GIVEN TO THE STUDENT:
"""${String(prompt || '').slice(0, 3000)}"""
REQUIRED LENGTH: ${minW ? (maxW ? `${minW}-${maxW} words` : `at least ${minW} words`) : 'not specified'}. The student wrote ${words} words.
If the answer is shorter than the minimum or longer than the maximum, say so clearly and lower Task Achievement / the overall score accordingly (a few words over is a small issue; far over or under is a real penalty, as in the real exam).
STUDENT'S ANSWER:
"""${body}"""

Reply with JSON only, in exactly this shape:
{
 "overall": "<band like 6.5, or CEFR level like B2>",
 "summary": "<2-3 sentences, plain English>",
 "criteria": [{"name": "...", "score": "<band or level>", "comment": "<1-2 sentences, specific>"}],
 "strengths": ["..."],
 "improvements": ["... (most important first, max 5)"],
 "corrections": [{"original": "<exact words from the student's text>", "better": "<corrected words>", "type": "<grammar|spelling|vocabulary|punctuation|style>", "why": "<short reason>"}],
 "improved_version": "<a better version of the student's first paragraph only>",
 "sample_b2": "<a complete model answer for THIS task written at a solid B2 level (clear, accurate, some complex grammar), inside the word limit>",
 "sample_c1": "<a complete model answer for THIS task written at C1 level (wide range of vocabulary, complex structures, smooth linking, consistent register), inside the word limit>",
 "uzbek_tip": "<one short, motivating tip written in Uzbek>"
}
Mark EVERY real mistake, in the order it appears in the text (up to 30 corrections). 'original' must be the shortest wrong span (1-5 words) copied CHARACTER FOR CHARACTER from the student's text, and 'better' the corrected span; give each one a 'type'. Never mark something that is correct. Do not invent text the student did not write. Mention if the answer is under the word limit or off-topic.`;

    const models = [Deno.env.get('GEMINI_MODEL'), ...FALLBACKS].filter(Boolean) as string[];
    let last = 'No model answered';
    for (const m of [...new Set(models)]) {
      const r = await gemini(m, key, instructions);
      if (!r.ok) { last = `${m}: ${r.status}`; if ([404, 429, 500, 503].includes(r.status)) continue; break; }
      const j = await r.json();
      const raw = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
      try {
        const fb = JSON.parse(raw.replace(/^```json\s*|```$/g, ''));
        return json({ feedback: fb, model: m });
      } catch { last = `${m}: unreadable reply`; }
    }
    return json({ error: 'AI is busy right now. Please try again in a minute. (' + last + ')' }, 502);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
