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

// Un média est une vidéo (donc éligible à une couverture personnalisée).
export const isVideoUrl = (url) => /\.(mp4|mov|webm)($|\?)/i.test(url ?? '')

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

// ── Attribution ─────────────────────────────────────────────────────────────
// GHL enregistre les paramètres utm de la PREMIÈRE attribution d'un contact.
// Un lien qui porte le code de la publication permet donc de relier un
// rendez-vous au contenu qui l'a déclenché — à condition que le lien soit
// cliquable, ce qui exclut le fil et les Reels Instagram.

export const BOOKING_URL = 'https://www.neoperformance.ca/consultation'
export const BIO_URL = 'https://www.neoperformance.ca/lien'

export function trackedLink(code, { source, medium, base = BOOKING_URL } = {}) {
  if (!code) return ''
  const url = new URL(base)
  url.searchParams.set('utm_source', source)
  url.searchParams.set('utm_medium', medium)
  url.searchParams.set('utm_campaign', 'social')
  url.searchParams.set('utm_content', code)
  return url.toString()
}

// Les surfaces réellement cliquables, par plateforme. `utm_medium` les
// distingue : au bout de quelques semaines on saura laquelle convertit.
// Instagram n'apparaît pas avec un lien direct — la plateforme n'en autorise
// aucun sous un Reel, et c'est la bio, la Story ou le message privé qui
// portent le code.
export const SURFACES = {
  instagram: [
    { key: 'bio',   label: 'Bouton page lien en bio', medium: 'bio',
      base: BOOKING_URL, note: 'à ajouter sur neoperformance.ca/lien' },
    { key: 'dm',    label: 'Lien à envoyer en message privé', medium: 'dm',
      base: BOOKING_URL, note: 'réponse automatique au mot-clé' },
    { key: 'story', label: 'Sticker lien en Story', medium: 'story',
      base: BOOKING_URL, note: 'le jour de la publication' },
  ],
  facebook: [
    { key: 'post',  label: 'Lien dans la publication', medium: 'post',
      base: BOOKING_URL, note: 'cliquable directement' },
    { key: 'dm',    label: 'Lien en message privé', medium: 'dm',
      base: BOOKING_URL, note: 'réponse automatique' },
  ],
  tiktok: [
    { key: 'bio',   label: 'Lien en bio', medium: 'bio',
      base: BOOKING_URL, note: 'à faire pointer vers la page lien' },
    { key: 'dm',    label: 'Lien en message privé', medium: 'dm',
      base: BOOKING_URL, note: 'réponse automatique' },
  ],
  google: [
    { key: 'fiche', label: 'Bouton de la fiche', medium: 'fiche',
      base: BOOKING_URL, note: 'bouton Réserver' },
  ],
}
