import { describe, it, expect } from 'vitest'
import {
  motsDe, grouperLignes, lignesDe, formatDebut, avertissementsLigne, correctionsLigne, estModifiee,
  correctionsAEnvoyer, tacheCorrection, etatCorrection, MOTS_MAX_LIGNE, LETTRES_MAX_LIGNE,
} from './montageSousTitres'
import { texteTache, filConversation } from './montageEditeur'

const JOB = '22222222-0000-0000-0000-000000000001'
const mot = (texte, debutMs, finMs) => ({ texte, debutMs, finMs })
// Début de video-neo/public/sous-titres/0929-2.json (même forme).
const SOUS_TITRES = {
  video: 'videos/0929-2.mp4', motsParLigne: 3, dureeMs: 48100,
  mots: [
    mot('Voici', 70, 240), mot('pourquoi', 240, 630), mot('les', 630, 780), mot('femmes,', 780, 1200),
    mot('passées', 1200, 1560), mot('40', 1560, 1880), mot('ans,', 1880, 2070),
    mot('ont', 2070, 2220), mot('énormément', 2220, 2680), mot('de', 2680, 2700), mot('difficultés', 2700, 3080),
    mot('à', 3080, 3150), mot('perdre', 3150, 3400), mot('du', 3400, 3710), mot('poids.', 3710, 4400),
    mot('Si', 5000, 5060),
  ],
}

describe('lignes de sous-titres (comme le gabarit SousTitres de video-neo)', () => {
  it('coupe sur la ponctuation, à 24 caractères, et sur une pause de plus de 350 ms', () => {
    expect(lignesDe(SOUS_TITRES).map(l => l.texte)).toEqual([
      'Voici pourquoi les', // « femmes, » ferait 26 caractères
      'femmes,',
      'passées 40 ans,',
      'ont énormément de', // « difficultés » ferait 29 caractères
      'difficultés à perdre du',
      'poids.',
      'Si',
    ])
  })
  it('chaque ligne garde les index d\'origine de ses mots et son début', () => {
    const l = lignesDe(SOUS_TITRES)
    expect(l[2]).toEqual({ cle: 4, indices: [4, 5, 6], debutMs: 1200, texte: 'passées 40 ans,' })
  })
  it('5 mots au plus', () => {
    const courts = Array.from({ length: 7 }, (_, i) => mot('a', i * 100, i * 100 + 100))
    expect(grouperLignes(motsDe({ mots: courts })).map(l => l.indices.length)).toEqual([5, 2])
  })
  it('sous-titres absents ou mal formés : aucune ligne', () => {
    expect(lignesDe(null)).toEqual([])
    expect(lignesDe({ mots: 'x' })).toEqual([])
    expect(lignesDe({ mots: [{ texte: 'sans minutage' }] })).toEqual([])
  })
  it('début en secondes, à la française', () => {
    expect(formatDebut(1200)).toBe('1,2 s')
    expect(formatDebut(70)).toBe('0,1 s')
    expect(formatDebut(48100)).toBe('48,1 s')
  })
})

describe('avertissements de longueur (règles du skill, sans bloquer)', () => {
  it('ligne correcte : rien', () => {
    expect(avertissementsLigne('passées 40 ans,')).toEqual([])
    expect(avertissementsLigne('a'.repeat(LETTRES_MAX_LIGNE))).toEqual([])
  })
  it('plus de 5 mots', () => {
    expect(avertissementsLigne('un deux trois quatre cinq six')).toEqual([`6 mots : ${MOTS_MAX_LIGNE} au plus par ligne.`, '29 caractères : 24 au plus par ligne.'])
  })
  it('plus de 24 caractères', () => {
    expect(avertissementsLigne('passées quarante-deux ans,')).toEqual(['26 caractères : 24 au plus par ligne.'])
  })
  it('espaces en trop ignorées dans le compte', () => {
    expect(avertissementsLigne('  passées   40   ans,  ')).toEqual([])
  })
  it('retour à la ligne : une seule ligne', () => {
    expect(avertissementsLigne('passées\n40 ans')[0]).toMatch(/Une seule ligne/)
  })
})

describe('modification d\'une ligne → corrections mot par mot', () => {
  const mots = motsDe(SOUS_TITRES)
  const parIndex = new Map(mots.map(m => [m.index, m]))
  const ligne = lignesDe(SOUS_TITRES)[2] // passées 40 ans, (mots 4, 5, 6)

  it('seuls les mots changés partent', () => {
    expect(correctionsLigne(ligne, 'passé 40 ans,', parIndex)).toEqual({ corrections: [{ mot: 4, texte: 'passé' }], erreur: null })
  })
  it('mots en plus : ils rejoignent le dernier mot', () => {
    expect(correctionsLigne(ligne, 'passées 40 ans bien sonnés,', parIndex).corrections)
      .toEqual([{ mot: 6, texte: 'ans bien sonnés,' }])
  })
  it('mots en moins : refusé (l\'agent ne retire pas de mot)', () => {
    const r = correctionsLigne(ligne, 'passées 40', parIndex)
    expect(r.corrections).toEqual([])
    expect(r.erreur).toMatch(/Garde au moins 3 mots/)
  })
  it('ligne d\'un mot vidée : refusé', () => {
    const seul = lignesDe(SOUS_TITRES)[1]
    expect(correctionsLigne(seul, '   ', parIndex).erreur).toBe('Un sous-titre ne peut pas être vide.')
  })
  it('modifiée = différente du texte d\'origine (espaces en trop ignorées)', () => {
    expect(estModifiee(ligne, undefined)).toBe(false)
    expect(estModifiee(ligne, ' passées  40 ans, ')).toBe(false)
    expect(estModifiee(ligne, 'passées 40 ans')).toBe(true)
  })
})

describe('corrections à envoyer et payload', () => {
  it('n\'envoie que les lignes modifiées, triées par mot', () => {
    const r = correctionsAEnvoyer(SOUS_TITRES, {
      11: 'difficultés à maigrir du', // ligne 5 (mots 10 à 13) : clé = 10, donc ignorée
      10: 'difficultés à maigrir du',
      4: 'passées 40 ans,', // inchangée
      0: 'Voilà pourquoi les',
    })
    expect(r).toEqual({ corrections: [{ mot: 0, texte: 'Voilà' }, { mot: 12, texte: 'maigrir' }], erreurs: {}, modifiees: 2 })
  })
  it('une ligne invalide donne une erreur sur sa clé', () => {
    const r = correctionsAEnvoyer(SOUS_TITRES, { 4: 'passées' })
    expect(r.corrections).toEqual([])
    expect(Object.keys(r.erreurs)).toEqual(['4'])
    expect(r.modifiees).toBe(1)
  })
  it('rien de modifié : rien à envoyer', () => {
    expect(correctionsAEnvoyer(SOUS_TITRES, {})).toEqual({ corrections: [], erreurs: {}, modifiees: 0 })
  })
  it('tâche correction_sous_titres au format de l\'agent, sans statut ni cree_par', () => {
    const t = tacheCorrection(JOB, [{ mot: 4, texte: 'passé' }])
    expect(t).toEqual({ job_id: JOB, type: 'correction_sous_titres', payload: { corrections: [{ mot: 4, texte: 'passé' }] } })
    expect(Object.keys(t).sort()).toEqual(['job_id', 'payload', 'type'])
  })
})

describe('états du panneau', () => {
  const job = { id: JOB, statut: 'apercu_pret', version_courante: 2 }
  const v2 = { numero: 2, sous_titres: SOUS_TITRES }
  const tache = (statut) => ({ id: 'a', statut, created_at: '2026-10-03T10:00:00Z' })

  it('version actuelle, file libre : modifiable et envoyable', () => {
    expect(etatCorrection({ job, taches: [tache('fait')], version: v2 })).toEqual({ lectureSeule: false, raison: null, envoiDesactive: false, raisonEnvoi: null })
  })
  it('tâche en attente ou en cours : envoi désactivé, même message que le champ de demande', () => {
    expect(etatCorrection({ job, taches: [tache('en_attente')], version: v2 })).toMatchObject({ lectureSeule: false, envoiDesactive: true, raisonEnvoi: expect.stringMatching(/attend son tour/) })
    expect(etatCorrection({ job, taches: [tache('en_cours')], version: v2 })).toMatchObject({ envoiDesactive: true, raisonEnvoi: expect.stringMatching(/agent travaille/) })
  })
  it('montage terminé : lecture seule', () => {
    expect(etatCorrection({ job: { ...job, statut: 'termine' }, taches: [], version: v2 })).toMatchObject({ lectureSeule: true, envoiDesactive: true, raison: expect.stringMatching(/terminé/) })
  })
  it('ancienne version affichée : lecture seule (l\'agent corrige la version actuelle)', () => {
    expect(etatCorrection({ job, taches: [], version: { numero: 1, sous_titres: SOUS_TITRES } })).toMatchObject({ lectureSeule: true, raison: expect.stringMatching(/version actuelle \(v2\)/) })
  })
  it('version sans sous-titres : lecture seule, message', () => {
    expect(etatCorrection({ job, taches: [], version: { numero: 2, sous_titres: null } })).toMatchObject({ lectureSeule: true, raison: expect.stringMatching(/Pas de sous-titres/) })
  })
})

describe('fil de conversation : tâche de correction', () => {
  const t = { id: 'c', job_id: JOB, type: 'correction_sous_titres', statut: 'en_attente', created_at: '2026-10-03T15:00:00Z', cree_par: 'x', payload: { corrections: [{ mot: 1, texte: 'a' }, { mot: 2, texte: 'b' }] } }
  it('libellé à la place du prompt', () => {
    expect(texteTache(t)).toBe('Correction des sous-titres à la main (2 mots)')
    expect(texteTache({ ...t, payload: { corrections: [{ mot: 1, texte: 'a' }] } })).toBe('Correction des sous-titres à la main (1 mot)')
    expect(texteTache({ type: 'montage', payload: { prompt: 'Coupe' } })).toBe('Coupe')
  })
  it('demande en attente et refus de l\'agent', () => {
    expect(filConversation({ versions: [], taches: [t] }).at(-1).texte).toBe('Correction des sous-titres à la main (2 mots)')
    const refus = filConversation({ versions: [], taches: [{ ...t, statut: 'erreur', erreur: 'Le mot n° 99 n\'existe pas' }] })
    expect(refus.map(m => m.role)).toEqual(['demande', 'erreur'])
    expect(refus[0].texte).toMatch(/Correction des sous-titres/)
  })
})
