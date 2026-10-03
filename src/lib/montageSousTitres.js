// Correction des sous-titres à la main dans l'éditeur (étape 8), sans React ni
// Supabase (testée dans montageSousTitres.test.js).
//
// Source : video_versions.sous_titres, copie de public/sous-titres/<nom>.json
// écrite par l'agent à chaque version : { video, motsParLigne, dureeMs,
// mots: [{ texte, debutMs, finMs }] }. L'agent corrige MOT par MOT (tâche
// correction_sous_titres, payload { corrections: [{ mot, texte }] }, `mot` =
// index dans `mots`) sur la version courante ; il ne sait ni ajouter ni
// retirer un mot, et refuse un texte vide.

import { etatEnvoi } from './montageEditeur'

// Règles du skill neo-video-montage (SOUS_TITRES_NEO_CLASSIQUE de video-neo) :
// 5 mots au plus, 24 caractères au plus, une seule ligne.
export const MOTS_MAX_LIGNE = 5
export const LETTRES_MAX_LIGNE = 24

// Mots valides de la version (ceux qui ont un texte et un début), avec leur
// index d'origine : c'est lui que l'agent attend.
export function motsDe(sousTitres) {
  const mots = Array.isArray(sousTitres?.mots) ? sousTitres.mots : []
  return mots
    .map((m, index) => ({ index, texte: typeof m?.texte === 'string' ? m.texte : '', debutMs: Number(m?.debutMs), finMs: Number(m?.finMs) }))
    .filter(m => Number.isFinite(m.debutMs))
}

// Regroupe les mots en lignes comme le gabarit SousTitres de video-neo
// (variante classique) : coupe sur la ponctuation, sur une pause de plus de
// 350 ms, à 5 mots, ou quand le mot suivant ferait dépasser 24 caractères.
export function grouperLignes(mots, { motsMax = MOTS_MAX_LIGNE, lettresMax = LETTRES_MAX_LIGNE } = {}) {
  const lignes = []
  let courante = []
  const fermer = () => {
    lignes.push({
      cle: courante[0].index,
      indices: courante.map(m => m.index),
      debutMs: courante[0].debutMs,
      texte: courante.map(m => m.texte).join(' '),
    })
    courante = []
  }
  mots.forEach((m, i) => {
    courante.push(m)
    const suivant = mots[i + 1]
    const pause = suivant ? suivant.debutMs - m.finMs > 350 : true
    const ponctuation = /[.!?,;:]$/.test(m.texte)
    const longueur = courante.map(x => x.texte).join(' ').length
    const pleine = suivant ? longueur + 1 + suivant.texte.length > lettresMax : false
    if (pause || ponctuation || courante.length >= motsMax || pleine) fermer()
  })
  if (courante.length) fermer()
  return lignes
}

export function lignesDe(sousTitres) {
  return grouperLignes(motsDe(sousTitres))
}

// « 12,3 s » : début d'une ligne, en secondes.
export function formatDebut(ms) {
  return `${(Math.max(0, ms) / 1000).toFixed(1).replace('.', ',')} s`
}

const decouper = (texte) => (texte || '').trim().split(/\s+/).filter(Boolean)

// Avertissements de longueur (n'empêchent pas l'envoi).
export function avertissementsLigne(texte) {
  const t = (texte || '').trim()
  const avertissements = []
  if (/[\r\n]/.test(t)) avertissements.push('Une seule ligne : le retour à la ligne sera remplacé par une espace.')
  const nbMots = decouper(t).length
  if (nbMots > MOTS_MAX_LIGNE) avertissements.push(`${nbMots} mots : ${MOTS_MAX_LIGNE} au plus par ligne.`)
  const nbLettres = decouper(t).join(' ').length
  if (nbLettres > LETTRES_MAX_LIGNE) avertissements.push(`${nbLettres} caractères : ${LETTRES_MAX_LIGNE} au plus par ligne.`)
  return avertissements
}

// Ligne modifiée → corrections mot par mot. Les mots du texte modifié sont
// posés un à un sur les mots d'origine ; s'il y en a plus, les derniers
// rejoignent le dernier mot (son minutage ne change pas). S'il y en a moins,
// c'est refusé : l'agent ne peut pas retirer un mot.
// Retourne { corrections: [{ mot, texte }], erreur }.
export function correctionsLigne(ligne, texteModifie, motsParIndex) {
  const n = ligne.indices.length
  const nouveaux = decouper(texteModifie)
  if (nouveaux.length < n) {
    return {
      corrections: [],
      erreur: n === 1
        ? 'Un sous-titre ne peut pas être vide.'
        : `Garde au moins ${n} mots : l'agent corrige les mots un par un, il ne peut pas en retirer.`,
    }
  }
  const textes = [...nouveaux.slice(0, n - 1), nouveaux.slice(n - 1).join(' ')]
  const corrections = []
  ligne.indices.forEach((mot, i) => {
    if (textes[i] !== motsParIndex.get(mot)?.texte) corrections.push({ mot, texte: textes[i] })
  })
  return { corrections, erreur: null }
}

// Une ligne est modifiée si son brouillon diffère du texte d'origine
// (espaces en trop ignorées).
export function estModifiee(ligne, brouillon) {
  return brouillon !== undefined && decouper(brouillon).join(' ') !== decouper(ligne.texte).join(' ')
}

// Toutes les corrections à envoyer, à partir des brouillons { [cle]: texte }.
// Retourne { corrections (triées par mot), erreurs: { [cle]: message }, modifiees }.
export function correctionsAEnvoyer(sousTitres, brouillons) {
  const mots = motsDe(sousTitres)
  const parIndex = new Map(mots.map(m => [m.index, m]))
  const corrections = []
  const erreurs = {}
  let modifiees = 0
  for (const ligne of grouperLignes(mots)) {
    const brouillon = brouillons?.[ligne.cle]
    if (!estModifiee(ligne, brouillon)) continue
    modifiees += 1
    const r = correctionsLigne(ligne, brouillon, parIndex)
    if (r.erreur) erreurs[ligne.cle] = r.erreur
    else corrections.push(...r.corrections)
  }
  corrections.sort((a, b) => a.mot - b.mot)
  return { corrections, erreurs, modifiees }
}

// Tâche envoyée à l'agent (contrat de video-neo/agent/src/taches.ts,
// correctionSousTitres). Jamais de statut ni de cree_par écrits par le hub.
export function tacheCorrection(jobId, corrections) {
  return { job_id: jobId, type: 'correction_sous_titres', payload: { corrections } }
}

// Peut-on corriger les sous-titres de la version affichée ?
// Retourne { lectureSeule, raison, envoiDesactive, raisonEnvoi }.
// lectureSeule : pas de modification possible (autre version que l'actuelle,
// pas de sous-titres) ; envoiDesactive : en plus, la file ou le statut du
// montage bloquent l'envoi (mêmes règles que le champ de demande).
export function etatCorrection({ job, taches, version }) {
  if (!version) return { lectureSeule: true, raison: null, envoiDesactive: true, raisonEnvoi: null }
  if (!motsDe(version.sous_titres).length) {
    return { lectureSeule: true, raison: "Pas de sous-titres enregistrés pour cette version.", envoiDesactive: true, raisonEnvoi: null }
  }
  if (job?.statut === 'termine') {
    return { lectureSeule: true, raison: 'Ce montage est terminé : ses sous-titres ne peuvent plus être corrigés ici.', envoiDesactive: true, raisonEnvoi: null }
  }
  if (version.numero !== job?.version_courante) {
    return {
      lectureSeule: true,
      raison: `L'agent corrige la version actuelle (v${job?.version_courante}). Affiche-la pour corriger ses sous-titres.`,
      envoiDesactive: true,
      raisonEnvoi: null,
    }
  }
  const envoi = etatEnvoi({ job, taches })
  return { lectureSeule: false, raison: null, envoiDesactive: envoi.desactive, raisonEnvoi: envoi.raison }
}

