// Envia os avisos (Web Push) que já venceram. Quem chama é um agendador do próprio banco (pg_cron + pg_net, a cada poucos minutos)
// com o segredo PUSH_CRON_SECRET: sem ele a função recusa. Passo a passo em docs/avisos-push.md.
//
// Regras: lembrete vencido há mais de 24 h não é enviado (aviso atrasado confunde); aparelho que o serviço de avisos diz que não
// existe mais (404/410) é apagado; falha passageira deixa o lembrete para a próxima rodada; sem aparelho, o lembrete é dado como
// tratado. Os textos já chegam sem valores em reais (o app é quem escreve). Roda com a chave de serviço, por isso só olha o que precisa.
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error('Falta o segredo ' + name);
  return v;
}
const CRON_SECRET = env('PUSH_CRON_SECRET');
const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {auth: {persistSession: false}});
webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

const BATCH = 200;
const STALE_MS = 24 * 3600 * 1000;
const KEEP_SENT_DAYS = 30;

// Comparação que não revela, pelo tempo, quantos caracteres do segredo estão certos.
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({error: 'Use POST.'}, 405);
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!sameSecret(given, CRON_SECRET)) return json({error: 'Não autorizado.'}, 401);

  const now = new Date();
  const {data: due, error} = await supabase.from('push_reminders')
    .select('id, user_id, title, body, url, dedupe_key, fire_at')
    .is('sent_at', null).lte('fire_at', now.toISOString()).order('fire_at').limit(BATCH);
  if (error) return json({error: error.message}, 500);

  const userIds = [...new Set((due ?? []).map((r) => r.user_id))];
  const byUser = new Map<string, {id: string; endpoint: string; p256dh: string; auth: string}[]>();
  if (userIds.length) {
    const {data: subs, error: subsError} = await supabase.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', userIds);
    if (subsError) return json({error: subsError.message}, 500);
    for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  }

  const count = {sent: 0, stale: 0, noDevice: 0, retry: 0, removedDevices: 0};
  for (const r of due ?? []) {
    const devices = byUser.get(r.user_id) ?? [];
    const old = now.getTime() - new Date(r.fire_at).getTime() > STALE_MS;
    let delivered = false, transient = false;
    if (!old) {
      for (const d of devices) {
        try {
          await webpush.sendNotification(
            {endpoint: d.endpoint, keys: {p256dh: d.p256dh, auth: d.auth}},
            JSON.stringify({title: r.title, body: r.body, url: r.url, tag: r.dedupe_key}),
            {TTL: 6 * 3600, urgency: 'normal'},
          );
          delivered = true;
        } catch (e) {
          const code = (e as {statusCode?: number}).statusCode;
          if (code === 404 || code === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', d.id);
            count.removedDevices++;
          } else transient = true;
        }
      }
    }
    if (!delivered && !old && transient) { count.retry++; continue; }   // tenta de novo na próxima rodada
    await supabase.from('push_reminders').update({sent_at: now.toISOString()}).eq('id', r.id);
    if (delivered) count.sent++; else if (old) count.stale++; else count.noDevice++;
  }

  // Limpeza: lembretes enviados há mais de 30 dias.
  const cutoff = new Date(now.getTime() - KEEP_SENT_DAYS * 86400000).toISOString();
  await supabase.from('push_reminders').delete().lt('sent_at', cutoff);
  return json({ok: true, checked: (due ?? []).length, ...count});
});
