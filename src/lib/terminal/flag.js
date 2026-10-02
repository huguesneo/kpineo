// Terminal de paiement Moneris, contrôlé par VITE_TERMINAL_MONERIS :
//   (absent)  caché pour tout le monde
//   admin     visible seulement pour les admins (période de test)
//   true      visible pour les closeurs, admin et resp_vente
const MODE = import.meta.env.VITE_TERMINAL_MONERIS
export const TERMINAL_ENABLED = MODE === 'true' || MODE === 'admin'

// Superviseurs : accès au terminal sans être admin (voient toutes les ventes, annulent les programmes)
export const TERMINAL_SUPERVISORS = ['hugues@neoperformance.ca', 'info@neoperformance.ca']

export function canUseTerminal({ isAdmin, isAdminOrRespVente, hasCloserRole, email }) {
  if (TERMINAL_ENABLED && TERMINAL_SUPERVISORS.includes(String(email ?? '').toLowerCase())) return true
  if (MODE === 'admin') return !!isAdmin
  if (MODE === 'true') return !!(isAdminOrRespVente || hasCloserRole)
  return false
}
