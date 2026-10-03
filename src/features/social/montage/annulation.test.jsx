// Bouton « Annuler » d'une tâche, rendu côté serveur (pas de DOM dans les
// tests du hub) : fil de l'éditeur et écran Templates.
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import AnnulerTache from './AnnulerTache'
import FilConversation from './FilConversation'
import { ListeTemplates } from './MontageTemplates'
import { filConversation } from '../../../lib/montageEditeur'

const HUGUES = 'hugues@neoperformance.ca'
const INFO = 'info@neoperformance.ca'
const DEMANDE = '2026-10-03T10:05:00Z'
const tache = (statut, extra = {}) => ({ id: 't1', job_id: 'j1', type: 'montage', statut, created_at: '2026-10-03T10:00:00Z', cree_par: INFO, payload: { prompt: 'Coupe le début' }, ...extra })
const annulation = { onAnnuler: async () => 'annulee', email: INFO, enLigne: true }
const fil = (taches, props = {}) => renderToStaticMarkup(
  <FilConversation messages={filConversation({ versions: [], taches })} job={{ version_courante: 2, progression: 40, etape: 'Montage par Claude' }} annulation={annulation} {...props} />,
)

describe('AnnulerTache', () => {
  it('en attente : bouton Annuler, sans confirmation ouverte', () => {
    const html = renderToStaticMarkup(<AnnulerTache tache={tache('en_attente')} email={INFO} onAnnuler={annulation.onAnnuler} ouvertInitial />)
    expect(html).toContain('>Annuler</button>')
    expect(html).not.toContain('alertdialog')
  })
  it('en cours : confirmation avec la version gardée', () => {
    const html = renderToStaticMarkup(<AnnulerTache tache={tache('en_cours')} job={{ version_courante: 2 }} email={INFO} onAnnuler={annulation.onAnnuler} ouvertInitial />)
    expect(html).toContain('Arrêter cette ronde ?')
    expect(html).toContain('le montage reste à la v2')
    expect(html).toContain('Continuer')
    expect(html).toContain('Arrêter la ronde')
  })
  it('annulation demandée : texte, plus de bouton', () => {
    const t = tache('en_cours', { annulation_demandee_le: DEMANDE })
    let html = renderToStaticMarkup(<AnnulerTache tache={t} email={INFO} onAnnuler={annulation.onAnnuler} />)
    expect(html).toContain('Annulation en cours… le Mac arrête la ronde')
    expect(html).not.toContain('<button')
    html = renderToStaticMarkup(<AnnulerTache tache={t} email={INFO} enLigne={false} onAnnuler={annulation.onAnnuler} />)
    expect(html).toContain('Le Mac est hors ligne : elle sera faite à son retour')
  })
  it('sans action ou tâche finie : rien', () => {
    expect(renderToStaticMarkup(<AnnulerTache tache={tache('en_cours')} email={INFO} />)).toBe('')
    expect(renderToStaticMarkup(<AnnulerTache tache={tache('fait')} email={INFO} onAnnuler={annulation.onAnnuler} />)).toBe('')
  })
})

describe('Fil de l\'éditeur', () => {
  it('demande en cours : progression puis Annuler', () => {
    const html = fil([tache('en_cours')])
    expect(html.indexOf('Montage par Claude')).toBeLessThan(html.indexOf('>Annuler</button>'))
  })
  it('Terminer et variante : bouton dans le fil aussi', () => {
    expect(fil([tache('en_attente', { type: 'terminer' })])).toContain('>Annuler</button>')
    expect(fil([tache('en_cours', { type: 'variante', payload: { hook: 'x' } })])).toContain('>Annuler</button>')
  })
  it('annulation en cours : barre grise et texte', () => {
    const html = fil([tache('en_cours', { annulation_demandee_le: DEMANDE })])
    expect(html).toContain('bg-[#9ca3af]')
    expect(html).toContain('Annulation en cours…')
  })
  it('sans annulation (lecture seule) : pas de bouton', () => {
    expect(fil([tache('en_attente')], { annulation: null })).not.toContain('>Annuler</button>')
  })
  it('tâche annulée : demande puis ligne grise avec le nom', () => {
    const t = tache('annulee', { annulation_demandee_le: DEMANDE, annulee_le: DEMANDE, annulation_demandee_par: HUGUES })
    const html = renderToStaticMarkup(<FilConversation messages={filConversation({ versions: [], taches: [t] })} noms={{ [HUGUES]: 'Hugues' }} />)
    expect(html).toContain('data-role="annulee"')
    expect(html).toContain('Annulée par Hugues avant que le Mac la commence.')
  })
})

describe('Écran Templates', () => {
  const template = { id: 'tp1', nom: 'Style X', statut: 'approuve', style_enregistre: false, propose_par: INFO, created_at: '2026-10-03T09:00:00Z' }
  const style = tache('en_cours', { type: 'enregistrer_style', job_id: null, payload: { template_id: 'tp1' } })
  const rendre = (email, taches = [style]) => renderToStaticMarkup(
    <StaticRouter location="/"><ListeTemplates templates={[template]} taches={taches} email={email} onAnnulerStyle={async () => 'demandee'} /></StaticRouter>,
  )
  it('style en cours d\'enregistrement : Annuler pour Hugues, pas pour info@', () => {
    expect(rendre(HUGUES)).toContain('>Annuler</button>')
    expect(rendre(INFO)).not.toContain('>Annuler</button>')
  })
  it('style annulé : détail, plus de bouton', () => {
    const html = rendre(HUGUES, [{ ...style, statut: 'annulee' }])
    expect(html).toContain('Enregistrement du style annulé')
    expect(html).not.toContain('>Annuler</button>')
  })
})
