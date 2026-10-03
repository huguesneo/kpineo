// Étape 9 de l'éditeur : restaurer une version et terminer (export HD dans
// Drive), sans dépendance à React ni à Supabase (testée dans montageFin.test.js).
// Contrat vérifié dans video-neo/agent/src/taches.ts (restaurer, terminer) et
// agent/src/drive.ts (cheminExport).

import { etatEnvoi } from './montageEditeur'

// --- Restaurer ---------------------------------------------------------------

// L'agent lit payload.version (k >= 1, différente de la version actuelle).
export function tacheRestaurer(jobId, numero) {
  return { job_id: jobId, type: 'restaurer', payload: { version: numero } }
}

// Bouton « Restaurer cette version » sous la bande : seulement pour une
// ancienne version affichée. Retourne { visible, desactive, raison }.
export function etatRestaurer({ job, taches, version }) {
  if (!job || !version || !(job.version_courante > 0) || version.numero === job.version_courante) {
    return { visible: false, desactive: true, raison: null }
  }
  const envoi = etatEnvoi({ job, taches })
  return { visible: true, desactive: envoi.desactive, raison: envoi.raison }
}

// Ce que fait vraiment l'agent : il recopie la version k en une nouvelle
// version n+1 (fichiers du commit, aperçu, sous-titres). Il ne supprime rien.
export function texteConfirmationRestaurer(numero, versionCourante) {
  const nouvelle = versionCourante + 1
  return `Ça crée une nouvelle version, v${nouvelle}, identique à la v${numero} (même montage, mêmes sous-titres, même aperçu). `
    + `Les versions v1 à v${versionCourante} restent dans la bande : rien n'est perdu. Les clips ne changent pas.`
}

// --- Terminer ----------------------------------------------------------------

// Payload vide : l'agent exporte toujours la version actuelle.
export function tacheTerminer(jobId) {
  return { job_id: jobId, type: 'terminer', payload: {} }
}

// Taille du rendu final : celle de la composition (agent/src/prompts.ts, DIMENSIONS).
const DIMENSIONS = { '9:16': '1080 x 1920', '4:5': '1080 x 1350', '1:1': '1080 x 1080' }

export function dimensionsFinales(format) {
  return DIMENSIONS[format] || DIMENSIONS['9:16']
}

// Même règle que nomExport dans agent/src/drive.ts.
export function nomExport(titre) {
  return (titre || '').replace(/[/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'video'
}

export function cheminExportPrevu(job) {
  const nom = nomExport(job?.titre)
  return { dossier: `NEO vidéo/Out/${nom}/`, fichier: `${nom}_v${job?.version_courante}.mp4` }
}

export const RAISON_DEJA_EXPORTEE = 'Cette version est déjà exportée, fais un changement pour créer une nouvelle version.'

// Bouton « Terminer et exporter ». Retourne { visible, desactive, raison }.
// Pas d'approbation : la personne qui clique valide elle-même. Un montage
// terminé peut être réexporté après un changement (nouvelle version) ;
// l'agent refuse de réexporter la même version (le fichier existe déjà).
export function etatTerminer({ job, taches, versions }) {
  if (!job) return { visible: false, desactive: true, raison: null }
  if (!(job.version_courante > 0)) {
    return { visible: true, desactive: true, raison: 'Il faut une première version avant de pouvoir exporter.' }
  }
  const envoi = etatEnvoi({ job, taches })
  if (envoi.desactive) return { visible: true, desactive: true, raison: envoi.raison }
  if (versionExportee({ job, versions, taches }) === job.version_courante) {
    return { visible: true, desactive: true, raison: RAISON_DEJA_EXPORTEE }
  }
  return { visible: true, desactive: false, raison: null }
}

export function texteConfirmationTerminer(job) {
  const { dossier, fichier } = cheminExportPrevu(job)
  return `Le rendu HD de la v${job.version_courante} (${dimensionsFinales(job.format)}, 30 images/s) part dans Google Drive, `
    + `dossier ${dossier} (fichier ${fichier}). Ensuite le montage passe à Terminé. Tu pourras encore demander des changements : `
    + 'un nouvel export créera un autre fichier à côté, sans écraser celui-ci. Aucune approbation : l\'export part dès que le Mac le prend.'
}

// --- Lien d'export -----------------------------------------------------------

// video_jobs.lien_drive_export : l'agent y écrit aujourd'hui le chemin dans
// Drive (NEO vidéo/Out/<nom>/<nom>_v<n>.mp4), pas une URL. Avec la portée
// drive.file, le hub ne peut pas retrouver ce fichier par l'API : le lien
// ouvre une recherche Drive sur son nom (sans guillemets : la recherche avec
// guillemets ne trouve rien, format vérifié par Hugues). Si l'agent écrit un
// jour une URL, elle est prise telle quelle.
export function lienExport(job) {
  const valeur = (job?.lien_drive_export || '').trim()
  if (!valeur) return null
  if (/^https?:\/\//.test(valeur)) return { url: valeur, chemin: null, fichier: null }
  const fichier = valeur.split('/').filter(Boolean).at(-1)
  return {
    url: `https://drive.google.com/drive/search?safe=strict&q=${encodeURIComponent(fichier)}`,
    chemin: valeur,
    fichier,
  }
}

// Numéro de la version du dernier export, ou null si inconnu. Le nom du
// fichier le donne (<nom>_v<n>.mp4) ; avec une URL, on prend la version
// actuelle au moment de la dernière tâche terminer réussie.
export function versionExportee({ job, versions, taches }) {
  const lien = lienExport(job)
  if (!lien) return null
  const n = lien.fichier?.match(/_v(\d+)\.mp4$/i)
  if (n) return Number(n[1])
  const dernier = [...(taches || [])]
    .filter(t => t.type === 'terminer' && t.statut === 'fait')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
  if (!dernier) return null
  const avant = (versions || []).filter(v => new Date(v.created_at) <= new Date(dernier.created_at))
  return avant.length ? Math.max(...avant.map(v => v.numero)) : null
}

// « Dernier export » de l'éditeur : fichier, version exportée et si c'est
// la version actuelle.
export function infoDernierExport({ job, versions, taches }) {
  const lien = lienExport(job)
  if (!lien) return null
  const version = versionExportee({ job, versions, taches })
  const actuelle = version != null && version === job.version_courante
  let detail = null
  if (actuelle) detail = `export de la version actuelle (v${version})`
  else if (version != null) detail = `export de v${version}, version actuelle : v${job.version_courante}`
  return { ...lien, version, actuelle, detail }
}
