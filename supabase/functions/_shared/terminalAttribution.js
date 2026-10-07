// Terminal : attribution de la vente (closeur, setter, naturopathe) et choix du bouton « Annuler ».
// Logique pure, partagée par l'edge function moneris-terminal et la page Terminal.

export const SUPERVISORS = ['hugues@neoperformance.ca', 'info@neoperformance.ca']
export const isSupervisorEmail = (email) => SUPERVISORS.includes(String(email ?? '').trim().toLowerCase())

// Valeur du menu pour « Aucun » (setter et naturopathe seulement)
export const NONE = 'none'

// « maude NEO » -> « Maude », « marie-michèle cardinal » -> « Marie-Michèle »
export function firstNameCap(full) {
  const w = String(full ?? '').trim().split(/\s+/)[0]
  if (!w) return null
  return w.toLowerCase().split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('-')
}

const hasRole = (p, role) => p.role === role || (p.secondary_roles ?? []).includes(role)
// Comptes de test (ex. « neo test ») : jamais proposés
const isTestProfile = (p) => /\btest\b/i.test(p.full_name ?? '')

// profiles : { id, full_name, role, secondary_roles, is_active }
// Retourne les trois listes du terminal : [{ id, name (nom complet), label (prénom) }], triées par prénom.
export function attributionLists(profiles) {
  const usable = (profiles ?? []).filter(p => p.is_active !== false && p.full_name && !isTestProfile(p))
  const toItems = (role) => usable.filter(p => hasRole(p, role))
    .map(p => ({ id: p.id, name: p.full_name, label: firstNameCap(p.full_name) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  return { closers: toItems('closer'), setters: toItems('setter'), therapists: toItems('naturopathe') }
}

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

// Trouve le profil d'une liste à partir d'un nom lu dans GHL (« Maude NEO », « maude »). Le prénom suffit.
export function matchByFirstName(list, name) {
  const first = norm(firstNameCap(name))
  if (!first) return null
  return (list ?? []).find(i => norm(i.label) === first)?.id ?? null
}

// Vérifie les trois choix envoyés par le terminal.
// input : { closerId, setterId, therapistId } (setter / naturopathe : un id ou NONE)
// opts  : { canChooseCloser (hugues@ / info@), selfId, selfName }
// Retourne { error } ou { closerId, closerName, setterId, setterName, therapistId, therapistName }
// (setterId / therapistId à null pour « Aucun »). Les noms setter / naturopathe sont des prénoms (reçu QuickBooks).
/** @returns {any} */
export function resolveAttribution(input, lists, opts) {
  const closerId = String(input?.closerId ?? '')
  const setterId = String(input?.setterId ?? '')
  const therapistId = String(input?.therapistId ?? '')
  if (!closerId || !setterId || !therapistId) return { error: 'Choisis le closeur, le setter et la naturopathe (« Aucun » est permis pour le setter et la naturopathe).' }

  let closerName
  if (opts.canChooseCloser) {
    const c = lists.closers.find(i => i.id === closerId)
    if (!c) return { error: 'Closeur invalide' }
    closerName = c.name
  } else {
    if (closerId !== opts.selfId) return { error: 'Tu ne peux inscrire que toi-même comme closeur' }
    closerName = opts.selfName
  }

  const pick = (list, id, what) => {
    if (id === NONE) return { id: null, name: null }
    const p = list.find(i => i.id === id)
    return p ? { id: p.id, name: p.label } : { error: `${what} invalide` }
  }
  const s = pick(lists.setters, setterId, 'Setter')
  if (s.error) return s
  const t = pick(lists.therapists, therapistId, 'Naturopathe')
  if (t.error) return t
  return { closerId, closerName, setterId: s.id, setterName: s.name, therapistId: t.id, therapistName: t.name }
}

export const attributionComplete = (f) => !!(f?.closerId && f?.setterId && f?.therapistId)

// ── Bouton « Annuler » ───────────────────────────────────────

export const CANCEL_CHOICES = {
  stop_payments: 'Annuler le paiement',
  cancel_plan: 'Annuler le programme',
  remove_plan: 'Retirer (erreur ou carte refusée)',
}

const insts = (plan) => plan?.payment_installments ?? []
export const paidCents = (plan) => insts(plan).filter(i => i.status === 'paid').reduce((a, i) => a + i.amount_cents, 0)

// Abonnement Moneris encore en marche (prélèvements à venir)
export const hasLiveSubscription = (plan) =>
  !!plan?.moneris_subscription_id && !['CANCELED', 'COMPLETED'].includes(plan.subscription_status ?? '')

// Les trois choix pour une vente : { key, label, visible, enabled, reason }.
// plan : avec payment_installments. who : { isSupervisor, profileId }
//   Annuler le paiement / le programme : hugues@ et info@ seulement.
//   Retirer : le closeur sur ses ventes, hugues@ et info@. Seulement si 0 $ encaissé.
export function cancelChoices(plan, who) {
  const removed = !!plan?.removed_at
  const own = !!who?.profileId && plan?.closer_id === who.profileId
  const sup = !!who?.isSupervisor
  const closed = ['completed', 'canceled'].includes(plan?.status)

  const stop = { key: 'stop_payments', label: CANCEL_CHOICES.stop_payments, visible: sup && !removed, enabled: false, reason: '' }
  if (plan?.payments_stopped_at) stop.reason = 'Les prélèvements sont déjà arrêtés.'
  else if (plan?.status !== 'active' || !hasLiveSubscription(plan)) stop.reason = 'Aucun prélèvement à venir chez Moneris.'
  else stop.enabled = true

  const cancel = { key: 'cancel_plan', label: CANCEL_CHOICES.cancel_plan, visible: sup && !removed, enabled: !closed, reason: closed ? 'Programme déjà terminé ou annulé.' : '' }

  const remove = { key: 'remove_plan', label: CANCEL_CHOICES.remove_plan, visible: (sup || own) && !removed, enabled: false, reason: '' }
  if (paidCents(plan) > 0 || insts(plan).some(i => i.receipt_status === 'sent')) remove.reason = 'Un paiement a été encaissé : faire un remboursement.'
  else if (insts(plan).some(i => i.status === 'processing')) remove.reason = 'Un paiement est en cours : attends le résultat.'
  else remove.enabled = true

  return [stop, cancel, remove]
}

// Texte de la confirmation de chaque choix
export function confirmText(key, plan) {
  const client = `${plan?.client_first_name ?? ''} ${plan?.client_last_name ?? ''}`.trim()
  if (key === 'stop_payments') {
    return `Annuler les prochains prélèvements de ${client} ? Le prochain prélèvement et tous les suivants seront annulés chez Moneris. Le client reste dans son programme (ex. il paie autrement).`
  }
  if (key === 'cancel_plan') {
    return `Annuler le programme de ${client} ? Les prochains paiements seront arrêtés chez Moneris et le client recevra le tag « statut-client-annuler » dans GHL.`
  }
  const extra = [
    hasLiveSubscription(plan) ? 'L’abonnement Moneris sera annulé.' : '',
    ['pending_card', 'card_failed'].includes(plan?.status) ? 'Le lien de paiement ne fonctionnera plus.' : '',
  ].filter(Boolean).join(' ')
  return `Retirer la vente de ${client} ? Elle disparaîtra de la liste (la trace est gardée : qui, quand, raison).${extra ? ' ' + extra : ''}`
}
