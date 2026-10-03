import { describe, it, expect } from 'vitest'
import {
  motsDe, grouperLignes, lignesDe, formatDebut, avertissementsLigne, correctionsLigne, estModifiee,
  correctionsAEnvoyer, tacheCorrection, etatCorrection, erreurCorrections, erreurBase, nbSuppressions,
  MOTS_MAX_LIGNE, LETTRES_MAX_LIGNE,
} from './montageSousTitres'
import { texteTache, filConversation, messageErreurEnvoi } from './montageEditeur'

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
  it('mot en moins : retiré (supprimer: true), sur son numéro d\'origine', () => {
    expect(correctionsLigne(ligne, 'passées 40', parIndex)).toEqual({ corrections: [{ mot: 6, supprimer: true }], erreur: null })
    expect(correctionsLigne(ligne, 'passées ans,', parIndex).corrections).toEqual([{ mot: 5, supprimer: true }])
    expect(correctionsLigne(ligne, '40 ans,', parIndex).corrections).toEqual([{ mot: 4, supprimer: true }])
  })
  it('mot retiré et mot corrigé sur la même ligne : le mot qui ressemble le plus est gardé', () => {
    // « passées » corrigé en « passé », « 40 » retiré
    expect(correctionsLigne(ligne, 'passé ans,', parIndex).corrections).toEqual([{ mot: 4, texte: 'passé' }, { mot: 5, supprimer: true }])
    // ponctuation et accents ignorés pour reconnaître un mot gardé
    expect(correctionsLigne(ligne, 'passees ans', parIndex).corrections).toEqual([{ mot: 4, texte: 'passees' }, { mot: 5, supprimer: true }, { mot: 6, texte: 'ans' }])
  })
  it('ligne vidée : tous ses mots sont retirés', () => {
    const seul = lignesDe(SOUS_TITRES)[1] // femmes, (mot 3)
    expect(correctionsLigne(seul, '   ', parIndex)).toEqual({ corrections: [{ mot: 3, supprimer: true }], erreur: null })
    expect(correctionsLigne(ligne, '', parIndex).corrections).toEqual([4, 5, 6].map(m => ({ mot: m, supprimer: true })))
  })
  it('mot répété : un seul des deux est retiré', () => {
    const l = { cle: 0, indices: [0, 1, 2], texte: 'le le chat' }
    const p = new Map([[0, { texte: 'le' }], [1, { texte: 'le' }], [2, { texte: 'chat' }]])
    const r = correctionsLigne(l, 'le chat', p).corrections
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ supprimer: true })
    expect([0, 1]).toContain(r[0].mot)
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
    expect(r).toEqual({ corrections: [{ mot: 0, texte: 'Voilà' }, { mot: 12, texte: 'maigrir' }], erreurs: {}, erreur: null, modifiees: 2 })
  })
  it('corrections et suppressions mélangées, triées par numéro d\'origine', () => {
    const r = correctionsAEnvoyer(SOUS_TITRES, { 4: 'passées', 0: 'Voilà pourquoi les' })
    expect(r).toEqual({
      corrections: [{ mot: 0, texte: 'Voilà' }, { mot: 5, supprimer: true }, { mot: 6, supprimer: true }],
      erreurs: {}, erreur: null, modifiees: 2,
    })
    expect(nbSuppressions(r.corrections)).toBe(2)
  })
  it('tous les mots retirés : refusé', () => {
    const brouillons = Object.fromEntries(lignesDe(SOUS_TITRES).map(l => [l.cle, '']))
    const r = correctionsAEnvoyer(SOUS_TITRES, brouillons)
    expect(nbSuppressions(r.corrections)).toBe(16)
    expect(r.erreur).toMatch(/pas retirer tous les mots/)
  })
  it('rien de modifié : rien à envoyer', () => {
    expect(correctionsAEnvoyer(SOUS_TITRES, {})).toEqual({ corrections: [], erreurs: {}, erreur: null, modifiees: 0 })
  })
  it('garde-fous : même mot corrigé et retiré, tout retiré', () => {
    expect(erreurCorrections([{ mot: 2, texte: 'a' }, { mot: 2, supprimer: true }], 10)).toMatch(/à la fois corrigé et retiré/)
    expect(erreurCorrections([{ mot: 0, supprimer: true }, { mot: 1, supprimer: true }, { mot: 1, supprimer: true }], 2)).toMatch(/pas retirer tous les mots/)
    expect(erreurCorrections([{ mot: 0, supprimer: true }, { mot: 1, texte: 'b' }], 2)).toBeNull()
    expect(erreurCorrections([], 2)).toBeNull()
  })
  it('tâche correction_sous_titres au format de l\'agent, sans statut ni cree_par', () => {
    const t = tacheCorrection(JOB, [{ mot: 4, texte: 'passé' }])
    expect(t).toEqual({ job_id: JOB, type: 'correction_sous_titres', payload: { corrections: [{ mot: 4, texte: 'passé' }] } })
    expect(Object.keys(t).sort()).toEqual(['job_id', 'payload', 'type'])
  })
  it('suppression : { mot, supprimer: true } dans la même tâche', () => {
    expect(tacheCorrection(JOB, [{ mot: 1, texte: 'b' }, { mot: 3, supprimer: true }], 16).payload)
      .toEqual({ corrections: [{ mot: 1, texte: 'b' }, { mot: 3, supprimer: true }] })
  })
  it('tâche fautive : elle ne part pas, message clair', () => {
    expect(() => tacheCorrection(JOB, [{ mot: 3, texte: 'x' }, { mot: 3, supprimer: true }], 16)).toThrow(/à la fois corrigé et retiré/)
    let err
    try { tacheCorrection(JOB, [{ mot: 0, supprimer: true }], 1) } catch (e) { err = e }
    expect(messageErreurEnvoi(err)).toBe('Tu ne peux pas retirer tous les mots des sous-titres : garde au moins un mot.')
  })
})

describe('numéros de mots à jour avant l\'envoi (une suppression les décale)', () => {
  it('corrections faites sur la version actuelle, file libre : envoi permis', () => {
    expect(erreurBase({ numeroBase: 3, job: { version_courante: 3 }, tachesActives: [] })).toBeNull()
  })
  it('nouvelle version arrivée : refus, sous-titres à relire', () => {
    expect(erreurBase({ numeroBase: 3, job: { version_courante: 4 }, tachesActives: [] })).toMatch(/nouvelle version \(v4\).*refais tes corrections/)
  })
  it('autre demande en attente ou en cours : refus', () => {
    expect(erreurBase({ numeroBase: 3, job: { version_courante: 3 }, tachesActives: [{ id: 'x' }] })).toMatch(/autre demande/)
  })
  it('montage disparu : refus', () => {
    expect(erreurBase({ numeroBase: 3, job: null, tachesActives: [] })).toMatch(/n'existe plus/)
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
  it('montage terminé : on peut encore corriger la version actuelle', () => {
    expect(etatCorrection({ job: { ...job, statut: 'termine' }, taches: [], version: v2 })).toMatchObject({ lectureSeule: false, envoiDesactive: false })
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
  it('mots retirés comptés à part', () => {
    const avec = (corrections) => texteTache({ ...t, payload: { corrections } })
    expect(avec([{ mot: 1, texte: 'a' }, { mot: 2, supprimer: true }])).toBe('Correction des sous-titres à la main (1 mot corrigé, 1 mot retiré)')
    expect(avec([{ mot: 2, supprimer: true }, { mot: 4, supprimer: true }])).toBe('Correction des sous-titres à la main (2 mots retirés)')
    expect(avec([{ mot: 1, texte: 'a' }, { mot: 3, texte: 'c' }, { mot: 2, supprimer: true }])).toBe('Correction des sous-titres à la main (2 mots corrigés, 1 mot retiré)')
  })
  it('demande en attente et refus de l\'agent', () => {
    expect(filConversation({ versions: [], taches: [t] }).at(-1).texte).toBe('Correction des sous-titres à la main (2 mots)')
    const refus = filConversation({ versions: [], taches: [{ ...t, statut: 'erreur', erreur: 'Le mot n° 99 n\'existe pas' }] })
    expect(refus.map(m => m.role)).toEqual(['demande', 'erreur'])
    expect(refus[0].texte).toMatch(/Correction des sous-titres/)
  })
})
