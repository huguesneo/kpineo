import { describe, it, expect } from 'vitest'
import {
  estSupprime, separerCorbeille, etatSuppression, confirmationSuppression, apresCorbeille, origineDe,
  messageErreurCorbeille, RAISON_CORBEILLE, RAISON_TACHE_ACTIVE,
} from './montageCorbeille'
import { etatEnvoi } from './montageEditeur'
import { etatAjoutClip } from './montageClips'
import { etatVariante } from './montageVariantes'
import { etatTerminer, etatRestaurer } from './montageFin'

const SUPPRIME = '2026-10-03T12:00:00Z'
const job = (id, extra = {}) => ({ id, titre: `Montage ${id}`, statut: 'apercu_pret', version_courante: 2, created_at: '2026-10-01T10:00:00Z', ...extra })
const tache = (statut, extra = {}) => ({ id: 't1', job_id: 'a', type: 'montage', statut, created_at: '2026-10-03T10:00:00Z', ...extra })

describe('separerCorbeille', () => {
  it('sépare la liste et la corbeille, dernière suppression d\'abord', () => {
    const jobs = [job('a'), job('b', { supprime_le: '2026-10-02T10:00:00Z' }), job('c'), job('d', { supprime_le: SUPPRIME })]
    const { actifs, corbeille } = separerCorbeille(jobs)
    expect(actifs.map(j => j.id)).toEqual(['a', 'c'])
    expect(corbeille.map(j => j.id)).toEqual(['d', 'b'])
    expect(separerCorbeille(null)).toEqual({ actifs: [], corbeille: [] })
  })
  it('estSupprime', () => {
    expect(estSupprime(job('a'))).toBe(false)
    expect(estSupprime(job('a', { supprime_le: SUPPRIME }))).toBe(true)
    expect(estSupprime(null)).toBe(false)
  })
})

describe('etatSuppression', () => {
  it('sans tâche active : permis', () => {
    expect(etatSuppression({ job: job('a'), taches: [tache('fait')] })).toEqual({ visible: true, desactive: false, raison: null })
    expect(etatSuppression({ job: job('a'), taches: [undefined] }).desactive).toBe(false)
  })
  it('tâche en attente ou en cours : « Annule d\'abord la demande en cours »', () => {
    for (const statut of ['en_attente', 'en_cours']) {
      expect(etatSuppression({ job: job('a'), taches: [tache(statut)] })).toEqual({ visible: true, desactive: true, raison: RAISON_TACHE_ACTIVE })
    }
  })
  it('une tâche active d\'un autre montage ne bloque pas', () => {
    expect(etatSuppression({ job: job('a'), taches: [tache('en_cours', { job_id: 'b' })] }).desactive).toBe(false)
  })
  it('déjà dans la corbeille : pas de bouton', () => {
    expect(etatSuppression({ job: job('a', { supprime_le: SUPPRIME }), taches: [] }).visible).toBe(false)
  })
})

describe('confirmationSuppression', () => {
  it('dit que Drive n\'est pas touché et qu\'on peut restaurer', () => {
    const c = confirmationSuppression(job('a'))
    expect(c.titre).toBe('Mettre « Montage a » à la corbeille ?')
    expect(c.texte).toContain('Les exports déjà dans Google Drive ne sont pas touchés.')
    expect(c.texte).toContain('restaurer depuis la Corbeille')
    expect(c.texte).not.toContain('variante')
  })
  it('les variantes restent', () => {
    expect(confirmationSuppression(job('a'), 1).texte).toContain('Sa variante reste dans la liste.')
    expect(confirmationSuppression(job('a'), 3).texte).toContain('Ses 3 variantes restent dans la liste.')
  })
})

describe('apresCorbeille', () => {
  it('supprime, restaure, ou rien', () => {
    const s = apresCorbeille(job('a'), 'supprime', { email: 'info@neoperformance.ca', maintenant: SUPPRIME })
    expect(s).toMatchObject({ supprime_le: SUPPRIME, supprime_par: 'info@neoperformance.ca' })
    expect(apresCorbeille(s, 'restaure')).toMatchObject({ supprime_le: null, supprime_par: null })
    expect(apresCorbeille(s, 'deja_supprime')).toBe(s)
  })
})

describe('origineDe', () => {
  const tous = [job('o', { supprime_le: SUPPRIME }), job('p')]
  it('origine dans la corbeille : supprime', () => {
    expect(origineDe(job('v', { variante_de: 'o' }), tous)).toEqual({ id: 'o', titre: 'Montage o', supprime: true })
    expect(origineDe(job('v', { variante_de: 'p' }), tous)).toEqual({ id: 'p', titre: 'Montage p', supprime: false })
  })
  it('origine non lue, ou pas une variante', () => {
    expect(origineDe(job('v', { variante_de: 'x' }), tous)).toEqual({ id: 'x', titre: null, supprime: false })
    expect(origineDe(job('v'), tous)).toBeNull()
  })
})

describe('messageErreurCorbeille', () => {
  it('traduit les refus de la base', () => {
    expect(messageErreurCorbeille({ message: "Annule d'abord la demande en cours" })).toBe("Annule d'abord la demande en cours, puis supprime le montage.")
    expect(messageErreurCorbeille({ message: 'Accès refusé au module Montage vidéo' })).toContain("n'a pas l'autorisation")
    expect(messageErreurCorbeille({ message: 'Failed to fetch' })).toContain('La connexion a été coupée')
    expect(messageErreurCorbeille({ message: 'Montage introuvable' })).toBe("Ce montage n'existe plus.")
    expect(messageErreurCorbeille({ message: 'boum' })).toBe("Ça n'a pas marché : boum.")
  })
})

describe('montage dans la corbeille : ni demande, ni variante, ni clip', () => {
  const j = job('a', { supprime_le: SUPPRIME })
  const version = { numero: 2 }
  it('demandes, rendu et restauration de version désactivés', () => {
    expect(etatEnvoi({ job: j, taches: [] })).toEqual({ desactive: true, raison: RAISON_CORBEILLE, videPermis: false })
    expect(etatTerminer({ job: j, taches: [], versions: [] })).toMatchObject({ desactive: true, raison: RAISON_CORBEILLE })
    expect(etatRestaurer({ job: j, taches: [], version: { numero: 1 } })).toMatchObject({ desactive: true, raison: RAISON_CORBEILLE })
  })
  it('variante désactivée', () => {
    expect(etatVariante({ job: j, taches: [], version })).toEqual({ visible: true, desactive: true, raison: RAISON_CORBEILLE })
  })
  it('ajout de clip désactivé', () => {
    expect(etatAjoutClip({ job: j, taches: [], clips: [] })).toEqual({ visible: true, desactive: true, raison: RAISON_CORBEILLE, avertissement: null })
  })
  it('restauré : tout revient', () => {
    const r = job('a', { supprime_le: null })
    expect(etatEnvoi({ job: r, taches: [] }).desactive).toBe(false)
    expect(etatVariante({ job: r, taches: [], version }).desactive).toBe(false)
    expect(etatAjoutClip({ job: r, taches: [], clips: [] }).desactive).toBe(false)
  })
})
