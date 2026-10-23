// Adjoint : le fil Gmail d'un dossier, en conversation. Logique pure (décodage MIME,
// nettoyage HTML, citations repliées, sens des messages), partagée par l'edge
// function leo-adjoint (via _shared/gmail.ts) et ses tests vitest. Aucune dépendance.

export const ADRESSE_INFO = 'info@neoperformance.ca'
export const TAILLE_MAX_CORPS = 200_000

// ── Décodage ────────────────────────────────────────────────────────────────
// base64url de l'API Gmail → texte UTF-8
export function decoderBase64Url(data) {
  if (!data) return ''
  const b64 = String(data).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const octets = Uint8Array.from(bin, c => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(octets)
}

export const entete = (headers, nom) => (headers ?? []).find(h => String(h.name).toLowerCase() === nom.toLowerCase())?.value ?? null

// « Julie Roy <julie@x.ca> » → { nom, courriel }
export function lireAdresse(valeur) {
  const v = String(valeur ?? '').trim()
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (m) return { nom: m[1].trim() || null, courriel: m[2].trim().toLowerCase() }
  return { nom: null, courriel: v.includes('@') ? v.toLowerCase() : null }
}
export const lireAdresses = (valeur) => String(valeur ?? '').split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(lireAdresse).filter(a => a.courriel)

// Parcourt les parties MIME : corps html et texte, pièces jointes
export function partiesDuMessage(payload) {
  const out = { html: null, texte: null, piecesJointes: [] }
  const visiter = (p) => {
    if (!p) return
    const nomFichier = p.filename && String(p.filename).trim()
    const dispo = entete(p.headers, 'Content-Disposition') ?? ''
    if (nomFichier && (p.body?.attachmentId || /attachment/i.test(dispo))) {
      out.piecesJointes.push({ nom: nomFichier, type: p.mimeType ?? null, taille: p.body?.size ?? null })
    } else if (p.mimeType === 'text/html' && p.body?.data && out.html == null) {
      out.html = decoderBase64Url(p.body.data)
    } else if (p.mimeType === 'text/plain' && p.body?.data && out.texte == null) {
      out.texte = decoderBase64Url(p.body.data)
    }
    for (const enfant of p.parts ?? []) visiter(enfant)
  }
  visiter(payload)
  return out
}

// ── Nettoyage HTML ──────────────────────────────────────────────────────────
// Images de suivi : 1×1 ou 0×0, cachées, ou d'un service de suivi connu
const SUIVI = /(open|track|pixel|beacon|mailtrack|list-manage\.com\/track|\/o\.gif|\/open\.gif|sendgrid\.net\/wf\/open|mandrillapp\.com\/track|hubspotemail|mailchimp\.com\/track|emltrk|\/e\/o\/)/i
function estImageDeSuivi(balise) {
  const attr = (n) => (balise.match(new RegExp(`\\b${n}\\s*=\\s*["']?([^"'\\s>]+)`, 'i')) ?? [])[1] ?? ''
  const w = attr('width'); const h = attr('height')
  if (/^[01](px)?$/i.test(w) || /^[01](px)?$/i.test(h)) return true
  if (/display\s*:\s*none|visibility\s*:\s*hidden|(width|height)\s*:\s*[01]px/i.test(balise)) return true
  return SUIVI.test(attr('src'))
}

// HTML d'un courriel → HTML sans scripts, styles actifs, formulaires, iframes,
// gestionnaires d'événements, liens javascript:, images de suivi ni images cid:
// (pièces jointes en ligne, non chargées). Affiché ensuite dans un iframe sans scripts.
export function nettoyerHtml(html) {
  let s = String(html ?? '').slice(0, TAILLE_MAX_CORPS)
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(/<(script|style|iframe|object|embed|form|noscript|svg|math|template|link|meta|base|title|head)\b[\s\S]*?<\/\1\s*>/gi, '')
  s = s.replace(/<(script|iframe|object|embed|form|input|button|textarea|select|link|meta|base)\b[^>]*\/?>/gi, '')
  s = s.replace(/<\/?(html|body)\b[^>]*>/gi, '')
  s = s.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  s = s.replace(/\s+(href|src|action|formaction|xlink:href)\s*=\s*("|')?\s*(javascript|vbscript|data:text\/html)[^"'>]*\2?/gi, '')
  s = s.replace(/<img\b[^>]*>/gi, (img) => (estImageDeSuivi(img) || /\bsrc\s*=\s*["']?cid:/i.test(img) ? '' : img))
  s = s.replace(/expression\s*\(/gi, '')
  return s.trim()
}

const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const texteEnHtml = (texte) => echapper(String(texte ?? '').slice(0, TAILLE_MAX_CORPS)).replace(/\r\n/g, '\n').replace(/\n/g, '<br>')

// ── Citations (« Le … a écrit : ») ──────────────────────────────────────────
const LIGNE_CITATION = /(^|\n|>)\s*((Le|On)\s[^\n<]{4,200}?\s(a écrit|wrote)\s*:)/i
// Sépare le message de la citation de l'échange précédent : { principal, citation }
export function separerCitation(html) {
  const s = String(html ?? '')
  const marqueurs = [
    s.search(/<div[^>]*class=["'][^"']*gmail_quote/i),
    s.search(/<blockquote[^>]*(type=["']cite["']|class=["'][^"']*gmail_quote)/i),
    s.search(/<div[^>]*(id=["']appendonsend["']|id=["']divRplyFwdMsg["']|class=["'][^"']*(yahoo_quoted|moz-cite-prefix)[^"']*["'])/i),
    s.search(/<hr[^>]*id=["']?stopSpelling/i),
  ].filter(i => i > 0)
  const m = s.match(LIGNE_CITATION)
  if (m && m.index != null) marqueurs.push(m.index + m[1].length)
  if (!marqueurs.length) return { principal: s, citation: null }
  const i = Math.min(...marqueurs)
  // Sans les sauts de ligne laissés juste avant la citation
  const principal = s.slice(0, i).replace(/(<br\s*\/?>|&nbsp;|\s)+$/i, '')
  // Rien de lisible avant la citation : on garde tout ouvert
  if (!principal.replace(/<[^>]+>|&nbsp;|\s/g, '')) return { principal: s, citation: null }
  return { principal, citation: s.slice(i) }
}

// Début du texte d'un message, pour sa ligne repliée
export function extraitTexte(html, longueur = 140) {
  const t = String(html ?? '')
    .replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim()
  return t.length > longueur ? `${t.slice(0, longueur - 1).trimEnd()}…` : t
}

// ── Message et fil ──────────────────────────────────────────────────────────
// Un message de l'API Gmail (format full) → message affichable
export function messageDuFil(m, { adresseInfo = ADRESSE_INFO } = {}) {
  const h = m?.payload?.headers ?? []
  const de = lireAdresse(entete(h, 'From'))
  const { html, texte, piecesJointes } = partiesDuMessage(m?.payload)
  const brut = html != null ? nettoyerHtml(html) : texteEnHtml(texte ?? m?.snippet ?? '')
  const { principal, citation } = separerCitation(brut)
  const libelles = m?.labelIds ?? []
  return {
    id: m?.id ?? null,
    de,
    a: lireAdresses(entete(h, 'To')),
    cc: lireAdresses(entete(h, 'Cc')),
    sujet: entete(h, 'Subject'),
    date: m?.internalDate ? new Date(Number(m.internalDate)).toISOString() : (entete(h, 'Date') ? new Date(entete(h, 'Date')).toISOString() : null),
    sens: de.courriel === adresseInfo.toLowerCase() || libelles.includes('SENT') ? 'envoye' : 'recu',
    html: principal,
    extrait: extraitTexte(principal),
    citation,
    piecesJointes,
    brouillon: libelles.includes('DRAFT'),
  }
}

// Fil Gmail (format full) → messages du plus récent au plus ancien (comme Gmail),
// sans les brouillons
export function filEnConversation(thread, options) {
  return (thread?.messages ?? [])
    .map(m => messageDuFil(m, options))
    .filter(m => !m.brouillon)
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
}

// Ids Gmail d'un dossier : fil (colonne ou payload), sinon message
export function idsGmail(row) {
  const p = row?.payload ?? {}
  return {
    threadId: row?.gmail_thread_id || p.gmail_thread_id || null,
    messageId: row?.gmail_message_id || p.gmail_message_id || null,
  }
}

export const tailleLisible = (octets) => {
  const n = Number(octets)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`
}

// Document complet pour l'iframe d'affichage (sandbox sans scripts) : liens dans un
// nouvel onglet, aucune exécution de script même si un reste passait le nettoyage
export function documentIframe(html) {
  return '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta http-equiv="Content-Security-Policy" content="script-src \'none\'; object-src \'none\'; form-action \'none\'">'
    + '<base target="_blank">'
    + '<style>html,body{margin:0;padding:0;background:transparent}body{font:14px/1.55 Montserrat,Arial,sans-serif;color:#2b2f38;overflow-wrap:anywhere}'
    + 'img{max-width:100%;height:auto}table{max-width:100%!important}a{color:#00665f}p{margin:0 0 .6em}'
    + 'blockquote{margin:.4em 0 .4em .3em;padding-left:.8em;border-left:2px solid #d0d5dd;color:#5b616e}</style>'
    + `</head><body>${html ?? ''}</body></html>`
}

// ── Classement sur Rejeter et Déjà traité ───────────────────────────────────
export const DECISIONS_CLASSEES = ['rejected', 'traite_manuellement']
// Libellés temporaires de Léo, jamais un classement final : Label_137 = « Léo en cours »
export const LIBELLES_TEMPORAIRES = ['Label_137']
export const estLibelleFinal = (v) => typeof v === 'string' && /^Label_\d+$/.test(v) && !LIBELLES_TEMPORAIRES.includes(v)
// Libellé de la catégorie : payload.label_final, sinon le plus fréquent pour la catégorie
export const libelleDeClassement = (row, labelCategorie = null) =>
  (estLibelleFinal(row?.payload?.label_final) ? row.payload.label_final : null) ?? (estLibelleFinal(labelCategorie) ? labelCategorie : null)
// Corps de threads.modify : libellé ajouté, sorti de la boîte de réception, « Léo en cours » retiré
export const modificationClassement = (label) => ({ addLabelIds: label ? [label] : [], removeLabelIds: ['INBOX', ...LIBELLES_TEMPORAIRES] })
// Libellé le plus fréquent parmi les label_final d'une catégorie, temporaires exclus
export function libellePlusFrequent(labels) {
  const n = new Map()
  for (const l of labels ?? []) if (estLibelleFinal(l)) n.set(l, (n.get(l) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}
// Fil classé par le Hub avec un libellé temporaire (bogue du 23 oct.) : à reclasser
export const classeAvecTemporaire = (row) => LIBELLES_TEMPORAIRES.includes(row?.payload?.hub_gmail?.label)
// Réessayer : seulement sur un dossier fermé dans le Hub dont le classement a échoué
export const classementAReessayer = (row) => DECISIONS_CLASSEES.includes(row?.decision) && !!row?.payload?.hub_gmail?.erreur
