// Confirmation manuelle d'une rencontre découverte : règles pures, partagées par
// ghl-confirmer-rencontre (droits, validation du RDV, texte de la note GHL) et
// ghl-appels-recents (résumé du journal d'appels). Aucune dépendance Deno :
// testées avec vitest (confirmation.test.ts).
// Même règle de droits que src/lib/v2/confirmation.js (côté écran).

// deno-lint-ignore no-explicit-any
type J = any

export const TAG_CONFIRME = 'statut-confirme'
// Posé au retrait d'une confirmation : déclenche NEOHUB-05 (carte Vente ramenée en
// « 📅 RDV booké »), qui le retire ensuite. Un tag dédié plutôt que « statut-confirme
// retiré » : les workflows de no-show, d'annulation et de présentation retirent aussi
// statut-confirme, et la carte ne doit pas revenir en arrière dans ces cas-là.
export const TAG_CONFIRMATION_RETIREE = 'app-confirmation-retiree'

// Les 3 calendriers découverte (src/lib/v2/salesConfig.js, CALENDARS_DECOUVERTE)
export const CALENDARS_DECOUVERTE = ['DIN6EPtG7eNU3Gf6ZRoC', 'ucyJmhYKKDDm7U5JmaJ8', '4227QzeKvFczi5BZyHOC']
const STATUTS_ACTIFS = new Set(['new', 'confirmed'])

export type Profil = {
  role?: string | null
  secondary_roles?: string[] | null
  full_name?: string | null
  ghl_user_id?: string | null
}
export type Rdv = {
  ghl_id: string
  calendar_id?: string | null
  contact_id?: string | null
  start_time?: string | null
  status?: string | null
  assigned_user_id?: string | null
}

export function rolesDuProfil(p: Profil | null | undefined): string[] {
  return [p?.role, ...(p?.secondary_roles ?? [])].filter((r): r is string => !!r)
}

// « Pascal NEO » ≈ « pascal », comparaison par prénom (src/lib/ghlHelpers.js, closerFieldMatches)
function normaliserNom(n: string | null | undefined): string {
  return String(n ?? '').trim().toLowerCase().replace(/\s+neo$/i, '').trim()
}
export function closerCorrespond(champCloser: string | null | undefined, nomProfil: string | null | undefined): boolean {
  const cf = normaliserNom(champCloser)
  const pr = normaliserNom(nomProfil)
  if (!cf || !pr) return false
  return cf === pr || cf.split(' ')[0] === pr.split(' ')[0]
}

// Qui peut confirmer (ou retirer une confirmation) :
// setter, admin, resp_vente : toute rencontre découverte ;
// closeur : seulement les siennes (RDV assigné à lui, ou carte Vente à son nom).
// Retourne null si permis, sinon la raison.
export function refusDroits(p: Profil | null | undefined, rdv: Rdv, champCloserVente: string | null = null): string | null {
  const roles = rolesDuProfil(p)
  if (roles.some(r => r === 'admin' || r === 'resp_vente' || r === 'setter')) return null
  if (roles.includes('closer')) {
    const assigne = !!p?.ghl_user_id && rdv.assigned_user_id === p.ghl_user_id
    if (assigne || closerCorrespond(champCloserVente, p?.full_name)) return null
    return 'Cette rencontre n’est pas à ton agenda.'
  }
  return 'Seuls les setters, les closeurs et les responsables peuvent confirmer une rencontre.'
}

// Le RDV doit être une rencontre découverte à venir, ni annulée ni déjà statuée
export function refusRdv(rdv: Rdv | null | undefined, now = Date.now()): string | null {
  if (!rdv) return 'Rendez-vous introuvable.'
  if (!rdv.contact_id) return 'Rendez-vous sans contact.'
  if (!CALENDARS_DECOUVERTE.includes(String(rdv.calendar_id ?? ''))) return 'Seule une rencontre découverte se confirme ici.'
  if (!STATUTS_ACTIFS.has(String(rdv.status ?? ''))) return 'Ce rendez-vous est annulé ou déjà statué.'
  const debut = rdv.start_time ? new Date(rdv.start_time).getTime() : NaN
  if (Number.isNaN(debut) || debut <= now) return 'Ce rendez-vous est déjà commencé ou passé.'
  return null
}

// « 7 oct. 2026 à 10 h 45 », heure de Montréal
export function fmtDateHeure(iso: string | number | Date): string {
  const d = new Date(iso)
  const parts = Object.fromEntries(new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Toronto', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map(x => [x.type, x.value]))
  return `${parts.day} ${parts.month} ${parts.year} à ${Number(parts.hour)} h ${parts.minute}`
}

export function prenomDe(nom: string | null | undefined): string {
  const w = normaliserNom(nom).split(/\s+/)[0] ?? ''
  if (!w) return 'quelqu’un'
  return w.split('-').map(x => x.charAt(0).toUpperCase() + x.slice(1)).join('-')
}

// Note posée sur le contact GHL : qui, quand, quelle rencontre
export function texteNote(action: 'confirmer' | 'annuler', nom: string | null | undefined, debutRdv: string, maintenant: number | Date = Date.now()): string {
  const qui = prenomDe(nom)
  const rdv = fmtDateHeure(debutRdv)
  const quand = fmtDateHeure(maintenant)
  return action === 'confirmer'
    ? `✅ Rencontre découverte du ${rdv} confirmée manuellement depuis le hub par ${qui}, le ${quand}.`
    : `↩️ Confirmation de la rencontre découverte du ${rdv} retirée depuis le hub par ${qui}, le ${quand}.`
}

// ── Journal d'appels (GET /conversations/messages/export?channel=Call) ──────
export type Appel = { date: string; statut: string; duree: number | null; sortant: boolean }

// Garde les appels des contacts demandés : { contactId: [appels, du plus récent au plus ancien] }
export function resumerAppels(messages: J[], contactIds: string[]): Record<string, Appel[]> {
  const voulus = new Set(contactIds)
  const out: Record<string, Appel[]> = {}
  for (const m of messages ?? []) {
    const cid = String(m?.contactId ?? '')
    if (!voulus.has(cid)) continue
    if (m.messageType && m.messageType !== 'TYPE_CALL') continue
    const date = m.dateAdded ?? m.createdAt
    if (!date) continue
    const call = m.meta?.call ?? {}
    const duree = Number(call.duration ?? m.callDuration)
    ;(out[cid] ??= []).push({
      date: new Date(date).toISOString(),
      statut: String(call.status ?? m.callStatus ?? m.status ?? ''),
      duree: Number.isFinite(duree) ? duree : null,
      sortant: m.direction === 'outbound',
    })
  }
  for (const cid of Object.keys(out)) out[cid].sort((a, b) => b.date.localeCompare(a.date))
  return out
}
