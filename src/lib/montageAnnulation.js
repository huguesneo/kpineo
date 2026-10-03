// Bouton « Annuler » sur une tâche de montage, sans dépendance à React ni à
// Supabase (testé dans montageAnnulation.test.js).
//
// Contrat (migration 20261003g_montage_video_annulation.sql) : le hub appelle
// public.video_annuler_tache(id), qui répond :
//   'annulee'       tâche en attente : annulée tout de suite (statut 'annulee') ;
//   'demandee'      tâche en cours : annulation_demandee_le/_par remplis, l'agent
//                   s'arrête proprement puis écrit 'annulee' (ou 'fait' si la
//                   demande arrive après son point de non-retour) ;
//   'deja_demandee' quelqu'un l'a déjà demandée ;
//   'deja_finie'    l'agent a fini (fait, erreur ou annulee) entre-temps.
// enregistrer_style : Hugues seulement (la base refuse les autres).
import { canApproveVideoTemplates } from './montageVideoAccess'

export const COLONNES_ANNULATION = 'annulation_demandee_le, annulation_demandee_par, annulee_le'

const ACTIVES = ['en_attente', 'en_cours']

export function annulationDemandee(tache) {
  return tache?.statut === 'en_cours' && !!tache.annulation_demandee_le
}

// Bouton : { visible, desactive, confirmer }. confirmer : une tâche en cours
// demande une confirmation (le travail du Mac est perdu) ; une tâche en
// attente s'annule d'un clic.
export function etatAnnulation(tache, { email } = {}) {
  if (!tache || !ACTIVES.includes(tache.statut)) return { visible: false, desactive: true, confirmer: false }
  if (tache.type === 'enregistrer_style' && !canApproveVideoTemplates(email)) {
    return { visible: false, desactive: true, confirmer: false }
  }
  if (annulationDemandee(tache)) return { visible: true, desactive: true, confirmer: false }
  return { visible: true, desactive: false, confirmer: tache.statut === 'en_cours' }
}

// Confirmation d'une tâche en cours : { titre, texte, libelleConfirmer }.
export function confirmationAnnulation(tache, job = null) {
  const n = job?.version_courante ?? 0
  switch (tache?.type) {
    case 'terminer':
      return {
        titre: 'Arrêter le rendu HD ?',
        texte: "Le rendu en cours est perdu et rien n'est exporté dans Google Drive. Si le fichier est déjà en route vers Drive, l'export se termine quand même.",
        libelleConfirmer: 'Arrêter le rendu',
      }
    case 'variante':
      return {
        titre: 'Arrêter la variante ?',
        texte: 'Le Mac arrête la création de la variante et supprime le montage en préparation. Ce montage-ci ne change pas.',
        libelleConfirmer: 'Arrêter la variante',
      }
    case 'enregistrer_style':
      return {
        titre: "Arrêter l'enregistrement du style ?",
        texte: "Le Mac arrête et retire ce qu'il a commencé (branche, aperçu). Le template reste approuvé, mais n'entre pas dans la galerie.",
        libelleConfirmer: "Arrêter l'enregistrement",
      }
    default:
      return {
        titre: 'Arrêter cette ronde ?',
        texte: n > 0
          ? `Le Mac arrête le travail en cours. Rien de cette ronde n'est gardé : le montage reste à la v${n}.`
          : "Le Mac arrête le travail en cours. Le montage reste sans version : tu pourras le relancer.",
        libelleConfirmer: 'Arrêter la ronde',
      }
  }
}

function suiteAnnulation(type) {
  if (type === 'terminer') return 'rien ne sera exporté'
  if (type === 'variante') return 'aucune variante ne sera gardée'
  if (type === 'enregistrer_style') return 'le style ne sera pas enregistré'
  return 'aucune nouvelle version ne sera créée'
}

// Texte pendant « annulation en cours » (tâche en cours, demande posée).
export function texteAnnulationEnCours(tache, { enLigne = true } = {}) {
  const suite = suiteAnnulation(tache?.type)
  if (!enLigne) return `Annulation demandée. Le Mac est hors ligne : elle sera faite à son retour, ${suite}.`
  if (tache?.type === 'terminer') return `Annulation en cours… le Mac arrête le rendu, ${suite}.`
  if (tache?.type === 'variante') return `Annulation en cours… le Mac arrête la variante, ${suite}.`
  if (tache?.type === 'enregistrer_style') return `Annulation en cours… le Mac arrête l'enregistrement, ${suite}.`
  return `Annulation en cours… le Mac arrête la ronde, ${suite}.`
}

// Réponse de video_annuler_tache → message à montrer (null : rien à dire, le
// temps réel met la tâche à jour).
export function messageResultatAnnulation(code) {
  if (code === 'deja_finie') return "Trop tard : l'agent avait déjà fini cette tâche."
  return null
}

export function messageErreurAnnulation(err) {
  const msg = `${err?.message || ''} ${err?.details || ''}`
  if (/Seul Hugues/.test(msg)) return "Seul Hugues peut annuler l'enregistrement d'un style."
  if (err?.code === '42501' || /row-level security|Accès refusé|permission denied|droit refusé/i.test(msg)) {
    return "Ton compte n'a pas l'autorisation d'annuler cette tâche."
  }
  if (/failed to fetch|network|load failed|fetch failed|networkerror/i.test(msg) || err?.name === 'TypeError') {
    return "La connexion a été coupée : l'annulation n'est pas partie. Réessaie."
  }
  return `L'annulation n'a pas pu être envoyée : ${err?.message || 'erreur inconnue'}.`
}

// Ligne du fil sous une tâche annulée. avantDebut : la base l'a annulée
// elle-même (en attente), à la même seconde que la demande.
export function texteTacheAnnulee(tache, nom) {
  const qui = nom ? ` par ${nom}` : ''
  const avantDebut = tache?.annulee_le && tache.annulee_le === tache.annulation_demandee_le
  if (avantDebut) return `Annulée${qui} avant que le Mac la commence.`
  if (tache?.type === 'terminer') return `Rendu HD arrêté${qui} : rien n'a été exporté.`
  if (tache?.type === 'variante') return `Variante arrêtée${qui} : aucun nouveau montage n'a été gardé.`
  if (tache?.type === 'enregistrer_style') return `Enregistrement du style arrêté${qui}.`
  return `Ronde arrêtée${qui} : aucune version n'a été créée.`
}

// Annulation demandée trop tard : l'agent avait passé son point de non-retour
// (ou ne connaît pas encore l'annulation) et la tâche a fini en « fait ».
export function texteAnnulationTardive(tache, numero = null) {
  if (tache?.type === 'terminer') return "L'annulation est arrivée trop tard : l'export était déjà dans Google Drive."
  if (tache?.type === 'variante') return "L'annulation est arrivée trop tard : la variante était déjà créée."
  if (tache?.type === 'enregistrer_style') return "L'annulation est arrivée trop tard : le style était déjà enregistré."
  return `L'annulation est arrivée trop tard : la ${numero ? `v${numero}` : 'nouvelle version'} était déjà prête.`
}

// Ronde annulée (en attente) : le texte de la demande, à remettre dans le champ.
export function texteARemettre(tache) {
  if (tache?.type !== 'montage') return null
  const texte = (tache.payload?.prompt || '').trim()
  return texte || null
}
