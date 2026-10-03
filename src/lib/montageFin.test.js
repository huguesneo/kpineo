import { describe, it, expect } from 'vitest'
import {
  tacheRestaurer, etatRestaurer, texteConfirmationRestaurer,
  tacheTerminer, etatTerminer, texteConfirmationTerminer, nomExport, cheminExportPrevu, dimensionsFinales, lienExport,
  versionExportee, infoDernierExport, RAISON_DEJA_EXPORTEE,
} from './montageFin'
import { filConversation, texteTache } from './montageEditeur'

const JOB = '22222222-0000-0000-0000-000000000001'
const job = (extra = {}) => ({ id: JOB, titre: 'Pub cortisol', statut: 'apercu_pret', version_courante: 3, format: '9:16', ...extra })
const v = (numero, extra = {}) => ({ id: `v${numero}`, numero, chemin_apercu: `apercus/${JOB}/v${numero}.mp4`, created_at: `2026-10-03T1${numero}:00:00Z`, ...extra })
const t = (id, statut, created_at, extra = {}) => ({
  id, job_id: JOB, type: 'montage', statut, created_at, cree_par: 'info@neoperformance.ca', payload: {}, ...extra,
})

describe('restaurer (contrat de video-neo/agent/src/taches.ts)', () => {
  it('tâche restaurer, payload { version }, ni statut ni cree_par', () => {
    expect(tacheRestaurer(JOB, 2)).toEqual({ job_id: JOB, type: 'restaurer', payload: { version: 2 } })
  })

  it('ancienne version affichée : bouton visible et actif', () => {
    expect(etatRestaurer({ job: job(), taches: [], version: v(1) })).toEqual({ visible: true, desactive: false, raison: null })
  })

  it('version actuelle ou aucune version : pas de bouton', () => {
    expect(etatRestaurer({ job: job(), taches: [], version: v(3) }).visible).toBe(false)
    expect(etatRestaurer({ job: job(), taches: [], version: null }).visible).toBe(false)
    expect(etatRestaurer({ job: job({ version_courante: 0 }), taches: [], version: v(1) }).visible).toBe(false)
  })

  it('tâche en attente ou en cours : désactivé avec la raison', () => {
    const attente = etatRestaurer({ job: job(), taches: [t('a', 'en_attente', '2026-10-03T15:00:00Z')], version: v(1) })
    expect(attente).toMatchObject({ visible: true, desactive: true })
    expect(attente.raison).toContain('attend son tour')
    const cours = etatRestaurer({ job: job(), taches: [t('a', 'en_cours', '2026-10-03T15:00:00Z', { type: 'terminer' })], version: v(1) })
    expect(cours.desactive).toBe(true)
    expect(cours.raison).toContain('agent travaille')
  })

  it('montage terminé : on peut encore restaurer (plus de verrou)', () => {
    expect(etatRestaurer({ job: job({ statut: 'termine' }), taches: [], version: v(1) })).toEqual({ visible: true, desactive: false, raison: null })
  })

  it('montage en erreur, rien en cours : on peut restaurer', () => {
    expect(etatRestaurer({ job: job({ statut: 'erreur' }), taches: [t('a', 'erreur', '2026-10-03T15:00:00Z')], version: v(2) }).desactive).toBe(false)
  })

  it('confirmation : nouvelle version identique, rien n\'est perdu', () => {
    const texte = texteConfirmationRestaurer(2, 3)
    expect(texte).toContain('nouvelle version, v4, identique à la v2')
    expect(texte).toContain('v1 à v3 restent')
    expect(texte).toContain("rien n'est perdu")
  })
})

describe('terminer (contrat de video-neo/agent/src/taches.ts et drive.ts)', () => {
  it('tâche terminer, payload vide (l\'agent exporte la version actuelle)', () => {
    expect(tacheTerminer(JOB)).toEqual({ job_id: JOB, type: 'terminer', payload: {} })
  })

  it('visible et actif avec une version, rien en cours', () => {
    expect(etatTerminer({ job: job(), taches: [] })).toEqual({ visible: true, desactive: false, raison: null })
  })

  it('sans version : désactivé', () => {
    expect(etatTerminer({ job: job({ version_courante: 0, statut: 'en_file' }), taches: [] })).toMatchObject({ visible: true, desactive: true })
  })

  it('version actuelle déjà exportée : visible mais désactivé, avec le message', () => {
    const e = etatTerminer({ job: job({ statut: 'termine', lien_drive_export: 'NEO vidéo/Out/Pub cortisol/Pub cortisol_v3.mp4' }), taches: [] })
    expect(e).toEqual({ visible: true, desactive: true, raison: RAISON_DEJA_EXPORTEE })
    expect(RAISON_DEJA_EXPORTEE).toBe('Cette version est déjà exportée, fais un changement pour créer une nouvelle version.')
  })

  it('après un export et un changement (v4) : Terminer redevient actif', () => {
    const j = job({ statut: 'apercu_pret', version_courante: 4, lien_drive_export: 'NEO vidéo/Out/Pub cortisol/Pub cortisol_v3.mp4' })
    expect(etatTerminer({ job: j, taches: [] })).toEqual({ visible: true, desactive: false, raison: null })
  })

  it('montage terminé avec une demande en attente : raison de la file', () => {
    const j = job({ statut: 'termine', lien_drive_export: 'NEO vidéo/Out/Pub cortisol/Pub cortisol_v3.mp4' })
    expect(etatTerminer({ job: j, taches: [t('a', 'en_attente', '2026-10-03T15:00:00Z')] }).raison).toContain('attend son tour')
  })

  it('pendant le rendu (tâche en cours) : désactivé', () => {
    const e = etatTerminer({ job: job({ statut: 'rendu' }), taches: [t('a', 'en_cours', '2026-10-03T15:00:00Z', { type: 'terminer' })] })
    expect(e.desactive).toBe(true)
  })

  it('après une erreur d\'export : on peut relancer', () => {
    const taches = [t('a', 'erreur', '2026-10-03T15:00:00Z', { type: 'terminer', erreur: 'Rendu impossible' })]
    expect(etatTerminer({ job: job({ statut: 'erreur', erreur: 'Rendu impossible' }), taches })).toMatchObject({ visible: true, desactive: false })
  })

  it('nom du dossier : même règle que l\'agent (caractères interdits retirés)', () => {
    expect(nomExport('Pub: cortisol / v2?')).toBe('Pub cortisol v2')
    expect(nomExport('  ')).toBe('video')
    expect(cheminExportPrevu(job())).toEqual({ dossier: 'NEO vidéo/Out/Pub cortisol/', fichier: 'Pub cortisol_v3.mp4' })
  })

  it('confirmation : HD 1080 x 1920, 30 images/s, dossier Out, sans approbation', () => {
    const texte = texteConfirmationTerminer(job())
    expect(texte).toContain('v3 (1080 x 1920, 30 images/s)')
    expect(texte).toContain('NEO vidéo/Out/Pub cortisol/')
    expect(texte).toContain('Aucune approbation')
    expect(texte).toContain('Terminé')
    expect(texte).toContain('encore demander des changements')
    expect(dimensionsFinales('4:5')).toBe('1080 x 1350')
  })
})

describe('lien d\'export', () => {
  it('chemin écrit par l\'agent : recherche Drive sur le nom du fichier, sans guillemets', () => {
    expect(lienExport({ lien_drive_export: 'NEO vidéo/Out/C0922/C0922_v2.mp4' }).url)
      .toBe('https://drive.google.com/drive/search?safe=strict&q=C0922_v2.mp4')
    const lien = lienExport({ lien_drive_export: 'NEO vidéo/Out/Pub cortisol/Pub cortisol_v3.mp4' })
    expect(lien.chemin).toBe('NEO vidéo/Out/Pub cortisol/Pub cortisol_v3.mp4')
    expect(lien.fichier).toBe('Pub cortisol_v3.mp4')
    expect(lien.url).toBe('https://drive.google.com/drive/search?safe=strict&q=Pub%20cortisol_v3.mp4')
    expect(lien.url).not.toContain('%22')
  })
  it('URL : prise telle quelle', () => {
    expect(lienExport({ lien_drive_export: 'https://drive.google.com/file/d/abc/view' }))
      .toEqual({ url: 'https://drive.google.com/file/d/abc/view', chemin: null, fichier: null })
  })
  it('version exportée : lue dans le nom du fichier', () => {
    expect(versionExportee({ job: job({ lien_drive_export: 'NEO vidéo/Out/a/a_v2.mp4' }) })).toBe(2)
    expect(versionExportee({ job: job() })).toBeNull()
  })
  it('version exportée avec une URL : version actuelle au moment du dernier Terminer réussi', () => {
    const j = job({ version_courante: 3, lien_drive_export: 'https://drive.google.com/file/d/abc/view' })
    const taches = [t('x', 'fait', '2026-10-03T12:30:00Z', { type: 'terminer' })]
    expect(versionExportee({ job: j, versions: [v(1), v(2), v(3)], taches })).toBe(2)
    expect(versionExportee({ job: j, versions: [v(1)], taches: [] })).toBeNull()
  })
  it('dernier export : version actuelle ou plus ancienne', () => {
    const lien = 'NEO vidéo/Out/Pub cortisol/Pub cortisol_v3.mp4'
    expect(infoDernierExport({ job: job({ lien_drive_export: lien }) }))
      .toMatchObject({ fichier: 'Pub cortisol_v3.mp4', version: 3, actuelle: true, detail: 'export de la version actuelle (v3)' })
    expect(infoDernierExport({ job: job({ version_courante: 4, lien_drive_export: lien }) }))
      .toMatchObject({ version: 3, actuelle: false, detail: 'export de v3, version actuelle : v4' })
    expect(infoDernierExport({ job: job() })).toBeNull()
  })
  it('rien d\'exporté : null', () => {
    expect(lienExport({ lien_drive_export: null })).toBeNull()
    expect(lienExport(null)).toBeNull()
  })
})

describe('fil de conversation', () => {
  it('textes des tâches restaurer et terminer', () => {
    expect(texteTache({ type: 'restaurer', payload: { version: 2 } })).toBe('Restaurer la version 2')
    expect(texteTache({ type: 'terminer', payload: {} })).toBe('Terminer et exporter en HD')
  })

  it('export fini : demande puis chemin dans Drive, placé à sa date', () => {
    const messages = filConversation({
      versions: [v(1), v(2, { prompt: 'Revenir à la version 1', reponse_agent: 'Retour à la version 1.' })],
      taches: [t('x', 'fait', '2026-10-03T13:00:00Z', { type: 'terminer' })],
      job: job({ statut: 'termine', lien_drive_export: 'NEO vidéo/Out/Pub cortisol/Pub cortisol_v2.mp4' }),
    })
    expect(messages.map(m => m.cle)).toEqual(['r1', 'p2', 'r2', 'tx', 'xx'])
    expect(messages.at(-1).texte).toContain('NEO vidéo/Out/Pub cortisol/Pub cortisol_v2.mp4')
  })

  it('erreur d\'export : message de l\'agent, marqué terminer', () => {
    const messages = filConversation({
      versions: [v(1)],
      taches: [t('x', 'erreur', '2026-10-03T15:00:00Z', { type: 'terminer', erreur: '« NEO vidéo/Out/a/a_v1.mp4 » existe déjà' })],
    })
    expect(messages.at(-1)).toMatchObject({ role: 'erreur', tache: 'terminer' })
    expect(messages.at(-1).texte).toContain('existe déjà')
  })
})
