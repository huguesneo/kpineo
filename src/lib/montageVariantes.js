// Étape 10b : variantes d'un montage (autre hook, format 4:5 ou 1:1), sans
// dépendance à React ni à Supabase (testée dans montageVariantes.test.js).
// Contrat vérifié dans video-neo/agent/src/taches.ts (variante) :
// - tâche « variante » posée sur le montage d'origine, payload
//   { format?, hook?, prompt? } (au moins un, sinon refus) ;
// - l'agent crée un NOUVEAU montage « <titre> (variante <étiquette>) » à partir
//   de la version actuelle (branche git, clips, sous-titres, session Claude
//   bifurquée), appelle Claude et rend sa v1. L'original ne bouge pas.
// - le lien vers l'origine est video_jobs.variante_de (migration 20261003e),
//   écrit par l'agent seulement.

import { etatEnvoi } from './montageEditeur'

export const HOOK_MAX = 500
export const CONSIGNE_MAX = 1000

// Un seul type à la fois.
export const TYPES_VARIANTE = [
  { cle: 'hook', label: 'Autre hook' },
  { cle: '4:5', label: 'Format 4:5' },
  { cle: '1:1', label: 'Format 1:1' },
]

const FORMATS = ['9:16', '4:5', '1:1']

function formatDe(job) {
  return FORMATS.includes(job?.format) ? job.format : '9:16'
}

// Un format identique à celui du montage serait refusé par l'agent
// (« Choisis un format, un hook ou une consigne ») : on ne le propose pas.
export function typesDisponibles(job) {
  return TYPES_VARIANTE.filter(t => t.cle === 'hook' || t.cle !== formatDe(job))
}

export function validerVariante({ type, texte }) {
  const t = (texte || '').trim()
  if (!TYPES_VARIANTE.some(x => x.cle === type)) return 'Choisis le type de variante.'
  if (type === 'hook') {
    if (!t) return 'Écris le nouveau hook ou ce que tu veux changer dans l\'accroche.'
    if (t.length > HOOK_MAX) return `Le hook est trop long (${HOOK_MAX} caractères au plus).`
    return null
  }
  if (t.length > CONSIGNE_MAX) return `La consigne est trop longue (${CONSIGNE_MAX} caractères au plus).`
  return null
}

// Autre hook : { hook } ; format : { format } et la consigne dans prompt si
// elle est écrite (l'agent la lit dans payload.prompt).
export function tacheVariante(jobId, { type, texte }) {
  const t = (texte || '').trim()
  const payload = type === 'hook' ? { hook: t } : { format: type, ...(t ? { prompt: t } : {}) }
  return { job_id: jobId, type: 'variante', payload }
}

// Même règle que l'agent : « <titre> (variante 4:5) », « (variante hook) ».
export function titreVariantePrevu(job, type) {
  const etiquette = type === 'hook' ? 'hook' : type
  return `${job?.titre || ''} (variante ${etiquette})`
}

// Bouton « Créer une variante » : sur la version actuelle seulement (l'agent
// part de la version actuelle), désactivé pendant une tâche du montage.
// Retourne { visible, desactive, raison }.
export function etatVariante({ job, taches, version }) {
  if (!job || !version || !(job.version_courante > 0) || version.numero !== job.version_courante) {
    return { visible: false, desactive: true, raison: null }
  }
  const envoi = etatEnvoi({ job, taches })
  return { visible: true, desactive: envoi.desactive, raison: envoi.raison }
}

export function texteConfirmationVariante(job, type) {
  return `Le Mac crée un nouveau montage, « ${titreVariantePrevu(job, type)} », à partir de la v${job?.version_courante} `
    + '(mêmes clips, mêmes sous-titres) et prépare sa v1. Ce montage-ci ne change pas.'
}

// Variantes d'un montage (les plus anciennes d'abord), parmi les montages lus.
export function variantesDe(jobId, jobs) {
  return (jobs || [])
    .filter(j => jobId && j.variante_de === jobId)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
}

// Cadre du lecteur selon le format du montage (aperçu 540 de large rendu à
// la taille de la composition : 540 x 960, 540 x 675, 540 x 540).
const CADRES = {
  '9:16': { classe: 'max-w-[340px] aspect-[9/16]', label: '9:16' },
  '4:5': { classe: 'max-w-[440px] aspect-[4/5]', label: '4:5' },
  '1:1': { classe: 'max-w-[480px] aspect-square', label: '1:1' },
}

export function cadreFormat(format) {
  return CADRES[format] || CADRES['9:16']
}
