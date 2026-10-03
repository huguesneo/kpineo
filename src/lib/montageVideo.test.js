import { describe, it, expect } from 'vitest'
import {
  isAgentEnLigne, AGENT_HORS_LIGNE_APRES_MS, positionsFile, rangFr, statutMontage,
  lireDossierBrut, lienDriveMontage,
} from './montageVideo'
import {
  lireAccesMontage, routeMontage, entreesReseauxSociaux, canConfigureMontageVideo,
} from './montageVideoAccess'
import { dossierChoisi, numeroProjet } from './googlePicker'

// has_montage_access() simulée : la base répond selon le courriel du JWT.
const HUGUES = 'hugues@neoperformance.ca'
const INFO = 'info@neoperformance.ca'
const AUTRE = 'cloe@neoperformance.ca'
const baseSimulee = email => ({
  rpc: async nom => (nom === 'has_montage_access'
    ? { data: [HUGUES, INFO].includes(email), error: null }
    : { data: null, error: { message: 'inconnue' } }),
})

describe('accès au module Montage vidéo (has_montage_access)', () => {
  it('la réponse vient de la base', async () => {
    expect(await lireAccesMontage(baseSimulee(HUGUES))).toBe(true)
    expect(await lireAccesMontage(baseSimulee(INFO))).toBe(true)
    expect(await lireAccesMontage(baseSimulee(AUTRE))).toBe(false)
  })

  it('erreur ou panne : null, jamais l’accès', async () => {
    expect(await lireAccesMontage({ rpc: async () => ({ data: null, error: { message: 'JWT expired' } }) })).toBeNull()
    expect(await lireAccesMontage({ rpc: async () => { throw new Error('réseau') } })).toBeNull()
    expect(await lireAccesMontage({ rpc: async () => ({ data: 'true', error: null }) })).toBe(false)
  })

  it('compte autorisé : voit Montage vidéo dans le menu et ouvre la route', async () => {
    const acces = await lireAccesMontage(baseSimulee(INFO))
    expect(entreesReseauxSociaux({ social: false, montage: acces, enabled: true }))
      .toEqual({ groupe: true, analyse: false, montage: true, ancienLien: false })
    expect(routeMontage({ user: { email: INFO }, loading: false, acces, enabled: true })).toBe('ok')
  })

  it('autre compte : pas d’entrée Montage vidéo, la route renvoie au tableau de bord', async () => {
    const acces = await lireAccesMontage(baseSimulee(AUTRE))
    expect(entreesReseauxSociaux({ social: true, montage: acces, enabled: true }))
      .toEqual({ groupe: true, analyse: true, montage: false, ancienLien: false })
    expect(entreesReseauxSociaux({ social: false, montage: acces, enabled: true }).groupe).toBe(false)
    expect(routeMontage({ user: { email: AUTRE }, loading: false, acces, enabled: true })).toBe('/dashboard')
  })

  it('pendant la lecture : écran de chargement ; déconnecté : connexion', () => {
    expect(routeMontage({ user: { email: HUGUES }, loading: true, acces: false, enabled: true })).toBe('chargement')
    expect(routeMontage({ user: null, loading: false, acces: false, enabled: true })).toBe('/login')
  })

  it('flag éteint : personne ne voit le module, menu comme avant', () => {
    expect(routeMontage({ user: { email: HUGUES }, loading: false, acces: true, enabled: false })).toBe('/dashboard')
    expect(entreesReseauxSociaux({ social: true, montage: true, enabled: false }))
      .toEqual({ groupe: false, analyse: false, montage: false, ancienLien: true })
    expect(canConfigureMontageVideo(HUGUES, false)).toBe(false)
  })

  it('configuration : Hugues seulement', () => {
    expect(canConfigureMontageVideo(HUGUES, true)).toBe(true)
    expect(canConfigureMontageVideo(INFO, true)).toBe(false)
  })
})

describe('Mac en ligne / hors ligne', () => {
  const maintenant = Date.parse('2026-10-02T12:00:00Z')

  it('en ligne sous 90 s', () => {
    expect(isAgentEnLigne('2026-10-02T11:59:30Z', maintenant)).toBe(true)
    expect(isAgentEnLigne(new Date(maintenant - AGENT_HORS_LIGNE_APRES_MS + 1).toISOString(), maintenant)).toBe(true)
  })

  it('hors ligne à 90 s et plus', () => {
    expect(isAgentEnLigne(new Date(maintenant - AGENT_HORS_LIGNE_APRES_MS).toISOString(), maintenant)).toBe(false)
    expect(isAgentEnLigne('2026-10-02T11:50:00Z', maintenant)).toBe(false)
  })

  it('hors ligne sans signal ou avec une date invalide', () => {
    expect(isAgentEnLigne(null, maintenant)).toBe(false)
    expect(isAgentEnLigne(undefined, maintenant)).toBe(false)
    expect(isAgentEnLigne('pas une date', maintenant)).toBe(false)
  })
})

describe('positions dans la file', () => {
  it('ordre de created_at parmi les montages en_file seulement', () => {
    const jobs = [
      { id: 'c', statut: 'en_file', created_at: '2026-10-02T10:03:00Z' },
      { id: 'x', statut: 'montage', created_at: '2026-10-02T09:00:00Z' },
      { id: 'a', statut: 'en_file', created_at: '2026-10-02T10:01:00Z' },
      { id: 't', statut: 'termine', created_at: '2026-10-02T08:00:00Z' },
      { id: 'b', statut: 'en_file', created_at: '2026-10-02T10:02:00Z' },
    ]
    expect(positionsFile(jobs)).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('à égalité de date, ordre stable par id', () => {
    const t = '2026-10-02T10:00:00Z'
    expect(positionsFile([
      { id: 'b', statut: 'en_file', created_at: t },
      { id: 'a', statut: 'en_file', created_at: t },
    ])).toEqual({ a: 1, b: 2 })
  })

  it('file vide', () => {
    expect(positionsFile([])).toEqual({})
    expect(positionsFile(null)).toEqual({})
  })

  it('rang en français', () => {
    expect(rangFr(1)).toBe('1er')
    expect(rangFr(2)).toBe('2e')
    expect(rangFr(11)).toBe('11e')
  })
})

describe('statuts en français', () => {
  it('libellés connus', () => {
    expect(statutMontage('en_file').label).toBe("En file d'attente")
    expect(statutMontage('termine').label).toBe('Terminé')
    expect(statutMontage('erreur').variant).toBe('danger')
  })

  it('statut inconnu affiché tel quel', () => {
    expect(statutMontage('nouveau').label).toBe('nouveau')
  })
})

describe('dossier Brut (video_config)', () => {
  it('configuré', () => {
    expect(lireDossierBrut([
      { cle: 'dossier_brut_id', valeur: 'abc123' },
      { cle: 'dossier_brut_nom', valeur: 'Brut' },
    ])).toEqual({ id: 'abc123', nom: 'Brut' })
  })

  it('non configuré', () => {
    expect(lireDossierBrut([])).toBeNull()
    expect(lireDossierBrut([{ cle: 'dossier_brut_nom', valeur: 'Brut' }])).toBeNull()
  })

  it('réponse du Picker : dossier choisi, annulation, mauvais type', () => {
    const dossier = { id: 'f1', name: 'Brut', mimeType: 'application/vnd.google-apps.folder' }
    expect(dossierChoisi({ action: 'picked', docs: [dossier] })).toEqual({ id: 'f1', nom: 'Brut' })
    expect(dossierChoisi({ action: 'cancel' })).toBeNull()
    expect(dossierChoisi({ action: 'picked', docs: [{ ...dossier, mimeType: 'video/mp4' }] })).toBeNull()
  })

  it('numéro du projet tiré du client ID', () => {
    expect(numeroProjet('198971596729-abc.apps.googleusercontent.com')).toBe('198971596729')
    expect(numeroProjet(undefined)).toBeNull()
  })
})

describe('lien Drive d’un montage', () => {
  it('vidéo source seulement (l\'export a son propre lien), sinon rien', () => {
    expect(lienDriveMontage({ lien_drive_export: 'NEO vidéo/Out/a/a_v1.mp4', fichier_drive_id: 'f9' }))
      .toEqual({ url: 'https://drive.google.com/file/d/f9/view', label: 'Vidéo source' })
    expect(lienDriveMontage({ lien_drive_export: 'https://drive.google.com/x' })).toBeNull()
    expect(lienDriveMontage({})).toBeNull()
  })
})
