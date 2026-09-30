// ─── Quand un rendez-vous peut-il passer en « show » ? ─────────
// Un show déclenche la commission du setter : il ne se marque qu'à partir de
// l'heure de fin prévue du rendez-vous, à la main comme automatiquement.
// Même règle côté serveur dans supabase/functions/ghl-update-appointment.

export const DUREE_DEFAUT_MIN = 60   // si le rendez-vous n'a ni fin ni durée

// Fin prévue (ms) d'un rendez-vous GHL ou d'une ligne du rapport de fin de
// journée. NaN si on ne connaît même pas le début.
export function finRendezVous(appt) {
  const fin = appt?.end_time ? new Date(appt.end_time).getTime() : NaN
  if (!isNaN(fin)) return fin
  const debut = appt?.start_time ? new Date(appt.start_time).getTime() : NaN
  const duree = Number(appt?.raw?.duration ?? appt?.raw?.durationMinutes) || DUREE_DEFAUT_MIN
  return debut + duree * 60_000
}

// Sans heure connue, on ne bloque pas : rien ne permet de juger.
export function showPermis(appt, maintenant = Date.now()) {
  const fin = finRendezVous(appt)
  return isNaN(fin) || maintenant >= fin
}

// « 18:45 », pour dire au closeur à partir de quand il pourra marquer le show.
export function heureShowPermis(appt) {
  const fin = finRendezVous(appt)
  if (isNaN(fin)) return ''
  const d = new Date(fin)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ─── Fiche de qualification ───────────────────────────────────
// Pas de show, manuel ou automatique, sans fiche remplie : au moins 6 des 9
// champs de l'écran d'appel (QUAL_FIELDS de SaleCallScript). Même liste
// côté serveur (ghl-update-appointment, show-auto).
export const SHOW_CHAMPS_MIN = 6
export const CHAMPS_FICHE = [
  'reference', 'source', 'objectif', 'pourquoi', 'depuis',
  'deja_essaye', 'problematique', 'solution', 'note',
]

export function champsFiche(qualification) {
  return CHAMPS_FICHE.filter(k => String(qualification?.[k] ?? '').trim()).length
}

export function ficheRemplie(qualification) {
  return champsFiche(qualification) >= SHOW_CHAMPS_MIN
}

// Nombre de champs remplis par rendez-vous : { [appointment_ghl_id]: n }
export async function champsFicheParRdv(supabase, ghlIds) {
  const ids = (ghlIds ?? []).filter(Boolean)
  if (ids.length === 0) return {}
  const { data } = await supabase
    .from('sale_call_notes')
    .select('appointment_ghl_id, qualification')
    .in('appointment_ghl_id', ids)
  // Il peut y avoir plusieurs fiches pour un rendez-vous : la plus remplie compte
  const parRdv = {}
  for (const n of data ?? []) {
    parRdv[n.appointment_ghl_id] = Math.max(parRdv[n.appointment_ghl_id] ?? 0, champsFiche(n.qualification))
  }
  return parRdv
}
