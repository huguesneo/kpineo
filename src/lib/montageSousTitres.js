// Correction des sous-titres à la main dans l'éditeur (étape 8), sans React ni
// Supabase (testée dans montageSousTitres.test.js).
//
// Source : video_versions.sous_titres, copie de public/sous-titres/<nom>.json
// écrite par l'agent à chaque version : { video, motsParLigne, dureeMs,
// mots: [{ texte, debutMs, finMs }] }. L'agent corrige MOT par MOT (tâche
// correction_sous_titres, payload { corrections: [{ mot, texte } ou
// { mot, supprimer: true }] }, `mot` = index dans `mots`) sur la version
// courante. Tous les numéros d'une tâche sont ceux d'avant la tâche. Il refuse
// un texte vide, un mot corrigé et supprimé, la suppression de tous les mots ;
// il ne sait pas ajouter un mot. Après une suppression, les numéros changent :
// on ne corrige qu'à partir des sous-titres de la version actuelle, relue.

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

// Forme comparable d'un mot : minuscules, sans accents ni ponctuation.
const normaliser = (texte) => (texte || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

// Ressemblance entre un mot d'origine et un mot tapé (pour savoir lequel a été
// retiré) : identique 4, identique à la ponctuation et aux accents près 3,
// sinon la part de début commun (0 à 1).
function ressemblance(a, b) {
  if (a === b) return 4
  const na = normaliser(a)
  const nb = normaliser(b)
  if (na && na === nb) return 3
  let commun = 0
  while (commun < na.length && commun < nb.length && na[commun] === nb[commun]) commun += 1
  return commun / Math.max(na.length, nb.length, 1)
}

// Avec moins de mots qu'à l'origine : quels mots d'origine garder (dans
// l'ordre) pour porter les mots tapés ? Celui qui ressemble le plus est gardé,
// les autres sont retirés. Retourne les positions gardées (dans la ligne).
function motsGardes(origines, nouveaux) {
  const n = origines.length
  const m = nouveaux.length
  // score[i][j] : meilleur score avec i mots d'origine et j mots tapés.
  const score = Array.from({ length: n + 1 }, () => Array(m + 1).fill(-Infinity))
  for (let i = 0; i <= n; i++) score[i][0] = 0
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= Math.min(i, m); j++) {
      score[i][j] = Math.max(score[i - 1][j], score[i - 1][j - 1] + ressemblance(origines[i - 1], nouveaux[j - 1]))
    }
  }
  const gardes = []
  for (let i = n, j = m; j > 0; i--) {
    if (score[i - 1][j - 1] + ressemblance(origines[i - 1], nouveaux[j - 1]) >= score[i - 1][j]) {
      gardes.unshift(i - 1)
      j -= 1
    }
  }
  return gardes
}

// Ligne modifiée → corrections mot par mot. Même nombre de mots ou plus : les
// mots du texte modifié sont posés un à un sur les mots d'origine ; s'il y en a
// plus, les derniers rejoignent le dernier mot (son minutage ne change pas).
// Moins de mots : les mots retirés sont ceux qui ressemblent le moins au texte
// tapé ({ mot, supprimer: true }) ; une ligne vidée retire tous ses mots.
// Retourne { corrections: [{ mot, texte } | { mot, supprimer: true }], erreur }.
export function correctionsLigne(ligne, texteModifie, motsParIndex) {
  const n = ligne.indices.length
  const nouveaux = decouper(texteModifie)
  const origines = ligne.indices.map(mot => motsParIndex.get(mot)?.texte ?? '')
  const corrections = []
  if (nouveaux.length < n) {
    const gardes = motsGardes(origines, nouveaux)
    ligne.indices.forEach((mot, i) => {
      const k = gardes.indexOf(i)
      if (k === -1) corrections.push({ mot, supprimer: true })
      else if (nouveaux[k] !== origines[i]) corrections.push({ mot, texte: nouveaux[k] })
    })
    return { corrections, erreur: null }
  }
  const textes = [...nouveaux.slice(0, n - 1), nouveaux.slice(n - 1).join(' ')]
  ligne.indices.forEach((mot, i) => {
    if (textes[i] !== origines[i]) corrections.push({ mot, texte: textes[i] })
  })
  return { corrections, erreur: null }
}

export const nbSuppressions = (corrections) => (corrections || []).filter(c => c?.supprimer === true).length

// Garde-fous avant l'envoi (mêmes refus que l'agent) : un mot à la fois
// corrigé et retiré, ou tous les mots retirés. totalMots = longueur de `mots`
// dans le fichier (c'est le compte de l'agent). Retourne un message ou null.
export function erreurCorrections(corrections, totalMots) {
  const corriges = new Set()
  const retires = new Set()
  for (const c of corrections || []) (c?.supprimer === true ? retires : corriges).add(c?.mot)
  if ([...retires].some(m => corriges.has(m))) {
    return 'Un même mot ne peut pas être à la fois corrigé et retiré. Annule tes changements et recommence.'
  }
  if (totalMots > 0 && retires.size >= totalMots) {
    return 'Tu ne peux pas retirer tous les mots des sous-titres : garde au moins un mot.'
  }
  return null
}

// Une ligne est modifiée si son brouillon diffère du texte d'origine
// (espaces en trop ignorées).
export function estModifiee(ligne, brouillon) {
  return brouillon !== undefined && decouper(brouillon).join(' ') !== decouper(ligne.texte).join(' ')
}

// Toutes les corrections à envoyer, à partir des brouillons { [cle]: texte }.
// Retourne { corrections (triées par mot), erreurs: { [cle]: message },
// erreur (garde-fou sur l'ensemble, voir erreurCorrections), modifiees }.
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
  const totalMots = Array.isArray(sousTitres?.mots) ? sousTitres.mots.length : 0
  return { corrections, erreurs, erreur: erreurCorrections(corrections, totalMots), modifiees }
}

// Tâche envoyée à l'agent (contrat de video-neo/agent/src/taches.ts,
// correctionSousTitres). Jamais de statut ni de cree_par écrits par le hub.
// Les garde-fous sont revérifiés ici : une tâche fautive ne part pas.
export function tacheCorrection(jobId, corrections, totalMots) {
  const erreur = erreurCorrections(corrections, totalMots)
  if (erreur) throw Object.assign(new Error(erreur), { clair: true })
  return { job_id: jobId, type: 'correction_sous_titres', payload: { corrections } }
}

// Juste avant l'envoi, avec le montage, sa version actuelle et ses tâches
// actives relus dans la base : les corrections ont-elles été faites sur les
// sous-titres de la version actuelle ? Sinon les numéros de mots ne valent
// plus (une suppression les décale) : refus, il faut refaire les corrections
// sur les sous-titres relus. Retourne un message ou null.
export function erreurBase({ numeroBase, job, tachesActives }) {
  if (!job) return "Ce montage n'existe plus."
  if (tachesActives?.length) {
    return "Une autre demande vient d'être envoyée sur ce montage : attends sa nouvelle version, puis refais tes corrections sur ses sous-titres."
  }
  if (job.version_courante !== numeroBase) {
    return `Une nouvelle version (v${job.version_courante}) est arrivée pendant tes corrections : ses sous-titres ont été rechargés, refais tes corrections dessus.`
  }
  return null
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

