// Page Adjoint (file d'approbation de Léo) : cachée tant que VITE_ADJOINT_HUB n'est pas « true ».
// Accès : voir peutUtiliserAdjoint (supabase/functions/_shared/adjoint.js).
import { peutUtiliserAdjoint } from '../../../supabase/functions/_shared/adjoint.js'

export const ADJOINT_ENABLED = import.meta.env.VITE_ADJOINT_HUB === 'true'
export const canUseAdjoint = (email) => ADJOINT_ENABLED && peutUtiliserAdjoint(email)
