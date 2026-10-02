// Terminal de paiement : actions des closeurs (JWT obligatoire).
//   create_plan        crée le plan et l'échéancier
//   create_link        génère le lien sécurisé à envoyer au client (7 jours)
//   attach_card        le closeur entre la carte (jeton temporaire Moneris)
//   retry_subscription relance la création de l'échéancier chez Moneris
//   cancel_plan        annule l'abonnement chez Moneris et les versements à venir

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { attachCard, createPlanSubscription, newLinkToken, sha256 } from '../_shared/terminal.ts'
import { ECI, cancelSubscription } from '../_shared/moneris.ts'
import { FREQUENCY_UNITS, TERMINAL_PRODUCTS, approxDays, buildSchedule, installmentsForProduct, todayMontreal } from '../_shared/schedule.js'

declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Promise<Response> | Response): void }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const LINK_DAYS = 7

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // ── Qui appelle ? ──
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ error: 'Non autorisé' }, 401)
    const { data: { user } } = await db.auth.getUser(jwt)
    if (!user) return json({ error: 'Non autorisé' }, 401)
    const { data: profile } = await db.from('profiles')
      .select('id, full_name, role, secondary_roles').eq('id', user.id).maybeSingle()
    const isManager = ['admin', 'resp_vente'].includes(profile?.role)
    const isCloser = profile?.role === 'closer' || (profile?.secondary_roles ?? []).includes('closer')
    if (!profile || (!isManager && !isCloser)) return json({ error: 'Accès réservé aux closeurs' }, 403)

    const body = await req.json() as Record<string, unknown>
    const action = String(body.action ?? '')

    // Le closeur n'agit que sur ses propres plans
    const loadPlan = async (planId: unknown) => {
      const { data } = await db.from('payment_plans').select('id, closer_id, status, moneris_subscription_id').eq('id', String(planId)).maybeSingle()
      if (!data) return null
      if (!isManager && data.closer_id !== profile.id) return null
      return data
    }

    if (action === 'create_plan') {
      const product = String(body.productName ?? '')
      if (!TERMINAL_PRODUCTS.includes(product)) return json({ error: 'Produit invalide' }, 400)
      const first = String(body.clientFirstName ?? '').trim()
      const last = String(body.clientLastName ?? '').trim()
      const email = String(body.clientEmail ?? '').trim().toLowerCase()
      if (!first || !last) return json({ error: 'Prénom et nom du client requis' }, 400)
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Courriel du client invalide' }, 400)

      const street = String(body.clientStreetName ?? '').trim()
      const postal = String(body.clientPostalCode ?? '').trim().toUpperCase()
      if (!street || !String(body.clientCity ?? '').trim() || !/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/.test(postal)) {
        return json({ error: 'Adresse du client incomplète (rue, ville et code postal valide requis)' }, 400)
      }

      const totalCents = Math.round(Number(body.totalAmount) * 100)
      const count = installmentsForProduct(product)
      const frequencyUnit = String(body.frequencyUnit ?? 'WEEK').toUpperCase()
      const frequencyInterval = count > 1 ? Number(body.frequencyInterval) : 1
      if (count > 1 && !FREQUENCY_UNITS.includes(frequencyUnit)) return json({ error: 'Unité de fréquence invalide' }, 400)
      if (count > 1 && (!Number.isInteger(frequencyInterval) || frequencyInterval < 1 || frequencyInterval > 99)) {
        return json({ error: 'Fréquence invalide' }, 400)
      }
      const today = todayMontreal()
      const payToday = body.payToday !== false
      // Payer aujourd'hui : 1er = aujourd'hui, la date saisie est celle du 2e.
      // Sinon : la date saisie est celle du 1er.
      const chosenDate = String(body.chargeDate ?? '')
      const firstDate = payToday ? today : chosenDate
      const secondDate = payToday && count > 1 ? chosenDate : undefined
      // Moneris n'accepte qu'une date de début future pour l'abonnement
      if (!payToday && firstDate <= today) return json({ error: 'Le 1er prélèvement doit être une date à venir (sinon coche « Payer aujourd’hui »)' }, 400)
      if (payToday && count > 1 && secondDate && secondDate <= today) return json({ error: 'Le 2e prélèvement doit être une date à venir' }, 400)
      // Sans paiement aujourd'hui, tous les versements sont prélevés par Moneris au même montant
      if (!payToday && count > 1 && totalCents % count !== 0) {
        return json({ error: `Sans paiement aujourd’hui, le total doit se diviser également en ${count} versements (ex. ${(Math.floor(totalCents / count) * count / 100).toFixed(2)} $ ou ${((Math.floor(totalCents / count) + 1) * count / 100).toFixed(2)} $)` }, 400)
      }

      let schedule
      try { schedule = buildSchedule({ totalCents, count, frequencyUnit, frequencyInterval, firstDate, secondDate }) }
      catch (e) { return json({ error: (e as Error).message }, 400) }

      // ID client Moneris : « Prénom Nom ». Si déjà pris, on ajoute un « . » à la fin.
      const baseRef = `${first} ${last}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9 '\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Client'
      let customerRef = baseRef
      for (let i = 0; i < 20; i++) {
        const { data: taken } = await db.from('payment_plans').select('id').eq('customer_reference', customerRef).limit(1)
        if (!taken?.length) break
        customerRef += '.'
      }

      const { data: plan, error } = await db.from('payment_plans').insert({
        customer_reference: customerRef,
        closer_id: profile.id, closer_name: profile.full_name ?? user.email,
        client_first_name: first, client_last_name: last, client_email: email,
        client_phone: String(body.clientPhone ?? '').trim() || null,
        client_street_number: String(body.clientStreetNumber ?? '').trim() || null,
        client_street_name: street,
        client_unit: String(body.clientUnit ?? '').trim() || null,
        client_city: String(body.clientCity ?? '').trim(),
        client_province: String(body.clientProvince ?? 'QC').trim().toUpperCase() || 'QC',
        client_postal_code: postal.replace(/^(\w{3})\s?(\w{3})$/, '$1 $2'),
        product_name: product, total_amount_cents: totalCents, installments_count: count,
        frequency_days: count > 1 ? approxDays(frequencyUnit, frequencyInterval) : 1,
        frequency_unit: count > 1 ? frequencyUnit : 'DAY', frequency_interval: frequencyInterval,
        first_charge_date: firstDate,
        notes: String(body.notes ?? '').trim() || null,
      }).select('id').single()
      if (error) throw error

      const { error: e2 } = await db.from('payment_installments').insert(
        schedule.map(s => ({ plan_id: plan.id, number: s.number, amount_cents: s.amountCents, due_date: s.dueDate })),
      )
      if (e2) { await db.from('payment_plans').delete().eq('id', plan.id); throw e2 }
      return json({ planId: plan.id })
    }

    if (action === 'create_link') {
      const plan = await loadPlan(body.planId)
      if (!plan) return json({ error: 'Plan introuvable' }, 404)
      if (!['pending_card', 'card_failed'].includes(plan.status)) return json({ error: 'La carte est déjà enregistrée' }, 400)
      const token = newLinkToken()
      const expiresAt = new Date(Date.now() + LINK_DAYS * 86400_000).toISOString()
      const { error } = await db.from('payment_plan_links').upsert({
        plan_id: plan.id, token_hash: await sha256(token), expires_at: expiresAt, used_at: null, attempts: 0,
      })
      if (error) throw error
      return json({ token, expiresAt })
    }

    if (action === 'attach_card') {
      const plan = await loadPlan(body.planId)
      if (!plan) return json({ error: 'Plan introuvable' }, 404)
      const tempToken = String(body.temporaryToken ?? '')
      if (!tempToken) return json({ error: 'Jeton de carte manquant' }, 400)
      const r = await attachCard(db, plan.id, tempToken, 'closer', ECI.closerPhone)
      return json(r, r.ok ? 200 : 402)
    }

    if (action === 'retry_subscription') {
      const plan = await loadPlan(body.planId)
      if (!plan) return json({ error: 'Plan introuvable' }, 404)
      if (plan.status !== 'active') return json({ error: 'Le plan doit être actif' }, 400)
      const r = await createPlanSubscription(db, plan.id)
      return json(r, r.ok ? 200 : 502)
    }

    if (action === 'cancel_plan') {
      const plan = await loadPlan(body.planId)
      if (!plan) return json({ error: 'Plan introuvable' }, 404)
      if (['completed', 'canceled'].includes(plan.status)) return json({ error: 'Plan déjà terminé ou annulé' }, 400)
      // D'abord chez Moneris : sinon il continuerait à prélever le client
      if (plan.moneris_subscription_id) {
        let c
        try { c = await cancelSubscription(plan.moneris_subscription_id, 'Annulé par NEO') }
        catch (e) { console.error('[cancel_plan]', e); return json({ error: 'Impossible de joindre Moneris. Rien n’a été annulé, réessaie.' }, 502) }
        if (!c.ok && c.status !== 'CANCELED' && c.status !== 'COMPLETED') {
          return json({ error: `Moneris n’a pas annulé l’échéancier (${c.message}). Rien n’a été annulé ici.` }, 502)
        }
      }
      await db.from('payment_installments').update({ status: 'canceled' })
        .eq('plan_id', plan.id).in('status', ['scheduled', 'declined'])
      await db.from('payment_plans').update({
        status: 'canceled', subscription_status: plan.moneris_subscription_id ? 'CANCELED' : null,
        canceled_at: new Date().toISOString(), canceled_by: profile.id, updated_at: new Date().toISOString(),
      }).eq('id', plan.id)
      await db.from('payment_plan_links').delete().eq('plan_id', plan.id)
      return json({ ok: true })
    }

    return json({ error: 'Action inconnue' }, 400)
  } catch (e) {
    console.error('[moneris-terminal]', e)
    return json({ error: 'Erreur serveur' }, 500)
  }
})
