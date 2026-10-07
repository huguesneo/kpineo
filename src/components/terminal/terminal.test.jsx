// Terminal, rendu côté serveur (pas de DOM dans les tests du hub) : menus d'attribution et bouton « Annuler ».
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AttributionVente from './AttributionVente'
import AnnulerVente from './AnnulerVente'

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
