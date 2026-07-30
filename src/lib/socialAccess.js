// Accès au module Réseaux sociaux — réservé à Hugues et Cloé.
// info@neoperformance.ca est le compte actuel de Cloé dans l'app;
// cloe@neoperformance.ca est couvert d'avance si ce compte est créé un jour.
export const SOCIAL_ACCESS_EMAILS = [
  'hugues@neoperformance.ca',
  'cloe@neoperformance.ca',
  'info@neoperformance.ca',
]

export function hasSocialAccess(email) {
  return SOCIAL_ACCESS_EMAILS.includes((email || '').toLowerCase())
}
