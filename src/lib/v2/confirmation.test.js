import { describe, it, expect } from 'vitest'
import {
  indexConfirmations, etatConfirmation, rdvConfirmable, peutConfirmer, etatAffiche, DELAI_MAJ_MS,
  indexManuelles, appelsDepuis, fmtAppel, filtrerAConfirmer, enrichirAConfirmer,
} from './confirmation'
import { PIPELINE_VENTE, PIPELINE_SETTING, CALENDARS } from './salesConfig'

const NOW = new Date('2026-10-05T15:00:00Z').getTime()
const h = n => new Date(NOW + n * 3_600_000).toISOString()
const V = PIPELINE_VENTE.stages
const vente = (contact, stage, cree = h(-48), extra = {}) =>
  ({ ghl_id: `v-${contact}-${cree}`, contact_id: contact, pipeline_id: PIPELINE_VENTE.id, pipeline_stage_id: stage, created_at_ghl: cree, ...extra })

describe('état de confirmation (carte Vente)', () => {
  it('RDV confirmé, RDV booké, autre étape, carte la plus récente', () => {
    const idx = indexConfirmations([
      vente('a', V.rdvConfirme),
      vente('b', V.rdvBooke),
      vente('c', V.enDecision),
      vente('d', V.rdvConfirme, h(-100)),           // ancienne carte
      vente('d', V.rdvBooke, h(-10)),               // la plus récente gagne
      { ...vente('e', V.rdvConfirme), pipeline_id: PIPELINE_SETTING.id }, // pas Vente
    ])
    expect(idx).toEqual({ a: 'confirme', b: 'nonConfirme', c: null, d: 'nonConfirme' })
    expect(etatConfirmation('a', idx)).toBe('confirme')
    expect(etatConfirmation('c', idx)).toBe(null)
    expect(etatConfirmation('e', idx)).toBe('nonConfirme')   // sans carte Vente
    expect(etatConfirmation(null, idx)).toBe(null)
  })
})

describe('rdvConfirmable', () => {
  const appt = extra => ({ contact_id: 'a', calendar_id: CALENDARS.decouvertePublic, status: 'confirmed', start_time: h(5), ...extra })
  it('découverte, active, à venir', () => {
    expect(rdvConfirmable(appt(), NOW)).toBe(true)
    expect(rdvConfirmable(appt({ status: 'new' }), NOW)).toBe(true)
  })
  it('refus : décision, annulé, statué, passé, sans contact', () => {
    expect(rdvConfirmable(appt({ calendar_id: CALENDARS.decision }), NOW)).toBe(false)
    expect(rdvConfirmable(appt({ status: 'cancelled' }), NOW)).toBe(false)
    expect(rdvConfirmable(appt({ status: 'showed' }), NOW)).toBe(false)
    expect(rdvConfirmable(appt({ start_time: h(-1) }), NOW)).toBe(false)
    expect(rdvConfirmable(appt({ contact_id: '' }), NOW)).toBe(false)
  })
})

describe('peutConfirmer', () => {
  it('setter, closeur, admin, resp_vente (rôle principal ou secondaire)', () => {
    expect(peutConfirmer({ role: 'setter' })).toBe(true)
    expect(peutConfirmer({ role: 'closer' })).toBe(true)
    expect(peutConfirmer({ role: 'naturo', secondary_roles: ['resp_vente'] })).toBe(true)
    expect(peutConfirmer({ role: 'naturo' })).toBe(false)
    expect(peutConfirmer(null)).toBe(false)
  })
})

describe('etatAffiche', () => {
  it('juste après un clic, tant que la carte n’a pas bougé', () => {
    expect(etatAffiche('nonConfirme', { action: 'confirmer', at: NOW - 1000 }, NOW)).toBe('confirmationEnCours')
    expect(etatAffiche('confirme', { action: 'confirmer', at: NOW - 1000 }, NOW)).toBe('confirme')
    expect(etatAffiche('confirme', { action: 'annuler', at: NOW - 1000 }, NOW)).toBe('annulationEnCours')
    expect(etatAffiche('nonConfirme', { action: 'annuler', at: NOW - 1000 }, NOW)).toBe('nonConfirme')
  })
  it('après le délai, ou sans clic : l’état de la carte', () => {
    expect(etatAffiche('nonConfirme', { action: 'confirmer', at: NOW - DELAI_MAJ_MS - 1 }, NOW)).toBe('nonConfirme')
    expect(etatAffiche('confirme', null, NOW)).toBe('confirme')
  })
})

describe('indexManuelles', () => {
  it('garde les confirmations actives', () => {
    expect(indexManuelles([
      { appointment_id: 'r1', confirme_par_nom: 'Maude' },
      { appointment_id: 'r2', annule_le: h(-1) },
    ])).toEqual({ r1: { appointment_id: 'r1', confirme_par_nom: 'Maude' } })
  })
})

describe('appels', () => {
  const appels = {
    a: [
      { date: h(-1), statut: 'completed', duree: 55, sortant: true },
      { date: h(-30), statut: 'no-answer', duree: null, sortant: true },
    ],
    b: [{ date: h(-2), statut: 'completed', duree: 40, sortant: false }],
  }
  it('appels sortants depuis la réservation', () => {
    expect(appelsDepuis(appels, 'a', h(-48))).toEqual({ nb: 2, dernier: appels.a[0] })
    expect(appelsDepuis(appels, 'a', h(-10)).nb).toBe(1)
    expect(appelsDepuis(appels, 'a', h(0)).nb).toBe(0)       // avant la réservation : pas compté
    expect(appelsDepuis(appels, 'b', h(-48)).nb).toBe(0)     // entrant : pas un appel du setter
    expect(appelsDepuis(appels, 'z', null)).toEqual({ nb: 0, dernier: null })
    expect(appelsDepuis(appels, 'a', null).nb).toBe(2)       // date de réservation inconnue
  })
  it('libellé', () => {
    expect(fmtAppel(null, NOW)).toBe('Pas appelé')
    expect(fmtAppel({ date: h(-1), statut: 'completed', duree: 55 }, NOW)).toBe('Auj. 10 h 00 · répondu 55 s')
    expect(fmtAppel({ date: h(-24), statut: 'no-answer' }, NOW)).toBe('Hier 11 h · pas de réponse')
    expect(fmtAppel({ date: h(-1), statut: 'failed' }, NOW)).toBe('Auj. 10 h 00 · échoué')
  })
})

describe('filtrerAConfirmer', () => {
  const leads = [
    { contactId: 'a', confirmation: 'confirme', appel: { nb: 1 } },
    { contactId: 'b', confirmation: 'nonConfirme', appel: { nb: 0 } },
    { contactId: 'c', confirmation: 'confirmationEnCours', appel: { nb: 0 } },
    { contactId: 'd', confirmation: 'nonConfirme', appel: { nb: 2 } },
    { contactId: 'e', confirmation: 'nonConfirme' },          // journal d'appels pas encore chargé
  ]
  const ids = f => filtrerAConfirmer(leads, f).map(l => l.contactId)
  it('confirmés / non confirmés', () => {
    expect(ids({ confirmation: 'tous', appel: 'tous' })).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(ids({ confirmation: 'confirmes', appel: 'tous' })).toEqual(['a', 'c'])
    expect(ids({ confirmation: 'nonConfirmes', appel: 'tous' })).toEqual(['b', 'd', 'e'])
  })
  it('appelés / pas appelés, combinés', () => {
    expect(ids({ confirmation: 'tous', appel: 'appeles' })).toEqual(['a', 'd'])
    expect(ids({ confirmation: 'tous', appel: 'nonAppeles' })).toEqual(['b', 'c', 'e'])
    expect(ids({ confirmation: 'nonConfirmes', appel: 'nonAppeles' })).toEqual(['b', 'e'])
  })
})

describe('enrichirAConfirmer', () => {
  const leads = [
    { contactId: 'a', rdvAVenir: true, confirmation: 'nonConfirme', rdvRef: { ghlId: 'r1', dateAjout: h(-48) } },
    { contactId: 'b', rdvAVenir: true, confirmation: 'confirme', rdvRef: { ghlId: 'r2', dateAjout: h(-5) } },
    { contactId: 'c', rdvAVenir: false, confirmation: null, rdvRef: null, changementEtape: h(-72) },
  ]
  const appels = { a: [{ date: h(-1), statut: 'completed', duree: 30, sortant: true }], c: [{ date: h(-2), statut: 'no-answer', sortant: true }] }
  it('clic récent et appels depuis la réservation', () => {
    const r = enrichirAConfirmer(leads, { locaux: { r1: { action: 'confirmer', at: NOW - 5000 } }, appels, now: NOW })
    expect(r.map(l => [l.contactId, l.confirmation, l.appel.nb])).toEqual([
      ['a', 'confirmationEnCours', 1], ['b', 'confirme', 0], ['c', null, 1],
    ])
  })
  it('journal pas chargé : appel null', () => {
    expect(enrichirAConfirmer(leads, { now: NOW }).map(l => l.appel)).toEqual([null, null, null])
  })
})
