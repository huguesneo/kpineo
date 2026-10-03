import { describe, it, expect } from 'vitest'
import {
  MAX_CLIPS, ajouterClip, deplacerClip, renommerClip, changerRoleClip, supprimerClip,
  clipPrincipal, validerClips, lignesClips, payloadClips, trierClips, formatDureeClip,
  remplacements, clipsActifs, etatAjoutClip, ligneAjoutClip, phraseAjoutClip, messageErreurClip, RAISON_RENDU_CLIPS,
} from './montageClips'
import { premiereTacheMontage } from './montageVideo'

const source = (n) => ({ nom: `Clip ${n}`, fichierDriveId: `d${n}`, nomSource: `C${n}_2026-10-03_1000.mov` })
const liste = (n) => Array.from({ length: n }, (_, i) => i + 1).reduce((c, i) => ajouterClip(c, source(i)), [])

describe('ajout : Principal ou B-roll par défaut', () => {
  it('le premier clip est Principal, les suivants B-roll', () => {
    const c = liste(3)
    expect(c.map(x => x.role)).toEqual(['principal', 'broll', 'broll'])
    expect(c[0]).toMatchObject({ nom: 'Clip 1', fichierDriveId: 'd1', nomSource: 'C1_2026-10-03_1000.mov' })
  })

  it('chaque clip a sa clé, et un nom par défaut s\'il est vide', () => {
    const c = ajouterClip(ajouterClip([], { ...source(1), nom: '  ' }), source(2))
    expect(new Set(c.map(x => x.cle)).size).toBe(2)
    expect(c[0].nom).toBe('Clip 1')
  })

  it('après la suppression du principal, un nouveau clip reste B-roll (premier ajouté seulement)', () => {
    const c = liste(2)
    const sans = supprimerClip(c, c[0].cle)
    expect(ajouterClip(sans, source(3)).map(x => x.role)).toEqual(['broll', 'broll'])
  })

  it(`${MAX_CLIPS} clips au plus : le 11e n'est pas ajouté`, () => {
    const c = liste(MAX_CLIPS)
    expect(c).toHaveLength(10)
    expect(ajouterClip(c, source(11))).toBe(c)
  })
})

describe('ordre, nom, rôle, suppression', () => {
  it('flèches haut et bas, sans sortir de la liste', () => {
    const c = liste(3)
    const [a, b, d] = c
    expect(deplacerClip(c, d.cle, -1).map(x => x.nom)).toEqual(['Clip 1', 'Clip 3', 'Clip 2'])
    expect(deplacerClip(c, a.cle, 1).map(x => x.nom)).toEqual(['Clip 2', 'Clip 1', 'Clip 3'])
    expect(deplacerClip(c, a.cle, -1)).toBe(c)
    expect(deplacerClip(c, d.cle, 1)).toBe(c)
    expect(deplacerClip(c, 'inconnu', 1)).toBe(c)
    expect(b.nom).toBe('Clip 2')
  })

  it('renommer, changer de rôle, supprimer ne touchent que le clip visé', () => {
    const c = liste(3)
    expect(renommerClip(c, c[1].cle, 'Cuisine').map(x => x.nom)).toEqual(['Clip 1', 'Cuisine', 'Clip 3'])
    expect(changerRoleClip(c, c[2].cle, 'principal').map(x => x.role)).toEqual(['principal', 'broll', 'principal'])
    expect(changerRoleClip(c, c[2].cle, 'musique')).toBe(c)
    expect(supprimerClip(c, c[1].cle).map(x => x.nom)).toEqual(['Clip 1', 'Clip 3'])
  })
})

describe('règles de lancement', () => {
  it('au moins un clip, au moins un Principal, des noms', () => {
    expect(validerClips([])).toMatch(/au moins une vidéo/)
    const c = liste(2)
    expect(validerClips(c)).toBeNull()
    expect(validerClips(changerRoleClip(c, c[0].cle, 'broll'))).toMatch(/au moins un clip Principal/)
    expect(validerClips(renommerClip(c, c[1].cle, '  '))).toMatch(/nom/)
    expect(validerClips([...liste(10), ...liste(1)])).toMatch(/10 clips au plus/)
  })

  it('le clip principal (source unique de l\'agent actuel) est le premier Principal dans l\'ordre', () => {
    let c = liste(3)
    c = changerRoleClip(c, c[0].cle, 'broll')
    c = changerRoleClip(c, c[2].cle, 'principal')
    c = changerRoleClip(c, c[1].cle, 'principal')
    expect(clipPrincipal(c).nom).toBe('Clip 2')
    expect(clipPrincipal(deplacerClip(c, c[2].cle, -1)).nom).toBe('Clip 3')
    expect(clipPrincipal([])).toBeNull()
  })
})

describe('écriture au lancement', () => {
  const deux = liste(2)
  const clips = deplacerClip(deux, deux[1].cle, -1)

  it('lignes video_clips : ordre 1, 2… dans l\'ordre affiché, noms nettoyés', () => {
    const l = lignesClips('j1', renommerClip(clips, clips[0].cle, ' Cuisine '))
    expect(l).toEqual([
      { job_id: 'j1', ordre: 1, role: 'broll', nom: 'Cuisine', fichier_drive_id: 'd2', nom_source: 'C2_2026-10-03_1000.mov' },
      { job_id: 'j1', ordre: 2, role: 'principal', nom: 'Clip 1', fichier_drive_id: 'd1', nom_source: 'C1_2026-10-03_1000.mov' },
    ])
  })

  it('payload de la tâche : { clips: [{ ordre, nom, role, fichier_drive_id, nom_source }] }, sans prompt', () => {
    const t = premiereTacheMontage('j1', clips)
    expect(t).toEqual({
      job_id: 'j1',
      type: 'montage',
      payload: { clips: payloadClips(clips) },
    })
    expect(t.payload.clips.map(x => [x.ordre, x.role, x.nom_source])).toEqual([
      [1, 'broll', 'C2_2026-10-03_1000.mov'],
      [2, 'principal', 'C1_2026-10-03_1000.mov'],
    ])
    expect(t.payload).not.toHaveProperty('prompt')
  })

  it('sans clips, le payload reste vide (comme avant)', () => {
    expect(premiereTacheMontage('j1').payload).toEqual({})
    expect(premiereTacheMontage('j1', []).payload).toEqual({})
  })
})

describe('lecture dans l\'éditeur', () => {
  it('tri par ordre et durée lisible', () => {
    expect(trierClips([{ ordre: 3 }, { ordre: 1 }, { ordre: 2 }]).map(x => x.ordre)).toEqual([1, 2, 3])
    expect(trierClips(null)).toEqual([])
    expect(formatDureeClip(null)).toBeNull()
    expect(formatDureeClip(12.4)).toBe('12 s')
    expect(formatDureeClip(65)).toBe('1 min 05 s')
  })
})

describe('après la v1 : ajouter ou remplacer un clip', () => {
  const lignes = [
    { id: 'c1', ordre: 1, role: 'principal', nom: 'Entrevue', remplace_ordre: null },
    { id: 'c2', ordre: 2, role: 'broll', nom: 'Cuisine', remplace_ordre: null },
    { id: 'c3', ordre: 3, role: 'broll', nom: 'Cuisine 2', remplace_ordre: 2, ajoute_en_version: 2 },
  ]
  const job = { id: 'j', version_courante: 2, statut: 'apercu_pret' }

  it('un clip remplacé reste dans la liste mais n\'est plus actif', () => {
    expect(remplacements(lignes)[2].ordre).toBe(3)
    expect(clipsActifs(lignes).map(c => c.ordre)).toEqual([1, 3])
  })

  it('caché avant la v1, permis ensuite', () => {
    expect(etatAjoutClip({ job: { ...job, version_courante: 0 }, taches: [], clips: lignes }).visible).toBe(false)
    expect(etatAjoutClip({ job, taches: [], clips: lignes })).toEqual({ visible: true, desactive: false, raison: null, avertissement: null })
  })

  it('bloqué pendant un rendu final ou un Terminer qui attend ou tourne', () => {
    expect(etatAjoutClip({ job: { ...job, statut: 'rendu' }, taches: [], clips: lignes }).raison).toBe(RAISON_RENDU_CLIPS)
    for (const statut of ['en_attente', 'en_cours']) {
      expect(etatAjoutClip({ job, taches: [{ type: 'terminer', statut }], clips: lignes }).desactive).toBe(true)
    }
    expect(etatAjoutClip({ job, taches: [{ type: 'terminer', statut: 'fait' }], clips: lignes }).desactive).toBe(false)
    expect(etatAjoutClip({ job, taches: [{ type: 'montage', statut: 'en_cours' }], clips: lignes }).desactive).toBe(false)
  })

  it('montage terminé : permis, avec l\'avertissement sur l\'export', () => {
    const e = etatAjoutClip({ job: { ...job, statut: 'termine' }, taches: [], clips: lignes })
    expect(e.desactive).toBe(false)
    expect(e.avertissement).toBe('Le fichier exporté reste la v2, il faudra Terminer de nouveau.')
  })

  it('10 clips, remplacés compris : bloqué', () => {
    const dix = Array.from({ length: MAX_CLIPS }, (_, i) => ({ ordre: i + 1, role: 'broll', nom: `c${i}` }))
    expect(etatAjoutClip({ job, taches: [], clips: dix }).desactive).toBe(true)
  })

  it('ligne envoyée : ordre suivant, rôle connu, remplace_ordre', () => {
    expect(ligneAjoutClip('j', lignes, { nom: ' Plan ', role: 'principal', fichierDriveId: 'd', nomSource: 'P.mov', remplaceOrdre: 1 }))
      .toEqual({ job_id: 'j', ordre: 4, role: 'principal', nom: 'Plan', fichier_drive_id: 'd', nom_source: 'P.mov', remplace_ordre: 1 })
    expect(ligneAjoutClip('j', [], { nom: 'x', role: 'musique' })).toMatchObject({ ordre: 1, role: 'broll', remplace_ordre: null })
  })

  it('phrase : B-roll ajouté', () => {
    expect(phraseAjoutClip({ ordre: 4, nom: 'Marché', role: 'broll' }, null, lignes))
      .toBe('Ajoute le B-roll « Marché » (clip 4) là où il sert le mieux le propos.')
  })

  it('phrase : Principal ajouté à la fin, après le dernier Principal actif', () => {
    const p = phraseAjoutClip({ ordre: 4, nom: 'Conclusion', role: 'principal' }, null, lignes)
    expect(p).toContain('Ajoute le clip 4 « Conclusion » (Principal) à la fin de la vidéo, après le clip 1 « Entrevue ».')
    expect(p).toContain('transcris-le')
  })

  it('phrase : remplacement, l\'ancien clip n\'est plus utilisé', () => {
    expect(phraseAjoutClip({ ordre: 4, nom: 'Cuisine 3', role: 'broll' }, lignes[2], lignes))
      .toBe("Remplace le clip 3 « Cuisine 2 » par le clip 4 « Cuisine 3 » : mets ce B-roll à sa place et n'utilise plus le clip 3.")
  })

  it('messages d\'erreur', () => {
    expect(messageErreurClip({ code: '23505' })).toContain('réessaie')
    expect(messageErreurClip({ code: '42501' })).toContain("autorisation")
    expect(messageErreurClip({ message: 'Un rendu final est en cours : attends la fin pour ajouter ou remplacer un clip' }))
      .toContain('Un rendu final est en cours')
  })
})
