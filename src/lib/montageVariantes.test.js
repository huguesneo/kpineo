import { describe, it, expect } from 'vitest'
import {
  tacheVariante, validerVariante, typesDisponibles, titreVariantePrevu, etatVariante, texteConfirmationVariante,
  variantesDe, cadreFormat, HOOK_MAX, CONSIGNE_MAX,
} from './montageVariantes'
import { filConversation, texteTache } from './montageEditeur'

const JOB = '22222222-0000-0000-0000-000000000001'
const job = (extra = {}) => ({ id: JOB, titre: 'Pub cortisol', statut: 'apercu_pret', version_courante: 3, format: '9:16', ...extra })
const v = (numero) => ({ id: `v${numero}`, numero, chemin_apercu: `apercus/${JOB}/v${numero}.mp4`, created_at: `2026-10-03T1${numero}:00:00Z` })
const t = (id, statut, created_at, extra = {}) => ({
  id, job_id: JOB, type: 'variante', statut, created_at, cree_par: 'info@neoperformance.ca', payload: { hook: 'Ton cortisol te ment' }, ...extra,
})

describe('payload de la tâche variante (contrat de video-neo/agent/src/taches.ts)', () => {
  it('autre hook : { hook }, texte nettoyé, sans format ni prompt', () => {
    expect(tacheVariante(JOB, { type: 'hook', texte: '  Ton cortisol te ment ' }))
      .toEqual({ job_id: JOB, type: 'variante', payload: { hook: 'Ton cortisol te ment' } })
  })

  it('format 4:5 sans consigne : { format } seulement', () => {
    expect(tacheVariante(JOB, { type: '4:5', texte: '  ' })).toEqual({ job_id: JOB, type: 'variante', payload: { format: '4:5' } })
  })

  it('format 1:1 avec consigne : { format, prompt }', () => {
    expect(tacheVariante(JOB, { type: '1:1', texte: 'Sous-titres plus hauts' }).payload).toEqual({ format: '1:1', prompt: 'Sous-titres plus hauts' })
  })

  it('ni statut ni cree_par (forcés par la base)', () => {
    const tache = tacheVariante(JOB, { type: 'hook', texte: 'x' })
    expect(tache).not.toHaveProperty('statut')
    expect(tache).not.toHaveProperty('cree_par')
  })
})

describe('formulaire', () => {
  it('hook obligatoire', () => {
    expect(validerVariante({ type: 'hook', texte: '  ' })).toMatch(/nouveau hook/)
    expect(validerVariante({ type: 'hook', texte: 'Ouvre sur la question' })).toBeNull()
    expect(validerVariante({ type: 'hook', texte: 'x'.repeat(HOOK_MAX + 1) })).toMatch(/trop long/)
  })

  it('consigne facultative pour un format', () => {
    expect(validerVariante({ type: '4:5', texte: '' })).toBeNull()
    expect(validerVariante({ type: '1:1', texte: 'x'.repeat(CONSIGNE_MAX + 1) })).toMatch(/trop longue/)
  })

  it('type inconnu refusé', () => {
    expect(validerVariante({ type: '16:9', texte: 'x' })).toMatch(/type/)
  })

  it('un montage 9:16 propose les trois types ; un 4:5 ne propose pas 4:5 (l\'agent refuserait)', () => {
    expect(typesDisponibles(job()).map(x => x.cle)).toEqual(['hook', '4:5', '1:1'])
    expect(typesDisponibles(job({ format: '4:5' })).map(x => x.cle)).toEqual(['hook', '1:1'])
    expect(typesDisponibles(job({ format: null })).map(x => x.cle)).toEqual(['hook', '4:5', '1:1'])
  })

  it('titre prévu : même règle que l\'agent', () => {
    expect(titreVariantePrevu(job(), '4:5')).toBe('Pub cortisol (variante 4:5)')
    expect(titreVariantePrevu(job(), 'hook')).toBe('Pub cortisol (variante hook)')
    expect(texteConfirmationVariante(job(), '1:1')).toContain('« Pub cortisol (variante 1:1) », à partir de la v3')
  })
})

describe('états du bouton', () => {
  it('version actuelle affichée : visible et actif', () => {
    expect(etatVariante({ job: job(), taches: [], version: v(3) })).toEqual({ visible: true, desactive: false, raison: null })
  })

  it('ancienne version ou aucune version : caché', () => {
    expect(etatVariante({ job: job(), taches: [], version: v(1) }).visible).toBe(false)
    expect(etatVariante({ job: job({ version_courante: 0 }), taches: [], version: null }).visible).toBe(false)
  })

  it('tâche en attente ou en cours : désactivé avec la raison', () => {
    expect(etatVariante({ job: job(), taches: [t('a', 'en_attente', '2026-10-03T15:00:00Z')], version: v(3) }))
      .toMatchObject({ visible: true, desactive: true, raison: expect.stringMatching(/attend son tour/) })
    expect(etatVariante({ job: job(), taches: [t('a', 'en_cours', '2026-10-03T15:00:00Z', { type: 'montage' })], version: v(3) }).raison)
      .toMatch(/agent travaille/)
  })

  it('montage terminé : permis', () => {
    expect(etatVariante({ job: job({ statut: 'termine' }), taches: [], version: v(3) }).desactive).toBe(false)
  })
})

describe('liens et fil', () => {
  const jobs = [
    { id: 'o', titre: 'Origine', created_at: '2026-10-03T10:00:00Z', variante_de: null },
    { id: 'b', titre: 'Origine (variante 1:1)', created_at: '2026-10-03T12:00:00Z', variante_de: 'o' },
    { id: 'a', titre: 'Origine (variante hook)', created_at: '2026-10-03T11:00:00Z', variante_de: 'o' },
  ]

  it('variantes d\'un montage, les plus anciennes d\'abord', () => {
    expect(variantesDe('o', jobs).map(j => j.id)).toEqual(['a', 'b'])
    expect(variantesDe('a', jobs)).toEqual([])
    expect(variantesDe(null, jobs)).toEqual([])
  })

  it('texte de la demande dans le fil', () => {
    expect(texteTache(t('a', 'fait', 'x'))).toBe('Créer une variante (autre hook : « Ton cortisol te ment »)')
    expect(texteTache(t('a', 'fait', 'x', { payload: { format: '4:5', prompt: 'Plus serré' } }))).toBe('Créer une variante (format 4:5)\nPlus serré')
  })

  it('variante en cours : marquée variante (pas la progression de ce montage)', () => {
    const m = filConversation({ versions: [v(3)], taches: [t('a', 'en_cours', '2026-10-03T15:00:00Z')], job: job() }).at(-1)
    expect(m).toMatchObject({ role: 'demande', enAttente: 'en_cours', variante: true })
  })

  it('variante faite : demande puis « Variante créée » à sa date', () => {
    const fil = filConversation({ versions: [v(1), v(3)], taches: [t('a', 'fait', '2026-10-03T12:00:00Z')], job: job() })
    expect(fil.map(m => m.cle)).toEqual(['r1', 'ta', 'xa', 'r3'])
    expect(fil[2].texte).toMatch(/Variante créée/)
  })

  it('variante refusée : erreur dans le fil, tâche variante', () => {
    const fil = filConversation({ versions: [v(3)], taches: [t('a', 'erreur', '2026-10-03T15:00:00Z', { erreur: 'La variante n\'a pas pu être créée : x' })], job: job() })
    expect(fil.at(-1)).toMatchObject({ role: 'erreur', tache: 'variante' })
  })
})

describe('ratio du lecteur', () => {
  it('9:16, 4:5, 1:1, et 9:16 par défaut', () => {
    expect(cadreFormat('9:16').classe).toContain('aspect-[9/16]')
    expect(cadreFormat('4:5').classe).toContain('aspect-[4/5]')
    expect(cadreFormat('1:1').classe).toContain('aspect-square')
    expect(cadreFormat(undefined).label).toBe('9:16')
  })
})
