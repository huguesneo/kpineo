// Réception des notifications de Moneris (paiement d'un abonnement) et
// passage quotidien de synchronisation (pg_cron). Déployée SANS vérification JWT,
// protégée par le secret MONERIS_CRON_SECRET (paramètre ?s= ou en-tête x-cron-secret).
//
// On ne se fie pas au contenu de la notification : à chaque appel, on relit
// les abonnements actifs chez Moneris et on met à jour les versements
// (payé, refusé), les reçus QuickBooks et les alertes Slack.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { syncAllPlans } from '../_shared/terminal.ts'

declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Promise<Response> | Response): void }

Deno.serve(async (req) => {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

  const secret = Deno.env.get('MONERIS_CRON_SECRET')
  const given = new URL(req.url).searchParams.get('s') ?? req.headers.get('x-cron-secret')
  if (!secret || given !== secret) return json({ error: 'Non autorisé' }, 401)

  let event = ''
  try { event = String((await req.json() as Record<string, unknown>).eventType ?? '') } catch { /* appel du cron, sans corps */ }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  try {
    const r = await syncAllPlans(db)
    console.log('[moneris-webhook]', event || 'cron', JSON.stringify(r))
    return json({ ok: true, ...r })
  } catch (e) {
    console.error('[moneris-webhook]', e)
    // 200 quand même : Moneris ne doit pas réessayer en boucle, le passage quotidien rattrape
    return json({ ok: false })
  }
})
