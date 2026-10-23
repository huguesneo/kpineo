import { describe, it, expect } from 'vitest'
import { elementsGmail, elementsGhl, elementsApp, elementsLeo, fusionnerLigneDuTemps, requeteGmailPersonne } from './historique.js'

const h = (de, sujet) => [{ name: 'From', value: de }, { name: 'Subject', value: sujet }]

describe('Gmail', () => {
  it('un élément par fil, daté du dernier message, sujet du premier', () => {
    const [e] = elementsGmail([{ id: 't1', messages: [
      { internalDate: String(Date.parse('2026-10-20T13:00:00Z')), labelIds: ['INBOX'], snippet: 'Mes reçus svp', payload: { headers: h('Julie <julie@x.ca>', 'Reçus') } },
      { internalDate: String(Date.parse('2026-10-21T13:00:00Z')), labelIds: ['SENT'], snippet: 'Voilà &amp; merci', payload: { headers: h('NEO <info@neoperformance.ca>', 'Re: Reçus') } },
      { internalDate: String(Date.parse('2026-10-22T13:00:00Z')), labelIds: ['DRAFT'], snippet: 'brouillon', payload: { headers: h('info@neoperformance.ca', 'Re: Reçus') } },
    ] }])
    expect(e).toMatchObject({ cle: 'gmail:t1', source: 'gmail', titre: 'Reçus', date: '2026-10-21T13:00:00.000Z', sens: 'envoye', nombre: 2, extrait: 'Voilà & merci', ref: { threadId: 't1' } })
  })
  it('requête de recherche', () => {
    expect(requeteGmailPersonne('a@b.ca')).toBe('from:a@b.ca OR to:a@b.ca OR cc:a@b.ca')
  })
})

describe('GHL', () => {
  it('SMS résumés par jour (heure de Montréal), courriels un par un', () => {
    const els = elementsGhl([
      { id: '1', messageType: 'TYPE_SMS', direction: 'inbound', body: 'Bonjour', dateAdded: '2026-10-20T14:00:00Z' },
      { id: '2', messageType: 'TYPE_SMS', direction: 'outbound', body: 'Salut!', dateAdded: '2026-10-20T15:00:00Z' },
      { id: '3', messageType: 'TYPE_SMS', direction: 'inbound', body: 'Tard le soir', dateAdded: '2026-10-21T02:00:00Z' },
      { id: '4', messageType: 'TYPE_EMAIL', direction: 'outbound', body: '<p>Rappel</p>', meta: { email: { subject: 'Ton rendez-vous' } }, dateAdded: '2026-10-19T12:00:00Z' },
      { id: '5', messageType: 'TYPE_CALL', dateAdded: '2026-10-19T12:00:00Z' },
    ])
    const sms = els.filter(e => e.source === 'ghl_sms')
    expect(sms).toHaveLength(1)
    expect(sms[0]).toMatchObject({ titre: '3 SMS échangés', nombre: 3, extrait: 'Tard le soir', ref: { jour: '2026-10-20' } })
    expect(els.find(e => e.source === 'ghl_courriel')).toMatchObject({ titre: 'Ton rendez-vous', extrait: 'Rappel', sens: 'envoye' })
  })
})

describe('App NEO', () => {
  it('un résumé par jour : nombre, sujets, dernier message coupé', () => {
    const [e] = elementsApp([
      { created_at: '2026-10-20T13:00:00Z', from_side: 'client', topic: 'leo', message: 'Question' },
      { created_at: '2026-10-20T13:05:00Z', from_side: 'staff', topic: 'plan', message: 'x'.repeat(300) },
    ])
    expect(e.titre).toBe('2 messages dans l’app (Léo, plan)')
    expect(e.extrait.length).toBeLessThanOrEqual(120)
    expect(e.sens).toBe('envoye')
  })
})

describe('fusion', () => {
  it('tri du plus récent au plus ancien, sans doublon, sans date ignoré', () => {
    const l = fusionnerLigneDuTemps(
      elementsLeo([{ id: 'd1', created_at: '2026-10-18T10:00:00Z', resume: { sujet: 'Reçus' } }]),
      [{ cle: 'gmail:t1', date: '2026-10-21T10:00:00Z' }, { cle: 'gmail:t1', date: '2026-10-21T10:00:00Z' }],
      [{ cle: 'app:2026-10-20', date: '2026-10-20T10:00:00Z' }, { cle: 'x', date: null }],
    )
    expect(l.map(e => e.cle)).toEqual(['gmail:t1', 'app:2026-10-20', 'leo:d1'])
  })
})
