// Copie des contacts GHL dans ghl_contacts (fonctions pures, testées avec vitest).

type Contact = Record<string, unknown>

const str = (v: unknown) => (v === null || v === undefined ? null : String(v) || null)

// Ligne complète, depuis la LISTE des contacts (GET /contacts/), seule réponse
// qui contient le tableau `attributions` (premier et dernier contact UTM).
export function ligneContactComplete(c: Contact, locationId: string, maintenant: string) {
  // Deux attributions, pas une. Le premier contact dit ce qui a fait
  // connaître NEO, le dernier ce qui a déclenché l'action — et c'est le
  // dernier qui décide à quelle publication un rendez-vous revient.
  const attributions = (c.attributions ?? []) as Record<string, unknown>[]
  const firstTouch = attributions.find(a => a.isFirst) ?? attributions[0] ?? {}
  // isLast n'est pas toujours posé : repli sur le dernier élément, GHL
  // renvoyant le tableau dans l'ordre chronologique.
  const lastTouch = attributions.find(a => a.isLast) ?? attributions[attributions.length - 1] ?? {}
  return {
    ghl_id:            String(c.id ?? ''),
    location_id:       locationId,
    // La liste renvoie firstName/lastName en minuscules ; la vraie graphie est dans *Raw
    first_name:        String(c.firstNameRaw ?? c.firstName ?? ''),
    last_name:         String(c.lastNameRaw ?? c.lastName ?? ''),
    email:             String(c.email ?? ''),
    phone:             String(c.phone ?? ''),
    tags:              (c.tags ?? []) as string[],
    source:            String(c.source ?? ''),
    utm_campaign:      String(firstTouch.utmCampaign ?? ''),
    utm_content:       String(firstTouch.utmContent ?? ''),
    utm_source:        String(firstTouch.utmSource ?? ''),
    utm_campaign_last: str(lastTouch.utmCampaign),
    utm_content_last:  str(lastTouch.utmContent),
    utm_source_last:   str(lastTouch.utmSource),
    utm_medium_last:   str(lastTouch.utmMedium),
    first_page_url:    str(firstTouch.url),
    last_page_url:     str(lastTouch.url),
    first_referrer:    str(firstTouch.referrer),
    touch_count:       attributions.length,
    created_at_ghl:    c.dateAdded ? new Date(c.dateAdded as string).toISOString() : null,
    raw:               c,
    synced_at:         maintenant,
  }
}

// Ligne d'un contact MODIFIÉ, depuis la recherche (POST /contacts/search), qui ne
// renvoie pas `attributions` : on ne met à jour que l'identité et les champs
// personnalisés. Colonnes UTM et created_at_ghl intactes ; la liste
// `attributions` déjà en cache est conservée dans raw.
export function ligneContactModifie(c: Contact, locationId: string, maintenant: string, ancienRaw?: Contact | null) {
  const { searchAfter: _ignore, ...propre } = c
  const raw: Contact = { ...(ancienRaw ?? {}), ...propre }
  if (ancienRaw && 'attributions' in ancienRaw && !('attributions' in propre)) raw.attributions = ancienRaw.attributions
  return {
    ghl_id:      String(c.id ?? ''),
    location_id: locationId,
    first_name:  String(c.firstNameRaw ?? c.firstName ?? ''),
    last_name:   String(c.lastNameRaw ?? c.lastName ?? ''),
    email:       String(c.email ?? ''),
    phone:       String(c.phone ?? ''),
    tags:        (c.tags ?? []) as string[],
    source:      String(c.source ?? ''),
    raw,
    synced_at:   maintenant,
  }
}

// Corps de recherche : contacts modifiés après `depuisIso`, du plus ancien au plus récent
export function corpsRechercheModifies(locationId: string, depuisIso: string, searchAfter?: unknown[] | null, pageLimit = 100) {
  const corps: Record<string, unknown> = {
    locationId,
    pageLimit,
    filters: [{ field: 'dateUpdated', operator: 'range', value: { gt: depuisIso } }],
    sort: [{ field: 'dateUpdated', direction: 'asc' }],
  }
  if (searchAfter) corps.searchAfter = searchAfter
  return corps
}

// La liste GHL arrive du plus récent au plus ancien (dateAdded décroissant) et
// ignore le filtre startDate. On garde les contacts ajoutés depuis `depuisMs` et
// on signale qu'il faut arrêter dès qu'un contact plus ancien apparaît.
export function nouveauxDepuis(contacts: Contact[], depuisMs: number) {
  const gardes: Contact[] = []
  let fini = false
  for (const c of contacts) {
    const t = Date.parse(String(c.dateAdded ?? ''))
    if (Number.isNaN(t) || t < depuisMs) { fini = true; continue }
    gardes.push(c)
  }
  return { gardes, fini }
}
