import { describe, it, expect } from 'vitest'
import {
  peutUtiliserAdjoint, estAutonome, filtresListe, decisionAffichee, numeroCommande, recuQuickbooks, blocageCommande, statutRecu,
  filtresCommandes, actionPrincipale, valeurMake, payloadMake, corpsFormulaireMake, complementsMake, manquesMake, refusDecision,
  trierFile, rangUrgence, delaiAttente, etiquettesDossier, courrielDuDossier, nomDuDossier, sujetDuDossier, sujetReponse,
  statutPersonne, semaineProgramme, analyserRecherche, motifTelephone, payloadPourEcran, dossierPourEcran, resumeDossier,
  texteVersHtml, htmlVersTexte, remplacerCorpsHtml, messageSlack, corpsSlackTraite, debutJourMontreal, jourMontreal, boutonJamaisPose, formatArgent,
  estPerime,
} from './adjoint.js'

const NOW = new Date('2026-10-23T16:00:00Z').getTime()
const ilYa = (h) => new Date(NOW - h * 3600000).toISOString()

const courriel = (o = {}) => ({
  id: 'c1', channel: 'courriel', decision: 'pending', suggested_action: 'repondre', category: 'Client actif/Général',
  contact_email: 'Julie@Example.com', created_at: ilYa(3), gmail_message_id: 'g1',
  payload: { to: ['julie@example.com'], subject: 'Re: Reçus pour mon assurance', html: '<p>Bonjour Julie :)</p>', label_final: 'Label_43' },
  ...o,
})
const commande = (o = {}) => ({
  id: 'k1', channel: 'commande', decision: 'pending', suggested_action: 'commande', category: 'Commandes', created_at: ilYa(30),
  gmail_message_id: 'g2', recu_quickbooks: null,
  payload: { commande: '8142', client_nom: 'Sophie Gagnon', client_courriel: 'sophie@example.com', Line: [{ Qty: 1, Amount: 10 }], total_woocommerce: 11.5 },
  ...o,
})

describe('accès', () => {
  it('Hugues et Cloé seulement, peu importe la casse', () => {
    expect(peutUtiliserAdjoint('Hugues@NeoPerformance.ca')).toBe(true)
    expect(peutUtiliserAdjoint('info@neoperformance.ca')).toBe(true)
    expect(peutUtiliserAdjoint('pierre.pugliese@gmail.com')).toBe(false)
    expect(peutUtiliserAdjoint(null)).toBe(false)
  })
})

describe('sections et filtres', () => {
  it('fait seul par Léo : classer, archiver ou auto_envoye', () => {
    expect(estAutonome({ suggested_action: 'classer' })).toBe(true)
    expect(estAutonome({ suggested_action: 'archiver' })).toBe(true)
    expect(estAutonome({ suggested_action: 'repondre', decision: 'auto_envoye' })).toBe(true)
    expect(estAutonome({ suggested_action: 'repondre', decision: 'approved_as_is' })).toBe(false)
  })
  it('à traiter : decision pending, filtré par canal', () => {
    expect(filtresListe({ section: 'commande', sousSection: 'a_traiter' })).toEqual([['in', 'channel', ['commande']], ['eq', 'decision', 'pending']])
    expect(filtresListe({ section: 'tout', sousSection: 'a_traiter' })).toEqual([['eq', 'decision', 'pending']])
  })
  it('déjà traité exclut ce que Léo a fait seul, sauf filtre « fait seul »', () => {
    const ops = filtresListe({ section: 'courriel', sousSection: 'traite' })
    expect(ops).toContainEqual(['neq', 'decision', 'pending'])
    expect(ops).toContainEqual(['not', 'suggested_action', 'in', '(classer,archiver)'])
    const seul = filtresListe({ section: 'tout', sousSection: 'traite', filtres: { decision: 'fait_seul' } })
    expect(seul).toContainEqual(['or', 'suggested_action.in.(classer,archiver),decision.eq.auto_envoye'])
    expect(seul).not.toContainEqual(['not', 'suggested_action', 'in', '(classer,archiver)'])
  })
  it('filtres canal et période dans « Tout »', () => {
    const ops = filtresListe({ section: 'tout', sousSection: 'traite', filtres: { canal: 'agenda', periode: '7j' }, now: new Date(NOW) })
    expect(ops[0]).toEqual(['eq', 'channel', 'agenda'])
    expect(ops).toContainEqual(['gte', 'created_at', new Date(NOW - 7 * 86400000).toISOString()])
    expect(filtresListe({ section: 'tout', sousSection: 'traite', filtres: { canal: 'nimporte' } })[0]).toEqual(['neq', 'decision', 'pending'])
  })
  it("fait seul aujourd'hui : depuis minuit à Montréal", () => {
    const ops = filtresListe({ section: 'autonome', sousSection: 'aujourdhui', debutJour: '2026-10-23T04:00:00.000Z' })
    expect(ops).toEqual([['or', 'suggested_action.in.(classer,archiver),decision.eq.auto_envoye'], ['gte', 'created_at', '2026-10-23T04:00:00.000Z']])
  })
})

describe('décision affichée', () => {
  it.each([
    [{ decision: 'pending' }, 'en_attente'],
    [{ decision: 'traite_manuellement' }, 'traite_main'],
    [{ decision: 'rejected' }, 'rejete'],
    [{ decision: 'approved_as_is', channel: 'commande', recu_quickbooks: '80053' }, 'recu_cree'],
    [{ decision: 'approved_as_is', suggested_action: 'classer' }, 'fait_seul'],
    [{ decision: 'auto_envoye', suggested_action: 'repondre' }, 'fait_seul'],
    [{ decision: 'approved_modified', suggested_action: 'repondre' }, 'envoye_modifie'],
    [{ decision: 'approved_as_is', suggested_action: 'repondre' }, 'envoye'],
  ])('%j → %s', (row, attendu) => expect(decisionAffichee(row)).toBe(attendu))
})

describe('commandes', () => {
  it('numéro dans payload.commande, sinon numero_commande', () => {
    expect(numeroCommande(commande())).toBe('8142')
    expect(numeroCommande({ payload: { numero_commande: '#8001' } })).toBe('8001')
    expect(numeroCommande({ payload: {} })).toBe(null)
  })
  it('reçu QBO : colonne, sinon payload', () => {
    expect(recuQuickbooks({ recu_quickbooks: '1', payload: {} })).toBe('1')
    expect(recuQuickbooks({ payload: { recu_quickbooks: '2' } })).toBe('2')
  })
  it('blocage : bloque_* et attente_*, sauf attente_clic_bouton', () => {
    expect(blocageCommande(commande({ etape: 'bloque_variante_produit' }))).toBe('Variante de produit à confirmer')
    expect(blocageCommande(commande({ etape: 'attente_validation_cloe' }))).toBe('Validation de Cloé attendue')
    expect(blocageCommande(commande({ etape: 'attente_clic_bouton' }))).toBe(null)
    expect(blocageCommande(commande({ etape: null }))).toBe(null)
    expect(blocageCommande(commande({ payload: { blocage: true, raison_blocage: 'Rupture de stock' } }))).toBe('Rupture de stock')
    expect(blocageCommande(commande({ etape: 'attente_quelque_chose' }))).toBe('attente quelque chose')
    expect(blocageCommande(courriel({ etape: 'attente_decision_hugues' }))).toBe(null)
  })
  it('statut du reçu', () => {
    expect(statutRecu(commande({ recu_quickbooks: '80053' }))).toBe('cree')
    expect(statutRecu(commande({ payload: { note_credit_id: 'NC1' } }))).toBe('note_credit')
    expect(statutRecu(commande({ decision: 'traite_manuellement' }))).toBe('main')
    expect(statutRecu(commande({ etape: 'bloque_variante_produit' }))).toBe('bloque')
    expect(statutRecu(commande())).toBe('non_cree')
  })
  it('filtres du statut du reçu', () => {
    expect(filtresCommandes('cree')).toEqual([['or', 'recu_quickbooks.not.is.null,payload->>recu_quickbooks.not.is.null']])
    expect(filtresCommandes('non_cree')).toContainEqual(['is', 'recu_quickbooks', null])
    expect(filtresCommandes('tous')).toEqual([])
  })
  it('bouton jamais posé', () => {
    expect(boutonJamaisPose(commande({ etape: 'attente_clic_bouton' }))).toBe(true)
    expect(boutonJamaisPose(commande({ etape: 'attente_clic_bouton', decision: 'approved_as_is' }))).toBe(false)
  })
})

describe('action principale', () => {
  it('commande prête : créer le reçu, valeur = numéro de commande', () => {
    const a = actionPrincipale(commande())
    expect(a.actionId).toBe('creer_recu_commande')
    expect(a.libelle).toBe('Créer le reçu de vente')
    expect(valeurMake(commande(), a.actionId)).toBe('8142')
  })
  it('commande bloquée ou transférée à Cloé : aucun bouton Make', () => {
    expect(actionPrincipale(commande({ etape: 'bloque_variante_produit' }))).toBe(null)
    expect(actionPrincipale(commande({ suggested_action: 'transferer_cloe' }))).toBe(null)
  })
  it('pas de « Créer le reçu » tant que Léo n’a pas préparé les lignes QuickBooks', () => {
    expect(actionPrincipale(commande({ payload: { commande: '8116', hub_origine: 'hub' } }))).toBe(null)
    expect(actionPrincipale(commande({ payload: { commande: '8116', Line: [] } }))).toBe(null)
  })
  it('courriel : réponse, accusé de réception pour escalade et transfert, rien sans html', () => {
    expect(actionPrincipale(courriel()).libelle).toBe('Envoyer la réponse')
    expect(valeurMake(courriel(), 'envoyer_reponse_courriel')).toBe('c1')
    expect(actionPrincipale(courriel({ suggested_action: 'escalader_hugues' })).libelle).toBe("Envoyer l'accusé de réception")
    expect(actionPrincipale(courriel({ suggested_action: 'transferer_cloe' })).badge).toBe('Accusé de réception')
    expect(actionPrincipale(courriel({ payload: { to: ['a@b.c'] } }))).toBe(null)
    expect(actionPrincipale(courriel({ decision: 'rejected' }))).toBe(null)
  })
  it('agenda : créneaux par courriel, sinon validation Slack, sinon rien', () => {
    const avecOptions = { channel: 'agenda', decision: 'pending', payload: { html: '<p>x</p>', options_proposees: ['2026-10-21T14:15:00-04:00'] } }
    expect(actionPrincipale(avecOptions)).toMatchObject({ actionId: 'envoyer_reponse_courriel', libelle: 'Proposer ces créneaux', badge: 'Créneaux GHL' })
    expect(actionPrincipale({ channel: 'agenda', decision: 'pending', payload: { slack_texte: 'x' } }).actionId).toBe('valider_creneaux')
    expect(actionPrincipale({ channel: 'agenda', decision: 'pending', payload: {} })).toBe(null)
  })
})

describe('appel Make', () => {
  it('format interactivité Slack, un seul champ payload', () => {
    const args = { actionId: 'envoyer_reponse_courriel', valeur: 'c1', courriel: 'info@neoperformance.ca', responseUrl: 'https://x/ack?id=c1&jeton=j' }
    expect(payloadMake(args)).toEqual({
      type: 'block_actions', source: 'neo-hub', user: { username: 'info@neoperformance.ca' },
      actions: [{ action_id: 'envoyer_reponse_courriel', value: 'c1' }], response_url: 'https://x/ack?id=c1&jeton=j',
    })
    const corps = new URLSearchParams(corpsFormulaireMake(args))
    expect([...corps.keys()]).toEqual(['payload'])
    expect(JSON.parse(corps.get('payload')).actions[0].action_id).toBe('envoyer_reponse_courriel')
  })
  it("le payload ne contient le texte d'aucune autre route Make", () => {
    const texte = corpsFormulaireMake({ actionId: 'creer_recu_commande', valeur: '8142', courriel: 'info@neoperformance.ca', responseUrl: 'https://x' })
    for (const autre of ['envoyer_reponse_courriel', 'valider_creneaux', '_reponse_app']) expect(decodeURIComponent(texte)).not.toContain(autre)
  })
  it('remplace Label_137 (« Léo en cours ») par le libellé de la catégorie', () => {
    const row = courriel({ payload: { subject: 's', html: 'h', label_final: 'Label_137', to: ['a@b.c'] } })
    expect(complementsMake(row, 'envoyer_reponse_courriel', { labelCategorie: 'Label_43' }).label_final).toBe('Label_43')
  })
  it('complète gmail_message_id, label_final et to', () => {
    const row = courriel({ payload: { subject: 's', html: 'h', label_final: 'autre' }, contact_email: 'Julie@Example.com' })
    expect(complementsMake(row, 'envoyer_reponse_courriel', { labelCategorie: 'Label_43' }))
      .toEqual({ gmail_message_id: 'g1', label_final: 'Label_43', to: ['julie@example.com'] })
    expect(complementsMake(courriel({ payload: { ...courriel().payload, gmail_message_id: 'déjà' } }), 'envoyer_reponse_courriel')).toEqual({})
  })
  it('refuse avant Make ce qui le ferait planter', () => {
    expect(manquesMake(courriel(), 'envoyer_reponse_courriel', { gmail_message_id: 'g1' })).toEqual([])
    expect(manquesMake(courriel({ payload: { html: 'h' } }), 'envoyer_reponse_courriel')).toEqual(['adresse du destinataire', 'sujet', 'id du courriel Gmail', 'libellé Gmail'])
    expect(manquesMake(commande({ payload: { commande: '1' } }), 'creer_recu_commande')).toEqual(['lignes de la commande'])
  })
})

describe('refus de décision', () => {
  it('dossier déjà traité (Hub ou Slack) : renvoie l’état réel', () => {
    expect(refusDecision(courriel({ decision: 'approved_as_is', executed_at: '2026-10-22T14:00:00Z' }), NOW)).toMatch(/déjà traité \(Envoyé, le 22 oct/)
    expect(refusDecision(courriel({ decision: 'rejected', payload: { hub_decided_by: 'Cloé' } }), NOW)).toMatch(/Rejeté, par Cloé/)
    expect(refusDecision(null)).toBe('Dossier introuvable.')
  })
  it('envoi en cours depuis moins de 15 min : refusé', () => {
    const enCours = courriel({ payload: { hub_execution: { demande_le: ilYa(0.1) } } })
    expect(refusDecision(enCours, NOW)).toMatch(/déjà en cours/)
    expect(refusDecision(courriel({ payload: { hub_execution: { demande_le: ilYa(1) } } }), NOW)).toBe(null)
    expect(refusDecision(courriel({ payload: { hub_execution: { demande_le: ilYa(0.1), confirme_le: ilYa(0.05) } } }), NOW)).toBe(null)
    expect(refusDecision(courriel(), NOW)).toBe(null)
  })
})

describe('file à traiter', () => {
  it('escalade ou argent, puis plus de 24 h, puis le plus ancien', () => {
    const recent = courriel({ id: 'recent', created_at: ilYa(2) })
    const vieux = courriel({ id: 'vieux', created_at: ilYa(5) })
    const retard = courriel({ id: 'retard', created_at: ilYa(30) })
    const escalade = courriel({ id: 'esc', suggested_action: 'escalader_hugues', created_at: ilYa(1) })
    const argent = courriel({ id: 'argent', created_at: ilYa(4), payload: { subject: 'Demande de remboursement' } })
    expect(trierFile([recent, retard, escalade, vieux, argent], NOW).map(r => r.id)).toEqual(['argent', 'esc', 'retard', 'vieux', 'recent'])
    expect(rangUrgence(courriel({ category: 'Plainte' }), NOW)).toBe(0)
  })
  it('délai d’attente', () => {
    expect(delaiAttente({ created_at: ilYa(0.25) }, NOW)).toBe('15 min')
    expect(delaiAttente({ created_at: ilYa(26.5) }, NOW)).toBe('26 h')
    expect(delaiAttente({ created_at: ilYa(80) }, NOW)).toBe('3 j')
  })
  it('étiquettes', () => {
    const labels = etiquettesDossier(commande({ etape: 'attente_clic_bouton', suggested_action: 'commande' })).map(e => e.label)
    expect(labels).toContain('Bouton jamais posé')
    expect(etiquettesDossier(courriel({ suggested_action: 'escalader_hugues' })).map(e => e.label)).toContain('Escaladé à Hugues')
  })
})

describe('personne', () => {
  it('courriel : contact_email, sinon client_courriel, sinon to', () => {
    expect(courrielDuDossier(courriel())).toBe('julie@example.com')
    expect(courrielDuDossier(commande())).toBe('sophie@example.com')
    expect(courrielDuDossier({ payload: { to: 'x@y.z' } })).toBe('x@y.z')
    expect(courrielDuDossier({ payload: {} })).toBe(null)
  })
  it('nom et sujet', () => {
    expect(nomDuDossier(courriel(), { first_name: 'Julie', last_name: 'Tremblay' })).toBe('Julie Tremblay')
    expect(nomDuDossier(commande())).toBe('Sophie Gagnon')
    expect(nomDuDossier({ payload: {} })).toBe('Inconnu')
    expect(sujetDuDossier(courriel())).toBe('Reçus pour mon assurance')
    expect(sujetDuDossier(commande())).toBe('Commande #8142')
    expect(sujetReponse('Reçus')).toBe('Re: Reçus')
    expect(sujetReponse('RE: Reçus')).toBe('RE: Reçus')
  })
  it('statut : prospect, client actif, ancien client', () => {
    expect(statutPersonne(null, '2026-10-23')).toBe('prospect')
    expect(statutPersonne({ end_date: '2026-12-01', program_finished: false }, '2026-10-23')).toBe('client_actif')
    expect(statutPersonne({ end_date: null, program_finished: false }, '2026-10-23')).toBe('client_actif')
    expect(statutPersonne({ end_date: '2026-09-01', program_finished: false }, '2026-10-23')).toBe('ancien_client')
    expect(statutPersonne({ end_date: '2026-12-01', program_finished: true }, '2026-10-23')).toBe('ancien_client')
    expect(statutPersonne({ end_date: '2026-09-01', end_date_manual: '2026-12-01', program_finished: false }, '2026-10-23')).toBe('client_actif')
  })
  it('semaine du programme', () => {
    expect(semaineProgramme({ start_date: '2026-09-25', end_date: '2027-01-08' }, '2026-10-23')).toBe('Semaine 5 sur 15')
    expect(semaineProgramme({ start_date: null, end_date: '2027-01-08' }, '2026-10-23')).toBe(null)
    expect(semaineProgramme({ start_date: '2026-01-01', end_date: '2026-02-01' }, '2026-10-23')).toBe(null)
  })
})

describe('recherche', () => {
  it.each([
    ['julie@example.com', 'courriel'], ['#8142', 'commande'], ['8142', 'commande'],
    ['450 486-4006', 'telephone'], ['Julie Tremblay', 'nom'], ['a', 'vide'],
  ])('%s → %s', (q, type) => expect(analyserRecherche(q).type).toBe(type))
  it('nettoie ce qui casserait un filtre PostgREST', () => {
    expect(analyserRecherche('Roy, (Nathalie)*').valeur).toBe('Roy Nathalie')
    expect(analyserRecherche('450 486-4006').valeur).toBe('4504864006')
    expect(motifTelephone('4504864006')).toBe('%450%486%4006%')
  })
})

describe('payload pour l’écran', () => {
  it('ne renvoie que les champs utiles', () => {
    const row = courriel({ payload: { ...courriel().payload, ghl_contact_id: 'secret', slack_ts: '1', hub_execution: { jeton: 'j', demande_le: 'x' } } })
    const p = payloadPourEcran(row)
    expect(p.subject).toBeDefined()
    expect(p.ghl_contact_id).toBeUndefined()
    expect(p.slack_ts).toBeUndefined()
    expect(p.hub_execution).toEqual({ action_id: undefined, demande_le: 'x', confirme_le: null })
    expect(dossierPourEcran(row).gmail_message_id).toBeUndefined()
  })
  it('champs absents : pas de crash', () => {
    const r = resumeDossier({ id: 'x', channel: 'commande', decision: 'pending', created_at: ilYa(2) }, null, NOW)
    expect(r.nom).toBe('Inconnu')
    expect(r.statutRecu).toBe('non_cree')
    expect(r.badgeAction).toBe('À traiter à la main')
    expect(formatArgent(undefined)).toBe('non renseigné')
    expect(formatArgent('96.53')).toMatch(/96,53/)
  })
})

describe('texte et html', () => {
  it('paragraphes → <p>, échappé', () => {
    expect(texteVersHtml('Bonjour Julie :)\n\nC’est fait <ok>.\nMerci')).toBe('<p>Bonjour Julie :)</p><p>C’est fait &lt;ok&gt;.<br>Merci</p>')
    expect(texteVersHtml('  ')).toBe('')
  })
  it('html → texte modifiable, aller-retour stable', () => {
    const html = '<p>Bonjour Sam :)</p><p>Pas de souci.</p><p>Cloé<br>NEO Performance</p>'
    expect(htmlVersTexte(html)).toBe('Bonjour Sam :)\n\nPas de souci.\n\nCloé\nNEO Performance')
    expect(texteVersHtml(htmlVersTexte(html))).toBe(html)
  })
  it('texte modifié : la signature html de Léo (lien) est gardée', () => {
    const sig = '<p>Cloé<br>NEO Performance<br><a href="https://neo.ca">neo.ca</a></p>'
    const html = `<p>Bonjour Sam :)</p><p>Pas de souci.</p>${sig}`
    const modifie = htmlVersTexte(html).replace('Pas de souci.', 'Pas de souci, c’est noté.')
    expect(remplacerCorpsHtml(html, modifie)).toBe(`<p>Bonjour Sam :)</p><p>Pas de souci, c’est noté.</p>${sig}`)
    expect(remplacerCorpsHtml(html, 'Bonjour Sam :)\n\nAutre chose.')).toBe('<p>Bonjour Sam :)</p><p>Autre chose.</p>')
    expect(remplacerCorpsHtml(null, 'Salut')).toBe('<p>Salut</p>')
  })
})

describe('Slack', () => {
  it('message : colonnes, sinon slack_ts et canaux connus', () => {
    expect(messageSlack({ channel: 'courriel', slack_channel_id: 'C1', slack_message_ts: '1.2', payload: {} })).toEqual({ ts: '1.2', canaux: ['C1'] })
    expect(messageSlack({ channel: 'commande', payload: { slack_ts: '3.4' } })).toEqual({ ts: '3.4', canaux: ['C0BBE3FLNHF'] })
    expect(messageSlack({ channel: 'courriel', payload: {} })).toBe(null)
  })
  it('« Traité dans le Hub par … », sans bouton', () => {
    const c = corpsSlackTraite({ par: 'Cloé', quand: '2026-10-23T16:00:00Z', resultat: 'Rejeté', sujet: 'Reçus' })
    expect(c.text).toMatch(/^Traité dans le Hub par Cloé le 23 oct\..* : Rejeté$/)
    expect(JSON.stringify(c.blocks)).not.toContain('"button"')
  })
})

describe('dates à Montréal', () => {
  it('début du jour en heure avancée et normale', () => {
    expect(debutJourMontreal(new Date('2026-10-23T16:00:00Z'))).toBe('2026-10-23T04:00:00.000Z')
    expect(debutJourMontreal(new Date('2026-12-15T16:00:00Z'))).toBe('2026-12-15T05:00:00.000Z')
    expect(jourMontreal(new Date('2026-10-24T02:00:00Z'))).toBe('2026-10-23')
  })
})

describe('périmé', () => {
  const now = new Date('2026-10-23T16:00:00Z').getTime()
  const il = (j) => new Date(now - j * 86400000).toISOString()
  it('en attente depuis plus de 7 jours seulement', () => {
    expect(estPerime({ decision: 'pending', created_at: il(7.1) }, now)).toBe(true)
    expect(estPerime({ decision: 'pending', created_at: il(6.9) }, now)).toBe(false)
    expect(estPerime({ decision: 'approved_as_is', created_at: il(30) }, now)).toBe(false)
  })
  it('badge « Périmé, à relire » dans le résumé', () => {
    const r = resumeDossier({ id: 'x', channel: 'courriel', decision: 'pending', created_at: il(9), payload: {} }, null, now)
    expect(r.perime).toBe(true)
    expect(r.etiquettes.map(e => e.label)).toContain('Périmé, à relire')
  })
})
