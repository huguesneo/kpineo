// Clips (étape 1 et éditeur) et file d'attente de l'accueil, rendus côté
// serveur (pas de DOM dans les tests du hub).
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import ListeClips from './ListeClips'
import ClipsMontage from './ClipsMontage'
import EtapeVideo from './EtapeVideo'
import { FileAttente } from './MontageAccueil'
import { ajouterClip, changerRoleClip, validerClips } from '../../../lib/montageClips'

const source = (n) => ({ nom: `Clip ${n}`, fichierDriveId: `d${n}`, nomSource: `C${n}_2026-10-03_1000.mov` })
const liste = (n) => Array.from({ length: n }, (_, i) => i + 1).reduce((c, i) => ajouterClip(c, source(i)), [])
const actions = { onDeplacer: () => {}, onRenommer: () => {}, onRole: () => {}, onSupprimer: () => {} }

// Éléments React (sans hooks) : retrouve les nœuds qui répondent au test.
function trouver(el, test, res = []) {
  if (!el || typeof el !== 'object') return res
  if (Array.isArray(el)) { el.forEach(e => trouver(e, test, res)); return res }
  if (test(el)) res.push(el)
  trouver(el.props?.children, test, res)
  return res
}

const envoiVide = {
  etat: 'choix', message: null, fichier: null, fichierDrive: null, progression: {}, resultat: null,
  choisirFichier: () => {}, demarrer: () => {}, reprendre: () => {}, annuler: () => {}, recommencer: () => {},
  choisirDansDrive: () => {}, copierDansBrut: () => {}, autoriserBrut: () => {},
}

describe('ListeClips (étape 1)', () => {
  it('un clip par ligne, dans l\'ordre, avec son numéro, son nom et Brut/<nom_source>', () => {
    const html = renderToStaticMarkup(<ListeClips clips={liste(3)} {...actions} />)
    expect([...html.matchAll(/value="(Clip \d)"/g)].map(m => m[1])).toEqual(['Clip 1', 'Clip 2', 'Clip 3'])
    expect(html).toContain('Brut/C2_2026-10-03_1000.mov')
    expect(html).toContain('3 sur 10')
  })

  it('premier Principal, autres B-roll (bouton pressé)', () => {
    const html = renderToStaticMarkup(<ListeClips clips={liste(2)} {...actions} />)
    expect([...html.matchAll(/data-role="(\w+)"/g)].map(m => m[1])).toEqual(['principal', 'broll'])
    expect((html.match(/aria-pressed="true"[^>]*>Principal</g) || []).length).toBe(1)
    expect((html.match(/aria-pressed="true"[^>]*>B-roll</g) || []).length).toBe(1)
  })

  it('flèche haut désactivée sur le premier, flèche bas sur le dernier', () => {
    const html = renderToStaticMarkup(<ListeClips clips={liste(2)} {...actions} />)
    expect(html).toMatch(/disabled=""[^>]*aria-label="Monter le clip 1"/)
    expect(html).not.toMatch(/disabled=""[^>]*aria-label="Monter le clip 2"/)
    expect(html).toMatch(/disabled=""[^>]*aria-label="Descendre le clip 2"/)
    expect(html).not.toMatch(/disabled=""[^>]*aria-label="Descendre le clip 1"/)
  })

  it('les boutons appellent les actions avec la clé du clip', () => {
    const c = liste(2)
    const a = { onDeplacer: vi.fn(), onRenommer: vi.fn(), onRole: vi.fn(), onSupprimer: vi.fn() }
    const el = ListeClips({ clips: c, ...a })
    const bouton = (label) => trouver(el, n => n.props?.['aria-label'] === label)[0]
    bouton('Descendre le clip 1').props.onClick()
    bouton('Monter le clip 2').props.onClick()
    bouton('Retirer le clip 2').props.onClick()
    trouver(el, n => n.type === 'button' && n.props.children === 'Principal')[1].props.onClick()
    bouton('Nom du clip 1').props.onChange({ target: { value: 'Entrevue' } })
    expect(a.onDeplacer.mock.calls).toEqual([[c[0].cle, 1], [c[1].cle, -1]])
    expect(a.onSupprimer).toHaveBeenCalledWith(c[1].cle)
    expect(a.onRole).toHaveBeenCalledWith(c[1].cle, 'principal')
    expect(a.onRenommer).toHaveBeenCalledWith(c[0].cle, 'Entrevue')
  })

  it('sans Principal : message à la place de l\'aide', () => {
    const c = liste(1)
    const sans = changerRoleClip(c, c[0].cle, 'broll')
    const html = renderToStaticMarkup(<ListeClips clips={sans} {...actions} erreur={validerClips(sans)} />)
    expect(html).toContain('au moins un clip Principal')
    expect(html).not.toContain('la vidéo parlée')
  })

  it('désactivée pendant un envoi', () => {
    const html = renderToStaticMarkup(<ListeClips clips={liste(2)} {...actions} desactive />)
    expect(html).not.toMatch(/<button(?![^>]*disabled)/)
  })

  it('vide : rien', () => {
    expect(renderToStaticMarkup(<ListeClips clips={[]} {...actions} />)).toBe('')
  })
})

describe('EtapeVideo avec des clips', () => {
  it('sans clip : zone de dépôt habituelle, pas de titre', () => {
    const html = renderToStaticMarkup(<StaticRouter location="/"><EtapeVideo envoi={envoiVide} clips={[]} actionsClips={actions} titre="" setTitre={() => {}} /></StaticRouter>)
    expect(html).toContain('Glisse ta vidéo ici')
    expect(html).not.toContain('Titre de la vidéo')
  })

  it('avec des clips : la liste, « Ajouter un clip » et le titre', () => {
    const html = renderToStaticMarkup(<StaticRouter location="/"><EtapeVideo envoi={envoiVide} clips={liste(2)} actionsClips={actions} titre="Clip 1" setTitre={() => {}} /></StaticRouter>)
    expect(html).toContain('Clips du montage')
    expect(html).toContain('Ajouter un clip')
    expect(html).toContain('Titre de la vidéo')
  })

  it('10 clips : plus de zone de dépôt', () => {
    const html = renderToStaticMarkup(<StaticRouter location="/"><EtapeVideo envoi={envoiVide} clips={liste(10)} actionsClips={actions} titre="x" setTitre={() => {}} /></StaticRouter>)
    expect(html).not.toContain('Ajouter un clip')
    expect(html).toContain('10 clips au plus')
  })

  it('montage déjà créé (réessai) : clips figés, pas de zone de dépôt', () => {
    const html = renderToStaticMarkup(<StaticRouter location="/"><EtapeVideo envoi={envoiVide} clips={liste(2)} actionsClips={actions} verrouille titre="x" setTitre={() => {}} /></StaticRouter>)
    expect(html).not.toContain('Ajouter un clip')
    expect(html).toContain('Clips du montage')
  })
})

describe('ClipsMontage (éditeur, lecture seule)', () => {
  const lignes = [
    { id: 'c2', ordre: 2, role: 'broll', nom: 'Cuisine', nom_source: 'B.mov', duree_s: 8 },
    { id: 'c1', ordre: 1, role: 'principal', nom: 'Entrevue', nom_source: 'A.mov', duree_s: null },
  ]

  it('dans l\'ordre, avec le rôle et la durée connue, sans champ ni bouton', () => {
    const html = renderToStaticMarkup(<ClipsMontage clips={lignes} />)
    expect(html.indexOf('Entrevue')).toBeLessThan(html.indexOf('Cuisine'))
    expect(html).toContain('Principal')
    expect(html).toContain('B-roll')
    expect(html).toContain('8 s')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('<input')
  })

  it('aucun clip : rien', () => {
    expect(renderToStaticMarkup(<ClipsMontage clips={[]} />)).toBe('')
  })

  const apresV1 = [
    { id: 'c1', ordre: 1, role: 'principal', nom: 'Entrevue', remplace_ordre: null, ajoute_en_version: null },
    { id: 'c2', ordre: 2, role: 'broll', nom: 'Cuisine', remplace_ordre: null, ajoute_en_version: null },
    { id: 'c3', ordre: 3, role: 'broll', nom: 'Cuisine 2', remplace_ordre: 2, ajoute_en_version: 2 },
  ]
  const permis = { visible: true, desactive: false, raison: null, avertissement: null }

  it('après la v1 : « Ajouter un clip » et « Remplacer » sur les clips encore utilisés', () => {
    const html = renderToStaticMarkup(<ClipsMontage clips={apresV1} ajout={permis} onAjouter={() => {}} onPhrase={() => {}} />)
    expect(html).toContain('+ Ajouter un clip')
    expect(html.match(/>Remplacer</g)).toHaveLength(2)
    expect(html).toContain('data-remplace="oui"')
    expect(html).toContain('line-through')
    expect(html).toContain('Remplacé par le clip 3')
    expect(html).toContain('Remplace le clip 2 · ajouté après la v2')
  })

  it('variante : pas de « ajouté après la vN »', () => {
    const html = renderToStaticMarkup(<ClipsMontage clips={apresV1} ajout={permis} onAjouter={() => {}} versionsAjout={false} />)
    expect(html).toContain('Remplace le clip 2')
    expect(html).not.toContain('ajouté après')
  })

  it('pendant un rendu final : boutons désactivés, raison affichée', () => {
    const ajout = { visible: true, desactive: true, raison: 'Un rendu final est en cours : attends la fin pour ajouter ou remplacer un clip.', avertissement: null }
    const html = renderToStaticMarkup(<ClipsMontage clips={apresV1} ajout={ajout} onAjouter={() => {}} />)
    expect(html).toContain('Un rendu final est en cours')
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(3)
  })

  it('avant la v1 : lecture seule', () => {
    const html = renderToStaticMarkup(<ClipsMontage clips={apresV1} ajout={{ visible: false }} onAjouter={() => {}} />)
    expect(html).not.toContain('<button')
  })
})

describe('FileAttente (accueil)', () => {
  it('chaque ligne (en cours et en attente) mène à l\'éditeur du montage', () => {
    const jobs = [
      { id: 'a1', titre: 'En cours', statut: 'montage', progression: 40, cree_par: 'x' },
      { id: 'b2', titre: 'Attend', statut: 'en_file', cree_par: 'info@neoperformance.ca' },
    ]
    const html = renderToStaticMarkup(
      <StaticRouter location="/"><FileAttente jobs={jobs} positions={{ b2: 1 }} noms={{}} enLigne /></StaticRouter>,
    )
    expect(html).toContain('href="/reseaux-sociaux/montage/a1"')
    expect(html).toContain('href="/reseaux-sociaux/montage/b2"')
  })
})
