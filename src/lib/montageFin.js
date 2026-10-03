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
  if (job.statut === 'termine') {
    return { visible: true, desactive: true, raison: 'Ce montage est terminé : ses versions ne peuvent plus être restaurées ici.' }
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

// Bouton « Terminer et exporter ». Retourne { visible, desactive, raison }.
// Pas d'approbation : la personne qui clique valide elle-même.
export function etatTerminer({ job, taches }) {
  if (!job || job.statut === 'termine') return { visible: false, desactive: true, raison: null }
  if (!(job.version_courante > 0)) {
    return { visible: true, desactive: true, raison: 'Il faut une première version avant de pouvoir exporter.' }
  }
  const envoi = etatEnvoi({ job, taches })
  return { visible: true, desactive: envoi.desactive, raison: envoi.raison }
}

export function texteConfirmationTerminer(job) {
  const { dossier, fichier } = cheminExportPrevu(job)
  return `Le rendu HD de la v${job.version_courante} (${dimensionsFinales(job.format)}, 30 images/s) part dans Google Drive, `
    + `dossier ${dossier} (fichier ${fichier}). Ensuite le montage passe à Terminé : plus de demandes, de corrections de sous-titres `
    + 'ni de retour à une version. Aucune approbation : l\'export part dès que le Mac le prend.'
}

// --- Lien d'export -----------------------------------------------------------

// video_jobs.lien_drive_export : l'agent y écrit aujourd'hui le chemin dans
// Drive (NEO vidéo/Out/<nom>/<nom>_v<n>.mp4), pas une URL. Avec la portée
// drive.file, le hub ne peut pas retrouver ce fichier par l'API : le lien
// ouvre une recherche Drive sur son nom exact. Si l'agent écrit un jour une
// URL, elle est prise telle quelle.
export function lienExport(job) {
  const valeur = (job?.lien_drive_export || '').trim()
  if (!valeur) return null
  if (/^https?:\/\//.test(valeur)) return { url: valeur, chemin: null }
  const fichier = valeur.split('/').filter(Boolean).at(-1)
  return {
    url: `https://drive.google.com/drive/search?q=${encodeURIComponent(`"${fichier}"`)}`,
    chemin: valeur,
  }
}
