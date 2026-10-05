// Confirmation manuelle des rencontres, rendue côté serveur (pas de DOM dans les
// tests du hub) : bouton et demande de confirmation, file « À confirmer » des
// setters, agenda du closeur.
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import ConfirmerRencontre, { PastilleConfirmation } from './ConfirmerRencontre'
import FiltresAConfirmer from './setter/FiltresAConfirmer'
import FileLeads from './setter/FileLeads'
import ListeAujourdhui from './closer/ListeAujourdhui'
import ProchainRdv from './closer/ProchainRdv'
import { CALENDARS } from '../../lib/v2/salesConfig'

const NOW = new Date('2026-10-05T15:00:00Z').getTime()
const h = n => new Date(NOW + n * 3_600_000).toISOString()
const rendre = el => renderToStaticMarkup(<StaticRouter location="/">{el}</StaticRouter>)
const rien = async () => ({ error: null })

describe('ConfirmerRencontre', () => {
  const base = { nom: 'Julie Roy', debut: h(20), now: NOW, onConfirmer: rien, onAnnuler: rien }
  it('non confirmée : bouton, puis demande avec le tag et le message au lead', () => {
    expect(rendre(<ConfirmerRencontre {...base} etat="nonConfirme" />)).toContain('Confirmer la rencontre')
    const html = rendre(<ConfirmerRencontre {...base} etat="nonConfirme" ouvertInitial="confirmer" />)
    expect(html).toContain('alertdialog')
    expect(html).toContain('Confirmer la rencontre de Julie Roy (Demain 7 h 00) ?')
    expect(html).toContain('statut-confirme est posé dans GHL')
    expect(html).toContain('Julie reçoit « Ta rencontre est confirmée. »')
  })
  it('libellé closeur', () => {
    expect(rendre(<ConfirmerRencontre {...base} etat="nonConfirme" libelle="Confirmer manuellement" />)).toContain('Confirmer manuellement')
  })
  it('confirmée depuis le hub : qui, et Annuler la confirmation', () => {
    const html = rendre(<ConfirmerRencontre {...base} etat="confirme" manuelle={{ confirme_par_nom: 'Maude NEO' }} />)
    expect(html).toContain('Confirmé par Maude')
    expect(html).toContain('Annuler la confirmation')
    const dlg = rendre(<ConfirmerRencontre {...base} etat="confirme" manuelle={{ confirme_par_nom: 'Maude NEO' }} ouvertInitial="annuler" />)
    expect(dlg).toContain('Annuler la confirmation de Julie Roy ?')
    expect(dlg).toContain('revient en « RDV booké »')
  })
  it('confirmée par le lead : pas de retrait possible', () => {
    const html = rendre(<ConfirmerRencontre {...base} etat="confirme" />)
    expect(html).toContain('Confirmé par le lead')
    expect(html).not.toContain('Annuler la confirmation')
  })
  it('en cours et erreur', () => {
    expect(rendre(<ConfirmerRencontre {...base} etat="nonConfirme" enCours="confirmer" />)).toContain('Confirmation en cours…')
    expect(rendre(<ConfirmerRencontre {...base} etat="confirmationEnCours" />)).toContain('Confirmation en cours…')
    expect(rendre(<ConfirmerRencontre {...base} etat="nonConfirme" erreur="Cette rencontre n’est pas à ton agenda." />))
      .toContain('role="alert"')
  })
  it('pastilles', () => {
    expect(rendre(<PastilleConfirmation etat="confirme" />)).toContain('Confirmé')
    expect(rendre(<PastilleConfirmation etat="nonConfirme" />)).toContain('Non confirmé')
    expect(rendre(<PastilleConfirmation etat={null} />)).toBe('')
  })
})

describe('FiltresAConfirmer', () => {
  it('deux groupes, filtre actif marqué', () => {
    const html = rendre(<FiltresAConfirmer filtres={{ confirmation: 'nonConfirmes', appel: 'tous' }} onChange={() => {}} />)
    expect(html).toContain('Non confirmés')
    expect(html).toContain('Pas appelés')
    expect(html).toMatch(/aria-pressed="true"[^>]*>Non confirmés</)
  })
  it('journal d’appels indisponible : filtres d’appel désactivés', () => {
    const html = rendre(<FiltresAConfirmer filtres={{ confirmation: 'tous', appel: 'tous' }} onChange={() => {}} appelsIndisponibles="Portée manquante" />)
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Appelés</)
  })
})

describe('File « À confirmer »', () => {
  const file = {
    cle: 'aConfirmer', titre: 'À confirmer', sousTitre: '', couleur: '#f59e0b', compteurBg: '', compteurColor: '',
    rdvLabel: 'RDV', videTitre: 'Vide', videTexte: '', triInitial: null, confirmation: true,
    rdv: l => ({ texte: l.rdvAVenir ? 'Demain 7 h 00' : 'Aucun RDV à venir', couleur: '#1a1a1a' }),
  }
  const lead = (id, extra = {}) => ({
    key: id, contactId: id, nom: `Lead ${id}`, source: 'VSL', setter: 'Maude NEO', closeur: 'Pascal NEO',
    rdvAVenir: true, confirmation: 'nonConfirme', appel: { nb: 0, dernier: null },
    rdvRef: { ghlId: `r-${id}`, start: h(16) }, ...extra,
  })
  const actions = { etats: {}, ouvrirFiche: () => {}, prendreRdv: () => {}, annuler: () => {} }
  const confirmation = { manuelles: {}, enCours: {}, erreurs: {}, confirmer: rien, annuler: rien }
  const rendreFile = (leads, extra = {}) => rendre(
    <FileLeads file={file} leads={leads} userId="u" locks={[]} actions={actions} now={NOW} confirmation={confirmation} {...extra} />)

  it('colonnes Setter, Appel, Confirmation et bouton à la place de Prendre un rendez-vous', () => {
    const html = rendreFile([lead('a'), lead('b', { confirmation: 'confirme', appel: { nb: 1, dernier: { date: h(-2), statut: 'completed', duree: 40 } } })])
    expect(html).toContain('>Setter<')
    expect(html).toContain('>Appel<')
    expect(html).toContain('>Confirmation<')
    expect(html).toContain('Maude NEO')
    expect(html).toContain('Confirmer la rencontre')
    expect(html).not.toContain('Prendre un rendez-vous')
    expect(html).toContain('Pas appelé')
    expect(html).toContain('Auj. 9 h 00 · répondu 40 s')
    expect(html).toContain('Confirmé par le lead')
    expect(html).not.toContain('Tentatives')
  })
  it('sans RDV à venir : pas de bouton', () => {
    const html = rendreFile([lead('c', { rdvAVenir: false, confirmation: null, rdvRef: null })])
    expect(html).toContain('Aucun RDV à venir')
    expect(html).not.toContain('Confirmer la rencontre')
  })
  it('compteur = non confirmés, barre de filtres affichée', () => {
    const html = rendreFile([lead('a'), lead('b')], { compteur: 1, barre: <div>BARRE</div> })
    expect(html).toContain('BARRE')
    expect(html).toMatch(/>1<\/span>/)
  })
})

describe('Agenda closeur', () => {
  const appt = (id, start, extra = {}) => ({
    ghl_id: id, contact_id: `c-${id}`, contact_name: `Prospect ${id}`, start_time: start,
    status: 'confirmed', calendar_id: CALENDARS.decouverteCloseurs, ...extra,
  })
  const confirmations = etats => ({
    etatDe: a => etats[a.ghl_id] ?? null,
    confirmation: { manuelles: {}, enCours: {}, erreurs: {}, confirmer: rien, annuler: rien },
  })

  it('liste du jour : nom ambre et pastille pour une rencontre à venir non confirmée, vert si confirmée', () => {
    const jour = { epingles: [], lignes: [
      { appt: appt('x', h(2)), etat: 'prochain' },
      { appt: appt('y', h(4)), etat: 'aVenir' },
      { appt: appt('z', h(-1)), etat: 'enCours' },
    ] }
    const html = rendre(<ListeAujourdhui jour={jour} now={NOW} onStatuer={rien} confirmations={confirmations({ x: 'nonConfirme', y: 'confirme' })} />)
    expect(html).toContain('title="Confirmer manuellement"')
    expect(html).toContain('color:#b45309')
    expect(html).toContain('color:#047857')
    expect(html).toContain('Non confirmé')
    expect(html).toContain('Confirmé')
    // Rencontre commencée : nom simple, pas de clic
    expect(html).toMatch(/<span class="text-sm font-semibold flex-1 min-w-0 truncate"[^>]*>Prospect z<\/span>/)
  })

  it('prochain RDV : pastille de la carte Vente, plus le statut GHL', () => {
    const a = appt('x', h(2))
    const non = rendre(<ProchainRdv appt={a} opps={[]} now={NOW} confirmations={confirmations({ x: 'nonConfirme' })} />)
    expect(non).toContain('Non confirmé')
    expect(non).not.toContain('Pas encore confirmé')
    const oui = rendre(<ProchainRdv appt={a} opps={[]} now={NOW} confirmations={confirmations({ x: 'confirme' })} />)
    expect(oui).toContain('Confirmé')
    // Statut GHL « confirmed » sans état de carte : aucune pastille trompeuse
    const sans = rendre(<ProchainRdv appt={a} opps={[]} now={NOW} />)
    expect(sans).not.toContain('Confirmé')
  })
})
