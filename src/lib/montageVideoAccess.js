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
