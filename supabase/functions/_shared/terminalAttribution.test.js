import { describe, it, expect } from 'vitest'
import {
  NONE, attributionLists, attributionComplete, cancelChoices, confirmText, firstNameCap, isSupervisorEmail,
  matchByFirstName, resolveAttribution,
} from './terminalAttribution.js'

const profiles = [
  { id: 'hugues', full_name: 'Hugues Pugliese', role: 'admin', secondary_roles: ['closer'] },
  { id: 'cloe', full_name: 'Cloé NEO', role: 'service_client', secondary_roles: ['setter', 'closer'] },
  { id: 'maude', full_name: 'Maude NEO', role: 'setter', secondary_roles: ['closer'] },
  { id: 'kassy', full_name: 'Kassy NEO', role: 'setter', secondary_roles: [] },
  { id: 'mm', full_name: 'Marie-Michèle NEO', role: 'closer', secondary_roles: ['setter'] },
  { id: 'tamara', full_name: 'Tamara', role: 'naturopathe', secondary_roles: [] },
  { id: 'brice', full_name: 'Brice NEO', role: 'naturopathe', secondary_roles: ['closer', 'setter'] },
  { id: 'test', full_name: 'neo test', role: 'closer', secondary_roles: ['setter'] },
  { id: 'pierre', full_name: 'Pierre Pugliese', role: 'admin', secondary_roles: [] },
  { id: 'parti', full_name: 'Ancien NEO', role: 'closer', secondary_roles: [], is_active: false },
]
const lists = attributionLists(profiles)
const ids = (l) => l.map(i => i.id)

describe('firstNameCap / isSupervisorEmail', () => {
  it('prénom seulement, avec majuscule', () => {
    expect(firstNameCap('cloé NEO')).toBe('Cloé')
    expect(firstNameCap('marie-michèle cardinal')).toBe('Marie-Michèle')
    expect(firstNameCap('')).toBe(null)
  })
  it('hugues@ et info@ seulement', () => {
    expect(isSupervisorEmail('Info@NeoPerformance.ca')).toBe(true)
    expect(isSupervisorEmail('hugues@neoperformance.ca')).toBe(true)
    expect(isSupervisorEmail('maude@neoperformance.ca')).toBe(false)
  })
})

describe('attributionLists', () => {
  it('rôle principal ou secondaire, sans compte de test ni inactif, triés par prénom', () => {
    expect(ids(lists.closers)).toEqual(['brice', 'cloe', 'hugues', 'mm', 'maude'])
    expect(ids(lists.setters)).toEqual(['brice', 'cloe', 'kassy', 'mm', 'maude'])
    expect(ids(lists.therapists)).toEqual(['brice', 'tamara'])
    expect(lists.setters.find(i => i.id === 'kassy')).toEqual({ id: 'kassy', name: 'Kassy NEO', label: 'Kassy' })
  })
})

describe('matchByFirstName', () => {
  it('trouve le profil par le prénom lu dans GHL, accents et casse ignorés', () => {
    expect(matchByFirstName(lists.setters, 'Maude NEO')).toBe('maude')
    expect(matchByFirstName(lists.closers, 'cloe')).toBe('cloe')
    expect(matchByFirstName(lists.therapists, 'Jessica')).toBe(null)
    expect(matchByFirstName(lists.setters, null)).toBe(null)
  })
})

describe('resolveAttribution', () => {
  const sup = { canChooseCloser: true, selfId: 'cloe', selfName: 'Cloé NEO' }
  const closer = { canChooseCloser: false, selfId: 'mm', selfName: 'Marie-Michèle NEO' }

  it('info@ inscrit Maude comme closeur (et non Cloé) ; prénoms pour le reçu', () => {
    expect(resolveAttribution({ closerId: 'maude', setterId: 'kassy', therapistId: 'tamara' }, lists, sup)).toEqual({
      closerId: 'maude', closerName: 'Maude NEO', setterId: 'kassy', setterName: 'Kassy', therapistId: 'tamara', therapistName: 'Tamara',
    })
  })
  it('« Aucun » : id et nom à null', () => {
    const r = resolveAttribution({ closerId: 'maude', setterId: NONE, therapistId: NONE }, lists, sup)
    expect(r).toMatchObject({ setterId: null, setterName: null, therapistId: null, therapistName: null })
  })
  it('les trois sont obligatoires, pour tout le monde', () => {
    expect(resolveAttribution({ closerId: 'maude', setterId: 'kassy', therapistId: '' }, lists, sup).error).toMatch(/Choisis/)
    expect(resolveAttribution({ closerId: 'mm', setterId: '', therapistId: NONE }, lists, closer).error).toMatch(/Choisis/)
  })
  it('closeur normal : lui-même seulement, même s’il n’est pas dans la liste', () => {
    expect(resolveAttribution({ closerId: 'maude', setterId: NONE, therapistId: NONE }, lists, closer).error).toMatch(/toi-même/)
    const pierre = { canChooseCloser: false, selfId: 'pierre', selfName: 'Pierre Pugliese' }
    expect(resolveAttribution({ closerId: 'pierre', setterId: NONE, therapistId: NONE }, lists, pierre).closerName).toBe('Pierre Pugliese')
  })
  it('refuse un id hors liste', () => {
    expect(resolveAttribution({ closerId: 'kassy', setterId: NONE, therapistId: NONE }, lists, sup).error).toBe('Closeur invalide')
    expect(resolveAttribution({ closerId: 'maude', setterId: 'tamara', therapistId: NONE }, lists, sup).error).toBe('Setter invalide')
    expect(resolveAttribution({ closerId: 'maude', setterId: NONE, therapistId: 'kassy' }, lists, sup).error).toBe('Naturopathe invalide')
  })
  it('attributionComplete', () => {
    expect(attributionComplete({ closerId: 'a', setterId: NONE, therapistId: NONE })).toBe(true)
    expect(attributionComplete({ closerId: 'a', setterId: '', therapistId: NONE })).toBe(false)
  })
})

describe('cancelChoices', () => {
  const inst = (n, status, extra = {}) => ({ number: n, status, amount_cents: 50000, receipt_status: 'pending', ...extra })
  const SUP = { isSupervisor: true, profileId: 'cloe' }
  const MAUDE = { isSupervisor: false, profileId: 'maude' }
  const AUTRE = { isSupervisor: false, profileId: 'mm' }
  const byKey = (plan, who) => Object.fromEntries(cancelChoices(plan, who).map(c => [c.key, c]))

  // Justin Bélanger : carte refusée, rien d'encaissé, ni abonnement ni lien
  const justin = { closer_id: 'cloe', status: 'card_failed', payment_installments: [inst(1, 'scheduled', { attempts: 1 })] }
  // « Hugo » : saisie par Maude, en attente de la carte, lien actif
  const hugo = { closer_id: 'maude', status: 'pending_card', payment_installments: [inst(1, 'scheduled'), inst(2, 'scheduled'), inst(3, 'scheduled')] }
  // Programme actif, 1er versement payé, abonnement Moneris en marche
  const actif = {
    closer_id: 'maude', status: 'active', moneris_subscription_id: 'sub1', subscription_status: 'ACTIVE',
    payment_installments: [inst(1, 'paid', { receipt_status: 'sent' }), inst(2, 'scheduled')],
  }

  it('Justin Bélanger : Retirer permis ; Annuler le paiement grisé', () => {
    const c = byKey(justin, SUP)
    expect(c.remove_plan).toMatchObject({ visible: true, enabled: true })
    expect(c.stop_payments).toMatchObject({ visible: true, enabled: false, reason: 'Aucun prélèvement à venir chez Moneris.' })
    expect(c.cancel_plan).toMatchObject({ visible: true, enabled: true })
  })
  it('Hugo : Maude voit seulement Retirer, sur sa vente', () => {
    const c = byKey(hugo, MAUDE)
    expect(c.remove_plan).toMatchObject({ visible: true, enabled: true })
    expect(c.stop_payments.visible).toBe(false)
    expect(c.cancel_plan.visible).toBe(false)
  })
  it('un autre closeur ne voit rien sur la vente de Maude', () => {
    expect(cancelChoices(hugo, AUTRE).filter(c => c.visible)).toEqual([])
  })
  it('paiement encaissé : Retirer grisé, renvoie au remboursement ; Annuler le paiement permis', () => {
    const c = byKey(actif, SUP)
    expect(c.remove_plan).toMatchObject({ enabled: false, reason: 'Un paiement a été encaissé : faire un remboursement.' })
    expect(c.stop_payments.enabled).toBe(true)
  })
  it('carte validée sans débit (abonnement, 0 $) : Retirer permis', () => {
    const futur = { ...actif, payment_installments: [inst(1, 'scheduled'), inst(2, 'scheduled')] }
    expect(byKey(futur, MAUDE).remove_plan.enabled).toBe(true)
  })
  it('paiement en cours : Retirer grisé', () => {
    const enCours = { ...justin, payment_installments: [inst(1, 'processing')] }
    expect(byKey(enCours, SUP).remove_plan).toMatchObject({ enabled: false, reason: 'Un paiement est en cours : attends le résultat.' })
  })
  it('prélèvements déjà arrêtés / programme annulé / vente retirée', () => {
    expect(byKey({ ...actif, payments_stopped_at: 'x', subscription_status: 'CANCELED' }, SUP).stop_payments.reason).toBe('Les prélèvements sont déjà arrêtés.')
    expect(byKey({ ...actif, status: 'canceled' }, SUP).cancel_plan.enabled).toBe(false)
    expect(cancelChoices({ ...justin, removed_at: 'x' }, SUP).filter(c => c.visible)).toEqual([])
  })
})

describe('confirmText', () => {
  const p = { client_first_name: 'Justin', client_last_name: 'Bélanger', status: 'card_failed' }
  it('dit ce qui va se passer', () => {
    expect(confirmText('stop_payments', p)).toMatch(/Le client reste dans son programme/)
    expect(confirmText('cancel_plan', p)).toMatch(/statut-client-annuler/)
    expect(confirmText('remove_plan', p)).toMatch(/Retirer la vente de Justin Bélanger \?.*Le lien de paiement ne fonctionnera plus\./)
    expect(confirmText('remove_plan', { ...p, status: 'active', moneris_subscription_id: 's', subscription_status: 'ACTIVE' }))
      .toMatch(/L’abonnement Moneris sera annulé\./)
  })
})
