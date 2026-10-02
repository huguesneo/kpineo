// Plages libres GHL (free-slots) : découpage de la période, lecture de la
// réponse, regroupement par jour de Montréal. Fonctions pures, aussi utilisées
// par la fonction serveur ghl-eval-book (copie dans supabase/functions/ghl-eval-book).
const FUSEAU = 'America/Toronto'
const JOUR_MS = 86_400_000

// GHL refuse plus de 31 jours par appel : morceaux de 25 jours au plus
export function decouperPeriode(debutMs, finMs, tailleJours = 25) {
  const morceaux = []
  for (let d = debutMs; d < finMs; d += tailleJours * JOUR_MS) {
    morceaux.push([d, Math.min(finMs, d + tailleJours * JOUR_MS)])
  }
  return morceaux
}

// Réponse GHL : { "AAAA-MM-JJ": { slots: [iso…] }, traceId: … } → [iso…]
export function extraireCreneaux(reponse) {
  const out = []
  for (const [cle, val] of Object.entries(reponse ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cle)) continue
    for (const s of val?.slots ?? []) out.push(String(s))
  }
  return out
}

export function jourDe(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso))
}

// Créneaux futurs, sans doublons (même instant écrit avec des fuseaux différents),
// regroupés par jour : [{ jour: 'AAAA-MM-JJ', creneaux: [iso…] }]
export function grouperParJour(isos, now = Date.now()) {
  const vus = new Map()
  for (const iso of isos ?? []) {
    const t = new Date(iso).getTime()
    if (Number.isNaN(t) || t <= now || vus.has(t)) continue
    vus.set(t, iso)
  }
  const parJour = new Map()
  for (const t of [...vus.keys()].sort((a, b) => a - b)) {
    const iso = new Date(t).toISOString()
    const jour = jourDe(iso)
    if (!parJour.has(jour)) parJour.set(jour, [])
    parJour.get(jour).push(iso)
  }
  return [...parJour].map(([jour, creneaux]) => ({ jour, creneaux }))
}

// Le créneau demandé est-il encore dans la liste (même instant) ?
export function creneauLibre(jours, iso) {
  const t = new Date(iso).getTime()
  return (jours ?? []).some(j => j.creneaux.some(c => new Date(c).getTime() === t))
}
