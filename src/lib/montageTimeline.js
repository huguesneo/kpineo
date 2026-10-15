// Timeline du hub (mise en production du labo, 15 oct. 2026) : règles sans React ni Supabase.
// Contrat de l'agent : video-neo/agent/README.md, « Timeline du hub », et docs/plan-timeline-hub.md.
// Tout passe par la session de la personne connectée et le RLS has_montage_access() (hugues@ et info@).

// Texte mis dans video_jobs.prompt quand rien n'est écrit : la base exige un prompt sans template
// (video_jobs_template_ou_prompt) ; Claude le lit comme « aucune consigne » (décision de Hugues du 15 oct. 2026).
export const PROMPT_STANDARD = 'Montage standard, aucune consigne particulière.'

export const MESSAGE_TIMELINE_CLIENTE = "Timeline fermée : la vidéo d'une cliente ne quitte pas le Mac. Le montage passe par l'IA, comme avant."
export const MESSAGE_PAS_RECETTE = "Ce montage n'est pas fait avec le nouveau moteur (template, plusieurs clips ou montage d'avant) : la timeline ne sait pas l'ouvrir."

// Bouton « Ouvrir » : moi ou l'équipe, sans template, pas dans la corbeille. Le reste (un seul clip, moteur
// recette) est vérifié à l'ouverture.
export function peutOuvrirTimeline(job) {
  return !!job && job.personnes === 'moi_equipe' && !job.template_id && !job.supprime_le
}

export function estCliente(job) {
  return job?.personnes === 'cliente'
}

// Mêmes conditions que choixMoteur de l'agent (agent/src/recette.ts) pour un nouveau montage.
export function surMoteurRecette({ personnes, templateId, clips }) {
  return (personnes === 'moi_equipe' || personnes === 'cliente') && !templateId
    && (clips || []).length === 1 && clips[0].role === 'principal'
}

// « Monter moi-même » : moi ou l'équipe, sans template, un seul clip Principal. null = permis, sinon la raison.
export function raisonMoiMeme({ personnes, templateId, clips }) {
  if (personnes !== 'moi_equipe') return null
  if (templateId) return '« Monter moi-même » se fait sans template : retire le template choisi.'
  if ((clips || []).length !== 1 || clips[0].role !== 'principal') {
    return '« Monter moi-même » se fait avec une seule vidéo (Principal), sans B-roll.'
  }
  return null
}

// Où aller après le lancement : la timeline si elle pourra s'ouvrir, sinon l'éditeur actuel.
export function routeApresLancement(jobId, { personnes, templateId, clips }) {
  return personnes === 'moi_equipe' && surMoteurRecette({ personnes, templateId, clips })
    ? `/reseaux-sociaux/montage/${jobId}/timeline`
    : `/reseaux-sociaux/montage/${jobId}`
}

// --- Tâches de l'agent (payload exact attendu, voir agent/src/taches.ts) -------------------------------

export const tachePreparer = (jobId) => ({ job_id: jobId, type: 'timeline_preparer', payload: {} })
export const tacheAppliquer = (jobId) => ({ job_id: jobId, type: 'timeline_appliquer', payload: {} })
export const tacheIA = (jobId, prompt) => ({ job_id: jobId, type: 'montage', payload: { prompt: prompt.trim(), depuis_timeline: true } })
export const tacheMoiMeme = (jobId) => ({ job_id: jobId, type: 'montage', payload: { manuel: true } })

// --- État de la timeline -----------------------------------------------------------------------------

// Faut-il lancer timeline_preparer ? Ligne absente (montage d'avant), ressources vidées (après Terminer ou
// 7 jours) ou sans copie légère.
export function timelineAPreparer(ligne) {
  if (!ligne || !ligne.recette) return true
  const proxies = ligne.ressources?.proxies
  return !proxies || Object.keys(proxies).length === 0
}

// Brouillon fait sur une version plus ancienne (une version est arrivée depuis : sous-titres, restauration,
// correction ailleurs) : la personne choisit de le reprendre ou de repartir de la version actuelle.
export function brouillonPerime(ligne, derniereVersion) {
  if (!ligne?.brouillon || !ligne.brouillon_le || !derniereVersion?.created_at) return false
  return new Date(ligne.brouillon_le) < new Date(derniereVersion.created_at)
}

const ACTIVES = ['en_attente', 'en_cours']
export function tacheActiveDe(taches, type = null) {
  return (taches || []).find(t => ACTIVES.includes(t.statut) && (!type || t.type === type)) || null
}

// Tâche suivie (Appliquer, Demander à l'IA) → forme « travail » de la timeline du labo
export function travailDe({ genre, tache, job, version, debut }) {
  if (!tache) return null
  const base = { type: genre, debut, journal: [], fin: null, resultat: null }
  if (ACTIVES.includes(tache.statut)) {
    const ligne = tache.statut === 'en_attente'
      ? 'En attente du Mac…'
      : `${job?.etape || 'En cours'}${job?.progression ? ` (${job.progression} %)` : ''}`
    return { ...base, etat: 'en_cours', journal: [ligne] }
  }
  if (tache.statut === 'fait') return { ...base, etat: 'fini', fin: Date.now(), resultat: { reponse: version?.reponse_agent || null } }
  const erreur = tache.statut === 'annulee' ? 'Tâche annulée.' : (tache.erreur || "Le Mac a signalé une erreur sans message.")
  return { ...base, etat: 'erreur', fin: Date.now(), resultat: { erreur } }
}

// Terminer depuis la timeline : jamais avec un brouillon pas appliqué ni pendant un travail.
export function raisonTerminerTimeline({ brouillon, enCours }) {
  if (enCours) return 'Attends la fin du travail en cours.'
  if (brouillon) return "Applique d'abord tes changements (« Appliquer ») : Terminer exporte la dernière version rendue."
  return null
}

// --- Bibliothèque de sons (sons/index.json de l'agent) ---------------------------------------------------

// La recette nomme le vrai fichier (accents compris) ; le stockage a une clé sans accent (cleSon de l'agent).
export function indexSons(index) {
  const chemins = {}
  const sons = []
  for (const s of index?.sons || []) {
    if (!s?.fichier || !s.chemin) continue
    chemins[s.fichier] = s.chemin
    sons.push({ fichier: s.fichier, categorie: s.categorie, duree: Number(s.duree) || 0, usage: s.usage || '' })
  }
  return { chemins, sons }
}

// Catalogue (hub/catalogue.json) + sons → « modèles » de la palette, comme /api/modeles du labo
export function modelesDe(catalogue, sons) {
  return { ...catalogue, sons }
}

// --- Forme d'onde (musique ajoutée dans la timeline) -------------------------------------------------------

// Même calcul que outil.py onde : pic de chaque tranche de 0,05 s, de 0 à 1, deux décimales.
export function calculerOnde(echantillons, taux, pas = 0.05) {
  const n = Math.max(1, Math.round(taux * pas))
  const pics = []
  for (let i = 0; i < echantillons.length; i += n) {
    let max = 0
    const fin = Math.min(echantillons.length, i + n)
    for (let j = i; j < fin; j++) {
      const v = Math.abs(echantillons[j])
      if (v > max) max = v
    }
    pics.push(max)
  }
  const haut = Math.max(0, ...pics) || 1
  return { duree: Math.round((echantillons.length / taux) * 1000) / 1000, pas, pics: pics.map(p => Math.round((p / haut) * 100) / 100) }
}

// Canaux → mono (moyenne), pour calculerOnde
export function mono(canaux) {
  if (!canaux.length) return new Float32Array(0)
  if (canaux.length === 1) return canaux[0]
  const sortie = new Float32Array(canaux[0].length)
  for (const c of canaux) for (let i = 0; i < sortie.length; i++) sortie[i] += c[i] / canaux.length
  return sortie
}

// --- Liens signés -------------------------------------------------------------------------------------

export const BUCKET_TIMELINE = 'video-timeline'
export const DUREE_LIEN_S = 15 * 60   // décision de Hugues : 15 min, renouvelés par le hub
export const RENOUVELER_AVANT_MS = 3 * 60 * 1000

// Lien encore bon à servir ; à renouveler quand il reste moins de 3 min
export function etatLien(entree, maintenant = Date.now()) {
  if (!entree?.url) return 'absent'
  if (entree.expire - maintenant <= 0) return 'expire'
  if (entree.expire - maintenant <= RENOUVELER_AVANT_MS) return 'a_renouveler'
  return 'bon'
}
