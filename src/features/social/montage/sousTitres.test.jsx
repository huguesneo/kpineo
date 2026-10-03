// Panneau « Sous-titres » et rendu markdown du fil, rendus côté serveur (pas
// de DOM dans les tests du hub).
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import PanneauSousTitres from './PanneauSousTitres'
import TexteMarkdown from './TexteMarkdown'
import FilConversation from './FilConversation'
import { etatCorrection } from '../../../lib/montageSousTitres'
import { filConversation } from '../../../lib/montageEditeur'

const JOB = '22222222-0000-0000-0000-000000000001'
const mot = (texte, debutMs, finMs) => ({ texte, debutMs, finMs })
const SOUS_TITRES = {
  video: 'videos/m.mp4', motsParLigne: 3, dureeMs: 5000,
  mots: [mot('passées', 1200, 1560), mot('40', 1560, 1880), mot('ans,', 1880, 2070), mot('Si', 3000, 3060)],
}
const job = { id: JOB, statut: 'apercu_pret', version_courante: 2 }
const v2 = { numero: 2, sous_titres: SOUS_TITRES }
const rien = () => {}

function rendre({ version = v2, j = job, taches = [], brouillons = {} } = {}) {
  return renderToStaticMarkup(
    <PanneauSousTitres
      version={version}
      etat={etatCorrection({ job: j, taches, version })}
      brouillons={brouillons}
      onModifier={rien} onAnnuler={rien} onAppliquer={rien} onSauter={rien}
    />,
  )
}
const bouton = (html, libelle) => new RegExp(`<button[^>]*>(<svg.*?</svg>)?${libelle}</button>`).exec(html)?.[0] ?? ''

describe('PanneauSousTitres', () => {
  it('une ligne par sous-titre, avec son début en secondes et son texte modifiable', () => {
    const html = rendre()
    expect(html).toContain('Sous-titres de la v2')
    expect(html).toContain('>1,2 s</button>')
    expect(html).toContain('>3,0 s</button>')
    expect(html).toContain('value="passées 40 ans,"')
    expect(html).toContain('value="Si"')
    expect(html).not.toMatch(/<input[^>]*disabled=""/)
  })

  it('rien de modifié : Appliquer et Annuler désactivés', () => {
    const html = rendre()
    expect(bouton(html, 'Appliquer les corrections')).toContain('disabled=""')
    expect(bouton(html, 'Annuler mes changements')).toContain('disabled=""')
  })

  it('ligne modifiée : marquée, compteur, boutons actifs', () => {
    const html = rendre({ brouillons: { 0: 'passé 40 ans,' } })
    expect(html).toContain('data-modifiee="oui"')
    expect(html).toContain('1 ligne modifiée')
    expect(bouton(html, 'Appliquer les corrections')).not.toContain('disabled=""')
    expect(bouton(html, 'Annuler mes changements')).not.toContain('disabled=""')
  })

  it('ligne trop longue : avertissement visible, envoi toujours possible', () => {
    const html = rendre({ brouillons: { 0: 'passées quarante-deux ans,' } })
    expect(html).toContain('26 caractères : 24 au plus par ligne.')
    expect(bouton(html, 'Appliquer les corrections')).not.toContain('disabled=""')
  })

  it('mot retiré : erreur sur la ligne, envoi bloqué', () => {
    const html = rendre({ brouillons: { 0: 'passées 40' } })
    expect(html).toContain('Garde au moins 3 mots')
    expect(bouton(html, 'Appliquer les corrections')).toContain('disabled=""')
  })

  it('tâche du montage en attente ou en cours : champs et Appliquer désactivés, message', () => {
    for (const statut of ['en_attente', 'en_cours']) {
      const html = rendre({ taches: [{ id: 'a', statut, created_at: '2026-10-03T10:00:00Z' }], brouillons: { 0: 'passé 40 ans,' } })
      expect(html).toMatch(/<input[^>]*disabled=""/)
      expect(bouton(html, 'Appliquer les corrections')).toContain('disabled=""')
      expect(html).toMatch(/attend son tour|agent travaille/)
    }
  })

  it('montage terminé : lecture seule, pas de boutons', () => {
    const html = rendre({ j: { ...job, statut: 'termine' } })
    expect(html).toMatch(/<input[^>]*disabled=""/)
    expect(html).not.toContain('Appliquer les corrections')
    expect(html).toContain('terminé')
  })

  it('ancienne version affichée : lecture seule, invitation à afficher la version actuelle', () => {
    const html = rendre({ version: { numero: 1, sous_titres: SOUS_TITRES } })
    expect(html).toMatch(/<input[^>]*disabled=""/)
    expect(html).not.toContain('Appliquer les corrections')
    expect(html).toContain('version actuelle (v2)')
  })

  it('version sans sous-titres : message, aucune ligne', () => {
    const html = rendre({ version: { numero: 2, sous_titres: null } })
    expect(html).toContain('Pas de sous-titres enregistrés pour cette version.')
    expect(html).not.toContain('<input')
  })
})

describe('TexteMarkdown (réponse de l\'agent)', () => {
  const reponse = '## Ce que j\'ai changé\n\nLe **hook** est plus court.\n\n- musique baissée\n- carte *Stat* déplacée\n\n| Moment | Carte |\n|---|---|\n| 0:03 | Hook |'

  it('titres, gras, listes et tableaux en vraies balises', () => {
    const html = renderToStaticMarkup(<TexteMarkdown texte={reponse} />)
    expect(html).toContain('<h4')
    expect(html).toContain('Ce que j&#x27;ai changé</h4>')
    expect(html).toContain('<strong class="font-semibold">hook</strong>')
    expect(html).toMatch(/<ul[^>]*><li>musique baissée<\/li><li>carte <em>Stat<\/em> déplacée<\/li><\/ul>/)
    expect(html).toMatch(/<th[^>]*>Moment<\/th>/)
    expect(html).toMatch(/<td[^>]*>0:03<\/td>/)
    expect(html).not.toContain('##')
    expect(html).not.toContain('|')
  })

  it('le HTML du texte reste du texte (échappé)', () => {
    const html = renderToStaticMarkup(<TexteMarkdown texte={'<img src=x onerror=alert(1)> **ok**'} />)
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('dans le fil : la réponse de l\'agent est rendue, la demande reste en texte', () => {
    const versions = [{ id: 'v1', numero: 1, chemin_apercu: 'a', prompt: '**pas du markdown**', reponse_agent: '## Fait', auteur: 'x', created_at: '2026-10-03T14:00:00Z' }]
    const html = renderToStaticMarkup(<FilConversation messages={filConversation({ versions, taches: [] })} />)
    expect(html).toMatch(/<h4[^>]*>Fait<\/h4>/)
    expect(html).toContain('**pas du markdown**')
  })
})
