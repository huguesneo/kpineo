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

// --- Après la v1 : ajouter ou remplacer un clip (20261003f) --------------------
// Un clip n'est jamais modifié ni supprimé : le nouveau clip porte
// remplace_ordre (l'ordre du clip qu'il remplace). La base donne l'ordre
// (le suivant) et refuse pendant un rendu final.

// { [ordre du clip remplacé]: clip qui le remplace }
export function remplacements(lignes) {
  return Object.fromEntries((lignes || []).filter(c => c.remplace_ordre != null).map(c => [c.remplace_ordre, c]))
}

export function clipsActifs(lignes) {
  const r = remplacements(lignes)
  return trierClips(lignes).filter(c => !r[c.ordre])
}

export const RAISON_RENDU_CLIPS = 'Un rendu final est en cours : attends la fin pour ajouter ou remplacer un clip.'

// Boutons « Ajouter un clip » et « Remplacer » de l'éditeur.
// Retourne { visible, desactive, raison, avertissement }.
export function etatAjoutClip({ job, taches, clips }) {
  if (!job || !(job.version_courante > 0)) return { visible: false, desactive: true, raison: null, avertissement: null }
  const rendu = job.statut === 'rendu'
    || (taches || []).some(t => t.type === 'terminer' && ['en_attente', 'en_cours'].includes(t.statut))
  if (rendu) return { visible: true, desactive: true, raison: RAISON_RENDU_CLIPS, avertissement: null }
  if ((clips || []).length >= MAX_CLIPS) {
    return { visible: true, desactive: true, raison: `${MAX_CLIPS} clips au plus par montage, clips remplacés compris.`, avertissement: null }
  }
  const avertissement = job.statut === 'termine'
    ? `Le fichier exporté reste la v${job.version_courante}, il faudra Terminer de nouveau.`
    : null
  return { visible: true, desactive: false, raison: null, avertissement }
}

// Ligne video_clips envoyée par l'éditeur. L'ordre est recalculé par la base.
export function ligneAjoutClip(jobId, clips, { nom, role, fichierDriveId, nomSource, remplaceOrdre = null }) {
  const max = Math.max(0, ...(clips || []).map(c => c.ordre))
  return {
    job_id: jobId,
    ordre: max + 1,
    role: ROLES_CLIP[role] ? role : 'broll',
    nom: (nom || '').trim(),
    fichier_drive_id: fichierDriveId,
    nom_source: nomSource,
    remplace_ordre: remplaceOrdre,
  }
}

// Phrase pré-remplie dans la demande (aucune ronde ne part toute seule).
// clip : la ligne créée ; remplace : le clip remplacé (ou null) ; clips : avant l'ajout.
export function phraseAjoutClip(clip, remplace, clips) {
  const nouveau = `le clip ${clip.ordre} « ${clip.nom} »`
  const principal = clip.role === 'principal'
  const transcription = principal
    ? ' Coupe-le et transcris-le comme les autres clips Principal, puis mets à jour les sous-titres.'
    : ''
  if (remplace) {
    return `Remplace le clip ${remplace.ordre} « ${remplace.nom} » par ${nouveau} : mets ${principal ? 'le nouveau' : 'ce B-roll'} à sa place et n'utilise plus le clip ${remplace.ordre}.${transcription}`
  }
  if (principal) {
    const dernier = clipsActifs(clips).filter(c => c.role === 'principal').pop()
    const apres = dernier ? `, après le clip ${dernier.ordre} « ${dernier.nom} »` : ''
    return `Ajoute ${nouveau} (Principal) à la fin de la vidéo${apres}.${transcription}`
  }
  return `Ajoute le B-roll « ${clip.nom} » (clip ${clip.ordre}) là où il sert le mieux le propos.`
}

// Refus de la base ou coupure, en clair.
export function messageErreurClip(err) {
  const msg = `${err?.message || ''} ${err?.details || ''}`
  if (err?.code === '42501' || /row-level security/i.test(msg)) {
    return "Ton compte n'a pas l'autorisation d'ajouter un clip. Demande à Hugues de vérifier ton accès au module."
  }
  if (err?.code === '23505') return "Un autre clip vient d'être ajouté à ce montage : réessaie."
  if (/failed to fetch|network|load failed|fetch failed|networkerror/i.test(msg) || err?.name === 'TypeError') {
    return "La connexion a été coupée : le clip n'est pas enregistré. La vidéo reste dans Brut, réessaie."
  }
  return `Le clip n'a pas pu être enregistré : ${err?.message || 'erreur inconnue'}.`
}
