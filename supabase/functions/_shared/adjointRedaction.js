// Adjoint : « Demander à Léo de rédiger ». Prompt, contexte et vérification du
// brouillon, partagés par l'edge function leo-adjoint (op rediger) et ses tests.
// L'appel à l'API Anthropic se fait seulement dans l'edge function.

export const MODELE_REDACTION = 'claude-sonnet-5-5'

// Style de Cloé (en dur pour l'instant)
export const PROMPT_SYSTEME = `Tu es Léo, l'adjoint de Cloé au service client de NEO Performance, une clinique de naturopathie et d'optimisation métabolique au Québec. Tu rédiges une réponse courriel que Cloé va relire, modifier au besoin et envoyer elle-même depuis info@neoperformance.ca.

Suis la consigne de Cloé. N'invente aucun fait, aucune date, aucun montant.

Style obligatoire :
- Ouverture : « Bonjour [Prénom] :) » avec le prénom de la personne.
- Tutoiement, phrases courtes, 3 à 5 lignes au total.
- Valide la personne avant de régler (« pas de souci », « c'est fait », « c'est bien reçu »).
- Fermeture exacte, sur deux lignes : « Merci à toi et bonne journée! » puis « Cloé ».

Interdits :
- le tiret cadratin et le tiret demi-cadratin ;
- « n'hésitez pas à » et tout vouvoiement ;
- plus d'un emoji (le « :) » de l'ouverture compte) ;
- le mot « coach » : on dit « naturopathe » ;
- parler de frais, de préavis ou de politique d'annulation ;
- nommer une pathologie, employer le mot « diagnostic » ;
- promettre de l'argent (remboursement, crédit, rabais) si la consigne ne le dit pas.

Réponds seulement avec le texte du courriel, sans objet, sans guillemets, sans commentaire.`

const ligne = (k, v) => `${k} : ${v == null || v === '' ? 'non renseigné' : v}`

// fiche : { prenom, nom, statut, naturopathe, programme } ; echanges : [{ canal, quand, sujet, extrait }]
export function messageUtilisateur({ consigne, messageRecu, sujet, fiche = {}, echanges = [] }) {
  const hist = echanges.length
    ? echanges.map(e => `- ${e.quand} · ${e.canal} · ${e.sujet}${e.extrait ? ` : ${e.extrait}` : ''}`).join('\n')
    : '- aucun'
  return [
    'Consigne de Cloé :', String(consigne ?? '').trim(), '',
    'La personne :', ligne('Prénom', fiche.prenom), ligne('Nom', fiche.nom), ligne('Statut', fiche.statut),
    ligne('Naturopathe', fiche.naturopathe), ligne('Programme', fiche.programme), '',
    'Ses 5 derniers échanges :', hist, '',
    `Message reçu (sujet : ${sujet || 'non renseigné'}) :`, String(messageRecu ?? '').trim() || 'non renseigné',
  ].join('\n')
}

export function requeteAnthropic(args) {
  return {
    model: MODELE_REDACTION,
    max_tokens: 800,
    system: PROMPT_SYSTEME,
    messages: [{ role: 'user', content: messageUtilisateur(args) }],
  }
}

// Texte de la réponse de l'API Messages
export function texteReponse(json) {
  const blocs = Array.isArray(json?.content) ? json.content : []
  return blocs.filter(b => b?.type === 'text').map(b => b.text).join('').trim()
}

// Corrections sûres : tirets cadratins et demi-cadratins remplacés par une virgule
export function nettoyerBrouillon(texte) {
  return String(texte ?? '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/^["«]\s*|\s*["»]$/g, '')
    .trim()
}

const EMOJI = /\p{Extended_Pictographic}/gu
// Ce qui reste à surveiller à la relecture (affiché à Cloé, rien n'est bloqué)
export function avertissementsBrouillon(texte, consigne = '') {
  const t = String(texte ?? '')
  const c = String(consigne ?? '').toLowerCase()
  const a = []
  if (/[—–]/.test(t)) a.push('Tiret cadratin')
  if (/n['’]h[ée]sitez pas/i.test(t)) a.push('« N’hésitez pas »')
  if (/\b(vous|votre|vos)\b/i.test(t)) a.push('Vouvoiement')
  if (/\bcoach/i.test(t)) a.push('Le mot « coach » (on dit naturopathe)')
  if (/diagnostic/i.test(t)) a.push('Le mot « diagnostic »')
  if (/\bfrais\b|pr[ée]avis|politique d['’]annulation/i.test(t)) a.push('Frais, préavis ou politique d’annulation')
  const emojis = (t.match(EMOJI) ?? []).length + (t.match(/:\)/g) ?? []).length
  if (emojis > 1) a.push('Plus d’un emoji')
  for (const [mot, motif] of [['remboursement', /rembours/i], ['crédit', /cr[ée]dit/i], ['rabais', /rabais/i]]) {
    if (motif.test(t) && !motif.test(c)) a.push(`Promesse d’argent absente de la consigne (${mot})`)
  }
  return a
}

// Journal dans payload.hub_redaction (les 10 dernières)
export function ajouterJournalRedaction(existant, entree) {
  const liste = Array.isArray(existant) ? existant : (existant ? [existant] : [])
  return [...liste, entree].slice(-10)
}
