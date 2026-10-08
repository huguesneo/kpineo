// Lecture GoHighLevel pour le reçu QuickBooks : thérapeute de l'évaluation et setter du client.
// Lecture seule. En cas d'erreur, on renvoie null (le reçu se crée quand même).

import { firstNameCap } from './terminalAttribution.js'

declare const Deno: { env: { get(key: string): string | undefined } }
// deno-lint-ignore no-explicit-any
type DB = any
// deno-lint-ignore no-explicit-any
type J = any

const GHL = 'https://services.leadconnectorhq.com'
// Calendriers d'évaluation (clinique, en ligne, ouverture de dossier), mêmes IDs que le Centre de vente
const EVAL_CALENDAR_IDS = ['nF4GjzBPg0JJu7aSdi4d', 'EN1rRFnOcotGonaMAV3N', '7BpembfPxvDHewFh51EN']
const FIELD_SETTER_NOM = 'II5NrZGZrIScYItkxCi8' // setter__nom sur l'opportunité (ex. « Maude NEO »)
const FIELD_CLOSER = 'JSltN3nE7nm4cUjuGxTs'     // closeur de l'opportunité (même champ que le hub)

// « maude NEO » -> « Maude », « marie-michèle cardinal » -> « Marie-Michèle »
export { firstNameCap }

async function ghl(path: string): Promise<J | null> {
  const key = Deno.env.get('GHL_API_KEY')
  if (!key) return null
  try {
    const r = await fetch(GHL + path, { headers: { Authorization: `Bearer ${key}`, Version: '2021-07-28', Accept: 'application/json' } })
    if (!r.ok) { console.error('[GHL]', path.split('?')[0], r.status); return null }
    return await r.json()
  } catch (e) { console.error('[GHL]', e); return null }
}

async function locationId(db: DB): Promise<string | null> {
  const env = Deno.env.get('GHL_LOCATION_ID')
  if (env) return env
  const { data } = await db.from('ghl_config').select('location_id').limit(1).maybeSingle()
  return data?.location_id ?? null
}

async function contactIdByEmail(db: DB, loc: string, email: string): Promise<string | null> {
  const r = await ghl(`/contacts/search/duplicate?locationId=${loc}&email=${encodeURIComponent(email)}`)
  if (r?.contact?.id) return r.contact.id
  const { data } = await db.from('ghl_contacts').select('ghl_id').ilike('email', email).order('synced_at', { ascending: false }).limit(1).maybeSingle()
  return data?.ghl_id ?? null
}

async function userFirstName(db: DB, userId: string): Promise<string | null> {
  const { data } = await db.from('profiles').select('full_name').eq('ghl_user_id', userId).limit(1).maybeSingle()
  if (data?.full_name) return firstNameCap(data.full_name)
  const u = await ghl(`/users/${userId}`)
  return firstNameCap(u?.firstName ?? u?.name)
}

// RDV d'évaluation du client (le prochain à venir, sinon le plus récent) : thérapeute assignée et date.
async function evaluation(db: DB, contactId: string): Promise<{ therapist: string | null; date: string | null }> {
  const r = await ghl(`/contacts/${contactId}/appointments`)
  const evts = ((r?.events ?? r?.appointments ?? []) as J[])
    .filter(e => EVAL_CALENDAR_IDS.includes(e.calendarId) && !['cancelled', 'invalid'].includes(String(e.appointmentStatus ?? e.status ?? '').toLowerCase()))
    .filter(e => e.assignedUserId)
  if (!evts.length) return { therapist: null, date: null }
  const now = Date.now()
  const t = (e: J) => new Date(e.startTime).getTime()
  const upcoming = evts.filter(e => t(e) >= now - 12 * 3600_000).sort((a, b) => t(a) - t(b))
  const pick = upcoming[0] ?? evts.sort((a, b) => t(b) - t(a))[0]
  return { therapist: await userFirstName(db, pick.assignedUserId), date: pick.startTime ?? null }
}

// Setter et closeur : champs setter__nom et closeur de l'opportunité la plus récente du client qui en a un.
async function setterAndCloser(loc: string, contactId: string): Promise<{ setter: string | null; closer: string | null }> {
  const r = await ghl(`/opportunities/search?location_id=${loc}&contact_id=${contactId}&limit=20`)
  const opps = ((r?.opportunities ?? []) as J[])
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
  const field = (o: J, id: string) => {
    const f = (o.customFields ?? []).find((c: J) => c.id === id)
    const v = String(f?.fieldValueString ?? f?.fieldValue ?? f?.value ?? '').trim()
    return v && !/^neo performance$/i.test(v) ? firstNameCap(v) : null
  }
  let setter: string | null = null, closer: string | null = null
  for (const o of opps) {
    setter = setter ?? field(o, FIELD_SETTER_NOM)
    closer = closer ?? field(o, FIELD_CLOSER)
    if (setter && closer) break
  }
  return { setter, closer }
}

// Lecture seule : naturopathe (RDV d'évaluation), setter et closeur (carte GHL) du client, en prénoms.
export async function lookupAttribution(db: DB, email: string)
  : Promise<{ therapist: string | null; setter: string | null; closer: string | null }> {
  const none = { therapist: null, setter: null, closer: null }
  if (!email) return none
  const loc = await locationId(db)
  if (!loc) return none
  const cid = await contactIdByEmail(db, loc, email.trim())
  if (!cid) return none
  const [ev, sc] = await Promise.all([evaluation(db, cid), setterAndCloser(loc, cid)])
  return { therapist: ev.therapist, ...sc }
}

// Date (ISO) du RDV d'évaluation du client, pour les notes du dossier QuickBooks
export async function lookupEvaluationDate(db: DB, email: string): Promise<string | null> {
  if (!email) return null
  const loc = await locationId(db)
  if (!loc) return null
  const cid = await contactIdByEmail(db, loc, email.trim())
  return cid ? (await evaluation(db, cid)).date : null
}

// Ventes saisies avant le choix dans le terminal : thérapeute et setter lus au 1er reçu
export async function lookupTherapistAndSetter(db: DB, email: string): Promise<{ therapist: string | null; setter: string | null }> {
  const { therapist, setter } = await lookupAttribution(db, email)
  return { therapist, setter }
}

// Ajoute un tag au contact GHL du client (trouvé par courriel). Retourne true si fait.
export async function addTagByEmail(db: DB, email: string, tag: string): Promise<boolean> {
  const key = Deno.env.get('GHL_API_KEY')
  const loc = await locationId(db)
  if (!key || !loc || !email) return false
  const cid = await contactIdByEmail(db, loc, email.trim())
  if (!cid) return false
  try {
    const r = await fetch(`${GHL}/contacts/${cid}/tags`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ tags: [tag] }),
    })
    if (!r.ok) console.error('[GHL tag]', r.status, (await r.text()).slice(0, 200))
    return r.ok
  } catch (e) { console.error('[GHL tag]', e); return false }
}
