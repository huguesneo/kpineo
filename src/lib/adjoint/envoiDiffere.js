// Envoi différé avec « Annuler » : l'action n'est exécutée qu'après le délai.
// Annuler avant la fin empêche réellement l'appel. Une seule action en attente à
// la fois : en programmer une autre exécute tout de suite la précédente (Cloé l'a
// voulue et n'a pas annulé). vider() fait pareil en quittant la page.
export const DELAI_ANNULATION_MS = 6000

export function creerEnvoiDiffere({ delai = DELAI_ANNULATION_MS, horloge = { setTimeout, clearTimeout } } = {}) {
  let enAttente = null

  function lancer(e) {
    horloge.clearTimeout(e.minuteur)
    if (enAttente === e) enAttente = null
    return Promise.resolve().then(e.executer).then(e.surSucces, e.surErreur)
  }

  return {
    programmer({ executer, surSucces = () => {}, surErreur = () => {}, surAnnulation = () => {} }) {
      if (enAttente) lancer(enAttente)
      const e = { executer, surSucces, surErreur, surAnnulation }
      e.minuteur = horloge.setTimeout(() => lancer(e), delai)
      enAttente = e
      return () => {
        if (enAttente !== e) return false
        horloge.clearTimeout(e.minuteur)
        enAttente = null
        e.surAnnulation()
        return true
      }
    },
    vider() {
      if (enAttente) lancer(enAttente)
    },
    get enAttente() { return !!enAttente },
  }
}
