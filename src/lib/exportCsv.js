// Export CSV lisible par Excel (Québec) et par Claude : point-virgule, virgule
// décimale, UTF-8 avec BOM pour garder les accents.
// colonnes : [{ cle, titre }] ; une valeur peut aussi venir de cle(ligne) si cle est une fonction.

function cellule(v) {
  if (v == null) return ''
  let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v)
  if (/^[=+\-@]/.test(s) && typeof v !== 'number') s = `'${s}` // pas de formule exécutée à l'ouverture
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(lignes, colonnes) {
  const valeur = (l, c) => (typeof c.cle === 'function' ? c.cle(l) : l[c.cle])
  return [
    colonnes.map(c => cellule(c.titre)).join(';'),
    ...lignes.map(l => colonnes.map(c => cellule(valeur(l, c))).join(';')),
  ].join('\r\n')
}

export function telechargerCsv(nomFichier, lignes, colonnes) {
  const blob = new Blob(['﻿' + toCsv(lignes, colonnes)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier.endsWith('.csv') ? nomFichier : `${nomFichier}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// « 2026-10-20 » pour nommer les fichiers
export const jourFichier = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(d)
