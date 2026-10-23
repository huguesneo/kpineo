// Terminal, rendu côté serveur (pas de DOM dans les tests du hub) : menus d'attribution et bouton « Annuler ».
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AttributionVente from './AttributionVente'
import AnnulerVente from './AnnulerVente'
import ModifierDates from './ModifierDates'
import PaiementUnique from './PaiementUnique'
import FiltreDates, { SANS_DATE, plageDates, dateVente, dansPlage } from './FiltreDates'

const lists = {
  closers: [{ id: 'cloe', label: 'Cloé' }, { id: 'maude', label: 'Maude' }],
  setters: [{ id: 'kassy', label: 'Kassy' }],
  therapists: [{ id: 'tamara', label: 'Tamara' }],
}
const noop = () => {}

describe('AttributionVente', () => {
  it('info@ : closeur au choix, « Aucun » pour setter et naturopathe, rappel tant que ce n’est pas complet', () => {
    const html = renderToStaticMarkup(<AttributionVente
      options={{ lists, canChooseCloser: true, self: { id: 'cloe', name: 'Cloé NEO' } }}
      form={{ closerId: '', setterId: 'none', therapistId: '' }} onChange={noop} />)
    expect(html).toContain('>Maude</option>')
    expect(html).toContain('>Choisir…</option>')
    expect((html.match(/>Aucun<\/option>/g) ?? []).length).toBe(2)
    expect(html).toContain('Choisis le closeur, le setter et la naturopathe pour encaisser')
  })
  it('closeur normal : lui-même, menu verrouillé', () => {
    const html = renderToStaticMarkup(<AttributionVente
      options={{ lists, canChooseCloser: false, self: { id: 'mm', name: 'Marie-Michèle NEO' } }}
      form={{ closerId: 'mm', setterId: 'kassy', therapistId: 'none' }} onChange={noop} fromGhl />)
    expect(html).toMatch(/<select[^>]* disabled=""[^>]*><option value="mm"[^>]*>Marie-Michèle NEO<\/option><\/select>/)
    expect(html).not.toContain('>Maude</option>')
    expect(html).toContain('Prérempli depuis GHL')
    expect(html).not.toContain('pour encaisser')
  })
})

describe('AnnulerVente', () => {
  const inst = (status, extra = {}) => ({ number: 1, status, amount_cents: 63236, receipt_status: 'pending', ...extra })
  const justin = { closer_id: 'cloe', status: 'card_failed', client_first_name: 'Justin', client_last_name: 'Bélanger', payment_installments: [inst('scheduled')] }
  const SUP = { isSupervisor: true, profileId: 'cloe' }

  it('un seul bouton « Annuler » qui ouvre les trois choix ; ceux qui ne s’appliquent pas sont grisés avec la raison', () => {
    const html = renderToStaticMarkup(<AnnulerVente plan={justin} who={SUP} onConfirm={noop} ouvertInitial />)
    expect(html).toContain('>Annuler</button>')
    expect(html).toMatch(/<button[^>]* disabled=""[^>]*>Annuler le paiement<\/button>/)
    expect(html).toContain('Aucun prélèvement à venir chez Moneris.')
    expect(html).toMatch(/<button(?![^>]* disabled="")[^>]*>Annuler le programme<\/button>/)
    expect(html).toMatch(/<button(?![^>]* disabled="")[^>]*>Retirer \(erreur ou carte refusée\)<\/button>/)
  })
  it('paiement encaissé : Retirer grisé, « faire un remboursement »', () => {
    const paye = { ...justin, status: 'active', payment_installments: [inst('paid', { receipt_status: 'sent' })] }
    const html = renderToStaticMarkup(<AnnulerVente plan={paye} who={SUP} onConfirm={noop} ouvertInitial />)
    expect(html).toMatch(/<button[^>]* disabled=""[^>]*>Retirer \(erreur ou carte refusée\)<\/button>/)
    expect(html).toContain('Un paiement a été encaissé : faire un remboursement.')
  })
  it('Retirer : confirmation avec raison obligatoire', () => {
    const html = renderToStaticMarkup(<AnnulerVente plan={justin} who={SUP} onConfirm={noop} ouvertInitial choixInitial="remove_plan" />)
    expect(html).toContain('Retirer la vente de Justin Bélanger ?')
    expect(html).toContain('Raison')
    expect(html).toMatch(/<button[^>]* disabled=""[^>]*>Confirmer<\/button>/)
  })
  it('closeur sur la vente d’un autre : pas de bouton', () => {
    expect(renderToStaticMarkup(<AnnulerVente plan={justin} who={{ isSupervisor: false, profileId: 'maude' }} onConfirm={noop} />)).toBe('')
  })
})

describe('ModifierDates', () => {
  const inst = (number, status, due_date) => ({ id: `i${number}`, number, status, due_date, amount_cents: 55188 })
  const jessica = {
    status: 'active', client_first_name: 'Jessica', client_last_name: 'Lapointe',
    moneris_subscription_id: 'sr1', subscription_status: 'ACTIVE', frequency_unit: 'WEEK', frequency_interval: 2,
    payment_installments: [inst(1, 'paid', '2026-10-20'), inst(2, 'scheduled', '2099-11-18'), inst(3, 'scheduled', '2099-12-02')],
  }

  it('hugues@ et info@ : bouton et fenêtre ; les paiements passés restent inchangés', () => {
    const html = renderToStaticMarkup(<ModifierDates plan={jessica} who={{ isSupervisor: true }} onConfirm={noop} ouvertInitial />)
    expect(html).toContain('>Modifier les dates</button>')
    expect(html).toContain('Payé, inchangé')
    expect(html).toContain('value="2099-11-18"')
  })
  it('closeur : pas de bouton', () => {
    expect(renderToStaticMarkup(<ModifierDates plan={jessica} who={{ isSupervisor: false }} onConfirm={noop} />)).toBe('')
  })
  it('prélèvements arrêtés : pas de bouton', () => {
    const arrete = { ...jessica, payments_stopped_at: '2026-10-21' }
    expect(renderToStaticMarkup(<ModifierDates plan={arrete} who={{ isSupervisor: true }} onConfirm={noop} />)).toBe('')
  })
})

describe('PaiementUnique', () => {
  it('description et montant avant taxes, sans échéancier ni produit QuickBooks', () => {
    const html = renderToStaticMarkup(<PaiementUnique onCreate={noop} />)
    expect(html).toContain('Paiement unique')
    expect(html).toContain('Rien n’est créé dans QuickBooks')
    expect(html).toContain('Montant avant taxes')
    expect(html).not.toContain('Prélever tous les')
  })
})

describe('FiltreDates', () => {
  const vente = (created_at, extra = {}) => ({ created_at, status: 'active', total_amount_cents: 10000, payment_installments: [], ...extra })
  it('date de la vente à l’heure de Montréal : 23 h 30 le 22 octobre = 03 h 30 UTC le 23', () => {
    expect(dateVente(vente('2026-10-23T03:30:00Z'))).toBe('2026-10-22')
    expect(dansPlage(vente('2026-10-23T03:30:00Z'), { du: '2026-10-23', au: '2026-10-23' })).toBe(false)
    expect(dansPlage(vente('2026-10-23T05:00:00Z'), { du: '2026-10-23', au: '2026-10-23' })).toBe(true)
  })
  it('plage : aujourd’hui, bornes inversées, une seule borne, aucune', () => {
    expect(plageDates({ mode: 'today' }, '2026-10-23')).toEqual({ du: '2026-10-23', au: '2026-10-23' })
    expect(plageDates({ mode: 'range', du: '2026-10-20', au: '2026-10-01' })).toEqual({ du: '2026-10-01', au: '2026-10-20' })
    expect(plageDates({ mode: 'range', du: '2026-10-05', au: '' })).toEqual({ du: '2026-10-05', au: '2026-10-05' })
    expect(plageDates({ mode: 'range', du: '', au: '' })).toBeNull()
    expect(plageDates(SANS_DATE)).toBeNull()
  })
  it('total de la période, sans les ventes annulées', () => {
    const html = renderToStaticMarkup(<FiltreDates value={{ mode: 'range', du: '2026-10-01', au: '2026-10-23' }} onChange={noop} plans={[
      vente('2026-10-02T15:00:00Z', { payment_installments: [{ status: 'paid', amount_cents: 2500 }] }),
      vente('2026-10-03T15:00:00Z'),
      vente('2026-10-04T15:00:00Z', { status: 'canceled' }),
    ]} />)
    expect(html).toContain('2 ventes')
    expect(html).toContain('du 2026-10-01 au 2026-10-23')
    expect(html).toMatch(/200,00\s\$/)
    expect(html).toMatch(/25,00\s\$/)
  })
})
