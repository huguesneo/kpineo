import { describe, it, expect } from 'vitest'
import { texteBandeau, derniereAnnulable, bilanLot, suivantApres } from './actions'

describe('bandeau', () => {
  it('compte les actions', () => {
    expect(texteBandeau(1)).toBe('1 action en cours')
    expect(texteBandeau(3)).toBe('3 actions en cours')
  })
  it('annule la dernière encore annulable', () => {
    expect(derniereAnnulable([{ cle: 'a', annulable: true }, { cle: 'b', annulable: true }, { cle: 'c', annulable: false }]).cle).toBe('b')
    expect(derniereAnnulable([{ cle: 'c', annulable: false }])).toBe(null)
  })
})

describe('bilan d’une action groupée', () => {
  it('tout est parti : aucune erreur', () => {
    expect(bilanLot({ ok: true, resultats: [{ id: '1', ok: true }, { id: '2', ok: true }] }, 'rejeter', 2)).toEqual({ echecs: [], erreurs: [] })
  })
  it('rapporte chaque échec et les fils non archivés', () => {
    const b = bilanLot({ ok: true, resultats: [{ id: '1', ok: false, erreur: 'Déjà traité' }, { id: '2', ok: true, gmailErreur: 'quota' }, { id: '3', ok: true }] }, 'rejeter', 3)
    expect(b.echecs).toEqual(['1'])
    expect(b.erreurs).toEqual(['1 dossier sur 3 non rejetés : Déjà traité', '1 dossier non archivé dans Gmail : ouvre-le pour réessayer'])
  })
  it('réponse vide : erreur, jamais de silence', () => {
    expect(bilanLot({ ok: true, resultats: [] }, 'rejeter', 2).erreurs.length).toBe(1)
    expect(bilanLot(null, 'rejeter', 2).echecs).toBe(null)
  })
})

describe('dossier suivant', () => {
  const file = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
  it('garde la sélection si elle reste', () => expect(suivantApres(file, ['b'], 'a')).toBe('a'))
  it('prend le suivant restant, sinon le précédent', () => {
    expect(suivantApres(file, ['b', 'c'], 'b')).toBe('d')
    expect(suivantApres(file, ['c', 'd'], 'd')).toBe('b')
    expect(suivantApres(file, ['a', 'b', 'c', 'd'], 'a')).toBe(null)
  })
})
