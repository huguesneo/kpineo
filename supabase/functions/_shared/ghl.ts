// Lecture GoHighLevel pour le reçu QuickBooks : thérapeute de l'évaluation et setter du client.
// Lecture seule. En cas d'erreur, on renvoie null (le reçu se crée quand même).

declare const Deno: { env: { get(key: string): string | undefined } }
// deno-lint-ignore no-explicit-any
type DB = any
// deno-lint-ignore no-explicit-any
type J = any

const GHL = 'https://services.leadconnectorhq.com'
// Calendriers d'évaluation (clinique, en ligne, ouverture de dossier), mêmes IDs que le Centre de vente
const EVAL_CALENDAR_IDS = ['nF4GjzBPg0JJu7aSdi4d', 'EN1rRFnOcotGonaMAV3N', '7BpembfPxvDHewFh51EN']
const FIELD_SETTER_NOM = 'II5NrZGZrIScYItkxCi8' // setter__nom sur l'opportunité (ex. « Maude NEO »)

// « maude NEO » -> « Maude », « marie-michèle cardinal » -> « Marie-Michèle »
export function firstNameCap(full: string | null | undefined): string | null {
  const w = String(full ?? '').trim().split(/\s+/)[0]
  if (!w) return null
  return w.toLowerCase().split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('-')
}

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

// Thérapeute : personne assignée au RDV d'évaluation du client (le prochain à venir, sinon le plus récent).
async function therapist(db: DB, contactId: string): Promise<string | null> {
  const r = await ghl(`/contacts/${contactId}/appointments`)
  const evts = ((r?.events ?? r?.appointments ?? []) as J[])
    .filter(e => EVAL_CALENDAR_IDS.includes(e.calendarId) && !['cancelled', 'invalid'].includes(String(e.appointmentStatus ?? e.status ?? '').toLowerCase()))
    .filter(e => e.assignedUserId)
  if (!evts.length) return null
  const now = Date.now()
  const t = (e: J) => new Date(e.startTime).getTime()
  const upcoming = evts.filter(e => t(e) >= now - 12 * 3600_000).sort((a, b) => t(a) - t(b))
  const pick = upcoming[0] ?? evts.sort((a, b) => t(b) - t(a))[0]
  return userFirstName(db, pick.assignedUserId)
}

// Setter : champ setter__nom de l'opportunité la plus récente du client qui en a un.
async function setter(loc: string, contactId: string): Promise<string | null> {
  const r = await ghl(`/opportunities/search?location_id=${loc}&contact_id=${contactId}&limit=20`)
  const opps = ((r?.opportunities ?? []) as J[])
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
  for (const o of opps) {
    const f = (o.customFields ?? []).find((c: J) => c.id === FIELD_SETTER_NOM)
    const v = String(f?.fieldValueString ?? f?.fieldValue ?? f?.value ?? '').trim()
    if (v && !/^neo performance$/i.test(v)) return firstNameCap(v)
  }
  return null
}

export async function lookupTherapistAndSetter(db: DB, email: string): Promise<{ therapist: string | null; setter: string | null }> {
  const none = { therapist: null, setter: null }
  if (!email) return none
  const loc = await locationId(db)
  if (!loc) return none
  const cid = await contactIdByEmail(db, loc, email.trim())
  if (!cid) return none
  const [t, s] = await Promise.all([therapist(db, cid), setter(loc, cid)])
  return { therapist: t, setter: s }
}
