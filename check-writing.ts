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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { kind, prompt, text, group } = await req.json();
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
TASK GIVEN TO THE STUDENT:
"""${String(prompt || '').slice(0, 3000)}"""
STUDENT'S ANSWER:
"""${body}"""

Reply with JSON only, in exactly this shape:
{
 "overall": "<band like 6.5, or CEFR level like B2>",
 "summary": "<2-3 sentences, plain English>",
 "criteria": [{"name": "...", "score": "<band or level>", "comment": "<1-2 sentences, specific>"}],
 "strengths": ["..."],
 "improvements": ["... (most important first, max 5)"],
 "corrections": [{"original": "<exact phrase from the student's text>", "better": "<corrected phrase>", "why": "<short reason>"}],
 "improved_version": "<a better version of the student's first paragraph only>",
 "uzbek_tip": "<one short, motivating tip written in Uzbek>"
}
Give 5-10 corrections that quote the student's real text. Do not invent text the student did not write. Mention if the answer is under the word limit or off-topic.`;

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
