// Petit lecteur markdown pour les réponses de l'agent de montage : titres,
// paragraphes, gras, italique, code, listes, tableaux, séparateurs. Retourne
// une structure de données (jamais de HTML) : TexteMarkdown.jsx la rend en
// éléments React, donc le texte est toujours échappé. Testé dans
// markdownSimple.test.js.

// Texte en ligne → morceaux { type: 'texte' | 'gras' | 'italique' | 'code', ... }.
// gras et italique ont des `enfants` (morceaux), texte et code un `texte`.
const MOTIFS = [
  { type: 'code', re: /`([^`\n]+)`/ },
  { type: 'gras', re: /\*\*(?=\S)([\s\S]*?\S)\*\*/ },
  { type: 'gras', re: /__(?=\S)([\s\S]*?\S)__/ },
  { type: 'italique', re: /\*(?=\S)([^*]*?\S)\*/ },
  { type: 'italique', re: /(?<![\p{L}\p{N}])_(?=\S)([^_]*?\S)_(?![\p{L}\p{N}])/u },
]

export function analyserEnLigne(texte) {
  const morceaux = []
  let reste = texte || ''
  while (reste) {
    let premier = null
    for (const m of MOTIFS) {
      const r = m.re.exec(reste)
      if (r && (!premier || r.index < premier.r.index)) premier = { m, r }
    }
    if (!premier) { morceaux.push({ type: 'texte', texte: reste }); break }
    const { m, r } = premier
    if (r.index > 0) morceaux.push({ type: 'texte', texte: reste.slice(0, r.index) })
    morceaux.push(m.type === 'code' ? { type: 'code', texte: r[1] } : { type: m.type, enfants: analyserEnLigne(r[1]) })
    reste = reste.slice(r.index + r[0].length)
  }
  return morceaux
}

const TITRE = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const PUCE = /^\s*[-*+]\s+(.*)$/
const NUMERO = /^\s*\d+[.)]\s+(.*)$/
const SEPARATEUR = /^\s*([-*_])(\s*\1){2,}\s*$/
const LIGNE_TABLEAU = /^\s*\|.*\|\s*$/
const SOUS_ENTETE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
const CLOTURE = /^\s*```/

const cellules = (ligne) => ligne.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => analyserEnLigne(c.trim()))

// Texte → blocs :
//   { type: 'titre', niveau, contenu }       { type: 'paragraphe', lignes: [contenu] }
//   { type: 'liste', ordonnee, elements: [contenu] }
//   { type: 'tableau', entetes: [contenu], lignes: [[contenu]] }
//   { type: 'code', texte }                  { type: 'separateur' }
// (contenu = morceaux de analyserEnLigne)
export function analyserMarkdown(texte) {
  const lignes = String(texte ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocs = []
  let i = 0
  while (i < lignes.length) {
    const l = lignes[i]
    if (!l.trim()) { i += 1; continue }

    if (CLOTURE.test(l)) {
      const code = []
      i += 1
      while (i < lignes.length && !CLOTURE.test(lignes[i])) { code.push(lignes[i]); i += 1 }
      i += 1
      blocs.push({ type: 'code', texte: code.join('\n') })
      continue
    }
    const titre = TITRE.exec(l)
    if (titre) {
      blocs.push({ type: 'titre', niveau: titre[1].length, contenu: analyserEnLigne(titre[2]) })
      i += 1
      continue
    }
    if (SEPARATEUR.test(l)) { blocs.push({ type: 'separateur' }); i += 1; continue }
    if (LIGNE_TABLEAU.test(l) && i + 1 < lignes.length && SOUS_ENTETE.test(lignes[i + 1])) {
      const entetes = cellules(l)
      const corps = []
      i += 2
      while (i < lignes.length && LIGNE_TABLEAU.test(lignes[i])) { corps.push(cellules(lignes[i])); i += 1 }
      blocs.push({ type: 'tableau', entetes, lignes: corps })
      continue
    }
    const puce = PUCE.exec(l)
    const numero = !puce && NUMERO.exec(l)
    if (puce || numero) {
      const ordonnee = !puce
      const motif = ordonnee ? NUMERO : PUCE
      const elements = []
      while (i < lignes.length) {
        const r = motif.exec(lignes[i])
        if (r) { elements.push(r[1]); i += 1; continue }
        // Ligne de suite d'un élément (indentée, sans puce)
        if (elements.length && /^\s{2,}\S/.test(lignes[i])) { elements[elements.length - 1] += ` ${lignes[i].trim()}`; i += 1; continue }
        break
      }
      blocs.push({ type: 'liste', ordonnee, elements: elements.map(analyserEnLigne) })
      continue
    }
    // Paragraphe : lignes jusqu'à une ligne vide ou un autre bloc
    const para = []
    while (
      i < lignes.length && lignes[i].trim() && !TITRE.test(lignes[i]) && !CLOTURE.test(lignes[i]) &&
      !SEPARATEUR.test(lignes[i]) && !PUCE.test(lignes[i]) && !NUMERO.test(lignes[i]) &&
      !(LIGNE_TABLEAU.test(lignes[i]) && SOUS_ENTETE.test(lignes[i + 1] || ''))
    ) {
      para.push(analyserEnLigne(lignes[i].trim()))
      i += 1
    }
    blocs.push({ type: 'paragraphe', lignes: para })
  }
  return blocs
}
