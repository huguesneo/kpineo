import { describe, it, expect } from 'vitest'
import { ligneContactComplete, ligneContactModifie, corpsRechercheModifies } from './contacts'

const T = '2026-10-02T15:00:00.000Z'

describe('copie des contacts GHL', () => {
  it('ligne complète : premier et dernier contact UTM, location_id toujours présent', () => {
    const l = ligneContactComplete({
      id: 'c1', firstName: 'Mary', lastName: 'Day-Leroy', phone: '+1514', email: 'm@x.ca', dateAdded: '2025-12-16T21:22:09.975Z',
      attributions: [
        { isFirst: true, utmCampaign: 'camp1', utmSource: 'fb', url: 'https://a', referrer: 'r' },
        { utmCampaign: 'camp2', utmSource: 'ig', utmMedium: 'paid', url: 'https://b' },
      ],
    }, 'LOC', T)
    expect(l).toMatchObject({
      ghl_id: 'c1', location_id: 'LOC', first_name: 'Mary', last_name: 'Day-Leroy', phone: '+1514',
      utm_campaign: 'camp1', utm_source: 'fb', utm_campaign_last: 'camp2', utm_source_last: 'ig', utm_medium_last: 'paid',
      first_page_url: 'https://a', last_page_url: 'https://b', first_referrer: 'r', touch_count: 2,
      created_at_ghl: '2025-12-16T21:22:09.975Z', synced_at: T,
    })
  })

  it('garde la vraie graphie du nom (la liste GHL renvoie des minuscules)', () => {
    const l = ligneContactComplete({ id: 'c3', firstName: 'mary', firstNameRaw: 'Mary', lastName: 'day-leroy', lastNameRaw: 'Day-Leroy' }, 'LOC', T)
    expect([l.first_name, l.last_name]).toEqual(['Mary', 'Day-Leroy'])
    const m = ligneContactModifie({ id: 'c3', firstName: 'Mary', lastName: 'Day-Leroy' }, 'LOC', T, null)
    expect([m.first_name, m.last_name]).toEqual(['Mary', 'Day-Leroy'])
  })

  it('ligne complète sans attributions : UTM vides, touch_count 0', () => {
    const l = ligneContactComplete({ id: 'c2' }, 'LOC', T)
    expect(l).toMatchObject({ utm_campaign: '', utm_source_last: null, touch_count: 0, created_at_ghl: null })
  })

  it('contact modifié : identité mise à jour, aucune colonne UTM, attributions conservées', () => {
    const ancien = { id: 'c1', firstName: 'mary f', attributions: [{ utmCampaign: 'camp1' }], customFields: [{ id: 'a', value: '1' }] }
    const l = ligneContactModifie(
      { id: 'c1', firstName: 'Mary', lastName: 'Day-Leroy', phone: '+1514', customFields: [{ id: 'a', value: '2' }], searchAfter: [1, 'x'] },
      'LOC', T, ancien,
    )
    expect(l).toEqual({
      ghl_id: 'c1', location_id: 'LOC', first_name: 'Mary', last_name: 'Day-Leroy', email: '', phone: '+1514',
      tags: [], source: '', synced_at: T,
      raw: { id: 'c1', firstName: 'Mary', lastName: 'Day-Leroy', phone: '+1514', customFields: [{ id: 'a', value: '2' }], attributions: [{ utmCampaign: 'camp1' }] },
    })
    for (const col of ['utm_campaign', 'utm_source_last', 'touch_count', 'created_at_ghl']) expect(l).not.toHaveProperty(col)
  })

  it('contact modifié jamais vu : raw = contact reçu, sans searchAfter', () => {
    const l = ligneContactModifie({ id: 'n1', firstName: 'A', searchAfter: [1] }, 'LOC', T, null)
    expect(l.raw).toEqual({ id: 'n1', firstName: 'A' })
  })

  it('corps de recherche des contacts modifiés', () => {
    expect(corpsRechercheModifies('LOC', '2026-10-02T14:00:00Z')).toEqual({
      locationId: 'LOC', pageLimit: 100,
      filters: [{ field: 'dateUpdated', operator: 'range', value: { gt: '2026-10-02T14:00:00Z' } }],
      sort: [{ field: 'dateUpdated', direction: 'asc' }],
    })
    expect(corpsRechercheModifies('LOC', 'x', [5, 'id']).searchAfter).toEqual([5, 'id'])
  })
})
