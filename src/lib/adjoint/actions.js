// Bandeau des actions en attente et bilan d'une action groupée (logique pure, testée)

export const texteBandeau = (n) => `${n} action${n > 1 ? 's' : ''} en cours`

// Dernière action encore annulable (dans ses 6 secondes)
export const derniereAnnulable = (actions) => [...(actions ?? [])].reverse().find(a => a.annulable) ?? null

const NOMS_ACTION = { rejeter: 'rejetés', deja_traite: 'marqués comme déjà traités' }

// Réponse de deciderLot → dossiers à réafficher et messages d'erreur (jamais de silence)
export function bilanLot(r, action, total) {
  const resultats = r?.resultats ?? []
  if (!r?.ok || resultats.length === 0) return { echecs: null, erreurs: [r?.error ?? 'Le hub n’a pas confirmé l’action groupée. Rien n’a changé.'] }
  const echecs = resultats.filter(x => !x.ok)
  const gmail = resultats.filter(x => x.ok && x.gmailErreur)
  const erreurs = []
  if (echecs.length) {
    const raisons = [...new Set(echecs.map(x => x.erreur).filter(Boolean))].join(' ; ')
    erreurs.push(`${echecs.length} dossier${echecs.length > 1 ? 's' : ''} sur ${total} non ${NOMS_ACTION[action] ?? 'traités'}${raisons ? ` : ${raisons}` : ''}`)
  }
  if (gmail.length) erreurs.push(`${gmail.length} dossier${gmail.length > 1 ? 's' : ''} non archivé${gmail.length > 1 ? 's' : ''} dans Gmail : ouvre-${gmail.length > 1 ? 'les' : 'le'} pour réessayer`)
  return { echecs: echecs.map(x => x.id), erreurs }
}

// Dossier à ouvrir après en avoir retiré certains de la file
export function suivantApres(file, retires, selection) {
  const sortis = new Set(retires)
  if (selection && !sortis.has(selection)) return selection
  const i = file.findIndex(d => d.id === selection)
  const apres = file.slice(Math.max(0, i + 1)).find(d => !sortis.has(d.id))
  const avant = [...file.slice(0, Math.max(0, i))].reverse().find(d => !sortis.has(d.id))
  return (apres ?? avant)?.id ?? null
}
