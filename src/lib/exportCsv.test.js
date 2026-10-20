import { describe, it, expect } from 'vitest'
import { toCsv } from './exportCsv'

describe('toCsv', () => {
  const colonnes = [{ cle: 'nom', titre: 'Nom' }, { cle: 'montant', titre: 'Montant' }, { cle: 'note', titre: 'Note' }]
  it('point-virgule, guillemets doublés, accents gardés, vide pour null', () => {
    expect(toCsv([{ nom: 'Mélanie "Mel" Hébert', montant: 2400.5, note: null }], colonnes))
      .toBe('Nom;Montant;Note\r\n"Mélanie ""Mel"" Hébert";2400,5;')
  })
  it('protège les champs avec ; ou retour de ligne', () => {
    expect(toCsv([{ nom: 'a;b', montant: 0, note: 'ligne 1\nligne 2' }], colonnes))
      .toBe('Nom;Montant;Note\r\n"a;b";0;"ligne 1\nligne 2"')
  })
  it('neutralise les formules Excel', () => {
    expect(toCsv([{ nom: '=SOMME(A1)', montant: 1, note: '' }], colonnes).split('\r\n')[1]).toBe("'=SOMME(A1);1;")
  })
})
