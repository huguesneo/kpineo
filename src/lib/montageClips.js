// Clips d'un montage (principal et b-roll), sans dépendance à React ni à
// Supabase (testée dans montageClips.test.js). Miroir de video_clips
// (20261003c_montage_video_clips.sql).

export const MAX_CLIPS = 10
export const ROLES_CLIP = {
  principal: 'Principal',
  broll: 'B-roll',
}

let compteur = 0
const cleLocale = () => `clip-${Date.now().toString(36)}-${++compteur}`

// Ajoute un clip à la fin. Le premier clip ajouté est principal, les autres
// b-roll. Au-delà de MAX_CLIPS, la liste ne change pas.
// source = { nom, fichierDriveId, nomSource }
export function ajouterClip(clips, { nom, fichierDriveId, nomSource }) {
  const liste = clips || []
  if (liste.length >= MAX_CLIPS) return liste
  return [...liste, {
    cle: cleLocale(),
    nom: (nom || '').trim() || `Clip ${liste.length + 1}`,
    role: liste.length === 0 ? 'principal' : 'broll',
    fichierDriveId,
    nomSource,
  }]
}

// Déplace le clip d'une case (sens = -1 vers le haut, +1 vers le bas).
export function deplacerClip(clips, cle, sens) {
  const i = clips.findIndex(c => c.cle === cle)
  const j = i + sens
  if (i < 0 || j < 0 || j >= clips.length) return clips
  const res = [...clips]
  ;[res[i], res[j]] = [res[j], res[i]]
  return res
}

export function renommerClip(clips, cle, nom) {
  return clips.map(c => (c.cle === cle ? { ...c, nom } : c))
}

export function changerRoleClip(clips, cle, role) {
  if (!ROLES_CLIP[role]) return clips
  return clips.map(c => (c.cle === cle ? { ...c, role } : c))
}

export function supprimerClip(clips, cle) {
  return clips.filter(c => c.cle !== cle)
}

// Premier clip principal dans l'ordre : il sert de source unique à l'agent
// actuel (video_jobs.fichier_drive_id et nom_source).
export function clipPrincipal(clips) {
  return (clips || []).find(c => c.role === 'principal') ?? null
}

// null si on peut lancer, sinon le message à afficher.
export function validerClips(clips) {
  const liste = clips || []
  if (!liste.length) return "Ajoute au moins une vidéo à l'étape 1."
  if (liste.length > MAX_CLIPS) return `${MAX_CLIPS} clips au plus.`
  if (!clipPrincipal(liste)) return 'Choisis au moins un clip Principal.'
  if (liste.some(c => !(c.nom || '').trim())) return 'Donne un nom à chaque clip.'
  return null
}

// Lignes video_clips à écrire au lancement (ordre 1, 2, 3…).
export function lignesClips(jobId, clips) {
  return clips.map((c, i) => ({
    job_id: jobId,
    ordre: i + 1,
    role: c.role,
    nom: c.nom.trim(),
    fichier_drive_id: c.fichierDriveId,
    nom_source: c.nomSource,
  }))
}

// Liste ordonnée ajoutée au payload de la tâche « montage » (pour l'agent).
export function payloadClips(clips) {
  return clips.map((c, i) => ({
    ordre: i + 1,
    nom: c.nom.trim(),
    role: c.role,
    fichier_drive_id: c.fichierDriveId,
    nom_source: c.nomSource,
  }))
}

// Lignes lues dans video_clips, triées par ordre (éditeur, lecture seule).
export function trierClips(lignes) {
  return [...(lignes || [])].sort((a, b) => a.ordre - b.ordre)
}

// « 12 s », « 1 min 05 s »
export function formatDureeClip(s) {
  if (s == null || Number.isNaN(Number(s))) return null
  const total = Math.round(Number(s))
  if (total < 60) return `${total} s`
  return `${Math.floor(total / 60)} min ${String(total % 60).padStart(2, '0')} s`
}
