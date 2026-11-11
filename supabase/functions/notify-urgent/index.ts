// Edge Function: posts new URGENT tickets to Slack (or any incoming-webhook URL).
// Triggered by a Database Webhook on INSERT into public.tickets. See README → "Urgent ticket alerts".
//
// Secrets:  npx supabase secrets set WEBHOOK_SECRET=... SLACK_WEBHOOK_URL=... APP_URL=https://...

interface TicketRecord {
  id: number;
  subject: string;
  priority: string;
  created_by: string;
}

interface DatabaseWebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: TicketRecord | null;
  old_record: TicketRecord | null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Constant-time comparison, so the secret can't be guessed byte by byte from response timing. */
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('WEBHOOK_SECRET');
  if (!secret || !safeEqual(req.headers.get('x-webhook-secret') ?? '', secret)) {
    return json({ error: 'unauthorized' }, 401);
  }

  let payload: DatabaseWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }

  const ticket = payload.record;
  if (payload.type !== 'INSERT' || payload.table !== 'tickets' || !ticket) {
    return json({ skipped: 'not a new ticket' });
  }
  if (ticket.priority !== 'urgent') {
    return json({ skipped: 'not urgent' });
  }

  const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:4200';
  const text = `:rotating_light: Urgent ticket #${ticket.id}: ${ticket.subject}\n${appUrl}/tickets/${ticket.id}`;

  const slackUrl = Deno.env.get('SLACK_WEBHOOK_URL');
  if (!slackUrl) {
    console.log('[notify-urgent] SLACK_WEBHOOK_URL not set; would have posted:', text);
    return json({ logged: true });
  }

  const response = await fetch(slackUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    // Logged with the status so it shows up in the function's log explorer when someone asks "why no alert?".
    console.error('[notify-urgent] Slack returned', response.status, await response.text());
    return json({ error: 'notification failed' }, 502);
  }
  return json({ notified: true });
});
