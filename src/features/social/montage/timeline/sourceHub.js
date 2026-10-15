// « Source » de la timeline dans le hub : remplace le serveur local du labo (labo/timeline/serveur.mjs).
// Tout passe par la session de la personne connectée (client supabase du hub) et le RLS has_montage_access() :
// brouillon dans video_timeline, vérifications courtes dans video_timeline_requetes, tâches de l'agent dans
// video_taches, fichiers du bucket privé video-timeline par liens signés de 15 min. Aucune clé de service.
import {
  BUCKET_TIMELINE, calculerOnde, indexSons, modelesDe, mono, tacheActiveDe, tacheAppliquer, tacheIA, travailDe,
} from '../../../../lib/montageTimeline'

export const CATALOGUE = 'hub/catalogue.json'
export const INDEX_SONS = 'sons/index.json'
const BUCKET_APERCUS = 'video-apercus'
const TAILLE_MAX = 1_000_000          // même limite que la base (brouillon et vérifications)
const VERIFIER_ATTENTE_MS = 90 * 1000
const VERIFIER_INTERVALLE_MS = 700
const TRAVAIL_CACHE_MS = 1500

const pause = (ms) => new Promise(ok => setTimeout(ok, ms))

export function creerSourceHub({ client, job, liens, onErreur = () => {}, attendre = pause }) {
  const jobId = job.id
  let ligne = null                // video_timeline (recette, brouillon, ressources)
  let apercu = null               // chemin de l'aperçu de la dernière version (video-apercus)
  let sons = { chemins: {}, sons: [] }
  let modelesPromesse = null
  const ondes = new Map()
  let suivi = null                // { genre, id, debut } : Appliquer ou Demander à l'IA en cours
  let dernierTravail = { t: 0, valeur: null }

  // ------------------------------------------------------------ lectures
  async function lireLigne() {
    const { data, error } = await client.from('video_timeline')
      .select('job_id, numero_version, recette, brouillon, brouillon_le, ressources').eq('job_id', jobId).maybeSingle()
    if (error) throw new Error(`La timeline ne peut pas être lue : ${error.message}`)
    ligne = data
    return data
  }

  async function derniereVersion() {
    const { data, error } = await client.from('video_versions')
      .select('numero, chemin_apercu, reponse_agent, created_at').eq('job_id', jobId).order('numero', { ascending: false }).limit(1)
    if (error) throw new Error(`Les versions ne peuvent pas être lues : ${error.message}`)
    return data?.[0] || null
  }

  async function tachesActives() {
    const { data, error } = await client.from('video_taches')
      .select('id, type, statut').eq('job_id', jobId).in('statut', ['en_attente', 'en_cours'])
    if (error) throw new Error(`Les tâches ne peuvent pas être lues : ${error.message}`)
    return data || []
  }

  async function lireJson(chemin, bucket = BUCKET_TIMELINE) {
    const url = await liens.signerMaintenant(bucket, chemin)
    if (!url) return null
    const r = await fetch(url)
    if (!r.ok) return null
    return r.json()
  }

  // ------------------------------------------------------------ montage, modèles, copies légères
  async function montage() {
    const [l, v] = await Promise.all([lireLigne(), derniereVersion()])
    if (!l?.recette) throw new Error("La timeline de ce montage n'est pas encore préparée.")
    apercu = v?.chemin_apercu || null
    return {
      recette: l.brouillon || l.recette,
      medias: { apercu: v?.numero ?? null, base: null, voix: null },
      brouillon: Boolean(l.brouillon),
      proxies: l.ressources?.proxies || {},
      plages_rendues: l.recette.plages,
    }
  }

  function modeles() {
    if (!modelesPromesse) {
      modelesPromesse = Promise.all([lireJson(CATALOGUE), lireJson(INDEX_SONS)]).then(([catalogue, index]) => {
        if (!catalogue) throw new Error("Catalogue de la palette absent du stockage : l'agent du Mac le publie à son démarrage.")
        sons = indexSons(index)
        return modelesDe(catalogue, sons.sons)
      })
      modelesPromesse.catch(() => { modelesPromesse = null })
    }
    return modelesPromesse
  }

  async function proxies() {
    const [l, actives] = await Promise.all([lireLigne(), tachesActives()])
    return { proxies: l?.ressources?.proxies || {}, en_cours: actives.some(t => t.type === 'timeline_preparer') }
  }

  // ------------------------------------------------------------ vérifications par le moteur du Mac
  // Une seule vérification à la fois : pendant qu'une tourne, seule la dernière recette attend (les gestes
  // intermédiaires ne sont jamais envoyés). Toutes les demandes en attente reçoivent la réponse de la dernière.
  let verifEnCours = null
  let verifSuivante = null

  async function verifierUne(recette) {
    const texte = JSON.stringify(recette)
    if (texte.length > TAILLE_MAX) return { erreur_outil: 'Recette trop grande pour être vérifiée (plus de 1 Mo).' }
    const ins = await client.from('video_timeline_requetes').insert({ job_id: jobId, type: 'verifier', recette }).select('id').single()
    if (ins.error) return { erreur_outil: `Vérification impossible : ${ins.error.message}` }
    const fin = Date.now() + VERIFIER_ATTENTE_MS
    while (Date.now() < fin) {
      await attendre(VERIFIER_INTERVALLE_MS)
      const { data, error } = await client.from('video_timeline_requetes').select('statut, reponse, erreur').eq('id', ins.data.id).maybeSingle()
      if (error) continue
      if (data?.statut === 'fait') return data.reponse?.etat || { erreur_outil: 'Réponse du Mac vide.' }
      if (data?.statut === 'erreur') return { erreur_outil: data.erreur || 'Le Mac a refusé la vérification.' }
    }
    return { erreur_outil: "Le Mac ne répond pas (vérification en attente) : l'agent est-il en ligne ?" }
  }

  function verifier(recette) {
    if (verifEnCours) {
      if (!verifSuivante) verifSuivante = { recette, attentes: [] }
      verifSuivante.recette = recette
      return new Promise(ok => verifSuivante.attentes.push(ok))
    }
    verifEnCours = verifierUne(recette).then(async (etat) => {
      verifEnCours = null
      if (verifSuivante) {
        const { recette: r, attentes } = verifSuivante
        verifSuivante = null
        const e = await verifier(r)
        attentes.forEach(ok => ok(e))
      }
      return etat
    })
    return verifEnCours
  }

  // ------------------------------------------------------------ brouillon
  async function ecrireBrouillon(recette) {
    if (recette && JSON.stringify(recette).length > TAILLE_MAX) throw new Error('Brouillon trop grand (plus de 1 Mo) : il ne peut pas être sauvé.')
    const { data, error } = await client.from('video_timeline').update({ brouillon: recette }).eq('job_id', jobId).select('job_id')
    if (error) throw new Error(`Brouillon pas sauvé : ${error.message}`)
    if (!data?.length) throw new Error("Brouillon pas sauvé : la timeline de ce montage n'existe plus (rouvre-la).")
  }

  async function sauver(recette) {
    try {
      await ecrireBrouillon(recette)
      onErreur(null)
      return { sauve: true }
    } catch (e) {
      onErreur(e.message)
      return { sauve: false }
    }
  }

  async function jeter() {
    try {
      await ecrireBrouillon(null)
      onErreur(null)
    } catch (e) {
      onErreur(e.message)
    }
    return { jete: true }
  }

  // ------------------------------------------------------------ formes d'onde
  async function ondeNavigateur(fichier) {
    const chemin = sons.chemins[fichier]
    if (!chemin) return null
    const url = await liens.signerMaintenant(BUCKET_TIMELINE, chemin)
    if (!url) return null
    const r = await fetch(url)
    if (!r.ok) return null
    const Contexte = window.AudioContext || window.webkitAudioContext
    const ctx = new Contexte()
    try {
      const audio = await ctx.decodeAudioData(await r.arrayBuffer())
      const canaux = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i))
      return calculerOnde(mono(canaux), audio.sampleRate)
    } finally {
      ctx.close?.()
    }
  }

  function onde(fichier) {
    if (!ondes.has(fichier)) {
      const chemin = ligne?.ressources?.ondes?.[fichier]
      const p = (chemin ? lireJson(chemin) : Promise.resolve(null))
        .then(o => (o && Array.isArray(o.pics) ? o : ondeNavigateur(fichier)))
        .catch(() => null)
      p.then(o => { if (!o) ondes.delete(fichier) })
      ondes.set(fichier, p)
    }
    return ondes.get(fichier)
  }

  // ------------------------------------------------------------ Appliquer, Demander à l'IA
  async function lancer(genre, recette, tache) {
    try {
      if (suivi) return { refus: 'Un travail est déjà en cours pour ce montage.' }
      const actives = await tachesActives()
      if (tacheActiveDe(actives)) return { refus: 'Le Mac travaille déjà sur ce montage : attends la fin, puis recommence.' }
      await ecrireBrouillon(recette)
      const { data, error } = await client.from('video_taches').insert(tache).select('id').single()
      if (error) return { refus: `Demande pas envoyée : ${error.message}` }
      suivi = { genre, id: data.id, debut: Date.now() }
      dernierTravail = { t: 0, valeur: null }
      return { travail: travailDe({ genre, tache: { statut: 'en_attente' }, debut: suivi.debut }) }
    } catch (e) {
      return { refus: e.message }
    }
  }

  const appliquer = (recette) => lancer('appliquer', recette, tacheAppliquer(jobId))
  const ia = (recette, demande) => lancer('ia', recette, tacheIA(jobId, demande))

  async function travail() {
    if (!suivi) return { travail: null }
    if (Date.now() - dernierTravail.t < TRAVAIL_CACHE_MS && dernierTravail.valeur) return { travail: dernierTravail.valeur }
    const [t, j] = await Promise.all([
      client.from('video_taches').select('id, statut, erreur').eq('id', suivi.id).maybeSingle(),
      client.from('video_jobs').select('etape, progression').eq('id', jobId).maybeSingle(),
    ])
    if (t.error || !t.data) return { travail: dernierTravail.valeur || travailDe({ genre: suivi.genre, tache: { statut: 'en_cours' }, debut: suivi.debut }) }
    const version = t.data.statut === 'fait' ? await derniereVersion().catch(() => null) : null
    const valeur = travailDe({ genre: suivi.genre, tache: t.data, job: j.data, version, debut: suivi.debut })
    dernierTravail = { t: Date.now(), valeur }
    if (valeur.etat !== 'en_cours') suivi = null
    return { travail: valeur }
  }

  async function annuler() {
    if (!suivi) return null
    const { data, error } = await client.rpc('video_annuler_tache', { p_id: suivi.id })
    if (error) throw new Error(error.message)
    return data
  }

  // ------------------------------------------------------------ liens
  return {
    titre: job.titre,
    montage, modeles, proxies, verifier, sauver, jeter, onde, appliquer, ia, travail, annuler,
    enCours: () => Boolean(suivi),
    lien: liens.lien,
    lienSon: (fichier) => liens.url(BUCKET_TIMELINE, sons.chemins[fichier]),
    lienApercu: () => liens.url(BUCKET_APERCUS, apercu) ?? null,
    abonner: liens.abonner,
    version: liens.version,
  }
}
