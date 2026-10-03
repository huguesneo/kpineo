import { describe, it, expect } from 'vitest'
import {
  isAgentEnLigne, AGENT_HORS_LIGNE_APRES_MS, positionsFile, rangFr, statutMontage,
  lireDossierBrut, lienDriveMontage,
} from './montageVideo'
import {
  hasMontageVideoAccess, canUseMontageVideo, canConfigureMontageVideo,
} from './montageVideoAccess'
import { dossierChoisi, numeroProjet } from './googlePicker'

describe('accès au module Montage vidéo', () => {
  it('liste d’accès, insensible à la casse', () => {
    expect(hasMontageVideoAccess('hugues@neoperformance.ca')).toBe(true)
    expect(hasMontageVideoAccess('INFO@neoperformance.ca')).toBe(true)
    expect(hasMontageVideoAccess('cloe@neoperformance.ca')).toBe(false)
    expect(hasMontageVideoAccess(undefined)).toBe(false)
  })

  it('flag désactivé : personne ne voit le module', () => {
    expect(canUseMontageVideo('hugues@neoperformance.ca', false)).toBe(false)
    expect(canConfigureMontageVideo('hugues@neoperformance.ca', false)).toBe(false)
  })

  it('flag actif : la liste décide', () => {
    expect(canUseMontageVideo('hugues@neoperformance.ca', true)).toBe(true)
    expect(canUseMontageVideo('info@neoperformance.ca', true)).toBe(true)
    expect(canUseMontageVideo('autre@neoperformance.ca', true)).toBe(false)
  })

  it('configuration : Hugues seulement', () => {
    expect(canConfigureMontageVideo('hugues@neoperformance.ca', true)).toBe(true)
    expect(canConfigureMontageVideo('info@neoperformance.ca', true)).toBe(false)
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
