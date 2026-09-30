// Page publique /payer/:token : le client entre lui-même sa carte.
// Déployée SANS vérification JWT : l'accès est contrôlé par le jeton du lien
// (aléatoire, 7 jours, usage unique, seul son hash est stocké).
//   get     résumé du plan (prénom, produit, échéancier)
//   submit  enregistre la carte (jeton temporaire Moneris) et prélève si dû

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { attachCard, sha256 } from '../_shared/terminal.ts'
import { ECI } from '../_shared/moneris.ts'

declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Promise<Response> | Response): void }

const MAX_LINK_ATTEMPTS = 5

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json() as Record<string, unknown>
    const token = String(body.token ?? '')
    if (token.length < 20) return json({ error: 'Lien invalide' }, 404)

    const { data: link } = await db.from('payment_plan_links')
      .select('plan_id, expires_at, used_at, attempts').eq('token_hash', await sha256(token)).maybeSingle()
    if (!link || link.used_at || new Date(link.expires_at) < new Date()) {
      return json({ error: 'Ce lien est expiré ou a déjà été utilisé. Contacte ton conseiller NEO.' }, 404)
    }

    const { data: plan } = await db.from('payment_plans')
      .select('id, status, client_first_name, product_name, total_amount_cents, installments_count')
      .eq('id', link.plan_id).maybeSingle()
    if (!plan || !['pending_card', 'card_failed'].includes(plan.status)) {
      return json({ error: 'Ce lien n’est plus actif. Contacte ton conseiller NEO.' }, 404)
    }

    if (body.action === 'get') {
      const { data: inst } = await db.from('payment_installments')
        .select('number, amount_cents, due_date').eq('plan_id', plan.id).order('number')
      return json({
        firstName: plan.client_first_name,
        productName: plan.product_name,
        totalCents: plan.total_amount_cents,
        installments: inst ?? [],
      })
    }

    if (body.action === 'submit') {
      const tempToken = String(body.temporaryToken ?? '')
      if (!tempToken) return json({ error: 'Carte manquante' }, 400)
      if ((link.attempts ?? 0) >= MAX_LINK_ATTEMPTS) {
        return json({ error: 'Trop d’essais avec ce lien. Contacte ton conseiller NEO pour en recevoir un nouveau.' }, 429)
      }
      await db.from('payment_plan_links').update({ attempts: (link.attempts ?? 0) + 1 }).eq('plan_id', plan.id)
      const r = await attachCard(db, plan.id, tempToken, 'client_link', ECI.clientLink)
      if (r.ok) await db.from('payment_plan_links').update({ used_at: new Date().toISOString() }).eq('plan_id', plan.id)
      return json(r, r.ok ? 200 : 402)
    }

    return json({ error: 'Action inconnue' }, 400)
  } catch (e) {
    console.error('[moneris-pay-link]', e)
    return json({ error: 'Erreur serveur' }, 500)
  }
})
