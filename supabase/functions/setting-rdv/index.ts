// RDV découverte réservé (webhook APP-03 → ghl-webhook → ghl_appointments) :
// appelée par le déclencheur setting_rdv_reserve (migration 20261016b) dès que
// la ligne du RDV arrive. Ferme les rappels du contact et leurs tâches, retire
// le tag rappel-manuel et vide date_rappel dans GHL (interrupteur appliqué).
// Déployée sans vérification JWT : elle ne fait rien si le contact n'a pas de
// RDV découverte à venir dans ghl_appointments (vérifié en base).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cloreRappelsApresRdv } from '../_shared/settingGhl.ts'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Promise<Response> | Response): void
}

Deno.serve(async (req) => {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
  try {
    const body = await req.json().catch(() => ({})) as { contactId?: string }
    const contactId = String(body.contactId ?? '').trim()
    if (!/^[A-Za-z0-9]{10,40}$/.test(contactId)) return json({ error: 'contactId invalide' }, 400)
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const r = await cloreRappelsApresRdv(db, contactId)
    console.log('[setting-rdv]', contactId, JSON.stringify(r))
    return json({ ok: true, ...r })
  } catch (err) {
    console.error('[setting-rdv]', err)
    return json({ error: (err as Error).message }, 500)
  }
})
