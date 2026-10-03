import { describe, it, expect } from 'vitest'
import {
  annulationDemandee, etatAnnulation, confirmationAnnulation, texteAnnulationEnCours,
  messageResultatAnnulation, messageErreurAnnulation, texteTacheAnnulee, texteAnnulationTardive, texteARemettre,
} from './montageAnnulation'
import { etatEnvoi, filConversation } from './montageEditeur'
import { statutTemplate } from './montageTemplates'

const HUGUES = 'hugues@neoperformance.ca'
const INFO = 'info@neoperformance.ca'
const tache = (statut, extra = {}) => ({ id: 't1', type: 'montage', statut, created_at: '2026-10-03T10:00:00Z', cree_par: INFO, payload: { prompt: 'Coupe le début' }, ...extra })
const DEMANDE = '2026-10-03T10:05:00Z'

describe('etatAnnulation', () => {
  it('en attente : un clic, sans confirmation', () => {
    expect(etatAnnulation(tache('en_attente'), { email: INFO })).toEqual({ visible: true, desactive: false, confirmer: false })
  })
  it('en cours : confirmation', () => {
    expect(etatAnnulation(tache('en_cours'), { email: INFO })).toMatchObject({ visible: true, desactive: false, confirmer: true })
  })
  it('annulation déjà demandée : visible mais désactivé', () => {
    const t = tache('en_cours', { annulation_demandee_le: DEMANDE })
    expect(annulationDemandee(t)).toBe(true)
    expect(etatAnnulation(t, { email: INFO })).toMatchObject({ visible: true, desactive: true })
  })
  it('tâche finie ou absente : pas de bouton', () => {
    for (const statut of ['fait', 'erreur', 'annulee']) expect(etatAnnulation(tache(statut), { email: HUGUES }).visible).toBe(false)
    expect(etatAnnulation(null).visible).toBe(false)
  })
  it('enregistrer_style : Hugues seulement', () => {
    const t = tache('en_cours', { type: 'enregistrer_style', job_id: null })
    expect(etatAnnulation(t, { email: INFO }).visible).toBe(false)
    expect(etatAnnulation(t, { email: 'Hugues@neoperformance.ca' }).visible).toBe(true)
  })
  it('les six types sont annulables', () => {
    for (const type of ['montage', 'correction_sous_titres', 'restaurer', 'terminer', 'variante', 'enregistrer_style']) {
      expect(etatAnnulation(tache('en_attente', { type }), { email: HUGUES }).visible).toBe(true)
    }
  })
})

describe('textes', () => {
  it('confirmation selon le type et la version', () => {
    expect(confirmationAnnulation(tache('en_cours'), { version_courante: 3 }).texte).toContain('le montage reste à la v3')
    expect(confirmationAnnulation(tache('en_cours'), { version_courante: 0 }).texte).toContain('tu pourras le relancer')
    expect(confirmationAnnulation(tache('en_cours', { type: 'terminer' })).titre).toBe('Arrêter le rendu HD ?')
    expect(confirmationAnnulation(tache('en_cours', { type: 'variante' })).texte).toContain('supprime le montage en préparation')
    expect(confirmationAnnulation(tache('en_cours', { type: 'enregistrer_style' })).texte).toContain('reste approuvé')
  })
  it('annulation en cours : Mac en ligne ou hors ligne', () => {
    const t = tache('en_cours', { annulation_demandee_le: DEMANDE })
    expect(texteAnnulationEnCours(t)).toBe('Annulation en cours… le Mac arrête la ronde, aucune nouvelle version ne sera créée.')
    expect(texteAnnulationEnCours(t, { enLigne: false })).toBe('Annulation demandée. Le Mac est hors ligne : elle sera faite à son retour, aucune nouvelle version ne sera créée.')
    expect(texteAnnulationEnCours({ ...t, type: 'terminer' })).toContain('rien ne sera exporté')
  })
  it('réponses de la base', () => {
    expect(messageResultatAnnulation('deja_finie')).toContain('Trop tard')
    for (const code of ['annulee', 'demandee', 'deja_demandee']) expect(messageResultatAnnulation(code)).toBeNull()
  })
  it('erreurs claires', () => {
    expect(messageErreurAnnulation({ message: "Seul Hugues peut annuler l'enregistrement d'un style" })).toBe("Seul Hugues peut annuler l'enregistrement d'un style.")
    expect(messageErreurAnnulation({ message: 'Accès refusé au module Montage vidéo' })).toContain("pas l'autorisation")
    expect(messageErreurAnnulation({ message: 'Failed to fetch' })).toContain('connexion a été coupée')
    expect(messageErreurAnnulation({ message: 'Tâche introuvable' })).toContain('Tâche introuvable')
  })
  it('ligne du fil : avant le début ou arrêtée en cours', () => {
    const avant = tache('annulee', { annulation_demandee_le: DEMANDE, annulee_le: DEMANDE })
    expect(texteTacheAnnulee(avant, 'Hugues')).toBe('Annulée par Hugues avant que le Mac la commence.')
    const arretee = tache('annulee', { annulation_demandee_le: DEMANDE, annulee_le: '2026-10-03T10:05:20Z' })
    expect(texteTacheAnnulee(arretee, 'Cloé')).toBe('Ronde arrêtée par Cloé : aucune version n\'a été créée.')
    expect(texteTacheAnnulee({ ...arretee, type: 'variante' })).toContain('aucun nouveau montage')
  })
  it('trop tard', () => {
    expect(texteAnnulationTardive(tache('fait'), 4)).toBe("L'annulation est arrivée trop tard : la v4 était déjà prête.")
    expect(texteAnnulationTardive(tache('fait', { type: 'terminer' }))).toContain('déjà dans Google Drive')
  })
  it('texte remis dans le champ : demande de montage seulement', () => {
    expect(texteARemettre(tache('annulee'))).toBe('Coupe le début')
    expect(texteARemettre(tache('annulee', { payload: {} }))).toBeNull()
    expect(texteARemettre(tache('annulee', { type: 'terminer' }))).toBeNull()
  })
})

describe('éditeur et templates', () => {
  it('etatEnvoi : champ bloqué pendant l\'annulation, libre après', () => {
    const job = { version_courante: 2 }
    expect(etatEnvoi({ job, taches: [tache('en_cours', { annulation_demandee_le: DEMANDE })] }).raison).toContain('Annulation en cours')
    expect(etatEnvoi({ job, taches: [tache('annulee')] }).desactive).toBe(false)
  })
  it('fil : tâche annulée à sa date, avec la tâche', () => {
    const t = tache('annulee', { annulation_demandee_le: DEMANDE, annulee_le: DEMANDE })
    const messages = filConversation({ versions: [], taches: [t] })
    expect(messages.map(m => m.role)).toEqual(['demande', 'annulee'])
    expect(messages[1].tache).toBe(t)
  })
  it('fil : annulation trop tardive placée après la version livrée', () => {
    const versions = [
      { numero: 1, prompt: 'v1', reponse_agent: 'r1', created_at: '2026-10-03T09:00:00Z' },
      { numero: 2, prompt: 'Coupe le début', reponse_agent: 'r2', created_at: '2026-10-03T10:06:00Z' },
    ]
    const messages = filConversation({ versions, taches: [tache('fait', { annulation_demandee_le: DEMANDE })] })
    expect(messages.map(m => m.cle)).toEqual(['p1', 'r1', 'p2', 'r2', 'lt1'])
    expect(messages.at(-1).texte).toContain('la v2 était déjà prête')
  })
  it('fil : demande en cours porte sa tâche (bouton Annuler)', () => {
    const t = tache('en_cours')
    expect(filConversation({ versions: [], taches: [t] }).at(-1).tacheActive).toBe(t)
  })
  it('template : enregistrement du style annulé', () => {
    const s = statutTemplate({ statut: 'approuve', style_enregistre: false }, tache('annulee', { type: 'enregistrer_style' }))
    expect(s.cle).toBe('preparation')
    expect(s.detail).toContain('annulé')
  })
})
