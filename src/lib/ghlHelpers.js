// ─── Helpers GHL partagés ─────────────────────────────────────
// Centralise la logique de tracking closer (matching, dates, pagination)
// utilisée par useCloserData.js, EquipeVente.jsx et CloserAdmin.jsx.
// Une seule source de vérité = plus de divergence entre les écrans.

import { supabase } from './supabase'

// ─── Constantes ───────────────────────────────────────────────
export const GHL_PIPELINE_CLOSER   = 'YPTruORTl0LOSdS2vWJS'
export const GHL_CALENDAR_DECISION  = 'BQK4NoyrVNuJA3e1VHDH'
export const GHL_STAGE_GAGNE        = '🏆 Gagné'
export const GHL_FIELD_CLOSER       = 'JSltN3nE7nm4cUjuGxTs'
export const GHL_FIELD_DATE_CLOSE   = 'UPqvJX8MkZ4thsPX2tjV'
export const COMMISSION_RATE        = 0.086
export const MONTREAL_TZ            = 'America/Toronto'

// ─── Pagination : contourne le cap PostgREST (~1000 lignes) ───
// Supabase plafonne le nombre de lignes retournées par requête.
// Avec > 1000 opportunités dans le pipeline, une partie devient
// invisible au hasard. On pagine par tranches de 1000 via .range().
//   makeQuery : (from, to) => supabase.from(...).select(...).range(from, to)
// Un query builder Supabase est à usage unique → on en recrée un par page.
export async function fetchAllRows(makeQuery, pageSize = 1000) {
  const all = []
  let from = 0
  // Garde-fou anti-boucle : 50 pages = 50 000 lignes max
  for (let page = 0; page < 50; page++) {
    const to = from + pageSize - 1
    const { data, error } = await makeQuery(from, to)
    if (error) { console.error('[fetchAllRows]', error.message); break }
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return all
}

// ─── Extraire un champ custom GHL ─────────────────────────────
// GHL stocke les champs par "id" (pas key/fieldKey) et la valeur
// dans fieldValueString / fieldValueDate / fieldValueNumber.
export function getGHLField(raw, fieldId) {
  const fields = raw?.customFields ?? []
  const f = fields.find(f => f.id === fieldId || f.key === fieldId || f.fieldKey === fieldId)
  if (!f) return null
  return f.fieldValueNumber ?? f.fieldValueString ?? f.fieldValueDate ?? f.value ?? null
}

// ─── Parser une date GHL (Unix ts ou ISO) → Date ──────────────
export function parseGHLDate(v) {
  if (!v) return null
  const n = Number(v)
  if (!isNaN(n) && n > 0) {
    const d = new Date(n > 9_999_999_999 ? n : n * 1000)
    return isNaN(d.getTime()) ? null : d
  }
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

// ─── Dates calendaires (fuseau Montréal) ──────────────────────
function pad(n) { return String(n).padStart(2, '0') }

// Le "jour réel" (Montréal) d'un instant précis (ex: closed_at, un timestamp complet)
export function montrealDateStr(date) {
  if (!date || isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MONTREAL_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date) // en-CA → "YYYY-MM-DD"
}

// Le champ custom "date de close" est une DATE (sans heure), stockée par
// GHL à minuit UTC. La bonne interprétation est donc la date UTC brute —
// surtout PAS convertie en Montréal (ça reculerait d'un jour).
export function ghlCloseCalendarDate(raw) {
  const v = getGHLField(raw, GHL_FIELD_DATE_CLOSE)
  if (v == null || v === '') return null
  const n = Number(v)
  if (!isNaN(n) && n > 0) {
    const d = new Date(n > 9_999_999_999 ? n : n * 1000)
    if (isNaN(d.getTime())) return null
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  const d = new Date(v)
  if (isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

// Date calendaire de close d'une opportunité. Ordre de repli :
//  1. champ custom "date de close" (saisi manuellement dans GHL)
//  2. closed_at (date de close officielle GHL)
//  3. lastStageChangeAt du raw (passage au stage Gagné) — filet de sécurité
//     pour que les ventes sans date saisie restent visibles dans les rapports.
// À n'appeler que sur des opportunités déjà filtrées "Gagné" (voir isWonStage).
// Retourne "YYYY-MM-DD".
export function closeCalendarDate(opp) {
  return ghlCloseCalendarDate(opp?.raw)
    ?? (opp?.closed_at ? montrealDateStr(new Date(opp.closed_at)) : null)
    ?? (opp?.raw?.lastStageChangeAt ? montrealDateStr(new Date(opp.raw.lastStageChangeAt)) : null)
}

// Date de close en objet Date (midi UTC) pour affichage sans décalage.
export function closeDateForDisplay(opp) {
  const s = closeCalendarDate(opp)
  return s ? new Date(s + 'T12:00:00Z') : null
}

// L'opportunité est-elle close dans la période [startDate, endDate] (dates incluses) ?
// Comparaison lexicographique de dates calendaires → aucun bug de fuseau.
export function isCloseInPeriod(opp, startDate, endDate) {
  const d = closeCalendarDate(opp)
  if (!d) return false
  return d >= startDate && d <= endDate
}

// ─── Stage "Gagné" ────────────────────────────────────────────
export function isWonStage(opp) {
  const stageName = String(opp?.stage_name ?? opp?.raw?.pipelineStage?.name ?? '')
  return stageName.includes('Gagné') || stageName.toLowerCase().includes('gagne')
}

// ─── Matching closer ──────────────────────────────────────────
// Normalise "Brice NEO" / "brice neo" / "Brice" → "brice" pour comparer
// le champ GHL au nom du profil, en retirant le suffixe " neo".
export function normalizeCloserName(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+neo$/i, '')     // retire le suffixe " neo"
    .trim()
}

// Le champ closer GHL correspond-il au profil ?
export function closerFieldMatches(closerFieldValue, profileFullName) {
  const cf = normalizeCloserName(closerFieldValue)
  if (!cf) return false
  const prof = normalizeCloserName(profileFullName)
  if (!prof) return false
  if (cf === prof) return true
  // Comparaison par prénom (tolère "Jean-Philippe" vs "jean")
  const cfFirst   = cf.split(' ')[0]
  const profFirst = prof.split(' ')[0]
  return cfFirst === profFirst
}

// Valeur brute du champ closer d'une opportunité (trim), ou '' si absent.
export function getCloserField(opp) {
  return String(getGHLField(opp?.raw, GHL_FIELD_CLOSER) ?? '').trim()
}
