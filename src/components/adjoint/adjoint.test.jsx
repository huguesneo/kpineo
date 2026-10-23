// Page Adjoint, rendue côté serveur (pas de DOM dans les tests du hub) : boutons
// du dossier selon le cas, aperçus, lecture seule, file et fiche.
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Dossier from './Dossier'
import File from './File'
import FichePersonne from './FichePersonne'
import FilGmail, { FilConversation } from './FilGmail'
import { actionPrincipale, resumeDossier } from '../../../supabase/functions/_shared/adjoint.js'

const NOW = new Date('2026-10-23T16:00:00Z').getTime()
const ilYa = (h) => new Date(NOW - h * 3600000).toISOString()
const rien = () => {}

// Comme l'op « dossier » de leo-adjoint
const dossier = (row) => ({ ...row, resume: resumeDossier(row, null, NOW), action: actionPrincipale(row), refus: null })
const rendre = (row, fiche = { statut: 'client_actif' }) => renderToStaticMarkup(<Dossier d={dossier(row)} fiche={fiche} onDecider={rien} />)

const courriel = (o = {}) => ({
  id: 'c1', channel: 'courriel', decision: 'pending', suggested_action: 'repondre', category: 'Client actif/Général',
  contact_email: 'julie@example.com', created_at: ilYa(31), incoming_message: 'Pouvez-vous m’envoyer mes reçus?',
  payload: { to: ['julie@example.com'], subject: 'Reçus pour mon assurance', html: '<p>Bonjour Julie :)</p><p>Pas de souci!</p>' },
  ...o,
})
const commande = (o = {}) => ({
  id: 'k1', channel: 'commande', decision: 'pending', suggested_action: 'commande', category: 'Commandes', created_at: ilYa(3),
  incoming_message: 'Nouvelle commande', recu_quickbooks: null,
  payload: {
    commande: '8142', client_nom: 'Sophie Gagnon', client_courriel: 'sophie@example.com', tps: 4.65, tvq: 9.28, total_woocommerce: 106.92,
    Line: [{ Description: 'Evo Lab - Omega 3', Qty: 1, Amount: 62.99 }, { Description: 'Magnésium', Qty: 1, Amount: 30 }],
  },
  ...o,
})

describe('Dossier à traiter', () => {
  it('courriel avec réponse de Léo : envoyer, modifier, écrire, rédiger, rejeter, déjà traité', () => {
    const html = rendre(courriel())
    for (const t of ['Envoyer la réponse', 'Modifier', 'Écrire une réponse', 'Demander à Léo de rédiger', 'Rejeter', 'Déjà traité à la main',
      'Courriel proposé par Léo', 'Ce qui va se passer quand tu cliques', 'Le courriel part de info@neoperformance.ca à julie@example.com']) {
      expect(html).toContain(t)
    }
  })
  it('sans html (70 dossiers sur 78) : pas de bouton Make, mais écrire et rédiger', () => {
    const html = rendre(courriel({ suggested_action: 'escalader_hugues', payload: { subject: 'Remboursement' } }))
    expect(html).not.toContain('Envoyer la réponse')
    expect(html).not.toContain('accusé de réception</button>')
    expect(html).toContain('Écrire une réponse')
    expect(html).toContain('Demander à Léo de rédiger')
    expect(html).toContain('Déjà traité à la main')
    expect(html).toContain('Escaladé à Hugues')
  })
  it('sans adresse : ni écrire ni rédiger', () => {
    const html = rendre(courriel({ contact_email: null, payload: { subject: 's' } }))
    expect(html).not.toContain('Écrire une réponse')
    expect(html).toContain('Rejeter')
  })
  it('commande prête : aperçu du reçu, lignes, taxes et total', () => {
    const html = rendre(commande())
    for (const t of ['Créer le reçu de vente', 'Reçu de vente #8142', 'Sophie Gagnon', 'Evo Lab - Omega 3', 'TPS', 'TVQ', 'Total WooCommerce']) {
      expect(html).toContain(t)
    }
  })
  it('commande bloquée : pas de « Créer le reçu », raison en évidence', () => {
    const html = rendre(commande({ etape: 'bloque_variante_produit' }))
    expect(html).not.toContain('Créer le reçu de vente')
    expect(html).toContain('Commande bloquée : le reçu ne peut pas être créé')
    expect(html).toContain('Variante de produit à confirmer')
  })
  it('agenda : créneau actuel et options', () => {
    const html = rendre({
      id: 'a1', channel: 'agenda', decision: 'pending', suggested_action: 'repondre', created_at: ilYa(1), contact_email: 'e@x.ca',
      payload: { html: '<p>Bonjour</p>', subject: 'Rappel', conseiller: 'Brice', ancien_creneau: '2026-10-20T11:30:00-04:00', options_proposees: ['2026-10-21T14:15:00-04:00'] },
    })
    expect(html).toContain('Proposer ces créneaux')
    expect(html).toContain('Rendez-vous actuel avec Brice')
    expect(html).toContain('Option proposée')
  })
  it('prospect : carte prospect', () => {
    expect(rendre(courriel(), { statut: 'prospect' })).toContain('Aucune à ce courriel')
  })
})

describe('Dossier déjà traité', () => {
  it('lecture seule : décision, qui, pas de boutons', () => {
    const html = rendre(courriel({ decision: 'approved_modified', payload: { ...courriel().payload, hub_decided_by: 'info@neoperformance.ca', hub_decided_at: ilYa(2) } }))
    expect(html).toContain('Envoyé modifié')
    expect(html).toContain('par info@neoperformance.ca')
    expect(html).toContain('Courriel envoyé')
    expect(html).not.toContain('Rejeter')
    expect(html).not.toContain('Ce qui va se passer')
  })
  it('accusé de Make et écart de prix affichés', () => {
    const html = rendre(commande({ decision: 'approved_as_is', recu_quickbooks: '80053', payload: { ...commande().payload, hub_ack: [{ le: ilYa(1), texte: ':rotating_light: *Débalancement sur la commande #8142*' }] } }))
    expect(html).toContain('Reçu créé')
    expect(html).toContain('QuickBooks #80053')
    expect(html).toContain('Débalancement sur la commande #8142')
  })
})

describe('File et fiche', () => {
  it('file : nom, délai rouge au-delà de 24 h, badge de l’action', () => {
    const html = renderToStaticMarkup(<File dossiers={[resumeDossier(courriel(), null, NOW)]} selection="c1" onChoisir={rien} />)
    expect(html).toContain('julie@example.com')
    expect(html).toContain('31 h')
    expect(html).toContain('text-[#b42318]')
    expect(html).toContain('Réponse')
    expect(renderToStaticMarkup(<File dossiers={[]} onChoisir={rien} />)).toContain('Rien à approuver ici.')
  })
  it('fiche : champs absents « non renseigné », ligne du temps cliquable', () => {
    const html = renderToStaticMarkup(
      <FichePersonne fiche={{ statut: 'prospect', statutLabel: 'Prospect', courriel: 'x@y.ca' }} ligneDuTemps={[resumeDossier(courriel(), null, NOW)]} onOuvrir={rien} onOuvrirPersonne={rien} />,
    )
    expect(html).toContain('Prospect')
    expect(html).toContain('non renseigné')
    expect(html).toContain('Reçus pour mon assurance')
    expect(html).toContain('Ouvrir le dossier complet')
  })
  it('fil Gmail : personne à gauche, info@ à droite, citation repliée, pièces jointes', () => {
    const html = renderToStaticMarkup(<FilConversation messages={[
      { id: '1', sens: 'recu', de: { nom: 'Julie Roy', courriel: 'julie@x.ca' }, date: ilYa(30), html: '<p>Mes reçus</p>', citation: null, piecesJointes: [{ nom: 'assurance.pdf', taille: 52000 }] },
      { id: '2', sens: 'envoye', de: { nom: null, courriel: 'info@neoperformance.ca' }, date: ilYa(2), html: '<p>Voilà</p>', citation: 'Le … a écrit :', piecesJointes: [] },
    ]} />)
    expect(html.indexOf('justify-start')).toBeLessThan(html.indexOf('justify-end'))
    expect(html).toContain('Julie Roy')
    expect(html).toContain('assurance.pdf')
    expect(html).toContain('51 Ko')
    expect(html).toContain('Afficher la citation')
    expect(html).toContain('sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"')
    expect(html).not.toContain('allow-scripts')
  })
  it('dossier avec courriel Gmail : résumé de Léo gardé en petit pendant le chargement', () => {
    const html = renderToStaticMarkup(<FilGmail dossier={{ id: 'c1', incoming_message: 'Veut ses reçus.' }} />)
    expect(html).toContain('Résumé de Léo')
    expect(html).toContain('Veut ses reçus.')
    expect(html).toContain('Chargement du courriel')
  })
})
