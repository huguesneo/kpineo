// Timeline du hub : bouton « Ouvrir », création (Monter avec l'IA / Monter moi-même), étapes de la page.
// Rendus côté serveur (pas de DOM dans les tests du hub).
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { email: 'hugues@neoperformance.ca' } }) }))
vi.mock('../../../lib/googlePicker', () => ({ prechargerGoogle: () => {}, googlePickerConfigure: () => true }))
vi.mock('../../../components/layout/Layout', () => ({ default: ({ children }) => <div>{children}</div> }))
vi.mock('./useEnvoiVideo', () => ({ useEnvoiVideo: () => ({ etat: 'choix', resultat: null, recommencer: () => {} }) }))
vi.mock('./useMontageVideo', () => ({
  useDossierBrut: () => ({ loading: false, error: null, dossier: { id: 'b' } }),
  useTemplatesApprouves: () => ({ templates: [], loading: false, error: null, reload: () => {} }),
  lancerMontage: vi.fn(),
  urlSigneeApercu: vi.fn(),
  useAgentStatus: () => ({ status: null, loading: false, error: null, maintenant: Date.now() }),
}))
vi.mock('./EtapeVideo', () => ({ default: () => <div>étape vidéo</div>, BrutNonConfigure: () => null }))

const { default: BoutonTimeline } = await import('./BoutonTimeline')
const { default: MontageNouvelle } = await import('./MontageNouvelle')
const { etapePage } = await import('./timeline/PageTimeline')

const rendre = (el) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>)
const JOB = { id: '22222222-0000-0000-0000-000000000070', titre: 'Cortisol', personnes: 'moi_equipe', template_id: null, version_courante: 1, statut: 'apercu_pret' }

describe('bouton « Ouvrir »', () => {
  it('moi ou l’équipe : lien vers la timeline du montage', () => {
    const html = rendre(<BoutonTimeline job={JOB} enabled compact />)
    expect(html).toContain(`href="/reseaux-sociaux/montage/${JOB.id}/timeline"`)
    expect(html).toContain('Ouvrir')
  })

  it('une cliente : pas de bouton, une courte explication', () => {
    const html = rendre(<BoutonTimeline job={{ ...JOB, personnes: 'cliente' }} enabled compact />)
    expect(html).not.toContain('href=')
    expect(html).toContain('Timeline fermée')
    expect(html).toContain('ne quitte pas le Mac')
  })

  it('template ou montage d’avant : rien ; VITE_TIMELINE éteint : rien du tout', () => {
    expect(rendre(<BoutonTimeline job={{ ...JOB, template_id: 't' }} enabled />)).toBe('')
    expect(rendre(<BoutonTimeline job={{ ...JOB, personnes: null }} enabled />)).toBe('')
    expect(rendre(<BoutonTimeline job={JOB} enabled={false} />)).toBe('')
    expect(rendre(<BoutonTimeline job={{ ...JOB, personnes: 'cliente' }} enabled={false} />)).toBe('')
  })
})

describe('création', () => {
  it('timeline allumée : « Monter avec l’IA » et « Monter moi-même », prompt facultatif', () => {
    const html = rendre(<MontageNouvelle timeline />)
    expect(html).toContain('Monter avec l&#x27;IA')
    expect(html).toContain('Monter moi-même')
    expect(html).toContain('(optionnel)')
    expect(html).not.toContain('Lancer le montage')
  })

  it('timeline éteinte : l’écran d’avant (« Lancer le montage », prompt obligatoire sans template)', () => {
    const html = rendre(<MontageNouvelle timeline={false} />)
    expect(html).toContain('Lancer le montage')
    expect(html).not.toContain('Monter moi-même')
    expect(html).toContain('(obligatoire sans template)')
  })
})

describe('étapes de la page de la timeline', () => {
  const ligne = { recette: { version: 1 }, ressources: { proxies: { P1: 'montages/x/proxy.mp4' } }, brouillon: null }
  const base = { job: JOB, ligne, clips: [{ role: 'principal' }], taches: [], derniereVersion: { numero: 1, created_at: '2026-10-15T15:00:00Z' }, choixBrouillon: false }

  it('prête : la timeline s’ouvre', () => {
    expect(etapePage(base)).toEqual({ etape: 'pret' })
  })

  it('cliente, template, plusieurs clips, corbeille : fermée ou introuvable', () => {
    expect(etapePage({ ...base, job: { ...JOB, personnes: 'cliente' } })).toMatchObject({ etape: 'fermee', message: expect.stringMatching(/cliente/) })
    expect(etapePage({ ...base, job: { ...JOB, template_id: 't' } }).etape).toBe('fermee')
    expect(etapePage({ ...base, ligne: null, clips: [{ role: 'principal' }, { role: 'broll' }] }).etape).toBe('fermee')
    expect(etapePage({ ...base, job: { ...JOB, supprime_le: '2026-10-15' } }).etape).toBe('introuvable')
    expect(etapePage({ ...base, job: null }).etape).toBe('introuvable')
  })

  it('v1 en cours (Monter avec l’IA / moi-même), ou en erreur', () => {
    expect(etapePage({ ...base, job: { ...JOB, version_courante: 0, statut: 'montage' }, ligne: null }).etape).toBe('v1')
    expect(etapePage({ ...base, job: { ...JOB, version_courante: 0, statut: 'erreur', erreur: 'Drive' }, ligne: null })).toEqual({ etape: 'erreur_v1', message: 'Drive' })
  })

  it('à préparer (après Terminer, 7 jours, ou montage d’avant) : préparation, en cours ou non', () => {
    expect(etapePage({ ...base, ligne: { ...ligne, ressources: {} } })).toEqual({ etape: 'preparation', enCours: false })
    expect(etapePage({ ...base, ligne: null, taches: [{ type: 'timeline_preparer', statut: 'en_attente' }] })).toEqual({ etape: 'preparation', enCours: true })
  })

  it('brouillon fait avant la dernière version : on demande, sauf choix déjà fait', () => {
    const vieux = { ...ligne, brouillon: { version: 1 }, brouillon_le: '2026-10-15T14:00:00Z' }
    expect(etapePage({ ...base, ligne: vieux })).toEqual({ etape: 'perime', version: 1 })
    expect(etapePage({ ...base, ligne: vieux, choixBrouillon: true }).etape).toBe('pret')
  })
})
