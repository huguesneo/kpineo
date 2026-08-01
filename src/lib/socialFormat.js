// Formatage partagé du module Réseaux sociaux.
// Tout est en fr-CA : séparateur de milliers par espace, virgule décimale.

const PLATFORMS = {
  instagram: { label: 'Instagram', color: '#E1306C', short: 'IG' },
  facebook:  { label: 'Facebook',  color: '#1877F2', short: 'FB' },
  tiktok:    { label: 'TikTok',    color: '#1a1a1a', short: 'TT' },
  google:    { label: 'Google',    color: '#EA9E34', short: 'GG' },
}

export function platformMeta(platform) {
  return PLATFORMS[platform] ?? { label: platform ?? '—', color: '#9ca3af', short: '?' }
}

export const PLATFORM_ORDER = ['instagram', 'facebook', 'tiktok', 'google']

// L'espace insécable étroit de fr-CA ne se voit pas toujours selon la police ;
// on le remplace par une espace insécable classique, plus fiable.
const nf = new Intl.NumberFormat('fr-CA')
const normalizeSpaces = s => s.replace(/ | /g, ' ')

export function fmtInt(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return normalizeSpaces(nf.format(Math.round(Number(n))))
}

export function fmtPct(n, digits = 1) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return `${Number(n).toFixed(digits).replace('.', ',')} %`
}

export function fmtSeconds(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  const v = Number(n)
  if (v < 60) return `${v.toFixed(1).replace('.', ',')} s`
  const m = Math.floor(v / 60)
  const s = Math.round(v % 60)
  return `${m} min ${String(s).padStart(2, '0')} s`
}

// Temps d'écoute cumulé : on passe en heures dès que ça dépasse l'heure, en
// jours au-delà de 48 h — sinon le chiffre ne veut plus rien dire.
export function fmtDuration(totalSeconds) {
  if (totalSeconds == null || Number.isNaN(Number(totalSeconds))) return '—'
  const v = Number(totalSeconds)
  if (v < 3600) return `${Math.round(v / 60)} min`
  if (v < 172800) return `${fmtInt(v / 3600)} h`
  return `${fmtInt(v / 86400)} jours`
}

// Signe explicite : un delta sans signe se lit comme une valeur absolue.
export function fmtDelta(n, { unit = '%', digits = 1 } = {}) {
  if (n == null || Number.isNaN(Number(n))) return null
  const v = Number(n)
  const sign = v > 0 ? '+' : v < 0 ? '−' : ''
  const body = Math.abs(v).toFixed(digits).replace('.', ',')
  return `${sign}${body} ${unit}`.trim()
}

const DATE_FMT = new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short' })
const DATE_LONG = new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })

export function fmtDate(iso) {
  if (!iso) return '—'
  return normalizeSpaces(DATE_FMT.format(new Date(iso)))
}

export function fmtDateLong(iso) {
  if (!iso) return '—'
  return normalizeSpaces(DATE_LONG.format(new Date(iso)))
}

// Titre d'une publication : celui du contenu local quand il existe, sinon les
// premiers mots de la légende. 47 des 54 publications Facebook et TikTok ont
// hérité de la légende du Reel Instagram correspondant.
export function publicationTitle(pub, post) {
  if (post?.title) return post.title
  const caption = (pub?.caption ?? '').replace(/\s+/g, ' ').trim()
  if (!caption) return `Publication ${platformMeta(pub?.platform).label} du ${fmtDate(pub?.published_at)}`
  return caption.length > 72 ? `${caption.slice(0, 72)}…` : caption
}

const MEDIA_LABELS = {
  VIDEO: 'Vidéo',
  CAROUSEL_ALBUM: 'Carrousel',
  IMAGE: 'Image',
  STORY: 'Story',
}

export function mediaLabel(mediaType) {
  return MEDIA_LABELS[mediaType] ?? mediaType ?? '—'
}

// Seuils du hook rate. Ils viennent de la médiane observée (37 %) : au-dessus
// de 40 % c'est un bon départ, sous 30 % la vidéo perd son monde d'entrée.
export function hookTone(hook) {
  if (hook == null) return { label: '—', text: 'text-[#9ca3af]', bg: 'bg-gray-100' }
  if (hook >= 40) return { label: 'bon', text: 'text-[#009e95]', bg: 'bg-[#00bbb1]/10' }
  if (hook >= 30) return { label: 'moyen', text: 'text-[#b45309]', bg: 'bg-[#f59e0b]/10' }
  return { label: 'faible', text: 'text-[#dc2626]', bg: 'bg-[#ef4444]/10' }
}

const COUNTRY_NAMES = {
  CA: 'Canada', US: 'États-Unis', BR: 'Brésil', FR: 'France', MX: 'Mexique',
  GB: 'Royaume-Uni', AU: 'Australie', CO: 'Colombie', EG: 'Égypte',
  ID: 'Indonésie', IN: 'Inde', ES: 'Espagne',
}

export function countryName(code) {
  return COUNTRY_NAMES[code] ?? code
}

export const GENDER_LABELS = { F: 'Femmes', M: 'Hommes', U: 'Non déclaré' }
