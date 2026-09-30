// Prélèvement quotidien des versements dus (appelée par pg_cron).
// Déployée SANS vérification JWT, protégée par l'en-tête x-cron-secret
// (secret MONERIS_CRON_SECRET).
//
// Prend : versements « scheduled » dont la date est arrivée, et versements
// « declined » dont la date de nouvel essai est arrivée (max 3 essais).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { chargeInstallment, notifySlack, MAX_ATTEMPTS } from '../_shared/terminal.ts'
import { todayMontreal } from '../_shared/schedule.js'

declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Promise<Response> | Response): void }

Deno.serve(async (req) => {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

  const secret = Deno.env.get('MONERIS_CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Non autorisé' }, 401)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const today = todayMontreal()

  const { data: due } = await db.from('payment_installments')
    .select('id, status, attempts, due_date, next_retry_date, payment_plans!inner(status)')
    .eq('payment_plans.status', 'active')
    .or(`and(status.eq.scheduled,due_date.lte.${today}),and(status.eq.declined,next_retry_date.lte.${today},attempts.lt.${MAX_ATTEMPTS})`)
    .order('due_date')
    .limit(200)

  const results = { total: due?.length ?? 0, paid: 0, declined: 0, errors: 0 }
  for (const inst of due ?? []) {
    const r = await chargeInstallment(db, inst.id)
    if (r.ok) results.paid++
    else if (r.message.startsWith('Refusé')) results.declined++
    else results.errors++
  }

  // Versements restés en « processing » plus de 2 h : à vérifier à la main
  const { data: stuck } = await db.from('payment_installments')
    .select('id').eq('status', 'processing')
    .lt('last_attempt_at', new Date(Date.now() - 2 * 3600_000).toISOString())
  if (stuck?.length) {
    await notifySlack(`⚠️ ${stuck.length} versement(s) bloqué(s) en traitement depuis plus de 2 h. Vérifier dans le portail Moneris avant toute relance.`)
  }

  console.log('[moneris-charge-due]', today, JSON.stringify(results))
  return json({ date: today, ...results })
})
