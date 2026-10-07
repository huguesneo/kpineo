// Terminal de paiement : actions des closeurs (JWT obligatoire).
//   create_plan        crée le plan et l'échéancier
//   create_link        génère le lien sécurisé à envoyer au client (7 jours)
//   attach_card        le closeur entre la carte (jeton temporaire Moneris)
//   retry_subscription relance la création de l'échéancier chez Moneris
//   attribution        listes closeur / setter / naturopathe + préremplissage GHL (lecture seule)
//   stop_payments      annule les prochains prélèvements chez Moneris, le client reste dans son programme
//   cancel_plan        annule l'abonnement chez Moneris et les versements à venir (programme annulé)
//   remove_plan        retire une vente saisie par erreur (0 $ encaissé) : cachée, jamais effacée

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { attachCard, createPlanSubscription, newLinkToken, sha256 } from '../_shared/terminal.ts'
import { ECI, cancelSubscription } from '../_shared/moneris.ts'
import { addTagByEmail, lookupAttribution } from '../_shared/ghl.ts'
import {
  attributionLists, cancelChoices, isSupervisorEmail, matchByFirstName, resolveAttribution,
} from '../_shared/terminalAttribution.js'
import { FREQUENCY_UNITS, TERMINAL_PRODUCTS, approxDays, buildSaleSchedule, installmentsForProduct, priceSale, todayMontreal } from '../_shared/schedule.js'

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
    // Superviseurs du terminal (hugues@, info@) : voient toutes les ventes, choisissent le closeur,
    // annulent les paiements ou un programme
    const isSupervisor = isSupervisorEmail(user.email)
    const isManager = isSupervisor || ['admin', 'resp_vente'].includes(profile?.role)
    const isCloser = profile?.role === 'closer' || (profile?.secondary_roles ?? []).includes('closer')
    if (!isSupervisor && (!profile || (!isManager && !isCloser))) return json({ error: 'Accès réservé aux closeurs' }, 403)

    const body = await req.json() as Record<string, unknown>
    const action = String(body.action ?? '')

    // Le closeur n'agit que sur ses propres plans. Une vente retirée n'existe plus pour le terminal.
    const loadPlan = async (planId: unknown) => {
      const { data } = await db.from('payment_plans').select('*, payment_installments(*)').eq('id', String(planId)).maybeSingle()
      if (!data || data.removed_at) return null
      if (!isManager && data.closer_id !== profile?.id) return null
      return data
    }
    const loadLists = async () => {
      const { data } = await db.from('profiles').select('id, full_name, role, secondary_roles, is_active')
      return attributionLists(data ?? [])
    }
    // Choix du bouton « Annuler » permis pour cette personne et cette vente
    // deno-lint-ignore no-explicit-any
    const choiceRefused = (plan: any, key: string): string | null => {
      const c = cancelChoices(plan, { isSupervisor, profileId: profile?.id }).find(x => x.key === key)
      if (!c?.visible) return 'Tu n’as pas accès à ce choix pour cette vente'
      return c.enabled ? null : c.reason
    }
    // Annule l'abonnement Moneris. Retourne un message d'erreur, ou null si c'est fait (ou déjà fini).
    const stopAtMoneris = async (subscriptionId: string): Promise<string | null> => {
      let c
      try { c = await cancelSubscription(subscriptionId, 'Annulé par NEO') }
      catch (e) { console.error('[stopAtMoneris]', e); return 'Impossible de joindre Moneris. Rien n’a été annulé, réessaie.' }
      if (!c.ok && c.status !== 'CANCELED' && c.status !== 'COMPLETED') {
        return `Moneris n’a pas annulé l’échéancier (${c.message}). Rien n’a été annulé ici.`
      }
      return null
    }

    if (action === 'attribution') {
      const lists = await loadLists()
      const self = { id: profile?.id ?? null, name: profile?.full_name ?? user.email }
      const email = String(body.clientEmail ?? '').trim().toLowerCase()
      const found = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? await lookupAttribution(db, email)
        : { closer: null, setter: null, therapist: null }
      const prefill = {
        closerId: isSupervisor ? (matchByFirstName(lists.closers, found.closer) ?? '') : (self.id ?? ''),
        setterId: matchByFirstName(lists.setters, found.setter) ?? '',
        therapistId: matchByFirstName(lists.therapists, found.therapist) ?? '',
      }
      return json({ lists, canChooseCloser: isSupervisor, self, prefill, found })
    }

    if (action === 'create_plan') {
      if (!profile) return json({ error: 'Ton compte n’a pas de profil dans l’app : impossible de créer une vente' }, 403)
      const product = String(body.productName ?? '')
      if (!TERMINAL_PRODUCTS.includes(product)) return json({ error: 'Produit invalide' }, 400)
      const first = String(body.clientFirstName ?? '').trim()
      const last = String(body.clientLastName ?? '').trim()
      const email = String(body.clientEmail ?? '').trim().toLowerCase()
      if (!first || !last) return json({ error: 'Prénom et nom du client requis' }, 400)
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Courriel du client invalide' }, 400)

      // Closeur, setter, naturopathe : obligatoires pour tous. Seuls hugues@ et info@ choisissent le closeur.
      // TRANSITION (à retirer dès que le hub avec les trois menus est en ligne) : l'ancien hub n'envoie
      // aucun des trois champs ; on garde alors l'ancien comportement (closeur = personne connectée,
      // setter et naturopathe lus dans GHL au 1er reçu).
      const legacyClient = body.closerId === undefined && body.setterId === undefined && body.therapistId === undefined
      const who: {
        error?: string; closerId: string; closerName: string
        setterId: string | null; setterName: string | null; therapistId: string | null; therapistName: string | null
      } = legacyClient
        ? { closerId: profile.id, closerName: profile.full_name ?? user.email, setterId: null, setterName: null, therapistId: null, therapistName: null }
        : resolveAttribution(
          { closerId: body.closerId, setterId: body.setterId, therapistId: body.therapistId },
          await loadLists(),
          { canChooseCloser: isSupervisor, selfId: profile.id, selfName: profile.full_name ?? user.email },
        )
      if (who.error) return json({ error: who.error }, 400)

      const street = String(body.clientStreetName ?? '').trim()
      const postal = String(body.clientPostalCode ?? '').trim().toUpperCase()
      if (!street || !String(body.clientCity ?? '').trim() || !/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/.test(postal)) {
        return json({ error: 'Adresse du client incomplète (rue, ville et code postal valide requis)' }, 400)
      }

      // Prix : montant avant taxes + ajouts - rabais, taxes calculées ici (jamais confiées au navigateur)
      const training = body.addTraining === true
      const guarantee = body.addGuarantee === true
      const discountType = body.discountType === 'amount' ? 'amount' : 'percent'
      const discountValue = Number(body.discountValue ?? 0) || 0
      let price
      try { price = priceSale({ pretaxCents: Math.round(Number(body.pretaxAmount) * 100), training, discountType, discountValue }) }
      catch (e) { return json({ error: (e as Error).message }, 400) }
      const totalCents = price.totalCents
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
      if (!payToday && count > 1 && price.firstDiscountTotal) {
        return json({ error: 'Un rabais en $ sur le 1er versement demande « Payer aujourd’hui ». Coche-le ou utilise un rabais en %.' }, 400)
      }
      if (!payToday && count > 1 && totalCents % count !== 0) {
        return json({ error: `Sans paiement aujourd’hui, le total doit se diviser également en ${count} versements (ex. ${(Math.floor(totalCents / count) * count / 100).toFixed(2)} $ ou ${((Math.floor(totalCents / count) + 1) * count / 100).toFixed(2)} $)` }, 400)
      }

      let schedule
      try { schedule = buildSaleSchedule(price, { count, frequencyUnit, frequencyInterval, firstDate, secondDate }) }
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
        closer_id: who.closerId, closer_name: who.closerName, created_by: profile.id,
        setter_id: who.setterId, setter_name: who.setterName,
        therapist_id: who.therapistId, therapist_name: who.therapistName,
        attribution_confirmed_at: legacyClient ? null : new Date().toISOString(),
        client_first_name: first, client_last_name: last, client_email: email,
        client_phone: String(body.clientPhone ?? '').trim() || null,
        client_street_number: String(body.clientStreetNumber ?? '').trim() || null,
        client_street_name: street,
        client_unit: String(body.clientUnit ?? '').trim() || null,
        client_city: String(body.clientCity ?? '').trim(),
        client_province: String(body.clientProvince ?? 'QC').trim().toUpperCase() || 'QC',
        client_postal_code: postal.replace(/^(\w{3})\s?(\w{3})$/, '$1 $2'),
        product_name: product, installments_count: count,
        total_amount_cents: schedule.reduce((a, x) => a + x.amountCents, 0),
        pretax_amount_cents: price.basePretax, training_addon: training, guarantee_addon: guarantee,
        discount_type: price.discountPretax ? discountType : null,
        discount_value: price.discountPretax ? discountValue : null,
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

    // Annuler le paiement : le prochain prélèvement et les suivants, chez Moneris. Le programme continue.
    if (action === 'stop_payments') {
      if (!isSupervisor) return json({ error: 'Seuls Hugues et info@ peuvent annuler les paiements' }, 403)
      const plan = await loadPlan(body.planId)
      if (!plan) return json({ error: 'Plan introuvable' }, 404)
      const refused = choiceRefused(plan, 'stop_payments')
      if (refused) return json({ error: refused }, 400)
      const err = await stopAtMoneris(plan.moneris_subscription_id)
      if (err) return json({ error: err }, 502)
      const now = new Date().toISOString()
      await db.from('payment_installments').update({ status: 'canceled' })
        .eq('plan_id', plan.id).in('status', ['scheduled', 'declined'])
      await db.from('payment_plans').update({
        subscription_status: 'CANCELED', payments_stopped_at: now, payments_stopped_by: profile?.id ?? null, updated_at: now,
      }).eq('id', plan.id)
      return json({ ok: true })
    }

    // Retirer : vente saisie par erreur ou carte refusée, 0 $ encaissé. Jamais effacée : marquée retirée.
    if (action === 'remove_plan') {
      const plan = await loadPlan(body.planId)
      if (!plan) return json({ error: 'Plan introuvable' }, 404)
      const refused = choiceRefused(plan, 'remove_plan')
      if (refused) return json({ error: refused }, 400)
      const reason = String(body.reason ?? '').trim()
      if (!reason) return json({ error: 'Indique la raison du retrait' }, 400)
      // Un abonnement Moneris peut exister sans paiement (carte validée, 1er prélèvement à venir)
      if (plan.moneris_subscription_id && !['CANCELED', 'COMPLETED'].includes(plan.subscription_status ?? '')) {
        const err = await stopAtMoneris(plan.moneris_subscription_id)
        if (err) return json({ error: err }, 502)
      }
      const now = new Date().toISOString()
      await db.from('payment_installments').update({ status: 'canceled' })
        .eq('plan_id', plan.id).in('status', ['scheduled', 'declined'])
      // Statut « annulé » : bloque aussi le lien client et la saisie de carte
      await db.from('payment_plans').update({
        status: 'canceled', subscription_status: plan.moneris_subscription_id ? 'CANCELED' : plan.subscription_status,
        removed_at: now, removed_by: profile?.id ?? null, removed_reason: reason.slice(0, 500), updated_at: now,
      }).eq('id', plan.id)
      await db.from('payment_plan_links').update({ expires_at: now }).eq('plan_id', plan.id)
      return json({ ok: true })
    }

    if (action === 'cancel_plan') {
      if (!isSupervisor) return json({ error: 'Seuls Hugues et info@ peuvent annuler un programme' }, 403)
      const plan = await loadPlan(body.planId)
      if (!plan) return json({ error: 'Plan introuvable' }, 404)
      if (['completed', 'canceled'].includes(plan.status)) return json({ error: 'Plan déjà terminé ou annulé' }, 400)
      // D'abord chez Moneris : sinon il continuerait à prélever le client
      if (plan.moneris_subscription_id) {
        const err = await stopAtMoneris(plan.moneris_subscription_id)
        if (err) return json({ error: err }, 502)
      }
      await db.from('payment_installments').update({ status: 'canceled' })
        .eq('plan_id', plan.id).in('status', ['scheduled', 'declined'])
      await db.from('payment_plans').update({
        status: 'canceled', subscription_status: plan.moneris_subscription_id ? 'CANCELED' : null,
        canceled_at: new Date().toISOString(), canceled_by: profile?.id ?? null, updated_at: new Date().toISOString(),
      }).eq('id', plan.id)
      await db.from('payment_plan_links').delete().eq('plan_id', plan.id)
      const { data: full } = await db.from('payment_plans').select('client_email').eq('id', plan.id).maybeSingle()
      const tagged = await addTagByEmail(db, full?.client_email ?? '', 'statut-client-annuler')
      return json({ ok: true, tagged })
    }

    return json({ error: 'Action inconnue' }, 400)
  } catch (e) {
    console.error('[moneris-terminal]', e)
    return json({ error: 'Erreur serveur' }, 500)
  }
})
