// Étape 10b, rendue côté serveur (pas de DOM dans les tests du hub) :
// Créer une variante, lecteur au ratio du montage, liens origine / variantes.
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { CreerVariante, LienOrigine, ListeVariantes } from './VariantesMontage'
import LecteurApercu, { EtatProgression } from './LecteurApercu'
import FilConversation from './FilConversation'
import { ListeMontages } from './MontageAccueil'
import { filConversation } from '../../../lib/montageEditeur'

const JOB = '22222222-0000-0000-0000-000000000001'
const VAR = '22222222-0000-0000-0000-000000000002'
const job = (extra = {}) => ({ id: JOB, titre: 'Pub cortisol', statut: 'apercu_pret', version_courante: 3, format: '9:16', ...extra })
const version = (numero) => ({ id: `v${numero}`, job_id: JOB, numero, chemin_apercu: `apercus/${JOB}/v${numero}.mp4` })
const tache = (statut, extra = {}) => ({ id: 'a', job_id: JOB, type: 'montage', statut, created_at: '2026-10-03T15:00:00Z', payload: {}, ...extra })
const rien = async () => {}
const actif = (libelle) => new RegExp(`<button(?![^>]*disabled="")[^>]*>${libelle}</button>`)
const inactif = (libelle) => new RegExp(`<button[^>]*disabled=""[^>]*>${libelle}</button>`)
const avecRouteur = (el) => renderToStaticMarkup(<StaticRouter location="/">{el}</StaticRouter>)

describe('Créer une variante (éditeur)', () => {
  const rendre = (props) => renderToStaticMarkup(
    <CreerVariante job={job()} taches={[]} version={version(3)} onCreer={rien} {...props} />,
  )

  it('bouton actif sur la version actuelle', () => {
    expect(rendre()).toMatch(actif('Créer une variante'))
  })

  it('ancienne version affichée : aucun bouton', () => {
    expect(rendre({ version: version(1) })).toBe('')
  })

  it('désactivé pendant une tâche en cours ou en attente, avec la raison', () => {
    let html = rendre({ taches: [tache('en_cours')] })
    expect(html).toMatch(inactif('Créer une variante'))
    expect(html).toContain('agent travaille')
    html = rendre({ taches: [tache('en_attente', { type: 'variante', payload: { format: '4:5' } })] })
    expect(html).toMatch(inactif('Créer une variante'))
    expect(html).toContain('attend son tour')
  })

  it('formulaire : trois types, un seul choisi, hook obligatoire', () => {
    const html = rendre({ ouvertInitial: true })
    expect(html).toContain('Autre hook')
    expect(html).toContain('Format 4:5')
    expect(html).toContain('Format 1:1')
    expect(html.match(/type="radio"/g)).toHaveLength(3)
    expect(html.match(/checked=""/g)).toHaveLength(1)
    expect(html).toMatch(/checked="" value="hook"/)
    expect(html).toContain('Nouveau hook, ou consigne sur l&#x27;accroche')
    expect(html).not.toContain('(facultative)')
    expect(html).toContain('« Pub cortisol (variante hook) », à partir de la v3')
    expect(html).toMatch(actif('Créer la variante'))
  })

  it('format 4:5 : consigne facultative, titre prévu', () => {
    const html = rendre({ ouvertInitial: true, typeInitial: '4:5' })
    expect(html).toMatch(/checked="" value="4:5"/)
    expect(html).toContain('(facultative)')
    expect(html).toContain('« Pub cortisol (variante 4:5) »')
  })

  it('montage déjà en 4:5 : pas de « Format 4:5 »', () => {
    const html = rendre({ job: job({ format: '4:5' }), ouvertInitial: true })
    expect(html).not.toContain('Format 4:5')
    expect(html).toContain('Format 1:1')
  })

  it('formulaire fermé pendant une tâche, même ouvert avant', () => {
    expect(rendre({ ouvertInitial: true, taches: [tache('en_cours')] })).not.toContain('Créer la variante')
  })
})

describe('Lecteur au ratio du montage', () => {
  const rendre = (format) => renderToStaticMarkup(<LecteurApercu numero={1} url="https://x/v1.mp4" format={format} onErreurChargement={() => {}} />)

  it('9:16 par défaut', () => {
    expect(rendre(undefined)).toMatch(/data-format="9:16" class="[^"]*aspect-\[9\/16\]/)
  })

  it('4:5 : cadre 4:5, pas 9:16', () => {
    const html = rendre('4:5')
    expect(html).toMatch(/data-format="4:5" class="[^"]*aspect-\[4\/5\]/)
    expect(html).not.toContain('aspect-[9/16]')
  })

  it('1:1 : cadre carré', () => {
    expect(rendre('1:1')).toMatch(/data-format="1:1" class="[^"]*aspect-square/)
  })

  it('en préparation : le cadre suit aussi le format', () => {
    const html = renderToStaticMarkup(<EtatProgression job={job({ format: '1:1', statut: 'montage', version_courante: 0, progression: 30 })} enLigne />)
    expect(html).toContain('aspect-square')
  })
})

describe('Liens variante / origine', () => {
  it('« Variante de <origine> » vers l\'éditeur de l\'origine', () => {
    const html = avecRouteur(<LienOrigine origine={{ id: JOB, titre: 'Pub cortisol' }} />)
    expect(html).toContain('Variante de')
    expect(html).toContain(`href="/reseaux-sociaux/montage/${JOB}"`)
    expect(html).toContain('Pub cortisol')
  })

  it('montage sans origine : rien', () => {
    expect(avecRouteur(<LienOrigine origine={null} />)).toBe('')
  })

  it('liste des variantes de l\'origine : titre, format, statut, lien', () => {
    const html = avecRouteur(<ListeVariantes variantes={[{ id: VAR, titre: 'Pub cortisol (variante 4:5)', format: '4:5', statut: 'montage' }]} />)
    expect(html).toContain('Variantes (1)')
    expect(html).toContain(`href="/reseaux-sociaux/montage/${VAR}"`)
    expect(html).toContain('Pub cortisol (variante 4:5)')
    expect(html).toContain('4:5')
  })

  it('liste des montages : « Variante de » sur la variante, lien vers la variante sur l\'origine', () => {
    const jobs = [
      { ...job({ id: VAR, titre: 'Pub cortisol (variante hook)', variante_de: JOB }), created_at: '2026-10-03T16:00:00Z' },
      { ...job(), created_at: '2026-10-03T10:00:00Z', variante_de: null },
    ]
    const html = avecRouteur(<ListeMontages jobs={jobs} noms={{}} loading={false} error={null} reload={() => {}} positions={{}} taches={{}} />)
    expect(html).toMatch(/Variante de <a[^>]*href="\/reseaux-sociaux\/montage\/22222222-0000-0000-0000-000000000001"[^>]*>Pub cortisol<\/a>/)
    expect(html).toMatch(/Variante : <span><a[^>]*href="\/reseaux-sociaux\/montage\/22222222-0000-0000-0000-000000000002"[^>]*>Pub cortisol \(variante hook\)<\/a>/)
  })
})

describe('Fil du montage d\'origine', () => {
  it('variante en cours : pas la barre de ce montage', () => {
    const t = tache('en_cours', { type: 'variante', payload: { hook: 'Ton cortisol te ment' } })
    const messages = filConversation({ versions: [], taches: [t], job: job() })
    const html = renderToStaticMarkup(<FilConversation messages={messages} job={job({ etape: 'Aperçu v3 prêt', progression: 100 })} />)
    expect(html).toContain('Créer une variante (autre hook : « Ton cortisol te ment »)')
    expect(html).toContain('Le Mac crée la variante')
    expect(html).not.toContain('100 %')
  })

  it('variante refusée : invite à redemander sous la bande', () => {
    const t = tache('erreur', { type: 'variante', payload: { format: '4:5' }, erreur: 'La variante n\'a pas pu être créée : x' })
    const html = renderToStaticMarkup(<FilConversation messages={filConversation({ versions: [], taches: [t], job: job() })} job={job()} />)
    expect(html).toContain('redemander une variante')
  })
})
