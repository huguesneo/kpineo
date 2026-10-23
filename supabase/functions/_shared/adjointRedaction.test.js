import { describe, it, expect } from 'vitest'
import {
  MODELE_REDACTION, PROMPT_SYSTEME, messageUtilisateur, requeteAnthropic, texteReponse, nettoyerBrouillon,
  avertissementsBrouillon, ajouterJournalRedaction,
} from './adjointRedaction.js'

const args = {
  consigne: 'refuse le remboursement, offre une pause du programme',
  messageRecu: 'Je veux être remboursée.',
  sujet: 'Remboursement',
  fiche: { prenom: 'Nathalie', nom: 'Roy', statut: 'Client actif', naturopathe: 'Thibault', programme: 'Semaine 4 sur 15' },
  echanges: [{ canal: 'Courriel', quand: '16 oct.', sujet: 'Suivi', extrait: 'Merci!' }],
}

describe('requête de rédaction', () => {
  it('modèle, prompt système et contexte complet', () => {
    const r = requeteAnthropic(args)
    expect(r.model).toBe(MODELE_REDACTION)
    expect(r.model).toBe('claude-sonnet-5-5')
    expect(r.system).toBe(PROMPT_SYSTEME)
    const m = r.messages[0].content
    for (const attendu of ['refuse le remboursement', 'Nathalie', 'Client actif', 'Thibault', 'Semaine 4 sur 15', 'Suivi', 'Je veux être remboursée.']) {
      expect(m).toContain(attendu)
    }
  })
  it('champs absents : « non renseigné », aucun échange', () => {
    const m = messageUtilisateur({ consigne: 'ok', messageRecu: null, fiche: {} })
    expect(m).toContain('Naturopathe : non renseigné')
    expect(m).toContain('- aucun')
  })
  it('le prompt système porte le style de Cloé', () => {
    for (const regle of ['Bonjour [Prénom] :)', 'Merci à toi et bonne journée!', 'naturopathe', 'diagnostic', 'tiret cadratin']) {
      expect(PROMPT_SYSTEME).toContain(regle)
    }
    expect(PROMPT_SYSTEME).not.toMatch(/—/)
  })
})

describe('réponse et brouillon', () => {
  it('extrait le texte des blocs', () => {
    expect(texteReponse({ content: [{ type: 'text', text: 'Bonjour ' }, { type: 'text', text: 'Nathalie' }] })).toBe('Bonjour Nathalie')
    expect(texteReponse({})).toBe('')
  })
  it('retire tirets cadratins et guillemets autour', () => {
    expect(nettoyerBrouillon('« Bonjour — Nathalie »')).toBe('Bonjour, Nathalie')
  })
  it('avertissements à la relecture', () => {
    const a = avertissementsBrouillon('Bonjour :) 😊 N’hésitez pas, votre coach vous offre un crédit. Diagnostic: frais.', 'offre une pause')
    expect(a).toEqual(expect.arrayContaining([
      '« N’hésitez pas »', 'Vouvoiement', 'Le mot « coach » (on dit naturopathe)', 'Le mot « diagnostic »',
      'Frais, préavis ou politique d’annulation', 'Plus d’un emoji', 'Promesse d’argent absente de la consigne (crédit)',
    ]))
    expect(avertissementsBrouillon('Bonjour Nathalie :)\n\nPas de souci, on met ton remboursement en route.', 'accepte le remboursement')).toEqual([])
  })
  it('journal : garde les 10 dernières', () => {
    let j = null
    for (let i = 0; i < 12; i++) j = ajouterJournalRedaction(j, { n: i })
    expect(j).toHaveLength(10)
    expect(j[0].n).toBe(2)
    expect(ajouterJournalRedaction({ n: 'ancien' }, { n: 1 })).toEqual([{ n: 'ancien' }, { n: 1 }])
  })
})
