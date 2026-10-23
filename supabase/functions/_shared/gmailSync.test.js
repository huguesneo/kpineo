import { describe, it, expect } from 'vitest'
import { doitIgnorer, ligneInbox, changementsHistorique, liaisons, courrielsNonTraites, elementFileInbox, etatLie, suiteDe, BADGE_NOUVELLE_REPONSE } from './gmailSync.js'

const meta = (o = {}) => ({
  id: 'm1', threadId: 't1', internalDate: String(Date.parse('2026-10-23T14:00:00Z')), labelIds: ['INBOX', 'UNREAD'], snippet: 'Bonjour, j&#39;ai une question',
  payload: { headers: [{ name: 'From', value: 'Julie Roy <julie@x.ca>' }, { name: 'Subject', value: 'Question' }] }, ...o,
})

describe('bruit et internes ignorés', () => {
  const table = { Label_1: 'Blocked', Label_2: 'NEWSLETTERS/Promotion', Label_3: 'wordpress', Label_4: 'CLIENTS/Reçus' }
  it('interne, hors INBOX, spam, libellés de bruit', () => {
    expect(doitIgnorer({ de: 'cloe@neoperformance.ca', labelIds: ['INBOX'] })).toBe(true)
    expect(doitIgnorer({ de: 'a@x.ca', labelIds: ['UNREAD'] })).toBe(true)
    expect(doitIgnorer({ de: 'a@x.ca', labelIds: ['INBOX', 'CATEGORY_PROMOTIONS'] })).toBe(true)
    for (const l of ['Label_1', 'Label_2', 'Label_3']) expect(doitIgnorer({ de: 'a@x.ca', labelIds: ['INBOX', l], tableLibelles: table })).toBe(true)
    expect(doitIgnorer({ de: 'a@x.ca', labelIds: ['INBOX', 'Label_4'], tableLibelles: table })).toBe(false)
  })
  it('ligne inbox_messages', () => {
    expect(ligneInbox(meta())).toEqual({
      gmail_message_id: 'm1', gmail_thread_id: 't1', expediteur: 'julie@x.ca', expediteur_nom: 'Julie Roy', sujet: 'Question',
      extrait: "Bonjour, j'ai une question", recu_le: '2026-10-23T14:00:00.000Z', libelles: ['INBOX', 'UNREAD'],
    })
    expect(ligneInbox(meta({ payload: { headers: [{ name: 'From', value: 'info@neoperformance.ca' }] } }))).toBe(null)
  })
})

describe('historique Gmail', () => {
  it('arrivées dans INBOX et libellés retirés', () => {
    const c = changementsHistorique([
      { messagesAdded: [{ message: { id: 'a', labelIds: ['INBOX'] } }, { message: { id: 's', labelIds: ['SENT'] } }] },
      { labelsAdded: [{ message: { id: 'b', labelIds: ['INBOX'] }, labelIds: ['INBOX'] }] },
      { labelsRemoved: [{ message: { id: 'a', labelIds: ['Label_4'] }, labelIds: ['INBOX'] }] },
    ])
    expect(c.ajoutes).toEqual(['a', 'b'])
    expect(c.libelles.get('a')).toEqual(['Label_4'])
  })
})

describe('liaison sans doublon', () => {
  const inbox = [
    { gmail_message_id: 'm1', gmail_thread_id: 't1', recu_le: '2026-10-23T14:00:00Z', etat: 'nouveau', libelles: ['INBOX'] },
    { gmail_message_id: 'm2', gmail_thread_id: 't2', recu_le: '2026-10-23T15:00:00Z', etat: 'nouveau', libelles: ['INBOX'] },
    { gmail_message_id: 'm3', gmail_thread_id: 't3', recu_le: '2026-10-23T16:00:00Z', etat: 'nouveau', libelles: ['INBOX'] },
    { gmail_message_id: 'm4', gmail_thread_id: 't4', recu_le: '2026-10-23T16:00:00Z', etat: 'nouveau', libelles: ['INBOX'], leo_interaction_id: 'x' },
  ]
  const leo = [
    { id: 'L1', gmail_message_id: 'm1', created_at: '2026-10-23T14:05:00Z', payload: {} },
    { id: 'L2', gmail_thread_id: 't2', created_at: '2026-10-23T15:03:00Z', payload: { hub_origine: 'hub' } },
    { id: 'L3', gmail_thread_id: 't3', created_at: '2026-10-20T10:00:00Z', payload: {} }, // ancien dossier du même fil
  ]
  it('par message, sinon par fil si le dossier est postérieur', () => {
    expect(liaisons(inbox, leo)).toEqual([
      { gmail_message_id: 'm1', leo_interaction_id: 'L1', etat: 'traite_par_leo' },
      { gmail_message_id: 'm2', leo_interaction_id: 'L2', etat: 'traite_dans_hub' },
    ])
  })
  it('la file ne montre que les courriels sans dossier Léo, même avant la liaison', () => {
    const file = courrielsNonTraites(inbox, [{ id: 'L1', gmail: 'm1' }])
    expect(file.map(m => m.gmail_message_id)).toEqual(['m3', 'm2'])
    expect(courrielsNonTraites([{ ...inbox[2], libelles: ['Label_4'] }], [])).toEqual([])
  })
  it('décidé dans le Hub = traité dans le Hub', () => {
    expect(etatLie({ payload: { hub_decided_by: 'info@neoperformance.ca' } })).toBe('traite_dans_hub')
  })
  it('ligne de la file avec le badge', () => {
    const e = elementFileInbox({ ...inbox[2], expediteur: 'a@x.ca', expediteur_nom: null, sujet: 'Q', extrait: 'x' }, '5 min')
    expect(e).toMatchObject({ id: 'inbox:m3', inbox: true, nom: 'a@x.ca', etiquettes: [{ label: 'Pas encore traité par Léo', ton: 'info' }] })
  })
  // Cas réel du 23 oct. : « test » traité dans le Hub (dossier créé 20:39:40, réponse
  // envoyée 20:39:56), puis « Re: test » reçu à 20:40:24 dans le même fil
  const reponse = { gmail_message_id: '1a16a7e69730dca3', gmail_thread_id: '1a16a77be180d9bc', recu_le: '2026-10-23T20:40:24Z', etat: 'nouveau', libelles: ['INBOX'] }
  const ferme = { id: '69b4b4be', gmail_message_id: '1a16a77be180d9bc', gmail_thread_id: '1a16a77be180d9bc', created_at: '2026-10-23T20:39:40Z', decision: 'approved_modified', decided_at: '2026-10-23T20:39:56Z', payload: { hub_origine: 'hub' } }
  it('une réponse arrivée après la décision n’est jamais absorbée par le dossier fermé', () => {
    expect(liaisons([reponse], [ferme])).toEqual([])
    expect(suiteDe(reponse, [ferme])).toBe('69b4b4be')
  })
  it('même chose pour un dossier fermé par Léo', () => {
    const leo = { id: 'L9', gmail_thread_id: 't9', created_at: '2026-10-23T20:39:50Z', decision: 'auto_sent', decided_at: '2026-10-23T20:40:00Z', payload: {} }
    const m = { ...reponse, gmail_message_id: 'm9', gmail_thread_id: 't9' }
    expect(liaisons([m], [leo])).toEqual([])
    expect(suiteDe(m, [leo])).toBe('L9')
  })
  it('un dossier encore en attente, ou décidé après le message, l’absorbe toujours', () => {
    expect(liaisons([reponse], [{ ...ferme, id: 'P', gmail_message_id: null, decision: 'pending', decided_at: null, payload: {} }])).toHaveLength(1)
    expect(liaisons([reponse], [{ ...ferme, id: 'D', gmail_message_id: null, decided_at: '2026-10-23T20:45:00Z', payload: {} }])).toHaveLength(1)
    expect(suiteDe(reponse, [{ ...ferme, decision: 'pending', decided_at: null }])).toBe(null)
  })
  it('un dossier créé dans le Hub pour un autre message du fil ne l’absorbe pas', () => {
    expect(liaisons([reponse], [{ ...ferme, decision: 'pending', decided_at: null }])).toEqual([])
  })
  it('badge « Nouvelle réponse » sur la ligne de la file', () => {
    const e = elementFileInbox({ ...reponse, expediteur: 'a@x.ca', sujet: 'Re: test' }, '1 min', '69b4b4be')
    expect(e).toMatchObject({ suiteDe: '69b4b4be', badgeAction: BADGE_NOUVELLE_REPONSE, etiquettes: [{ label: 'Fil déjà traité' }] })
  })
})
