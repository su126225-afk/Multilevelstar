// Supabase Edge Function: Telegram login + channel-membership check.
// Secrets (Edge Functions → Secrets): TELEGRAM_BOT_TOKEN (required), TELEGRAM_CHANNEL (e.g. @EnglishwithUsmonov).
// The bot token never reaches the browser. "Verify JWT" must be OFF for this function.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

// Telegram Login Widget check: hash = HMAC_SHA256(data_check_string, key = SHA256(bot_token))
async function validLogin(u: Record<string, unknown>, token: string) {
  const { hash, ...rest } = u;
  if (!hash) return false;
  const str = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join('\n');
  const key = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode(token)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = hex(await crypto.subtle.sign('HMAC', key, enc.encode(str)));
  return sig === String(hash).toLowerCase();
}

async function isMember(token: string, chat: string, id: number) {
  const r = await fetch(`https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(chat)}&user_id=${id}`);
  const d = await r.json();
  if (!d.ok) {
    // "user not found" / "participant not found" simply means: not a member
    if (/user not found|participant|PARTICIPANT/i.test(String(d.description))) return false;
    throw new Error('Telegram: ' + d.description + ' (is the bot an admin of the channel?)');
  }
  const s = d.result?.status;
  return s === 'creator' || s === 'administrator' || s === 'member' || (s === 'restricted' && d.result?.is_member === true);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chat = Deno.env.get('TELEGRAM_CHANNEL') || '@EnglishwithUsmonov';
    if (!token) return json({ error: 'TELEGRAM_BOT_TOKEN secret is not set' }, 500);
    const body = await req.json();

    if (body.mode === 'recheck') {            // already logged in: is the user still subscribed?
      const id = Number(body.id);
      if (!id) return json({ error: 'Bad request' }, 400);
      return json({ member: await isMember(token, chat, id) });
    }

    const u = body.user || {};
    if (!(await validLogin(u, token))) return json({ error: 'Telegram login could not be verified. Try again.' }, 401);
    if (Date.now() / 1000 - Number(u.auth_date) > 86400) return json({ error: 'Login expired. Press the Telegram button again.' }, 401);
    const id = Number(u.id);
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ');
    return json({ id, name, username: u.username || '', member: await isMember(token, chat, id) });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
