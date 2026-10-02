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

// --- Phase 2 : direction et lancement ----------------------------------------

// Règle template / prompt (miroir du CHECK video_jobs_template_ou_prompt).
// Retourne null si on peut lancer, sinon le message à afficher.
export function validerDirection({ templateId, prompt }) {
  if (templateId) return null
  if ((prompt || '').trim()) return null
  return 'Choisis un template ou décris ce que tu veux.'
}

export function validerTitre(titre) {
  const t = (titre || '').trim()
  if (!t) return 'Donne un titre à la vidéo.'
  if (t.length > 120) return 'Le titre est trop long (120 caractères au plus).'
  return null
}

// Ligne video_jobs à créer. Le premier passage de l'agent lit le prompt du
// montage : la tâche « montage » part donc avec un payload vide (sinon le
// prompt serait donné deux fois à Claude).
export function nouveauMontage({ titre, fichierDriveId, nomSource, templateId, prompt }) {
  const texte = (prompt || '').trim()
  return {
    titre: titre.trim(),
    fichier_drive_id: fichierDriveId,
    nom_source: nomSource,
    template_id: templateId || null,
    prompt: texte || null,
    format: '9:16',
  }
}

export function premiereTacheMontage(jobId) {
  return { job_id: jobId, type: 'montage', payload: {} }
}

// Erreur Supabase ou réseau → message clair en français.
export function messageErreurLancement(err) {
  const msg = `${err?.message || ''} ${err?.details || ''}`
  if (err?.code === '42501' || /row-level security/i.test(msg)) {
    return "Ton compte n'a pas l'autorisation de créer un montage. Demande à Hugues de vérifier ton accès au module."
  }
  if (/template choisi n'est pas approuvé/i.test(msg)) {
    return "Ce template n'est plus approuvé. Choisis-en un autre ou décris ce que tu veux."
  }
  if (err?.code === '23514' || /video_jobs_template_ou_prompt/.test(msg)) {
    return 'Choisis un template ou décris ce que tu veux.'
  }
  if (/failed to fetch|network|load failed|fetch failed|networkerror/i.test(msg) || err?.name === 'TypeError') {
    return 'La connexion a été coupée. Vérifie ta connexion, puis réessaie : la vidéo est déjà dans Google Drive.'
  }
  return `Le montage ne peut pas être lancé : ${err?.message || 'erreur inconnue'}.`
}

// Dernière tâche de chaque montage (pour afficher un refus de l'agent quand le
// montage lui-même n'est pas en erreur).
export function derniereTacheParJob(taches) {
  const res = {}
  for (const t of taches || []) {
    if (!t.job_id) continue
    const cur = res[t.job_id]
    if (!cur || new Date(t.created_at) > new Date(cur.created_at)) res[t.job_id] = t
  }
  return res
}

// Erreur de l'agent à montrer pour un montage : celle du montage s'il est en
// erreur, sinon celle de sa dernière tâche si elle a échoué.
export function erreurAgent(job, derniereTache) {
  if (job?.statut === 'erreur') return job.erreur || "L'agent a signalé une erreur sans message."
  if (derniereTache?.statut === 'erreur' && derniereTache.erreur) return derniereTache.erreur
  return null
}

// Chemin de l'aperçu de la dernière version (bucket video-apercus).
export function cheminDernierApercu(versions) {
  const avecApercu = (versions || []).filter(v => v.chemin_apercu)
  if (!avecApercu.length) return null
  return avecApercu.reduce((a, b) => (b.numero > a.numero ? b : a)).chemin_apercu
}
