// Accès GHL et réglages du Setting v2 (setting-actions, setting-cycle, setting-fiche).
// Toute écriture GHL passe par `ecrire`, qui applique l'interrupteur :
// écritures réelles seulement si setting_config.ecritures_ghl_reelles = true,
// sinon pour le contact test seulement.
import { peutEcrireGhl, TAG_RAPPEL as TAG_RAPPEL_MANUEL } from './settingRegles.js'

declare const Deno: { env: { get(key: string): string | undefined } }
// deno-lint-ignore no-explicit-any
type DB = any
// deno-lint-ignore no-explicit-any
type J = any

export const GHL_BASE = 'https://services.leadconnectorhq.com'
export const PIPELINE_SETTING_ID = 'KkPiFjw0ztAXc7z6Ab9c'
export const STAGE_NON_QUALIFIE = '7d0ce220-cb62-45e8-8484-3392ce774061'
export const STAGE_PAS_INTERESSE = '3db78827-e798-4e33-9115-3227d7e1015c'  // « 🚫 Pas intéressé », créée le 16 oct. 2026

export function cleGhl(): string {
  const k = Deno.env.get('GHL_API_KEY')
  if (!k) throw new Error('GHL_API_KEY non configurée')
  return k
}

export async function ghl(path: string, { method = 'GET', body, version = '2021-07-28' }: { method?: string; body?: unknown; version?: string } = {}): Promise<J> {
  const res = await fetch(GHL_BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${cleGhl()}`,
      Version: version,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const texte = await res.text()
  if (!res.ok) throw new Error(`GHL ${method} ${path.split('?')[0]} → ${res.status} ${texte.slice(0, 200)}`)
  try { return texte ? JSON.parse(texte) : {} } catch { return {} }
}

export async function locationId(db: DB): Promise<string> {
  const env = Deno.env.get('GHL_LOCATION_ID')
  if (env) return env
  const { data } = await db.from('ghl_config').select('location_id').limit(1).maybeSingle()
  if (!data?.location_id) throw new Error('GHL_LOCATION_ID non configurée')
  return data.location_id
}

export type Config = { ecrituresReelles: boolean; emailTest: string; champs: Record<string, string | null> }

export async function lireConfig(db: DB): Promise<Config> {
  const { data } = await db.from('setting_config').select('cle, valeur')
  const v = Object.fromEntries((data ?? []).map((r: J) => [r.cle, r.valeur]))
  return {
    ecrituresReelles: v.ecritures_ghl_reelles === true,
    emailTest: String(v.contact_test_email ?? 'hugues.pugliese@gmail.com'),
    champs: {
      date_rappel: v.champ_date_rappel ?? null,
      cycle_utm_source: v.champ_cycle_utm_source ?? null,
    },
  }
}

// Résout les ids des champs personnalisés contact (date_rappel, cycle_utm_source)
// et les garde dans setting_config. Lecture GHL seulement.
export async function resoudreChamps(db: DB, config: Config): Promise<Config> {
  if (config.champs.date_rappel && config.champs.cycle_utm_source) return config
  try {
    const loc = await locationId(db)
    const r = await ghl(`/locations/${loc}/customFields?model=contact`)
    const defs: J[] = r.customFields ?? []
    const trouver = (cle: string) => defs.find(f => {
      const k = String(f.fieldKey ?? '').toLowerCase()
      return k === `contact.${cle}` || k === cle || String(f.name ?? '').toLowerCase() === cle
    })?.id ?? null
    for (const cle of ['date_rappel', 'cycle_utm_source']) {
      if (config.champs[cle]) continue
      const id = trouver(cle)
      if (id) {
        config.champs[cle] = id
        await db.from('setting_config').upsert({ cle: `champ_${cle}`, valeur: id, maj_le: new Date().toISOString() })
      }
    }
  } catch (e) {
    console.error('[setting] Champs personnalisés illisibles :', (e as Error).message)
  }
  return config
}

// Courriel du contact pour le garde-fou : lu dans GHL (source de vérité, le
// cache peut avoir des heures de retard), cache Supabase seulement si GHL échoue
export async function emailContact(db: DB, contactId: string): Promise<string | null> {
  try {
    const r = await ghl(`/contacts/${contactId}`)
    if (r?.contact) return r.contact.email ?? null
  } catch { /* repli sur le cache */ }
  const { data } = await db.from('ghl_contacts').select('email').eq('ghl_id', contactId).maybeSingle()
  return data?.email ?? null
}

// Garde-fou unique des écritures GHL. Retourne true si l'écriture est réelle,
// false si elle est seulement enregistrée dans l'app (simulée).
export async function ecrituresPermises(db: DB, config: Config, contactId: string): Promise<boolean> {
  if (config.ecrituresReelles) return true
  return peutEcrireGhl({ ecrituresReelles: false, emailContact: await emailContact(db, contactId), emailTest: config.emailTest })
}

export const ecrire = {
  ajouterTags: (contactId: string, tags: string[]) =>
    ghl(`/contacts/${contactId}/tags`, { method: 'POST', body: { tags } }),
  retirerTags: (contactId: string, tags: string[]) =>
    ghl(`/contacts/${contactId}/tags`, { method: 'DELETE', body: { tags } }),
  note: (contactId: string, body: string) =>
    ghl(`/contacts/${contactId}/notes`, { method: 'POST', body: { body } }),
  champContact: (contactId: string, champId: string, valeur: string | null) =>
    ghl(`/contacts/${contactId}`, { method: 'PUT', body: { customFields: [{ id: champId, field_value: valeur ?? '' }] } }),
  deplacerOpportunite: (oppId: string, pipelineId: string, stageId: string) =>
    ghl(`/opportunities/${oppId}`, { method: 'PUT', body: { pipelineId, pipelineStageId: stageId } }),
  statutOpportunite: (oppId: string, status: 'lost' | 'open' | 'won' | 'abandoned') =>
    ghl(`/opportunities/${oppId}/status`, { method: 'PUT', body: { status } }),
}

export function prenomDe(nom: string | null | undefined): string {
  const w = String(nom ?? '').trim().split(/\s+/)[0] ?? ''
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : ''
}

export function fmtQuand(d: Date | string | number = Date.now()): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Toronto', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  }).format(new Date(d))
}

export const CALENDRIERS_DECOUVERTE = ['DIN6EPtG7eNU3Gf6ZRoC', 'ucyJmhYKKDDm7U5JmaJ8', '4227QzeKvFczi5BZyHOC']

// RDV découverte réservé pour un contact : ferme ses rappels actifs et leurs
// tâches, retire le tag rappel-manuel et vide date_rappel dans GHL (écriture
// soumise à l'interrupteur). Sans effet si le contact n'a pas de RDV découverte
// à venir dans le cache (ghl_appointments). Retourne ce qui a été fait.
export async function cloreRappelsApresRdv(db: DB, contactId: string): Promise<Record<string, unknown>> {
  const iso = new Date().toISOString()
  const { data: rdv } = await db.from('ghl_appointments').select('ghl_id')
    .eq('contact_id', contactId).in('calendar_id', CALENDRIERS_DECOUVERTE)
    .in('status', ['new', 'confirmed']).gt('start_time', iso).limit(1)
  if (!rdv?.length) return { ignore: 'aucun RDV découverte à venir' }

  const { data: fermes } = await db.from('setting_rappels')
    .update({ statut: 'fait', termine_le: iso, tag_retire_le: iso })
    .eq('contact_id', contactId).eq('statut', 'actif').select('id, ghl_simule')
  const ids = (fermes ?? []).map((r: J) => r.id)
  if (ids.length) {
    await db.from('setting_taches').update({ fait_le: iso }).in('cle', ids.map((id: string) => `rappel:${id}`)).is('fait_le', null)
  }

  // Tag présent dans GHL ? (rappel posé par l'app, ou tag mis à la main)
  const { data: c } = await db.from('ghl_contacts').select('tags').eq('ghl_id', contactId).maybeSingle()
  const tagPresent = (c?.tags ?? []).includes(TAG_RAPPEL_MANUEL)
  const aRetirer = tagPresent || (fermes ?? []).some((r: J) => !r.ghl_simule)
  let ghlEcrit = false
  if (aRetirer) {
    let config = await lireConfig(db)
    if (await ecrituresPermises(db, config, contactId)) {
      config = await resoudreChamps(db, config)
      await ecrire.retirerTags(contactId, [TAG_RAPPEL_MANUEL])
      if (config.champs.date_rappel) await ecrire.champContact(contactId, config.champs.date_rappel, null)
      ghlEcrit = true
    }
  }
  return { rappelsFermes: ids.length, tagPresent, ghlEcrit }
}
