// Formats d'affichage partagés par les écrans v2 (fuseau Montréal).
const TZ = 'America/Toronto'

function parts(date) {
  const p = new Intl.DateTimeFormat('fr-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(date)
  const get = t => p.find(x => x.type === t)?.value ?? ''
  return {
    jour: `${get('year')}-${get('month')}-${get('day')}`,
    h: Number(get('hour')), m: Number(get('minute')),
    wd: get('weekday').replace('.', ''),
  }
}

// 13 h 00 · 9 h 30
export function fmtHeure(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const { h, m } = parts(d)
  return `${h} h ${String(m).padStart(2, '0')}`
}

// 15 h (sans minutes quand elles valent 0)
function fmtHeureCourte(d) {
  const { h, m } = parts(d)
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

function decalageJours(iso, now) {
  const a = parts(new Date(iso)).jour
  const b = parts(new Date(now)).jour
  return Math.round((new Date(a + 'T12:00:00Z') - new Date(b + 'T12:00:00Z')) / 86_400_000)
}

// « Auj. 13 h 00 », « Demain 9 h 30 », « Hier 15 h », « lun. 18 h 30 », « jeu. 24 sept. »
export function fmtRdvRelatif(iso, now = Date.now()) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const j = decalageJours(iso, now)
  if (j === 0) return `Auj. ${fmtHeure(iso)}`
  if (j === 1) return `Demain ${fmtHeure(iso)}`
  if (j === -1) return `Hier ${fmtHeureCourte(d)}`
  if (Math.abs(j) < 7) return `${parts(d).wd}. ${fmtHeureCourte(d)}`
  return new Intl.DateTimeFormat('fr-CA', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(d)
}

// Âge d'un lead : « 2 h », « 5 j »
export function fmtAge(heures) {
  if (heures == null) return '—'
  if (heures < 24) return `${heures} h`
  return `${Math.floor(heures / 24)} j`
}

// Durée écoulée : « 2 h 08 », « 45 min »
export function fmtDuree(ms) {
  const min = Math.max(0, Math.floor(ms / 60_000))
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}

export function fmtCAD(n) {
  return `${Math.round(Number(n ?? 0)).toLocaleString('fr-CA')} $`
}

// « Mardi 22 septembre 2026 »
export function fmtDateLongue(date = new Date()) {
  const s = new Intl.DateTimeFormat('fr-CA', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function prenom(fullName) {
  return String(fullName ?? '').trim().split(/\s+/)[0] || ''
}

// Pastille de source : chaude (VSL/Optin VS) ambre, quiz teal, le reste gris
export function styleSource(source) {
  const s = String(source ?? '')
  if (/\bvsl?\b/i.test(s)) return { bg: '#fffbeb', color: '#b45309' }
  if (/quiz/i.test(s)) return { bg: 'rgba(0,187,177,0.1)', color: '#00897f' }
  return { bg: '#f3f4f6', color: '#4b5563' }
}
