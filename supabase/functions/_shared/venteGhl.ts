// Carte du pipeline 🎯 Vente du client : valeur = total payé au terminal avant
// taxes, champ « closeur » = nom GHL exact du closeur de la vente (ex. « Vicky NEO »).
// Appelée à chaque paiement réussi (markPaid) et par le rattrapage terminal-vente-ghl.

import { contactIdByEmail, ghl, locationId } from './ghl.ts'
import { choisirCarteVente, payeAvantTaxes } from './venteValeur.js'

declare const Deno: { env: { get(key: string): string | undefined } }
// deno-lint-ignore no-explicit-any
type DB = any
// deno-lint-ignore no-explicit-any
type J = any

const GHL = 'https://services.leadconnectorhq.com'
const FIELD_CLOSER = 'JSltN3nE7nm4cUjuGxTs' // closeur de l'opportunité (même champ que le hub)

export interface ResultatVente {
  client: string; courriel: string
  carte: { id: string; nom: string; statut: string; valeurAvant: number; closerAvant: string | null } | null
  valeur: number; closer: string | null; ecrit: boolean; erreur?: string
}

const champ = (o: J, id: string) => {
  const f = (o.customFields ?? []).find((c: J) => c.id === id)
  return String(f?.fieldValueString ?? f?.fieldValue ?? f?.value ?? '').trim() || null
}

// Nom du closeur tel qu'il est dans GHL (utilisateur relié au profil), sinon le nom du terminal
async function nomCloserGhl(db: DB, closerId: string | null, closerName: string | null): Promise<string | null> {
  if (closerId) {
    const { data } = await db.from('profiles').select('ghl_user_id').eq('id', closerId).maybeSingle()
    if (data?.ghl_user_id) {
      const u = await ghl(`/users/${data.ghl_user_id}`)
      const nom = String(u?.name ?? [u?.firstName, u?.lastName].filter(Boolean).join(' ')).trim()
      if (nom) return nom
    }
  }
  return closerName?.trim() || null
}

// appliquer = false : calcule seulement ce qui serait écrit (aperçu du rattrapage)
export async function syncVenteGhl(db: DB, email: string, { appliquer }: { appliquer: boolean }): Promise<ResultatVente> {
  const { data: plans } = await db.from('payment_plans')
    .select('closer_id, closer_name, client_first_name, client_last_name, created_at, removed_at, manual, payment_installments(amount_cents, status)')
    .ilike('client_email', email.trim().replace(/[\\%_]/g, '\\$&')) // courriel exact, sans jokers
  const liste = (plans ?? []) as J[]
  const payes = liste.filter(p => !p.removed_at && !p.manual && (p.payment_installments ?? []).some((i: J) => i.status === 'paid'))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const ref = payes[0] ?? liste[0]
  const res: ResultatVente = {
    client: ref ? `${ref.client_first_name} ${ref.client_last_name}`.trim() : email,
    courriel: email, carte: null, valeur: payeAvantTaxes(liste) / 100, closer: null, ecrit: false,
  }
  if (!payes.length) return { ...res, erreur: 'Aucun paiement réussi' }
  res.closer = await nomCloserGhl(db, payes[0].closer_id, payes[0].closer_name)

  const loc = await locationId(db)
  const cid = loc ? await contactIdByEmail(db, loc, email.trim()) : null
  if (!cid) return { ...res, erreur: 'Contact introuvable dans GHL' }
  const r = await ghl(`/opportunities/search?location_id=${loc}&contact_id=${cid}&limit=50`)
  const carte = choisirCarteVente((r?.opportunities ?? []) as J[])
  if (!carte) return { ...res, erreur: 'Aucune carte ouverte ou gagnée dans 🎯 Vente' }
  res.carte = {
    id: carte.id, nom: carte.name ?? res.client, statut: carte.status,
    valeurAvant: Number(carte.monetaryValue ?? 0), closerAvant: champ(carte, FIELD_CLOSER),
  }
  if (!appliquer) return res

  const key = Deno.env.get('GHL_API_KEY')
  if (!key) return { ...res, erreur: 'GHL_API_KEY absente' }
  const body: J = { monetaryValue: res.valeur }
  if (res.closer) body.customFields = [{ id: FIELD_CLOSER, field_value: res.closer }]
  try {
    const w = await fetch(`${GHL}/opportunities/${carte.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${key}`, Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
    if (!w.ok) return { ...res, erreur: `GHL ${w.status} : ${(await w.text()).slice(0, 200)}` }
  } catch (e) {
    return { ...res, erreur: String(e) }
  }
  // Copie locale à jour sans attendre la synchro GHL
  await db.from('ghl_opportunities').update({ monetary_value: res.valeur }).eq('ghl_id', carte.id)
  return { ...res, ecrit: true }
}
