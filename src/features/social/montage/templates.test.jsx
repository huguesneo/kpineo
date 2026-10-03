// Étape 10a, rendue côté serveur (pas de DOM dans les tests du hub) :
// Proposer comme template, liste des templates, boutons selon l'utilisateur.
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { ProposerTemplate, DecisionTemplate } from './TemplatesMontage'
import { ListeTemplates } from './MontageTemplates'

const JOB = '22222222-0000-0000-0000-000000000001'
const HUGUES = 'hugues@neoperformance.ca'
const CLOE = 'info@neoperformance.ca'
const job = (extra = {}) => ({ id: JOB, titre: 'Pub cortisol', statut: 'apercu_pret', version_courante: 3, ...extra })
const version = (numero) => ({ id: `v${numero}`, job_id: JOB, numero, chemin_apercu: `apercus/${JOB}/v${numero}.mp4` })
const tpl = (extra = {}) => ({
  id: 't1', nom: 'Entrevue rythmée', description: 'Coupes rapides', statut: 'propose', propose_par: CLOE, job_id: JOB, numero_version: 2,
  style_enregistre: false, chemin_apercu: null, created_at: '2026-10-03T15:00:00Z', ...extra,
})
const rien = async () => {}
const actif = (libelle) => new RegExp(`<button(?![^>]*disabled="")[^>]*>${libelle}</button>`)
const inactif = (libelle) => new RegExp(`<button[^>]*disabled=""[^>]*>${libelle}</button>`)

describe('Proposer comme template (éditeur)', () => {
  const rendre = (props) => renderToStaticMarkup(
    <ProposerTemplate job={job()} taches={[]} version={version(2)} templates={[]} onProposer={rien} {...props} />,
  )

  it('bouton actif sur la version affichée', () => {
    expect(rendre()).toMatch(actif('Proposer comme template'))
  })

  it('désactivé pendant une tâche en cours, avec la raison', () => {
    const html = rendre({ taches: [{ id: 'a', job_id: JOB, type: 'montage', statut: 'en_cours', created_at: '2026-10-03T15:00:00Z' }] })
    expect(html).toMatch(inactif('Proposer comme template'))
    expect(html).toContain('agent travaille')
  })

  it('désactivé si cette version est déjà proposée', () => {
    const html = rendre({ templates: [tpl()] })
    expect(html).toMatch(inactif('Proposer comme template'))
    expect(html).toContain('déjà proposée')
  })

  it('formulaire : nom, description, Annuler, Proposer, ce qui se passera', () => {
    const html = rendre({ ouvertInitial: true })
    expect(html).toContain('Proposer la v2 comme template')
    expect(html).toContain('id="template-nom"')
    expect(html).toContain('id="template-description"')
    expect(html).toMatch(/Hugues verra l(&#x27;|')aperçu/)
    expect(html).toMatch(actif('Annuler'))
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Proposer<\/button>/)
  })

  it('aucun bouton sans version', () => {
    expect(rendre({ version: null })).toBe('')
  })
})

describe('Décision (Approuver, Refuser, Archiver)', () => {
  const rendre = (props) => renderToStaticMarkup(<DecisionTemplate template={tpl()} email={HUGUES} apercuPret onDecider={rien} {...props} />)

  it('Hugues sur un proposé : Approuver et Refuser', () => {
    const html = rendre()
    expect(html).toMatch(actif('Approuver'))
    expect(html).toMatch(actif('Refuser'))
  })

  it('Hugues sans aperçu : Approuver désactivé, raison', () => {
    const html = rendre({ apercuPret: false })
    expect(html).toMatch(inactif('Approuver'))
    expect(html).toContain('impossible d')
  })

  it('Refuser ouvre un motif facultatif', () => {
    const html = rendre({ refusOuvertInitial: true })
    expect(html).toContain('Motif')
    expect(html).toContain('facultatif')
    expect(html).not.toMatch(actif('Approuver'))
  })

  it('Hugues sur un approuvé : Retirer de la galerie, pas d’approbation', () => {
    const html = rendre({ template: tpl({ statut: 'approuve', style_enregistre: true }) })
    expect(html).toMatch(actif('Retirer de la galerie'))
    expect(html).not.toContain('>Approuver<')
  })

  it('info@ : aucun bouton, sur un proposé comme sur un approuvé', () => {
    expect(rendre({ email: CLOE })).toBe('')
    expect(rendre({ email: CLOE, template: tpl({ statut: 'approuve' }) })).toBe('')
  })
})

describe('Écran Templates', () => {
  const liste = [
    tpl(),
    tpl({ id: 't2', nom: 'Pub 0929', statut: 'approuve', style_enregistre: true, chemin_apercu: 'templates/t2/apercu.mp4', job_id: null, numero_version: null, propose_par: HUGUES, approuve_le: '2026-10-03T11:00:00Z' }),
    tpl({ id: 't3', nom: 'Trop long', statut: 'refuse', motif_refus: 'Trop proche de Pub 0929', approuve_le: '2026-10-03T16:00:00Z' }),
    tpl({ id: 't4', nom: 'Ancien', statut: 'archive', approuve_le: '2026-10-03T17:00:00Z' }),
  ]
  const rendre = (email, extra = {}) => renderToStaticMarkup(
    <StaticRouter location="/">
      <ListeTemplates templates={liste} jobs={{ [JOB]: 'Pub cortisol' }} versions={[version(2)]} noms={{ [CLOE]: 'Cloé' }} email={email} {...extra} />
    </StaticRouter>,
  )

  it('statut, nom, description, auteur, montage et aperçu de chaque template, proposés en premier', () => {
    const html = rendre(CLOE)
    expect(html.indexOf('Entrevue rythmée')).toBeLessThan(html.indexOf('Pub 0929'))
    for (const s of ['Proposé', 'Approuvé', 'Refusé', 'Archivé', 'Coupes rapides', 'Cloé', 'Pub cortisol (v2)', 'Template de départ']) expect(html).toContain(s)
    expect(html).toContain('Motif : Trop proche de Pub 0929')
    expect(html).toContain(`href="/reseaux-sociaux/montage/${JOB}"`)
    expect(html).toMatch(/Voir l(&#x27;|')aperçu de la v2/)
    expect(html).toMatch(/Voir l(&#x27;|')aperçu du template/)
  })

  it('info@ voit les statuts sans aucun bouton de décision', () => {
    const html = rendre(CLOE)
    expect(html).not.toContain('>Approuver<')
    expect(html).not.toContain('>Refuser<')
    expect(html).not.toContain('Retirer de la galerie')
  })

  it('Hugues : Approuver et Refuser sur le proposé, Retirer sur l’approuvé seulement', () => {
    const html = rendre(HUGUES)
    expect(html.match(/>Approuver</g)).toHaveLength(1)
    expect(html.match(/>Retirer de la galerie</g)).toHaveLength(1)
  })

  it('approuvé en préparation : état de la tâche enregistrer_style', () => {
    const html = rendre(HUGUES, {
      templates: [tpl({ statut: 'approuve' })],
      taches: [{ id: 's', type: 'enregistrer_style', payload: { template_id: 't1' }, statut: 'erreur', erreur: 'La version 2 est introuvable.', created_at: '2026-10-03T16:00:00Z' }],
    })
    expect(html).toContain('Approuvé, style en préparation')
    expect(html).toContain('La version 2 est introuvable.')
  })

  it('aucun template : explication', () => {
    expect(rendre(CLOE, { templates: [] })).toContain('Proposer comme template')
  })
})
