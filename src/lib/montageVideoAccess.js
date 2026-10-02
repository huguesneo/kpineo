// Accès au module Montage vidéo. Garder cette liste identique à
// public.has_montage_access() (supabase/migrations/20261001e_montage_video.sql).
export const MONTAGE_VIDEO_ACCESS_EMAILS = [
  'hugues@neoperformance.ca',
  'info@neoperformance.ca',
]

// Seul Hugues approuve les templates proposés (public.is_hugues() côté base).
export const MONTAGE_VIDEO_APPROVER_EMAIL = 'hugues@neoperformance.ca'

export function hasMontageVideoAccess(email) {
  return MONTAGE_VIDEO_ACCESS_EMAILS.includes((email || '').toLowerCase())
}

export function canApproveVideoTemplates(email) {
  return (email || '').toLowerCase() === MONTAGE_VIDEO_APPROVER_EMAIL
}

// Module caché tant que VITE_MONTAGE_VIDEO n'est pas « true » (désactivé par
// défaut, jamais activé dans Netlify avant la fin des tests en local).
export const MONTAGE_VIDEO_ENABLED = import.meta.env.VITE_MONTAGE_VIDEO === 'true'

export function canUseMontageVideo(email, enabled = MONTAGE_VIDEO_ENABLED) {
  return !!enabled && hasMontageVideoAccess(email)
}

// Configuration du module (dossier Brut) : Hugues seulement, comme
// l'écriture dans video_config (public.is_hugues() côté base).
export function canConfigureMontageVideo(email, enabled = MONTAGE_VIDEO_ENABLED) {
  return !!enabled && canApproveVideoTemplates(email)
}
