// Agrégats du scoreboard d'équipe (fonctions pures).
import { isWonStage, isSaleInScope, isCloseInPeriod, getCloserField, normalizeCloserName } from '../ghlHelpers'

function capitaliser(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

// Prénom affichable d'un nom de closeur GHL (« Brice NEO » → « Brice »)
export function prenomCloseur(nom) {
  return capitaliser(normalizeCloserName(nom).split(' ')[0] ?? '')
}

// Classement : [{ nom, valeur }] trié décroissant, avec rang et largeur de barre (%)
export function classement(entrees) {
  const tries = [...entrees].filter(e => e.valeur > 0).sort((a, b) => b.valeur - a.valeur || a.nom.localeCompare(b.nom))
  const max = tries[0]?.valeur ?? 0
  return tries.map((e, i) => ({ ...e, rang: i + 1, largeur: max > 0 ? Math.round((e.valeur / max) * 100) : 0 }))
}

// Ventes du mois par closeur : cartes « Gagné » des deux pipelines closeurs,
// date de close dans la période, une vente jamais comptée deux fois (bascule).
export function ventesParCloseur(opps, start, end) {
  const compte = new Map()
  for (const o of opps ?? []) {
    if (!isWonStage(o) || !isSaleInScope(o) || !isCloseInPeriod(o, start, end)) continue
    // Une vente sans closeur ne va dans aucun classement (hygiène : DataHygienePanel)
    const nom = prenomCloseur(getCloserField(o))
    if (!nom) continue
    compte.set(nom, (compte.get(nom) ?? 0) + 1)
  }
  return classement([...compte].map(([nom, valeur]) => ({ nom, valeur })))
}

// Cash collecté : somme des paiements de la période
export function sommeCash(paiements) {
  return (paiements ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0)
}

// Rythme attendu au jour J d'un mois de N jours, et écart (positif = en avance)
export function rythme({ objectif, cash, jour, joursDansMois }) {
  if (!objectif || objectif <= 0) return null
  const attendu = Math.round((objectif * jour) / joursDansMois)
  return {
    attendu,
    ecart: Math.round(cash - attendu),
    pctAtteint: Math.round((cash / objectif) * 100),
    pctRythme: Math.min(100, Math.round((jour / joursDansMois) * 1000) / 10),
    reste: Math.max(0, Math.round(objectif - cash)),
    joursRestants: Math.max(0, joursDansMois - jour),
  }
}

// Bannière « il te manque » d'un setter (même calcul que showupsMissing)
export function banniereSetter({ prenom, showups, objectif, bonusMensuel }) {
  if (!(objectif > 0) || showups >= objectif) return null
  const manque = objectif - showups
  return {
    texte: `${prenom}, plus que ${manque} show-up${manque > 1 ? 's' : ''}${bonusMensuel ? ` pour ton boni de ${Math.round(bonusMensuel).toLocaleString('fr-CA')} $` : ' pour ton objectif'}`,
    detail: `${showups} / ${objectif} show-ups`,
  }
}

// Bannière d'un closeur : objectif trimestriel moins le cash du trimestre
export function banniereCloseur({ prenom, cashTrimestre, objectifTrimestre }) {
  if (!(objectifTrimestre > 0) || cashTrimestre >= objectifTrimestre) return null
  const manque = Math.round(objectifTrimestre - cashTrimestre)
  return {
    texte: `${prenom}, il te manque ${manque.toLocaleString('fr-CA')} $ pour ton objectif du trimestre`,
    detail: `${Math.round(cashTrimestre).toLocaleString('fr-CA')} / ${Math.round(objectifTrimestre).toLocaleString('fr-CA')} $`,
  }
}
