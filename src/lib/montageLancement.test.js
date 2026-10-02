import { describe, it, expect } from 'vitest'
import {
  validerDirection, validerTitre, nouveauMontage, premiereTacheMontage, messageErreurLancement,
  derniereTacheParJob, erreurAgent, cheminDernierApercu,
} from './montageVideo'

describe('règle template / prompt', () => {
  it('template seul, prompt seul ou les deux : on peut lancer', () => {
    expect(validerDirection({ templateId: 't1', prompt: '' })).toBeNull()
    expect(validerDirection({ templateId: null, prompt: 'Coupe les silences' })).toBeNull()
    expect(validerDirection({ templateId: 't1', prompt: 'Plus rythmé' })).toBeNull()
  })

  it('sans template, le prompt est obligatoire (les espaces ne comptent pas)', () => {
    expect(validerDirection({ templateId: null, prompt: '' })).toMatch(/template ou décris/)
    expect(validerDirection({ templateId: null, prompt: '   \n ' })).toMatch(/template ou décris/)
    expect(validerDirection({})).toMatch(/template ou décris/)
  })

  it('titre obligatoire et raisonnable', () => {
    expect(validerTitre('  ')).toMatch(/titre/)
    expect(validerTitre('x'.repeat(121))).toMatch(/trop long/)
    expect(validerTitre('Été au chalet (v2)')).toBeNull()
  })
})

describe('création du montage', () => {
  it('ligne video_jobs : prompt nettoyé, format 9:16', () => {
    expect(nouveauMontage({
      titre: ' Été au chalet ', fichierDriveId: 'd1', nomSource: 'Ete_2026-10-02_1405.mov', templateId: '', prompt: '  ',
    })).toEqual({
      titre: 'Été au chalet', fichier_drive_id: 'd1', nom_source: 'Ete_2026-10-02_1405.mov',
      template_id: null, prompt: null, format: '9:16',
    })
    expect(nouveauMontage({ titre: 'a', fichierDriveId: 'd', nomSource: 'n', templateId: 't', prompt: ' Plus court ' }))
      .toMatchObject({ template_id: 't', prompt: 'Plus court' })
  })

  it('première tâche : montage, payload vide (le prompt est lu sur le montage)', () => {
    expect(premiereTacheMontage('j1')).toEqual({ job_id: 'j1', type: 'montage', payload: {} })
  })

  it('messages d’erreur clairs', () => {
    expect(messageErreurLancement({ code: '42501', message: 'new row violates row-level security policy' })).toMatch(/autorisation/)
    expect(messageErreurLancement({ message: 'TypeError: Failed to fetch' })).toMatch(/connexion a été coupée/)
    expect(messageErreurLancement({ code: '23514', message: 'violates check constraint "video_jobs_template_ou_prompt"' })).toMatch(/template ou décris/)
    expect(messageErreurLancement({ code: 'P0001', message: "Le template choisi n'est pas approuvé" })).toMatch(/plus approuvé/)
    expect(messageErreurLancement({ message: 'autre chose' })).toBe('Le montage ne peut pas être lancé : autre chose.')
  })
})

describe('liste des montages', () => {
  it('dernière tâche par montage', () => {
    const d = derniereTacheParJob([
      { id: 1, job_id: 'a', created_at: '2026-10-02T10:00:00Z' },
      { id: 2, job_id: 'a', created_at: '2026-10-02T11:00:00Z' },
      { id: 3, job_id: 'b', created_at: '2026-10-02T09:00:00Z' },
      { id: 4, job_id: null, created_at: '2026-10-02T12:00:00Z' },
    ])
    expect(d.a.id).toBe(2)
    expect(d.b.id).toBe(3)
    expect(Object.keys(d)).toEqual(['a', 'b'])
  })

  it('erreur de l’agent : celle du montage, sinon un refus sur la dernière tâche', () => {
    expect(erreurAgent({ statut: 'erreur', erreur: 'Vidéo introuvable' }, null)).toBe('Vidéo introuvable')
    expect(erreurAgent({ statut: 'en_file' }, { statut: 'erreur', erreur: 'Template pas encore enregistré' })).toBe('Template pas encore enregistré')
    expect(erreurAgent({ statut: 'apercu_pret' }, { statut: 'fait' })).toBeNull()
  })

  it('aperçu de la dernière version qui en a un', () => {
    expect(cheminDernierApercu([
      { numero: 1, chemin_apercu: 'apercus/j/v1.mp4' },
      { numero: 3, chemin_apercu: null },
      { numero: 2, chemin_apercu: 'apercus/j/v2.mp4' },
    ])).toBe('apercus/j/v2.mp4')
    expect(cheminDernierApercu([])).toBeNull()
  })
})
