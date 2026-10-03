import { describe, it, expect } from 'vitest'
import {
  MAX_CLIPS, ajouterClip, deplacerClip, renommerClip, changerRoleClip, supprimerClip,
  clipPrincipal, validerClips, lignesClips, payloadClips, trierClips, formatDureeClip,
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
