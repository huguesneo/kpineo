// Accès au module Montage vidéo. La liste des courriels n'existe qu'à un
// endroit : public.has_montage_access() (supabase/migrations/20261002112114_montage_video.sql),
// la même fonction que le RLS des tables video_*. Le hub la lit par RPC
// (src/hooks/useMontageVideoAccess.js) au lieu d'en garder une copie.

// Seul Hugues approuve les templates proposés (public.is_hugues() côté base).
export const MONTAGE_VIDEO_APPROVER_EMAIL = 'hugues@neoperformance.ca'

export function canApproveVideoTemplates(email) {
  return (email || '').toLowerCase() === MONTAGE_VIDEO_APPROVER_EMAIL
}

// Module caché tant que VITE_MONTAGE_VIDEO n'est pas « true » (désactivé par
// défaut, jamais activé dans Netlify avant la fin des tests en local).
export const MONTAGE_VIDEO_ENABLED = import.meta.env.VITE_MONTAGE_VIDEO === 'true'

// Réponse de has_montage_access() : true ou false, null si l'appel a échoué
// (réseau, session expirée). Un échec ne donne jamais l'accès.
export async function lireAccesMontage(client) {
  try {
    const { data, error } = await client.rpc('has_montage_access')
    if (error) return null
    return data === true
  } catch {
    return null
  }
}

// Route du module : 'chargement', '/login', '/dashboard' (redirection) ou 'ok'.
export function routeMontage({ user, loading, acces, enabled = MONTAGE_VIDEO_ENABLED }) {
  if (loading) return 'chargement'
  if (!user) return '/login'
  if (!enabled || !acces) return '/dashboard'
  return 'ok'
}

// Entrées « Réseaux sociaux » du menu. `montage` = réponse de la base (déjà
// fausse sans le flag). Sans le flag, l'ancien lien unique comme avant.
export function entreesReseauxSociaux({ social, montage, enabled = MONTAGE_VIDEO_ENABLED }) {
  if (!enabled) return { groupe: false, analyse: false, montage: false, ancienLien: !!social }
  return { groupe: !!(social || montage), analyse: !!social, montage: !!montage, ancienLien: false }
}

// Configuration du module (dossier Brut) : Hugues seulement, comme
// l'écriture dans video_config (public.is_hugues() côté base).
export function canConfigureMontageVideo(email, enabled = MONTAGE_VIDEO_ENABLED) {
  return !!enabled && canApproveVideoTemplates(email)
}
