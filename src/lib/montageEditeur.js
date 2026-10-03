// Logique de l'éditeur de montage (phase 3a), sans dépendance à React ni à
// Supabase (testée dans montageEditeur.test.js).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function jobIdValide(id) {
  return UUID.test(id || '')
}

export const LONGUEUR_MAX_DEMANDE = 4000

// Tâche « montage » sur un montage existant. Contrat de l'agent : à partir de
// la version 1, `payload.prompt` est obligatoire ; à la première ronde (version
// 0, par exemple après une erreur), un payload vide relance avec le prompt du
// montage et un prompt écrit s'y ajoute.
export function tacheDemande(jobId, prompt) {
  const texte = (prompt || '').trim()
  return { job_id: jobId, type: 'montage', payload: texte ? { prompt: texte } : {} }
}

const ACTIVES = ['en_attente', 'en_cours']

// Tâche du montage que l'agent n'a pas encore finie (la plus ancienne d'abord :
// c'est celle qu'il prendra).
export function tacheActive(taches) {
  return [...(taches || [])]
    .filter(t => ACTIVES.includes(t.statut))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0] ?? null
}

export function derniereTache(taches) {
  return [...(taches || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] ?? null
}

// Peut-on envoyer une demande ? Retourne { desactive, raison, videPermis }.
// videPermis : à la première ronde, « Relancer le montage » part sans texte.
export function etatEnvoi({ job, taches }) {
  if (!job) return { desactive: true, raison: 'Chargement du montage...', videPermis: false }
  if (job.statut === 'termine') {
    return { desactive: true, raison: 'Ce montage est terminé : il ne peut plus être modifié ici.', videPermis: false }
  }
  const active = tacheActive(taches)
  if (active?.statut === 'en_cours') {
    return { desactive: true, raison: "L'agent travaille sur la dernière demande. Tu pourras écrire la suivante quand la nouvelle version sera prête.", videPermis: false }
  }
  if (active) {
    return { desactive: true, raison: "Ta demande attend son tour dans la file. Tu pourras en envoyer une autre quand l'agent y aura répondu.", videPermis: false }
  }
  return { desactive: false, raison: null, videPermis: !(job.version_courante > 0) }
}

export function validerDemande(prompt, videPermis) {
  const texte = (prompt || '').trim()
  if (!texte && !videPermis) return 'Écris ce que tu veux changer.'
  if (texte.length > LONGUEUR_MAX_DEMANDE) return `Ta demande est trop longue (${LONGUEUR_MAX_DEMANDE} caractères au plus).`
  return null
}

export function trierVersions(versions) {
  return [...(versions || [])].sort((a, b) => a.numero - b.numero)
}

// Version affichée dans le lecteur : celle choisie dans la bande si elle existe
// encore, sinon la dernière qui a un aperçu.
export function versionAffichee(versions, numeroChoisi) {
  const triees = trierVersions(versions).filter(v => v.chemin_apercu)
  if (!triees.length) return null
  if (numeroChoisi != null) {
    const choisie = triees.find(v => v.numero === numeroChoisi)
    if (choisie) return choisie
  }
  return triees[triees.length - 1]
}

export function dernierNumero(versions) {
  return (versions || []).reduce((max, v) => Math.max(max, v.numero || 0), 0)
}

// Texte d'une tâche dans le fil : son prompt, sinon ce qu'elle fait.
export function texteTache(tache) {
  if (tache?.type === 'correction_sous_titres') {
    const n = Array.isArray(tache.payload?.corrections) ? tache.payload.corrections.length : 0
    return `Correction des sous-titres à la main (${n} mot${n > 1 ? 's' : ''})`
  }
  if (tache?.type === 'restaurer') return `Restaurer la version ${tache.payload?.version ?? '?'}`
  if (tache?.type === 'terminer') return 'Terminer et exporter en HD'
  return tache?.payload?.prompt || 'Lancer le montage'
}

// Fil de conversation : pour chaque version, la demande (prompt) puis la
// réponse de l'agent ; un export réussi (tâche terminer faite) se place à sa
// date entre les versions. Ensuite la demande en cours (pas encore de version)
// ou le refus de la dernière demande. `job` sert au chemin du dernier export.
export function filConversation({ versions, taches, job = null }) {
  const blocs = []
  for (const v of trierVersions(versions)) {
    const bloc = []
    if (v.prompt) {
      bloc.push({ cle: `p${v.numero}`, role: 'demande', texte: v.prompt, auteur: v.auteur, date: v.created_at, version: v.numero })
    }
    bloc.push({
      cle: `r${v.numero}`,
      role: 'agent',
      texte: v.reponse_agent || 'Version prête, sans commentaire de l\'agent.',
      date: v.created_at,
      version: v.numero,
    })
    blocs.push({ date: v.created_at, messages: bloc })
  }
  const exports = [...(taches || [])]
    .filter(t => t.type === 'terminer' && t.statut === 'fait')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  exports.forEach((t, i) => {
    const chemin = i === exports.length - 1 ? job?.lien_drive_export : null
    blocs.push({
      date: t.created_at,
      messages: [
        { cle: `t${t.id}`, role: 'demande', texte: texteTache(t), auteur: t.cree_par, date: t.created_at },
        { cle: `x${t.id}`, role: 'agent', texte: chemin ? `Rendu HD exporté dans Google Drive : \`${chemin}\`` : 'Rendu HD exporté dans Google Drive.', date: t.created_at },
      ],
    })
  })
  const temps = (d) => new Date(d).getTime() || 0
  const messages = blocs.sort((a, b) => temps(a.date) - temps(b.date)).flatMap(b => b.messages)
  const active = tacheActive(taches)
  if (active) {
    messages.push({
      cle: `t${active.id}`, role: 'demande', texte: texteTache(active),
      auteur: active.cree_par, date: active.created_at, enAttente: active.statut,
    })
    return messages
  }
  // Une demande refusée ou échouée n'a pas de version : on la montre avec son erreur.
  const derniere = derniereTache(taches)
  const dernierVersion = trierVersions(versions).at(-1)
  if (derniere?.statut === 'erreur' && (!dernierVersion || new Date(derniere.created_at) > new Date(dernierVersion.created_at))) {
    messages.push({
      cle: `t${derniere.id}`, role: 'demande', texte: texteTache(derniere),
      auteur: derniere.cree_par, date: derniere.created_at,
    })
    messages.push({
      cle: `e${derniere.id}`, role: 'erreur', texte: derniere.erreur || "L'agent a signalé une erreur sans message.",
      date: derniere.created_at, tache: derniere.type,
    })
  }
  return messages
}

// Une URL signée dure 1 h : on la renouvelle 5 min avant.
export const DUREE_URL_SIGNEE_S = 3600
export const RENOUVELER_AVANT_MS = 5 * 60 * 1000

export function delaiRenouvellement(obtenueLe, maintenant = Date.now()) {
  return Math.max(0, obtenueLe + DUREE_URL_SIGNEE_S * 1000 - RENOUVELER_AVANT_MS - maintenant)
}

// Erreur à l'envoi d'une demande → message clair en français.
export function messageErreurEnvoi(err) {
  const msg = `${err?.message || ''} ${err?.details || ''}`
  if (err?.code === '42501' || /row-level security/i.test(msg)) {
    return "Ton compte n'a pas l'autorisation d'envoyer une demande. Demande à Hugues de vérifier ton accès au module."
  }
  if (/failed to fetch|network|load failed|fetch failed|networkerror/i.test(msg) || err?.name === 'TypeError') {
    return "La connexion a été coupée : ta demande n'est pas partie. Vérifie ta connexion, puis renvoie-la."
  }
  return `Ta demande n'a pas pu être envoyée : ${err?.message || 'erreur inconnue'}.`
}
