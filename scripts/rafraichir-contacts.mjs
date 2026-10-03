#!/usr/bin/env node
// Remise à jour complète de ghl_contacts depuis GoHighLevel (lecture seule côté GHL).
// Même règle de copie que la synchro (supabase/functions/gohighlevel-sync/contacts.ts).
// N'efface aucune ligne : upsert uniquement.
//
// Usage :
//   npx vite-node scripts/rafraichir-contacts.mjs            # essai : compte seulement
//   npx vite-node scripts/rafraichir-contacts.mjs --ecrire   # relit et écrit tout
import { loadEnv, supabaseClient, LOCATION_ID, GHL_BASE } from './lib/common.mjs'
import { ligneContactComplete } from '../supabase/functions/gohighlevel-sync/contacts.ts'

loadEnv()
const ECRIRE = process.argv.includes('--ecrire')
const KEY = process.env.GHL_API_KEY
if (!KEY) throw new Error('GHL_API_KEY introuvable')
const sb = supabaseClient()
const pause = ms => new Promise(r => setTimeout(r, ms))

async function lirePage(params, essai = 0) {
  const r = await fetch(`${GHL_BASE}/contacts/?${params}`, { headers: { Authorization: `Bearer ${KEY}`, Version: '2021-07-28' } })
  if (r.status === 429 || r.status >= 500) {
    if (essai >= 6) throw new Error(`GHL ${r.status} après ${essai} essais`)
    await pause(1000 * 2 ** essai)
    return lirePage(params, essai + 1)
  }
  if (!r.ok) throw new Error(`GHL ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

const premier = await lirePage(new URLSearchParams({ locationId: LOCATION_ID, limit: '1' }))
const total = premier.meta?.total ?? 0
const { count: enCache } = await sb.from('ghl_contacts').select('id', { count: 'exact', head: true })
console.log(`GHL : ${total} contacts · cache : ${enCache} lignes`)
if (!ECRIRE) { console.log('Essai seulement (ajouter --ecrire pour lancer).'); process.exit(0) }

let ecrits = 0, erreurs = 0, pages = 0, tampon = []
let startAfter, startAfterId
const debut = Date.now()
const vider = async () => {
  if (!tampon.length) return
  const { error } = await sb.from('ghl_contacts').upsert(tampon, { onConflict: 'ghl_id' })
  if (error) { erreurs += tampon.length; console.error(`écriture refusée (${tampon.length}) : ${error.message}`) }
  else ecrits += tampon.length
  tampon = []
}
for (;;) {
  const p = new URLSearchParams({ locationId: LOCATION_ID, limit: '100' })
  if (startAfter) { p.set('startAfter', String(startAfter)); p.set('startAfterId', String(startAfterId)) }
  const data = await lirePage(p)
  const contacts = data.contacts ?? []
  const maintenant = new Date().toISOString()
  tampon.push(...contacts.map(c => ligneContactComplete(c, LOCATION_ID, maintenant)))
  if (tampon.length >= 500) await vider()
  pages++
  if (pages % 25 === 0) console.log(`… ${pages} pages, ${ecrits + tampon.length} contacts lus, ${Math.round((Date.now() - debut) / 1000)} s`)
  const m = data.meta ?? {}
  if (contacts.length < 100 || !m.nextPageUrl || !m.startAfter || !m.startAfterId) break
  if (m.startAfter === startAfter && m.startAfterId === startAfterId) break
  startAfter = m.startAfter; startAfterId = m.startAfterId
  await pause(120)
}
await vider()
const { data: plusVieux } = await sb.from('ghl_contacts').select('synced_at').order('synced_at').limit(1)
const { count: nonRafraichis } = await sb.from('ghl_contacts').select('id', { count: 'exact', head: true }).lt('synced_at', new Date(debut).toISOString())
console.log(`Terminé en ${Math.round((Date.now() - debut) / 1000)} s : ${ecrits} contacts mis à jour, ${erreurs} en erreur, ${pages} pages.`)
console.log(`Lignes du cache non revues par GHL (contacts supprimés dans GHL ?) : ${nonRafraichis} · synced_at le plus ancien : ${plusVieux?.[0]?.synced_at}`)
process.exit(erreurs ? 1 : 0)
