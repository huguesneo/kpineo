// Envoi différé avec « Annuler » : chaque action part à la fin de SES 6 secondes, même si
// Cloé ouvre un autre dossier ou en décide un autre entre-temps (file d'actions, pas une
// seule). Annuler avant la fin empêche réellement l'appel. vider() envoie tout de suite
// ce qui reste (page quittée).
export const DELAI_ANNULATION_MS = 6000

// Appels directs : window.setTimeout appelé comme méthode d'un autre objet lève
// « Illegal invocation » dans le navigateur (bogue du 23 oct. : aucun rejet n'était parti).
const MINUTERIES = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (t) => globalThis.clearTimeout(t),
}

export function creerEnvoiDiffere({ delai = DELAI_ANNULATION_MS, horloge = MINUTERIES } = {}) {
  const enAttente = new Set()

  function lancer(e) {
    if (!enAttente.delete(e)) return
    horloge.clearTimeout(e.minuteur)
    Promise.resolve().then(e.executer).then(e.surSucces, e.surErreur)
  }

  return {
    programmer({ executer, surSucces = () => {}, surErreur = () => {}, surAnnulation = () => {} }) {
      const e = { executer, surSucces, surErreur, surAnnulation }
      enAttente.add(e)
      e.minuteur = horloge.setTimeout(() => lancer(e), delai)
      return () => {
        if (!enAttente.delete(e)) return false
        horloge.clearTimeout(e.minuteur)
        e.surAnnulation()
        return true
      }
    },
    vider() {
      for (const e of [...enAttente]) lancer(e)
    },
    get enAttente() { return enAttente.size > 0 },
    get nombre() { return enAttente.size },
  }
}
