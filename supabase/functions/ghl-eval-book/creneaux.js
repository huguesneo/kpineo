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

// ── Calendrier mensuel ───────────────────────────────────────────────────────
// Bornes d'un mois 'AAAA-MM' en ms, pour free-slots : du début du mois (ou de
// maintenant s'il est déjà commencé) au lendemain du dernier jour (marge de fuseau).
export function bornesMois(mois, now = Date.now()) {
  const [a, m] = mois.split('-').map(Number)
  const debut = Date.UTC(a, m - 1, 1) - JOUR_MS
  const fin = Date.UTC(a, m, 1) + JOUR_MS
  return [Math.max(debut, now), fin]
}

// Grille du mois (semaines de dimanche à samedi) : null pour les cases vides
export function grilleMois(mois) {
  const [a, m] = mois.split('-').map(Number)
  const premier = new Date(Date.UTC(a, m - 1, 1)).getUTCDay() // 0 = dimanche
  const nbJours = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const cases = [...Array(premier).fill(null)]
  for (let j = 1; j <= nbJours; j++) cases.push(`${mois}-${String(j).padStart(2, '0')}`)
  while (cases.length % 7) cases.push(null)
  const semaines = []
  for (let i = 0; i < cases.length; i += 7) semaines.push(cases.slice(i, i + 7))
  return semaines
}

export function moisSuivant(mois, delta) {
  const [a, m] = mois.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// Garde les jours du mois demandé (les bornes débordent d'un jour de chaque côté)
export function joursDuMois(jours, mois) {
  return (jours ?? []).filter(j => j.jour.startsWith(mois))
}
