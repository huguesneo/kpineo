import { describe, it, expect } from 'vitest'
import {
  prioriserLeads, groupeLead, indexerAppels, fmtTentative, avertissementAppelRecent,
  repartirLeads, trierRappels, fmtDuree, erreurResultat, prioriserNouveaux, sortiDesListes, tentativesAffichees,
} from './settingV2'
import {
  ajouterJoursOuvrables, proprieteExpiree, proprieteEnAlerte, peutEcrireGhl,
  lignesAppels, nouveauxProprietaires, noteNonQualifie,
} from '../../../supabase/functions/_shared/settingRegles.js'

const H = 3_600_000
// Jeudi 15 oct. 2026, 15 h à Montréal
const NOW = new Date('2026-10-15T19:00:00Z').getTime()
const iso = t => new Date(t).toISOString()

describe('groupes de priorité', () => {
  it('rappel dû > jamais appelé > prêt > en attente', () => {
    expect(groupeLead({ rappelDu: true, tentative: null }, NOW)).toBe(1)
    expect(groupeLead({ tentative: null }, NOW)).toBe(2)
    expect(groupeLead({ tentative: { date: iso(NOW - 25 * H) } }, NOW)).toBe(3)
    expect(groupeLead({ tentative: { date: iso(NOW - 6 * H) } }, NOW)).toBe(4)
  })

  it('exemple du cahier : 2e tentative hier 14 h 32, grisé jusqu’à aujourd’hui 14 h 32 puis remonte', () => {
    const hier1432 = new Date('2026-10-14T18:32:00Z').getTime()
    const lead = { contactId: 'c1', tentative: 3, creeLe: iso(NOW - 72 * H) }
    const appels = indexerAppels([{ contact_id: 'c1', appele_le: iso(hier1432), sortant: true, user_id: 'v', duree: 20 }])
    const avant = prioriserLeads([lead], { appelsParContact: appels, now: hier1432 + 23 * H })[0]
    expect(avant.groupe).toBe(4)
    expect(fmtDuree(avant.rappelableLe - (hier1432 + 23 * H))).toBe('1 h')
    const apres = prioriserLeads([lead], { appelsParContact: appels, now: hier1432 + 24 * H + 60_000 })[0]
    expect(apres.groupe).toBe(3)
  })

  it('tri complet', () => {
    const appels = indexerAppels([
      { contact_id: 'pret-vieux', appele_le: iso(NOW - 50 * H), sortant: true },
      { contact_id: 'pret-recent', appele_le: iso(NOW - 30 * H), sortant: true },
      { contact_id: 'attente', appele_le: iso(NOW - 2 * H), sortant: true },
    ])
    const rappels = new Map([['rappel', { rappel_le: iso(NOW - H) }], ['futur', { rappel_le: iso(NOW + 5 * H) }]])
    const leads = [
      { contactId: 'attente', tentative: 2 },
      { contactId: 'pret-recent', tentative: 2 },
      { contactId: 'nouveau-vieux', tentative: 1, creeLe: iso(NOW - 10 * H) },
      { contactId: 'pret-vieux', tentative: 2 },
      { contactId: 'nouveau-recent', tentative: 1, creeLe: iso(NOW - H) },
      { contactId: 'rappel', tentative: 2, changementEtape: iso(NOW - 3 * H) },
    ]
    const ordre = prioriserLeads(leads, { appelsParContact: appels, rappelsParContact: rappels, now: NOW }).map(l => l.contactId)
    expect(ordre).toEqual(['rappel', 'nouveau-recent', 'nouveau-vieux', 'pret-vieux', 'pret-recent', 'attente'])
  })

  it('liste Nouveaux leads : 🔥 chauds en tête, puis du plus ancien au plus récent, sans groupes', () => {
    const appels = indexerAppels([{ contact_id: 'appele', appele_le: iso(NOW - 30 * H), sortant: true }])
    const r = prioriserNouveaux([
      { contactId: 'recent', tentative: 1, creeLe: iso(NOW - H) },
      { contactId: 'chaud', tentative: 1, chaud: true, creeLe: iso(NOW - 2 * H) },
      { contactId: 'appele', tentative: 1, creeLe: iso(NOW - 40 * H) },
      { contactId: 'vieux', tentative: 1, creeLe: iso(NOW - 10 * H) },
    ], { appelsParContact: appels, now: NOW })
    expect(r.map(l => l.contactId)).toEqual(['chaud', 'appele', 'vieux', 'recent'])
    expect(r.every(l => l.groupe === 2)).toBe(true)
    expect(r.find(l => l.contactId === 'appele').derniere).not.toBeNull()
  })

  it('on a parlé au lead : 💬 Contact établi, jamais « en attente » ; rappel futur : Rappel prévu en bas', () => {
    const appels = indexerAppels([
      { contact_id: 'parle', appele_le: iso(NOW - 2 * H), sortant: true, duree: 83, user_id: 'k' },
      { contact_id: 'court', appele_le: iso(NOW - 2 * H), sortant: true, duree: 20 },
      { contact_id: 'prevu', appele_le: iso(NOW - 3 * H), sortant: true, duree: 120 },
    ])
    const rappels = new Map([['prevu', { rappel_le: iso(NOW + 20 * H) }]])
    const r = prioriserLeads([
      { contactId: 'court', tentative: 2 },
      { contactId: 'prevu', tentative: 1 },
      { contactId: 'parle', tentative: 1 },
      { contactId: 'etape', tentative: null, stageId: '0a3237b7-6878-4a45-bd3e-3013908ee257', changementEtape: iso(NOW - 5 * H) },
    ], { appelsParContact: appels, rappelsParContact: rappels, nomsParId: { k: 'Kassy NEO' }, now: NOW })
    expect(r.map(l => [l.contactId, l.groupe])).toEqual([['parle', 1.5], ['etape', 1.5], ['court', 4], ['prevu', 5]])
    expect(r[0].conversation).toEqual({ date: iso(NOW - 2 * H), par: 'Kassy NEO', duree: 83 })
  })

  it('sans journal : la date de l’étape sert de dernière tentative', () => {
    const [l] = prioriserLeads([{ contactId: 'x', tentative: 2, changementEtape: iso(NOW - 3 * H) }], { now: NOW })
    expect(l.groupe).toBe(4)
  })
})

describe('affichage', () => {
  it('ligne de tentative', () => {
    const lead = { tentative: 3, derniere: { date: '2026-10-14T18:32:00Z', par: 'Vicky NEO' } }
    expect(fmtTentative(lead, NOW)).toBe('2e tentative · hier 14 h 32 · Vicky')
    expect(fmtTentative({ tentative: 1, derniere: null }, NOW)).toBe('Jamais appelé')
  })

  it('avertissement appel récent par quelqu’un d’autre', () => {
    const appels = [{ user_id: 'v', appele_le: iso(NOW - 3 * H), duree: 134 }]
    expect(avertissementAppelRecent(appels, 'moi', { v: 'Vicky NEO' }, NOW))
      .toBe('Appelé par Vicky il y a 3 h, 2 min 14 s : écoute l’appel avant de rappeler')
    expect(avertissementAppelRecent(appels, 'v', { v: 'Vicky NEO' }, NOW)).toBeNull()
    expect(avertissementAppelRecent([{ user_id: 'v', appele_le: iso(NOW - 30 * H) }], 'moi', {}, NOW)).toBeNull()
  })
})

describe('propriété', () => {
  const leads = [{ contactId: 'a' }, { contactId: 'b' }, { contactId: 'c' }, { contactId: 'd' }]
  const proprietes = new Map([['a', { user_id: 'moi' }], ['b', { user_id: 'vicky' }]])
  it('un lead assigné disparaît de la liste commune des autres', () => {
    const r = repartirLeads(leads, { proprietes, traites: new Set(['d']), userId: 'moi' })
    expect(r.miens.map(l => l.contactId)).toEqual(['a'])
    expect(r.communs.map(l => l.contactId)).toEqual(['c'])
    expect(r.assignes).toEqual([])
  })
  it('l’admin voit les leads des autres', () => {
    const r = repartirLeads(leads, { proprietes, userId: 'admin', estAdmin: true })
    expect(r.assignes.map(l => l.contactId)).toEqual(['a', 'b'])
  })
  it('appel de 60 s ou plus d’un setter connu = assigné ; tentative courte = rien', () => {
    const g = nouveauxProprietaires([
      { contact_id: 'x', user_id: 'v', duree: 59, appele_le: '2026-10-15T10:00:00Z' },
      { contact_id: 'y', user_id: 'v', duree: 60, appele_le: '2026-10-15T10:00:00Z' },
      { contact_id: 'z', user_id: null, duree: 300, appele_le: '2026-10-15T10:00:00Z' },
    ])
    expect(Object.keys(g)).toEqual(['y'])
  })
  it('jours ouvrables : vendredi + 3 = mercredi', () => {
    const vendredi = new Date('2026-10-16T14:00:00Z').getTime()
    expect(new Date(ajouterJoursOuvrables(vendredi, 3)).toISOString()).toBe('2026-10-21T14:00:00.000Z')
    expect(proprieteExpiree(vendredi, new Date('2026-10-21T13:59:00Z').getTime())).toBe(false)
    expect(proprieteExpiree(vendredi, new Date('2026-10-21T14:00:00Z').getTime())).toBe(true)
    expect(proprieteEnAlerte(vendredi, new Date('2026-10-20T14:00:00Z').getTime())).toBe(true)
  })
})

describe('pastilles de tentatives', () => {
  it('étape de tentatives d’abord, sinon appels du journal (Contact établi)', () => {
    expect(tentativesAffichees({ tentative: 3, nbAppels: 1 })).toBe(2)
    expect(tentativesAffichees({ tentative: null, nbAppels: 2 })).toBe(2)
    expect(tentativesAffichees({ tentative: null, nbAppels: 7 })).toBe(4)
    expect(tentativesAffichees({ tentative: null, nbAppels: 0 })).toBeNull()
  })
})

describe('sortie des listes', () => {
  it('Pas intéressé puis retour par un lead magnet : le lead réapparaît', () => {
    const ev = new Map([['c', iso(NOW - 10 * 24 * H)]])           // Pas intéressé il y a 10 jours
    expect(sortiDesListes({ contactId: 'c', changementEtape: iso(NOW - 11 * 24 * H) }, ev)).toBe(true)
    expect(sortiDesListes({ contactId: 'c', changementEtape: iso(NOW - H) }, ev)).toBe(false) // carte remise à Nouveau lead
    expect(sortiDesListes({ contactId: 'autre', changementEtape: iso(NOW) }, ev)).toBe(false)
  })
  it('vieille carte jamais bougée après la rencontre : masquée', () => {
    const ev = new Map([['josiane', '2026-09-16T19:00:00Z']])
    expect(sortiDesListes({ contactId: 'josiane', changementEtape: '2026-09-10T12:00:00Z' }, ev)).toBe(true)
  })
})

describe('règles serveur', () => {
  it('interrupteur : contact test seulement tant qu’il est éteint', () => {
    expect(peutEcrireGhl({ ecrituresReelles: false, emailContact: 'Hugues.Pugliese@gmail.com', emailTest: 'hugues.pugliese@gmail.com' })).toBe(true)
    expect(peutEcrireGhl({ ecrituresReelles: false, emailContact: 'lead@x.com', emailTest: 'hugues.pugliese@gmail.com' })).toBe(false)
    expect(peutEcrireGhl({ ecrituresReelles: false, emailContact: null, emailTest: 'hugues.pugliese@gmail.com' })).toBe(false)
    expect(peutEcrireGhl({ ecrituresReelles: true, emailContact: 'lead@x.com', emailTest: 'x' })).toBe(true)
  })
  it('résultat : raison obligatoire pour Non qualifié', () => {
    expect(erreurResultat({ resultat: 'non_qualifie' })).toBe('Choisis une raison')
    expect(erreurResultat({ resultat: 'non_qualifie', raison: 'autre' })).toBe('Précise la raison')
    expect(erreurResultat({ resultat: 'non_qualifie', raison: 'age' })).toBeNull()
    expect(erreurResultat({ resultat: 'pas_interesse' })).toBeNull()
    expect(noteNonQualifie({ raison: 'autre', raisonTexte: 'Pas d’Internet', prenom: 'Vicky', quand: '15 octobre' }))
      .toBe('🗑️ Non qualifié (setting) : Autre : Pas d’Internet. Par Vicky, le 15 octobre.')
  })
  it('journal d’appels GHL → lignes', () => {
    const l = lignesAppels([
      { id: 'm1', contactId: 'c', dateAdded: '2026-10-15T10:00:00Z', direction: 'outbound', userId: 'g1', meta: { call: { duration: 134, status: 'completed' } } },
      { id: 'm2', contactId: 'c', dateAdded: '2026-10-15T11:00:00Z', messageType: 'TYPE_SMS' },
    ], { g1: 'p1' })
    expect(l).toEqual([{ id: 'm1', contact_id: 'c', conversation_id: null, ghl_user_id: 'g1', user_id: 'p1', sortant: true, statut: 'completed', duree: 134, appele_le: '2026-10-15T10:00:00.000Z' }])
  })
})

describe('rappels', () => {
  it('en retard, aujourd’hui, à venir', () => {
    const r = trierRappels([
      { id: 'avenir', statut: 'actif', rappel_le: iso(NOW + 30 * H) },
      { id: 'auj', statut: 'actif', rappel_le: iso(NOW + 2 * H) },
      { id: 'retard', statut: 'actif', rappel_le: iso(NOW - 2 * H) },
      { id: 'fait', statut: 'fait', rappel_le: iso(NOW - 5 * H) },
    ], NOW)
    expect(r.map(x => [x.id, x.etat])).toEqual([['retard', 'retard'], ['auj', 'aujourdhui'], ['avenir', 'avenir']])
  })
})
