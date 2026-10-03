// Composants clés de l'éditeur de montage, rendus côté serveur (pas de DOM
// dans les tests du hub) : fil, bande des versions, états désactivés, pastille Mac.
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import FilConversation from './FilConversation'
import BandeVersions from './BandeVersions'
import ZoneDemande from './ZoneDemande'
import PastilleMac from './PastilleMac'
import { filConversation, etatEnvoi } from '../../../lib/montageEditeur'

const JOB = '22222222-0000-0000-0000-000000000001'
const version = (numero, extra = {}) => ({
  id: `v${numero}`, numero, chemin_apercu: `apercus/${JOB}/v${numero}.mp4`, prompt: `Demande ${numero}`,
  reponse_agent: `Réponse ${numero}`, auteur: 'info@neoperformance.ca', created_at: '2026-10-03T14:05:00Z', ...extra,
})

// Éléments React (sans hooks) : retrouve les nœuds qui répondent au test.
function trouver(el, test, res = []) {
  if (!el || typeof el !== 'object') return res
  if (Array.isArray(el)) { el.forEach(e => trouver(e, test, res)); return res }
  if (test(el)) res.push(el)
  trouver(el.props?.children, test, res)
  return res
}

describe('FilConversation', () => {
  it('affiche demandes et réponses avec auteur (nom du profil) et version', () => {
    const html = renderToStaticMarkup(
      <FilConversation messages={filConversation({ versions: [version(1), version(2)], taches: [] })} noms={{ 'info@neoperformance.ca': 'Cloé Tremblay' }} />,
    )
    expect(html.indexOf('Demande 1')).toBeLessThan(html.indexOf('Réponse 1'))
    expect(html.indexOf('Réponse 1')).toBeLessThan(html.indexOf('Demande 2'))
    expect(html).toContain('Cloé Tremblay')
    expect(html).toContain('Agent de montage')
    expect(html).toContain('v2')
    expect((html.match(/data-role="demande"/g) || []).length).toBe(2)
    expect((html.match(/data-role="agent"/g) || []).length).toBe(2)
  })

  it('demande en cours : étape et progression du montage', () => {
    const messages = filConversation({
      versions: [version(1)],
      taches: [{ id: 'a', job_id: JOB, type: 'montage', statut: 'en_cours', created_at: '2026-10-03T15:00:00Z', cree_par: 'hugues@neoperformance.ca', payload: { prompt: 'Coupe le début' } }],
    })
    const html = renderToStaticMarkup(<FilConversation messages={messages} job={{ etape: "Rendu de l'aperçu", progression: 80 }} />)
    expect(html).toContain('Coupe le début')
    expect(html).toContain('Rendu de l&#x27;aperçu · 80 %')
  })

  it('refus de l\'agent : message d\'erreur et invitation à renvoyer', () => {
    const messages = filConversation({
      versions: [],
      taches: [{ id: 'a', job_id: JOB, type: 'montage', statut: 'erreur', created_at: '2026-10-03T15:00:00Z', cree_par: 'x', payload: {}, erreur: 'Vidéo introuvable dans Brut.' }],
    })
    const html = renderToStaticMarkup(<FilConversation messages={messages} />)
    expect(html).toContain('data-role="erreur"')
    expect(html).toContain('Vidéo introuvable dans Brut.')
    expect(html).toContain('renvoyer une demande')
  })

  it('vide : texte d\'attente', () => {
    expect(renderToStaticMarkup(<FilConversation messages={[]} />)).toContain('apparaîtront ici')
  })

  it('aucun tiret cadratin dans les textes', () => {
    const html = renderToStaticMarkup(<FilConversation messages={filConversation({ versions: [version(1)], taches: [] })} />)
    expect(html).not.toContain('\u2014')
  })
})

describe('BandeVersions', () => {
  const versions = [version(2), version(1), version(3, { chemin_apercu: null })]

  it('une case par version, dans l\'ordre, version courante marquée, version affichée pressée', () => {
    const html = renderToStaticMarkup(<BandeVersions versions={versions} numeroAffiche={1} versionCourante={2} onChoisir={() => {}} />)
    expect([...html.matchAll(/>v(\d)</g)].map(m => m[1])).toEqual(['1', '2', '3'])
    expect((html.match(/Actuelle/g) || []).length).toBe(1)
    expect(html).toMatch(/aria-pressed="true"[^>]*title="Afficher la version 1"/)
  })

  it('cliquer une version appelle onChoisir avec son numéro (rien d\'autre)', () => {
    const onChoisir = vi.fn()
    const boutons = trouver(BandeVersions({ versions, numeroAffiche: 1, versionCourante: 2, onChoisir }), e => e.type === 'button')
    boutons[1].props.onClick()
    expect(onChoisir).toHaveBeenCalledWith(2)
    expect(onChoisir).toHaveBeenCalledTimes(1)
  })

  it('version sans aperçu : case désactivée', () => {
    const boutons = trouver(BandeVersions({ versions, numeroAffiche: 1, versionCourante: 2, onChoisir: () => {} }), e => e.type === 'button')
    expect(boutons.map(b => b.props.disabled)).toEqual([false, false, true])
  })

  it('aucune version : rien', () => {
    expect(renderToStaticMarkup(<BandeVersions versions={[]} onChoisir={() => {}} />)).toBe('')
  })
})

describe('ZoneDemande (états désactivés)', () => {
  const job = { id: JOB, statut: 'apercu_pret', version_courante: 1 }
  const rendre = (taches, enLigne = true, j = job) =>
    renderToStaticMarkup(<ZoneDemande etat={etatEnvoi({ job: j, taches })} enLigne={enLigne} onEnvoyer={() => {}} />)

  it('libre : champ actif, placeholder, bouton Envoyer (désactivé tant que vide)', () => {
    const html = rendre([])
    expect(html).toContain('placeholder="Qu&#x27;est-ce que tu veux changer ?"')
    expect(html).not.toMatch(/<textarea[^>]*disabled=""/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Envoyer<\/button>/)
  })

  it('tâche en attente : champ et bouton désactivés, message clair', () => {
    const html = rendre([{ id: 'a', statut: 'en_attente', created_at: '2026-10-03T10:00:00Z' }])
    expect(html).toMatch(/<textarea[^>]*disabled=""/)
    expect(html).toMatch(/<button[^>]*disabled=""/)
    expect(html).toContain('attend son tour')
  })

  it('tâche en cours : désactivés, l\'agent travaille', () => {
    const html = rendre([{ id: 'a', statut: 'en_cours', created_at: '2026-10-03T10:00:00Z' }])
    expect(html).toMatch(/<textarea[^>]*disabled=""/)
    expect(html).toContain('agent travaille')
  })

  it('Mac hors ligne : message, mais on peut quand même envoyer', () => {
    const html = rendre([], false)
    expect(html).toContain('Le Mac de montage est hors ligne, ta demande sera traitée à son retour.')
    expect(html).not.toMatch(/<textarea[^>]*disabled=""/)
  })

  it('1re ronde en erreur : bouton « Relancer le montage » actif sans texte', () => {
    const html = rendre([{ id: 'a', statut: 'erreur', created_at: '2026-10-03T10:00:00Z' }], true, { ...job, statut: 'erreur', version_courante: 0 })
    expect(html).toMatch(/<button(?![^>]*disabled="")[^>]*>Relancer le montage<\/button>/)
  })
})

describe('PastilleMac', () => {
  const maintenant = Date.parse('2026-10-03T12:00:00Z')
  const rendre = (secondes) => renderToStaticMarkup(
    <PastilleMac status={{ dernier_signal: new Date(maintenant - secondes * 1000).toISOString() }} loading={false} error={null} maintenant={maintenant} />,
  )

  it('signal de 30 s : en ligne', () => {
    const html = rendre(30)
    expect(html).toContain('Mac en ligne')
    expect(html).toContain('data-en-ligne="oui"')
  })
  it('signal de plus de 90 s : hors ligne', () => {
    const html = rendre(91)
    expect(html).toContain('Mac hors ligne')
    expect(html).toContain('data-en-ligne="non"')
  })
  it('aucun signal ou erreur de lecture : hors ligne', () => {
    expect(renderToStaticMarkup(<PastilleMac status={null} loading={false} error={null} maintenant={maintenant} />)).toContain('Aucun signal reçu')
    expect(renderToStaticMarkup(<PastilleMac status={null} loading={false} error="x" maintenant={maintenant} />)).toContain('Mac hors ligne')
  })
  it('compacte : sans le détail', () => {
    const html = renderToStaticMarkup(<PastilleMac status={null} loading={false} error={null} maintenant={maintenant} compacte />)
    expect(html).not.toContain('· Aucun signal reçu')
  })
})
