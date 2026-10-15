import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  PROMPT_STANDARD, peutOuvrirTimeline, estCliente, surMoteurRecette, raisonMoiMeme, routeApresLancement,
  tachePreparer, tacheAppliquer, tacheIA, tacheMoiMeme, timelineAPreparer, brouillonPerime, tacheActiveDe, travailDe,
  raisonTerminerTimeline, indexSons, modelesDe, calculerOnde, mono, etatLien, RENOUVELER_AVANT_MS,
} from './montageTimeline'
import { nouveauMontage } from './montageVideo'

const JOB = '22222222-0000-0000-0000-000000000070'
const principal = [{ role: 'principal' }]

describe('bouton « Ouvrir »', () => {
  it('moi ou l’équipe sans template : oui ; cliente, template, montage d’avant, corbeille : non', () => {
    expect(peutOuvrirTimeline({ personnes: 'moi_equipe', template_id: null })).toBe(true)
    expect(peutOuvrirTimeline({ personnes: 'cliente', template_id: null })).toBe(false)
    expect(peutOuvrirTimeline({ personnes: 'moi_equipe', template_id: 't1' })).toBe(false)
    expect(peutOuvrirTimeline({ personnes: null, template_id: null })).toBe(false)
    expect(peutOuvrirTimeline({ personnes: 'moi_equipe', template_id: null, supprime_le: '2026-10-15' })).toBe(false)
    expect(peutOuvrirTimeline(null)).toBe(false)
    expect(estCliente({ personnes: 'cliente' })).toBe(true)
  })
})

describe('création', () => {
  it('moteur recette : comme choixMoteur de l’agent (personnes, aucun template, un seul clip Principal)', () => {
    expect(surMoteurRecette({ personnes: 'moi_equipe', templateId: null, clips: principal })).toBe(true)
    expect(surMoteurRecette({ personnes: 'cliente', templateId: null, clips: principal })).toBe(true)
    expect(surMoteurRecette({ personnes: 'moi_equipe', templateId: 't', clips: principal })).toBe(false)
    expect(surMoteurRecette({ personnes: 'moi_equipe', templateId: null, clips: [...principal, { role: 'broll' }] })).toBe(false)
    expect(surMoteurRecette({ personnes: 'moi_equipe', templateId: null, clips: [{ role: 'broll' }] })).toBe(false)
  })

  it('« Monter moi-même » : refusé avec un template ou plusieurs clips, dit pourquoi', () => {
    expect(raisonMoiMeme({ personnes: 'moi_equipe', templateId: null, clips: principal })).toBeNull()
    expect(raisonMoiMeme({ personnes: 'moi_equipe', templateId: 't', clips: principal })).toMatch(/sans template/)
    expect(raisonMoiMeme({ personnes: 'moi_equipe', templateId: null, clips: [...principal, { role: 'broll' }] })).toMatch(/une seule vidéo/)
  })

  it('après le lancement : timeline pour moi ou l’équipe au moteur recette, éditeur sinon (cliente, template)', () => {
    expect(routeApresLancement('j', { personnes: 'moi_equipe', templateId: null, clips: principal })).toBe('/reseaux-sociaux/montage/j/timeline')
    expect(routeApresLancement('j', { personnes: 'cliente', templateId: null, clips: principal })).toBe('/reseaux-sociaux/montage/j')
    expect(routeApresLancement('j', { personnes: 'moi_equipe', templateId: 't', clips: principal })).toBe('/reseaux-sociaux/montage/j')
  })

  it('prompt facultatif : texte standard sans template, rien avec un template, le prompt écrit gagne', () => {
    const base = { titre: 'a', fichierDriveId: 'd', nomSource: 'n', personnes: 'moi_equipe', promptParDefaut: PROMPT_STANDARD }
    expect(nouveauMontage({ ...base, templateId: null, prompt: '  ' }).prompt).toBe('Montage standard, aucune consigne particulière.')
    expect(nouveauMontage({ ...base, templateId: 't', prompt: '' }).prompt).toBeNull()
    expect(nouveauMontage({ ...base, templateId: null, prompt: ' Plus court ' }).prompt).toBe('Plus court')
    expect(nouveauMontage({ ...base, promptParDefaut: null, templateId: null, prompt: '' }).prompt).toBeNull()
  })
})

describe('tâches de l’agent (forme exacte, agent/src/taches.ts)', () => {
  it('préparer, appliquer, demander à l’IA, monter moi-même', () => {
    expect(tachePreparer(JOB)).toEqual({ job_id: JOB, type: 'timeline_preparer', payload: {} })
    expect(tacheAppliquer(JOB)).toEqual({ job_id: JOB, type: 'timeline_appliquer', payload: {} })
    expect(tacheIA(JOB, '  ajoute une carte  ')).toEqual({ job_id: JOB, type: 'montage', payload: { prompt: 'ajoute une carte', depuis_timeline: true } })
    expect(tacheMoiMeme(JOB)).toEqual({ job_id: JOB, type: 'montage', payload: { manuel: true } })
  })
})

describe('état de la timeline', () => {
  it('à préparer : ligne absente, sans recette, ressources vidées ou sans copie légère', () => {
    expect(timelineAPreparer(null)).toBe(true)
    expect(timelineAPreparer({ recette: null, ressources: {} })).toBe(true)
    expect(timelineAPreparer({ recette: {}, ressources: {} })).toBe(true)
    expect(timelineAPreparer({ recette: {}, ressources: { proxies: {} } })).toBe(true)
    expect(timelineAPreparer({ recette: {}, ressources: { proxies: { P1: 'montages/x/proxy-a.mp4' } } })).toBe(false)
  })

  it('brouillon périmé : fait avant la dernière version', () => {
    const v = { created_at: '2026-10-15T15:00:00Z' }
    expect(brouillonPerime({ brouillon: {}, brouillon_le: '2026-10-15T14:00:00Z' }, v)).toBe(true)
    expect(brouillonPerime({ brouillon: {}, brouillon_le: '2026-10-15T16:00:00Z' }, v)).toBe(false)
    expect(brouillonPerime({ brouillon: null, brouillon_le: '2026-10-15T14:00:00Z' }, v)).toBe(false)
  })

  it('tâche active', () => {
    const t = [{ type: 'montage', statut: 'fait' }, { type: 'timeline_preparer', statut: 'en_cours' }]
    expect(tacheActiveDe(t)?.type).toBe('timeline_preparer')
    expect(tacheActiveDe(t, 'montage')).toBeNull()
  })

  it('suivi d’un travail : en attente, en cours (étape et %), fini (réponse de l’agent), erreur, annulé', () => {
    const o = { genre: 'appliquer', debut: 1 }
    expect(travailDe({ ...o, tache: { statut: 'en_attente' } })).toMatchObject({ type: 'appliquer', etat: 'en_cours', journal: ['En attente du Mac…'] })
    expect(travailDe({ ...o, tache: { statut: 'en_cours' }, job: { etape: 'Aperçu', progression: 40 } }).journal).toEqual(['Aperçu (40 %)'])
    expect(travailDe({ ...o, tache: { statut: 'fait' }, version: { reponse_agent: 'Édition appliquée.' } })).toMatchObject({ etat: 'fini', resultat: { reponse: 'Édition appliquée.' } })
    expect(travailDe({ ...o, tache: { statut: 'erreur', erreur: 'Aperçu refusé' } })).toMatchObject({ etat: 'erreur', resultat: { erreur: 'Aperçu refusé' } })
    expect(travailDe({ ...o, tache: { statut: 'annulee' } }).resultat.erreur).toBe('Tâche annulée.')
    expect(travailDe({ ...o, tache: null })).toBeNull()
  })

  it('Terminer : jamais avec un brouillon pas appliqué ni pendant un travail', () => {
    expect(raisonTerminerTimeline({ brouillon: true, enCours: false })).toMatch(/Applique d'abord/)
    expect(raisonTerminerTimeline({ brouillon: false, enCours: true })).toMatch(/travail en cours/)
    expect(raisonTerminerTimeline({ brouillon: false, enCours: false })).toBeNull()
  })
})

describe('sons et catalogue', () => {
  it('index des sons : le vrai nom (accents) mène à la clé du stockage', () => {
    const { chemins, sons } = indexSons({ sons: [
      { fichier: 'musique/Motivation Émotion/atlas (1).mp3', categorie: 'musique', duree: 120.5, chemin: 'sons/musique/Motivation-Emotion/atlas-1-0123abcd.mp3' },
      { fichier: 'sans-chemin.mp3', categorie: 'texte', duree: 1 },
    ] })
    expect(chemins['musique/Motivation Émotion/atlas (1).mp3']).toBe('sons/musique/Motivation-Emotion/atlas-1-0123abcd.mp3')
    expect(sons).toEqual([{ fichier: 'musique/Motivation Émotion/atlas (1).mp3', categorie: 'musique', duree: 120.5, usage: '' }])
    expect(indexSons(null)).toEqual({ chemins: {}, sons: [] })
    expect(modelesDe({ types: { texte: 'Texte' }, polices: {} }, sons)).toMatchObject({ types: { texte: 'Texte' }, sons })
  })
})

describe('forme d’onde dans le navigateur (même calcul que outil.py onde)', () => {
  it('pic de chaque tranche de 0,05 s, ramené de 0 à 1, deux décimales', () => {
    const taux = 100   // 5 échantillons par tranche
    const e = Float32Array.from([0.1, -0.5, 0.2, 0, 0, 0.25, 0, 0, 0, 0, 0.05])
    expect(calculerOnde(e, taux)).toEqual({ duree: 0.11, pas: 0.05, pics: [1, 0.5, 0.1] })
    expect(calculerOnde(new Float32Array(0), taux)).toEqual({ duree: 0, pas: 0.05, pics: [] })
  })

  it('stéréo → mono (moyenne)', () => {
    expect(Array.from(mono([Float32Array.from([1, 0]), Float32Array.from([0, 1])]))).toEqual([0.5, 0.5])
  })
})

describe('liens signés', () => {
  it('bon, à renouveler (moins de 3 min), expiré, absent', () => {
    expect(etatLien({ url: 'u', expire: 10 * 60_000 }, 0)).toBe('bon')
    expect(etatLien({ url: 'u', expire: RENOUVELER_AVANT_MS - 1 }, 0)).toBe('a_renouveler')
    expect(etatLien({ url: 'u', expire: 5 }, 10)).toBe('expire')
    expect(etatLien(null)).toBe('absent')
  })
})

describe('sécurité du nouveau code', () => {
  const fichiers = (d) => readdirSync(d).flatMap(f => (statSync(join(d, f)).isDirectory() ? fichiers(join(d, f)) : [join(d, f)]))
  it('aucune clé de service ni supabaseAdmin dans la timeline du hub', () => {
    const racine = join(__dirname, '..')
    const liste = [
      ...fichiers(join(racine, 'features/social/montage/timeline')).filter(f => /\.(jsx?|tsx?|mjs)$/.test(f)),
      join(racine, 'lib/montageTimeline.js'),
      join(racine, 'features/social/montage/BoutonTimeline.jsx'),
    ]
    expect(liste.length).toBeGreaterThan(10)
    for (const f of liste) expect(readFileSync(f, 'utf8'), f).not.toMatch(/supabaseAdmin|service_role|SERVICE_ROLE/i)
  })

  it('aucune police Allrounder dans le dépôt du hub (stockage privé seulement)', () => {
    const racine = join(__dirname, '..')
    expect(fichiers(racine).filter(f => /allrounder/i.test(f) && /\.(otf|ttf|woff2?)$/i.test(f))).toEqual([])
  })
})
