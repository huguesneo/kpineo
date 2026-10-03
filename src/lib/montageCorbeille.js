// Corbeille des montages, sans dépendance à React ni à Supabase (testée dans
// montageCorbeille.test.js).
//
// Contrat (migration 20261003h_montage_video_corbeille.sql) :
//   video_jobs.supprime_le / supprime_par : le montage est dans la corbeille.
//   public.video_supprimer_montage(id) → 'supprime' ou 'deja_supprime' ;
//     refusé (« Annule d'abord la demande en cours ») si une tâche du montage
//     est en attente ou en cours.
//   public.video_restaurer_montage(id) → 'restaure' ou 'pas_supprime'.
// Suppression douce : clips, versions, tâches, branche git, aperçus et exports
// Drive restent. Un montage dans la corbeille ne reçoit ni tâche ni clip.

export const RAISON_CORBEILLE = 'Ce montage est dans la corbeille : restaure-le pour le modifier.'
export const RAISON_TACHE_ACTIVE = "Annule d'abord la demande en cours."

const ACTIVES = ['en_attente', 'en_cours']

export function estSupprime(job) {
  return !!job?.supprime_le
}

// { actifs, corbeille } : la liste normale (ordre gardé) et la corbeille, la
// dernière suppression d'abord.
export function separerCorbeille(jobs) {
  const actifs = []
  const corbeille = []
  for (const j of jobs || []) (estSupprime(j) ? corbeille : actifs).push(j)
  corbeille.sort((a, b) => new Date(b.supprime_le) - new Date(a.supprime_le))
  return { actifs, corbeille }
}

// Bouton « Supprimer » : { visible, desactive, raison }. taches : celles du
// montage (toutes, ou la dernière seulement dans la liste).
export function etatSuppression({ job, taches }) {
  if (!job || estSupprime(job)) return { visible: false, desactive: true, raison: null }
  if ((taches || []).some(t => t && t.job_id === job.id && ACTIVES.includes(t.statut))) {
    return { visible: true, desactive: true, raison: RAISON_TACHE_ACTIVE }
  }
  return { visible: true, desactive: false, raison: null }
}

// Texte de la confirmation. nbVariantes : variantes hors corbeille.
export function confirmationSuppression(job, nbVariantes = 0) {
  const variantes = nbVariantes > 0
    ? ` ${nbVariantes > 1 ? `Ses ${nbVariantes} variantes restent` : 'Sa variante reste'} dans la liste.`
    : ''
  return {
    titre: `Mettre « ${job?.titre || 'ce montage'} » à la corbeille ?`,
    texte: "Il disparaît de la liste et de la file. Rien n'est effacé : versions, clips et aperçus sont gardés, "
      + 'et tu peux le restaurer depuis la Corbeille. Les exports déjà dans Google Drive ne sont pas touchés.'
      + variantes,
    libelleConfirmer: 'Mettre à la corbeille',
  }
}

// Montage tel que la base vient de le laisser, sans attendre le temps réel.
export function apresCorbeille(job, code, { email = '', maintenant = new Date().toISOString() } = {}) {
  if (code === 'supprime') return { ...job, supprime_le: maintenant, supprime_par: email }
  if (code === 'restaure') return { ...job, supprime_le: null, supprime_par: null }
  return job
}

// Origine d'une variante pour « Variante de … » : { id, titre, supprime }.
// tous : tous les montages lus, corbeille comprise.
export function origineDe(job, tous) {
  if (!job?.variante_de) return null
  const o = (tous || []).find(j => j.id === job.variante_de)
  return o ? { id: o.id, titre: o.titre, supprime: estSupprime(o) } : { id: job.variante_de, titre: null, supprime: false }
}

export function messageErreurCorbeille(err) {
  const msg = `${err?.message || ''} ${err?.details || ''}`
  if (/annule d'abord/i.test(msg)) return "Annule d'abord la demande en cours, puis supprime le montage."
  if (/accès refusé|permission denied|droit refusé|42501/i.test(msg) || err?.code === '42501') {
    return "Ton compte n'a pas l'autorisation de faire ça. Demande à Hugues de vérifier ton accès au module."
  }
  if (/failed to fetch|network|load failed|fetch failed|networkerror/i.test(msg) || err?.name === 'TypeError') {
    return "La connexion a été coupée : rien n'a changé. Vérifie ta connexion, puis réessaie."
  }
  if (/introuvable/i.test(msg)) return "Ce montage n'existe plus."
  return `Ça n'a pas marché : ${err?.message || 'erreur inconnue'}.`
}
