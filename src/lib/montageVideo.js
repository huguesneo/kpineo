// Logique du module Montage vidéo, sans dépendance à React ni à Supabase
// (testée dans montageVideo.test.js).

// Plus de 90 s sans heartbeat de l'agent (écrit toutes les 30 s) = Mac hors ligne.
export const AGENT_HORS_LIGNE_APRES_MS = 90 * 1000

export function isAgentEnLigne(dernierSignal, maintenant = Date.now()) {
  if (!dernierSignal) return false
  const t = new Date(dernierSignal).getTime()
  if (Number.isNaN(t)) return false
  return maintenant - t < AGENT_HORS_LIGNE_APRES_MS
}

export const STATUTS_MONTAGE = {
  en_file:       { label: "En file d'attente", variant: 'default' },
  transcription: { label: 'Transcription',     variant: 'primary' },
  montage:       { label: 'Montage en cours',  variant: 'primary' },
  apercu_pret:   { label: 'Aperçu prêt',       variant: 'warning' },
  rendu:         { label: 'Rendu final',       variant: 'primary' },
  termine:       { label: 'Terminé',           variant: 'success' },
  erreur:        { label: 'Erreur',            variant: 'danger' },
}

export function statutMontage(statut) {
  return STATUTS_MONTAGE[statut] ?? { label: statut || 'Inconnu', variant: 'default' }
}

// Statuts où l'agent travaille sur le montage en ce moment.
export const STATUTS_EN_TRAITEMENT = ['transcription', 'montage', 'rendu']

// Position de chaque montage en attente : 1 = le prochain, selon created_at
// (à égalité, l'id départage pour un ordre stable).
export function positionsFile(jobs) {
  const enFile = (jobs || [])
    .filter(j => j.statut === 'en_file')
    .sort((a, b) => {
      const d = new Date(a.created_at) - new Date(b.created_at)
      return d !== 0 ? d : String(a.id).localeCompare(String(b.id))
    })
  const positions = {}
  enFile.forEach((j, i) => { positions[j.id] = i + 1 })
  return positions
}

// « 1er », « 2e », « 3e »…
export function rangFr(n) {
  return n === 1 ? '1er' : `${n}e`
}

// Lignes de video_config → réglages du dossier Brut.
export const CLE_DOSSIER_BRUT_ID = 'dossier_brut_id'
export const CLE_DOSSIER_BRUT_NOM = 'dossier_brut_nom'

export function lireDossierBrut(lignes) {
  const valeurs = Object.fromEntries((lignes || []).map(l => [l.cle, l.valeur]))
  const id = typeof valeurs[CLE_DOSSIER_BRUT_ID] === 'string' ? valeurs[CLE_DOSSIER_BRUT_ID] : null
  const nom = typeof valeurs[CLE_DOSSIER_BRUT_NOM] === 'string' ? valeurs[CLE_DOSSIER_BRUT_NOM] : null
  return id ? { id, nom: nom || 'Dossier sans nom' } : null
}

// Lien Drive à afficher pour un montage : l'export s'il est une URL, sinon la
// vidéo source (fichier_drive_id). lien_drive_export est aujourd'hui un chemin
// dans Drive (NEO vidéo/Out/…), affiché tel quel par l'écran.
export function lienDriveMontage(job) {
  if (job?.lien_drive_export && /^https?:\/\//.test(job.lien_drive_export)) {
    return { url: job.lien_drive_export, label: 'Vidéo finale' }
  }
  if (job?.fichier_drive_id) {
    return {
      url: `https://drive.google.com/file/d/${encodeURIComponent(job.fichier_drive_id)}/view`,
      label: 'Vidéo source',
    }
  }
  return null
}
