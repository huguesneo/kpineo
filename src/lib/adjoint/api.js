// Appels à l'edge function leo-adjoint (seul accès au journal de Léo)
import { supabase } from '../supabase'

export class ErreurAdjoint extends Error {
  constructor(message, details = {}) {
    super(message)
    this.details = details
  }
}

export async function appelAdjoint(op, args = {}) {
  const { data, error } = await supabase.functions.invoke('leo-adjoint', { body: { op, ...args } })
  if (error) {
    let corps = {}
    try { corps = await error.context.json() } catch { /* réponse non JSON */ }
    throw new ErreurAdjoint(corps.error ?? 'Le hub n’a pas pu joindre Léo. Réessaie dans un instant.', corps)
  }
  return data
}

// Prévient le menu (badge) et les compteurs qu'un dossier a changé
export const EVENEMENT_MAJ = 'adjoint:maj'
export const signalerMaj = () => window.dispatchEvent(new Event(EVENEMENT_MAJ))
