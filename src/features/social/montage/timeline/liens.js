// Liens signés de la timeline (15 min, session de la personne connectée) : demandés par lots, gardés en mémoire,
// renouvelés quand il reste moins de 3 min. url() est appelée à chaque image du lecteur : elle ne fait jamais
// d'appel elle-même, elle note ce qui manque et un lot part quelques millisecondes après.
// Vidéo du lecteur (copie légère) : lienVideo() garde la même adresse tant que la vidéo marche, car un nouveau src la
// recharge (écran vide) ; si elle échoue quand même (lien expiré), echecVideo() lui passe un lien frais (19 oct. 2026).
import { DUREE_LIEN_S, BUCKET_TIMELINE, etatLien } from '../../../../lib/montageTimeline'

const REESSAYER_APRES_MS = 30 * 1000
const PAR_LOT = 100
const ECHEC_VIDEO_MS = 5 * 1000   // une vidéo qui échoue en boucle : un nouveau lien au plus toutes les 5 s

export function creerLiens(client, { maintenant = () => Date.now(), delaiLot = 20 } = {}) {
  const entrees = new Map()      // « bucket\nchemin » → { url, expire } ou { echec }
  const attente = new Map()      // bucket → Set(chemins)
  const enCours = new Set()
  const fixes = new Map()        // « bucket\nchemin » → adresse donnée à la vidéo (ne change qu'après un échec)
  const echecsVideo = new Map()  // « bucket\nchemin » → moment du dernier échec signalé
  const abonnes = new Set()
  let version = 0
  let minuterie = null

  const cle = (bucket, chemin) => `${bucket}\n${chemin}`
  const notifier = () => {
    version += 1
    for (const f of abonnes) f()
  }

  async function signerLot(bucket, chemins) {
    for (let i = 0; i < chemins.length; i += PAR_LOT) {
      const lot = chemins.slice(i, i + PAR_LOT)
      const debut = maintenant()
      let resultats = []
      try {
        const { data, error } = await client.storage.from(bucket).createSignedUrls(lot, DUREE_LIEN_S)
        if (error) throw error
        resultats = data || []
      } catch {
        resultats = []
      }
      const recus = new Map(resultats.filter(r => r?.path && r.signedUrl && !r.error).map(r => [r.path, r.signedUrl]))
      for (const c of lot) {
        const k = cle(bucket, c)
        enCours.delete(k)
        entrees.set(k, recus.has(c) ? { url: recus.get(c), expire: debut + DUREE_LIEN_S * 1000 } : { ...entrees.get(k), echec: maintenant() })
      }
    }
  }

  async function vider() {
    minuterie = null
    const lots = [...attente.entries()].map(([b, s]) => [b, [...s]])
    attente.clear()
    await Promise.all(lots.map(([b, chemins]) => signerLot(b, chemins)))
    notifier()
  }

  function demander(bucket, chemin) {
    const k = cle(bucket, chemin)
    if (enCours.has(k)) return
    enCours.add(k)
    if (!attente.has(bucket)) attente.set(bucket, new Set())
    attente.get(bucket).add(chemin)
    if (!minuterie) minuterie = setTimeout(vider, delaiLot)
  }

  // Lien à servir tout de suite (undefined s'il n'est pas encore prêt) ; demande un renouvellement si besoin
  function url(bucket, chemin) {
    if (!chemin) return undefined
    const e = entrees.get(cle(bucket, chemin))
    const etat = etatLien(e, maintenant())
    if (etat === 'bon') return e.url
    if (!(e?.echec && maintenant() - e.echec < REESSAYER_APRES_MS)) demander(bucket, chemin)
    return etat === 'a_renouveler' ? e.url : undefined
  }

  // Lien d'une vidéo en lecture : toujours le même tant qu'elle marche ; url() garde le renouvellement en route
  function lienVideo(bucket, chemin) {
    if (!chemin) return undefined
    const k = cle(bucket, chemin)
    const frais = url(bucket, chemin)
    if (!fixes.has(k) && frais) fixes.set(k, frais)
    return fixes.get(k)
  }

  // La vidéo n'a pas pu lire son lien (expiré, réseau) : le lien frais lui est donné, ou demandé tout de suite
  function echecVideo(bucket, chemin) {
    if (!chemin) return
    const k = cle(bucket, chemin)
    const t = maintenant()
    if (t - (echecsVideo.get(k) ?? -Infinity) < ECHEC_VIDEO_MS) return
    echecsVideo.set(k, t)
    const vieux = fixes.get(k)
    fixes.delete(k)
    const e = entrees.get(k)
    if (!e?.url || e.url === vieux || etatLien(e, t) !== 'bon') {
      entrees.delete(k)
      demander(bucket, chemin)
    } else notifier()
  }

  // Lien tout de suite (fichiers JSON lus une fois : catalogue, index des sons, formes d'onde)
  async function signerMaintenant(bucket, chemin) {
    const deja = entrees.get(cle(bucket, chemin))
    if (etatLien(deja, maintenant()) === 'bon') return deja.url
    enCours.add(cle(bucket, chemin))
    await signerLot(bucket, [chemin])
    const e = entrees.get(cle(bucket, chemin))
    return e?.url && !e.echec ? e.url : null
  }

  return {
    url,
    lien: (chemin) => url(BUCKET_TIMELINE, chemin),
    lienVideo: (chemin) => lienVideo(BUCKET_TIMELINE, chemin),
    echecVideo: (chemin) => echecVideo(BUCKET_TIMELINE, chemin),
    signerMaintenant,
    abonner: (f) => {
      abonnes.add(f)
      return () => abonnes.delete(f)
    },
    version: () => version,
    arreter: () => {
      if (minuterie) clearTimeout(minuterie)
      minuterie = null
      abonnes.clear()
    },
  }
}
