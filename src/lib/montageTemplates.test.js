import { describe, it, expect } from 'vitest'
import {
  TYPE_VIDEO, validerProposition, ligneProposition, propositionExistante, etatProposer, tacheStyle,
  statutTemplate, cheminApercuTemplate, actionsTemplate, changementDecision, trierTemplates, dateTemplate,
  messagesTemplates, messageErreurTemplate, MOTIF_MAX,
} from './montageTemplates'
import { filConversation } from './montageEditeur'

const JOB = '22222222-0000-0000-0000-000000000001'
const HUGUES = 'hugues@neoperformance.ca'
const CLOE = 'info@neoperformance.ca'
const job = (extra = {}) => ({ id: JOB, titre: 'Pub cortisol', statut: 'apercu_pret', version_courante: 3, ...extra })
const version = (numero) => ({ id: `v${numero}`, job_id: JOB, numero, chemin_apercu: `apercus/${JOB}/v${numero}.mp4`, created_at: `2026-10-03T1${numero}:00:00Z` })
const tpl = (extra = {}) => ({
  id: 't1', nom: 'Entrevue rythmée', statut: 'propose', propose_par: CLOE, job_id: JOB, numero_version: 2,
  style_enregistre: false, chemin_apercu: null, created_at: '2026-10-03T15:00:00Z', ...extra,
})
const tache = (statut, extra = {}) => ({ id: 'a', job_id: JOB, type: 'montage', statut, created_at: '2026-10-03T15:00:00Z', payload: {}, ...extra })

describe('proposition', () => {
  it('nom obligatoire, longueurs limitées', () => {
    expect(validerProposition({ nom: '  ' })).toMatch(/nom/)
    expect(validerProposition({ nom: 'x'.repeat(81) })).toMatch(/trop long/)
    expect(validerProposition({ nom: 'Ok', description: 'x'.repeat(301) })).toMatch(/description/)
    expect(validerProposition({ nom: 'Ok', description: '' })).toBeNull()
  })

  it('ligne insérée : nom, description, skill, montage et version ; ni statut ni tâche', () => {
    expect(ligneProposition({ jobId: JOB, numero: 2, nom: ' Entrevue ', description: '  ' })).toEqual({
      nom: 'Entrevue', description: null, type_video: TYPE_VIDEO, job_id: JOB, numero_version: 2,
    })
    expect(TYPE_VIDEO).toBe('neo-video-montage')
  })

  it('une proposition refusée n’empêche pas de reproposer la même version', () => {
    expect(propositionExistante([tpl({ statut: 'refuse' })], JOB, 2)).toBeNull()
    expect(propositionExistante([tpl()], JOB, 2)?.id).toBe('t1')
    expect(propositionExistante([tpl()], JOB, 1)).toBeNull()
  })
})

describe('bouton « Proposer comme template »', () => {
  it('actif sur une version affichée, même ancienne', () => {
    expect(etatProposer({ job: job(), taches: [], version: version(1), templates: [] })).toEqual({ visible: true, desactive: false, raison: null })
  })
  it('absent sans version', () => {
    expect(etatProposer({ job: job(), taches: [], version: null, templates: [] }).visible).toBe(false)
  })
  it('désactivé pendant une tâche en attente ou en cours', () => {
    expect(etatProposer({ job: job(), taches: [tache('en_cours')], version: version(3), templates: [] }).raison).toMatch(/agent travaille/)
    expect(etatProposer({ job: job(), taches: [tache('en_attente')], version: version(3), templates: [] }).raison).toMatch(/attend son tour/)
  })
  it('désactivé si la version est déjà proposée', () => {
    const e = etatProposer({ job: job(), taches: [], version: version(2), templates: [tpl()] })
    expect(e.desactive).toBe(true)
    expect(e.raison).toContain('« Entrevue rythmée » (proposé)')
  })
})

describe('statuts', () => {
  it('proposé, refusé (motif), archivé', () => {
    expect(statutTemplate(tpl()).label).toBe('Proposé')
    expect(statutTemplate(tpl({ statut: 'refuse', motif_refus: 'Trop long' })).detail).toBe('Motif : Trop long')
    expect(statutTemplate(tpl({ statut: 'refuse' })).detail).toBe('Refusé sans motif.')
    expect(statutTemplate(tpl({ statut: 'archive' })).label).toBe('Archivé')
  })
  it('approuvé : en préparation tant que le style n’est pas enregistré, avec la tâche', () => {
    const t = tpl({ statut: 'approuve' })
    expect(statutTemplate(t).cle).toBe('preparation')
    const ts = { id: 's', type: 'enregistrer_style', payload: { template_id: 't1' }, statut: 'en_cours', created_at: '2026-10-03T16:00:00Z' }
    expect(statutTemplate(t, ts).detail).toMatch(/enregistre le style/)
    const err = { ...ts, statut: 'erreur', erreur: 'La version 2 est introuvable.' }
    expect(statutTemplate(t, err)).toMatchObject({ erreur: true, detail: expect.stringContaining('La version 2 est introuvable.') })
    expect(statutTemplate(tpl({ statut: 'approuve', style_enregistre: true }))).toMatchObject({ cle: 'approuve', label: 'Approuvé' })
  })
  it('tâche enregistrer_style : la plus récente du template', () => {
    const taches = [
      { id: 'x', type: 'enregistrer_style', payload: { template_id: 't1' }, statut: 'erreur', created_at: '2026-10-03T16:00:00Z' },
      { id: 'y', type: 'enregistrer_style', payload: { template_id: 't1' }, statut: 'fait', created_at: '2026-10-03T17:00:00Z' },
      { id: 'z', type: 'enregistrer_style', payload: { template_id: 'autre' }, statut: 'en_cours', created_at: '2026-10-03T18:00:00Z' },
    ]
    expect(tacheStyle(taches, 't1').id).toBe('y')
  })
})

describe('aperçu', () => {
  it('version proposée tant que le style n’est pas enregistré, puis aperçu du template', () => {
    const versions = [version(1), version(2)]
    expect(cheminApercuTemplate(tpl(), versions)).toBe(`apercus/${JOB}/v2.mp4`)
    expect(cheminApercuTemplate(tpl({ statut: 'approuve', style_enregistre: true, chemin_apercu: 'templates/t1/apercu.mp4' }), versions)).toBe('templates/t1/apercu.mp4')
    expect(cheminApercuTemplate(tpl({ numero_version: 9 }), versions)).toBeNull()
  })
})

describe('boutons selon l’utilisateur', () => {
  it('Hugues : Approuver et Refuser sur un proposé, Approuver désactivé sans aperçu', () => {
    expect(actionsTemplate({ template: tpl(), email: HUGUES, apercuPret: true })).toEqual({ approuver: true, refuser: true, approuverDesactive: false, archiver: false })
    expect(actionsTemplate({ template: tpl(), email: HUGUES, apercuPret: false }).approuverDesactive).toBe(true)
  })
  it('Hugues : Archiver sur un approuvé seulement', () => {
    expect(actionsTemplate({ template: tpl({ statut: 'approuve' }), email: HUGUES, apercuPret: true }).archiver).toBe(true)
    for (const statut of ['refuse', 'archive']) {
      expect(actionsTemplate({ template: tpl({ statut }), email: HUGUES, apercuPret: true })).toEqual({ approuver: false, refuser: false, approuverDesactive: false, archiver: false })
    }
  })
  it('info@ : aucun bouton, même sur sa propre proposition', () => {
    for (const statut of ['propose', 'approuve']) {
      expect(actionsTemplate({ template: tpl({ statut }), email: CLOE, apercuPret: true })).toEqual({ approuver: false, refuser: false, approuverDesactive: false, archiver: false })
    }
  })
})

describe('décisions', () => {
  it('changements envoyés', () => {
    expect(changementDecision('approuver')).toEqual({ statut: 'approuve' })
    expect(changementDecision('refuser', '  Trop long ')).toEqual({ statut: 'refuse', motif_refus: 'Trop long' })
    expect(changementDecision('refuser', '')).toEqual({ statut: 'refuse', motif_refus: null })
    expect(changementDecision('refuser', 'x'.repeat(500)).motif_refus).toHaveLength(MOTIF_MAX)
    expect(changementDecision('archiver')).toEqual({ statut: 'archive' })
    expect(() => changementDecision('supprimer')).toThrow()
  })
  it('messages d’erreur de la base', () => {
    expect(messageErreurTemplate({ message: 'Seul Hugues peut approuver ou refuser un template' })).toMatch(/Seul Hugues/)
    expect(messageErreurTemplate({ message: 'Passage de statut non permis : archive → propose' })).toMatch(/Recharge/)
    expect(messageErreurTemplate({ code: '42501', message: 'new row violates row-level security policy' })).toMatch(/autorisation/)
  })
})

describe('liste', () => {
  it('proposés, approuvés, refusés, archivés ; récents d’abord', () => {
    const l = trierTemplates([
      tpl({ id: 'a', statut: 'archive' }),
      tpl({ id: 'r', statut: 'refuse' }),
      tpl({ id: 'p1', created_at: '2026-10-01T00:00:00Z' }),
      tpl({ id: 'ok', statut: 'approuve' }),
      tpl({ id: 'p2', created_at: '2026-10-02T00:00:00Z' }),
    ])
    expect(l.map(t => t.id)).toEqual(['p2', 'p1', 'ok', 'r', 'a'])
  })
  it('date : proposition, sinon décision', () => {
    expect(dateTemplate(tpl())).toBe('2026-10-03T15:00:00Z')
    expect(dateTemplate(tpl({ statut: 'approuve', approuve_le: '2026-10-04T09:00:00Z' }))).toBe('2026-10-04T09:00:00Z')
  })
})

describe('fil de l’éditeur', () => {
  it('la proposition et son état se placent à leur date entre les versions', () => {
    const versions = [{ ...version(1), prompt: 'Monte', reponse_agent: 'v1' }, { ...version(2), created_at: '2026-10-03T16:00:00Z', reponse_agent: 'v2' }]
    const fil = filConversation({ versions, taches: [], job: job(), autres: messagesTemplates([tpl()], []) })
    expect(fil.map(m => m.cle)).toEqual(['p1', 'r1', 'tpt1', 'tst1', 'r2'])
    expect(fil[2].texte).toBe('Proposer la v2 comme template « Entrevue rythmée »')
    expect(fil[3].texte).toMatch(/approbation de Hugues/)
  })
  it('après approbation : préparation, puis dans la galerie', () => {
    const [b] = messagesTemplates([tpl({ statut: 'approuve', approuve_le: '2026-10-04T09:00:00Z' })], [])
    expect(b.messages[1].texte).toMatch(/approuvé, style en préparation/)
    const [c] = messagesTemplates([tpl({ statut: 'approuve', style_enregistre: true })], [])
    expect(c.messages[1].texte).toMatch(/galerie/)
  })
})
