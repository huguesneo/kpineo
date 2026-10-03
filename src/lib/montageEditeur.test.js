import { describe, it, expect } from 'vitest'
import {
  jobIdValide, tacheDemande, tacheActive, etatEnvoi, validerDemande, versionAffichee, dernierNumero,
  filConversation, delaiRenouvellement, messageErreurEnvoi, LONGUEUR_MAX_DEMANDE,
} from './montageEditeur'

const JOB = '22222222-0000-0000-0000-000000000001'
const v = (numero, extra = {}) => ({
  id: `v${numero}`, numero, chemin_apercu: `apercus/${JOB}/v${numero}.mp4`, prompt: `demande ${numero}`,
  reponse_agent: `réponse ${numero}`, auteur: 'info@neoperformance.ca', created_at: `2026-10-03T1${numero}:00:00Z`, ...extra,
})
const t = (id, statut, created_at, extra = {}) => ({
  id, job_id: JOB, type: 'montage', statut, created_at, cree_par: 'hugues@neoperformance.ca', payload: {}, ...extra,
})

describe('tâche envoyée à l\'agent (contrat de video-neo/agent/src/taches.ts)', () => {
  it('type montage, payload { prompt } nettoyé', () => {
    expect(tacheDemande(JOB, '  Coupe le début  ')).toEqual({ job_id: JOB, type: 'montage', payload: { prompt: 'Coupe le début' } })
  })
  it('sans texte (relance de la 1re ronde) : payload vide', () => {
    expect(tacheDemande(JOB, '   ')).toEqual({ job_id: JOB, type: 'montage', payload: {} })
  })
  it('jamais de statut ni de cree_par écrits par le hub', () => {
    expect(Object.keys(tacheDemande(JOB, 'x')).sort()).toEqual(['job_id', 'payload', 'type'])
  })
  it('identifiant de montage valide', () => {
    expect(jobIdValide(JOB)).toBe(true)
    expect(jobIdValide('nouvelle')).toBe(false)
    expect(jobIdValide(undefined)).toBe(false)
  })
})

describe('états désactivés', () => {
  const job = { id: JOB, statut: 'apercu_pret', version_courante: 2 }

  it('libre : champ actif, texte obligatoire', () => {
    const e = etatEnvoi({ job, taches: [t('a', 'fait', '2026-10-03T10:00:00Z')] })
    expect(e).toEqual({ desactive: false, raison: null, videPermis: false })
    expect(validerDemande('  ', e.videPermis)).toMatch(/Écris/)
    expect(validerDemande('Plus court', e.videPermis)).toBeNull()
  })
  it('tâche en attente : désactivé, message de file', () => {
    const e = etatEnvoi({ job, taches: [t('a', 'en_attente', '2026-10-03T10:00:00Z')] })
    expect(e.desactive).toBe(true)
    expect(e.raison).toMatch(/attend son tour/)
  })
  it('tâche en cours : désactivé, l\'agent travaille', () => {
    const e = etatEnvoi({ job, taches: [t('a', 'en_cours', '2026-10-03T10:00:00Z')] })
    expect(e.desactive).toBe(true)
    expect(e.raison).toMatch(/agent travaille/)
  })
  it('tâche d\'un autre type (ex. terminer) en attente : désactivé aussi', () => {
    expect(etatEnvoi({ job, taches: [t('a', 'en_attente', '2026-10-03T10:00:00Z', { type: 'terminer' })] }).desactive).toBe(true)
  })
  it('dernière tâche en erreur : on peut renvoyer', () => {
    expect(etatEnvoi({ job: { ...job, statut: 'erreur' }, taches: [t('a', 'erreur', '2026-10-03T10:00:00Z')] }).desactive).toBe(false)
  })
  it('1re ronde échouée (version 0) : relance possible sans texte', () => {
    const e = etatEnvoi({ job: { ...job, statut: 'erreur', version_courante: 0 }, taches: [t('a', 'erreur', '2026-10-03T10:00:00Z')] })
    expect(e.videPermis).toBe(true)
    expect(validerDemande('', e.videPermis)).toBeNull()
  })
  it('montage terminé : désactivé', () => {
    expect(etatEnvoi({ job: { ...job, statut: 'termine' }, taches: [] }).desactive).toBe(true)
  })
  it('demande trop longue refusée', () => {
    expect(validerDemande('x'.repeat(LONGUEUR_MAX_DEMANDE + 1), false)).toMatch(/trop longue/)
  })
  it('tâche active : la plus ancienne non finie', () => {
    expect(tacheActive([t('b', 'en_attente', '2026-10-03T11:00:00Z'), t('a', 'en_cours', '2026-10-03T10:00:00Z'), t('c', 'fait', '2026-10-03T09:00:00Z')]).id).toBe('a')
    expect(tacheActive([t('c', 'fait', '2026-10-03T09:00:00Z')])).toBeNull()
  })
})

describe('version affichée', () => {
  const versions = [v(2), v(1), v(3)]
  it('par défaut, la dernière', () => {
    expect(versionAffichee(versions, null).numero).toBe(3)
    expect(dernierNumero(versions)).toBe(3)
  })
  it('celle choisie dans la bande', () => {
    expect(versionAffichee(versions, 1).numero).toBe(1)
  })
  it('choix disparu ou sans aperçu : la dernière avec aperçu', () => {
    expect(versionAffichee(versions, 9).numero).toBe(3)
    expect(versionAffichee([v(1), v(2, { chemin_apercu: null })], null).numero).toBe(1)
  })
  it('aucune version : rien', () => {
    expect(versionAffichee([], null)).toBeNull()
  })
})

describe('fil de conversation', () => {
  it('chaque version : la demande puis la réponse, dans l\'ordre', () => {
    const fil = filConversation({ versions: [v(2), v(1)], taches: [] })
    expect(fil.map(m => `${m.role}:${m.texte}`)).toEqual([
      'demande:demande 1', 'agent:réponse 1', 'demande:demande 2', 'agent:réponse 2',
    ])
    expect(fil[0].auteur).toBe('info@neoperformance.ca')
  })
  it('version sans prompt (template seul) : seulement la réponse', () => {
    expect(filConversation({ versions: [v(1, { prompt: null })], taches: [] }).map(m => m.role)).toEqual(['agent'])
  })
  it('demande en cours : ajoutée à la fin avec son état', () => {
    const fil = filConversation({
      versions: [v(1)],
      taches: [t('a', 'en_cours', '2026-10-03T12:00:00Z', { payload: { prompt: 'Musique plus forte' } })],
    })
    expect(fil.at(-1)).toMatchObject({ role: 'demande', texte: 'Musique plus forte', enAttente: 'en_cours', auteur: 'hugues@neoperformance.ca' })
  })
  it('demande refusée après la dernière version : demande puis erreur', () => {
    const fil = filConversation({
      versions: [v(1)],
      taches: [t('a', 'erreur', '2026-10-03T12:00:00Z', { payload: { prompt: 'x' }, erreur: 'Écris ce que tu veux changer dans le montage.' })],
    })
    expect(fil.slice(-2).map(m => m.role)).toEqual(['demande', 'erreur'])
    expect(fil.at(-1).texte).toMatch(/Écris ce que tu veux/)
  })
  it('vieille erreur suivie d\'une version réussie : pas affichée', () => {
    const fil = filConversation({ versions: [v(2)], taches: [t('a', 'erreur', '2026-10-03T10:00:00Z', { erreur: 'vieux' })] })
    expect(fil.some(m => m.role === 'erreur')).toBe(false)
  })
})

describe('URL signée', () => {
  it('renouvelée 5 min avant l\'heure', () => {
    expect(delaiRenouvellement(0, 0)).toBe(55 * 60 * 1000)
    expect(delaiRenouvellement(0, 56 * 60 * 1000)).toBe(0)
  })
})

describe('erreur d\'envoi', () => {
  it('RLS, réseau, autre', () => {
    expect(messageErreurEnvoi({ code: '42501' })).toMatch(/autorisation/)
    expect(messageErreurEnvoi(new TypeError('Failed to fetch'))).toMatch(/connexion a été coupée/)
    expect(messageErreurEnvoi({ message: 'boum' })).toMatch(/boum/)
  })
})
