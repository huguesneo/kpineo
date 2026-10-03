// Étape 10a : templates proposés depuis l'éditeur, approbation par Hugues,
// refus motivé, archivage. Sans dépendance à React ni à Supabase (testée dans
// montageTemplates.test.js).
//
// Contrat vérifié dans video-neo/agent/src/taches.ts (enregistrerStyle) et
// supabase/migrations/20261001e_montage_video.sql :
// - le hub crée le template (statut forcé à « propose » par la base) avec
//   job_id et numero_version : c'est la version que l'agent enregistrera ;
// - la tâche enregistrer_style ({ template_id }) est créée PAR LA BASE quand
//   Hugues approuve (trigger video_templates_approuve). L'agent refuse un
//   template non approuvé : le hub ne crée donc jamais cette tâche lui-même ;
// - l'agent écrit ensuite reference_video_neo (style/<slug>), chemin_apercu
//   (templates/<id>/apercu.mp4) et style_enregistre = true.

import { etatEnvoi } from './montageEditeur'
import { canApproveVideoTemplates } from './montageVideoAccess'

// Le skill de montage de video-neo (comme les templates de départ).
export const TYPE_VIDEO = 'neo-video-montage'
export const NOM_MAX = 80
export const DESCRIPTION_MAX = 300
export const MOTIF_MAX = 200

export function validerProposition({ nom, description }) {
  const n = (nom || '').trim()
  if (!n) return 'Donne un nom au template.'
  if (n.length > NOM_MAX) return `Le nom est trop long (${NOM_MAX} caractères au plus).`
  if ((description || '').trim().length > DESCRIPTION_MAX) return `La description est trop longue (${DESCRIPTION_MAX} caractères au plus).`
  return null
}

// Ligne insérée dans video_templates. statut, propose_par, motif_refus et
// style_enregistre sont forcés par la base : inutile de les envoyer.
export function ligneProposition({ jobId, numero, nom, description }) {
  return {
    nom: (nom || '').trim(),
    description: (description || '').trim() || null,
    type_video: TYPE_VIDEO,
    job_id: jobId,
    numero_version: numero,
  }
}

// Une proposition encore vivante pour cette version (un refus permet de reproposer).
export function propositionExistante(templates, jobId, numero) {
  return (templates || []).find(t => t.job_id === jobId && t.numero_version === numero && t.statut !== 'refuse') ?? null
}

// Bouton « Proposer comme template » sur la version affichée (l'agent
// enregistre la version numero_version, pas forcément l'actuelle).
// Retourne { visible, desactive, raison }.
export function etatProposer({ job, taches, version, templates }) {
  if (!job || !version) return { visible: false, desactive: true, raison: null }
  const envoi = etatEnvoi({ job, taches })
  if (envoi.desactive) return { visible: true, desactive: true, raison: envoi.raison }
  const existant = propositionExistante(templates, job.id, version.numero)
  if (existant) {
    return {
      visible: true,
      desactive: true,
      raison: `La v${version.numero} est déjà proposée comme template « ${existant.nom} » (${statutTemplate(existant).label.toLowerCase()}).`,
    }
  }
  return { visible: true, desactive: false, raison: null }
}

// Dernière tâche enregistrer_style d'un template.
export function tacheStyle(taches, templateId) {
  return [...(taches || [])]
    .filter(t => t.type === 'enregistrer_style' && t.payload?.template_id === templateId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] ?? null
}

// Statut affiché : { cle, label, variant, detail }.
export function statutTemplate(template, tache = null) {
  switch (template?.statut) {
    case 'propose':
      return { cle: 'propose', label: 'Proposé', variant: 'warning', detail: "En attente de l'approbation de Hugues." }
    case 'refuse':
      return {
        cle: 'refuse', label: 'Refusé', variant: 'danger',
        detail: template.motif_refus ? `Motif : ${template.motif_refus}` : 'Refusé sans motif.',
      }
    case 'archive':
      return { cle: 'archive', label: 'Archivé', variant: 'default', detail: "Retiré de la galerie. Les montages qui l'ont utilisé restent." }
    case 'approuve': {
      if (template.style_enregistre) {
        return { cle: 'approuve', label: 'Approuvé', variant: 'success', detail: 'Dans la galerie de « Nouvelle vidéo ».' }
      }
      let detail = 'Le Mac va enregistrer le style (branche, modèle et aperçu).'
      if (tache?.statut === 'en_cours') detail = "L'agent enregistre le style…"
      else if (tache?.statut === 'erreur') detail = `L'enregistrement du style a échoué : ${tache.erreur || 'erreur sans message'}`
      else if (tache?.statut === 'en_attente') detail = "Enregistrement du style en attente du Mac."
      return { cle: 'preparation', label: 'Approuvé, style en préparation', variant: 'primary', detail, erreur: tache?.statut === 'erreur' }
    }
    default:
      return { cle: 'inconnu', label: template?.statut || 'Inconnu', variant: 'default', detail: null }
  }
}

// Chemin de l'aperçu dans video-apercus : celui du template une fois le style
// enregistré, sinon celui de la version proposée (ce que Hugues approuve).
export function cheminApercuTemplate(template, versions) {
  if (template?.style_enregistre && template.chemin_apercu) return template.chemin_apercu
  const v = (versions || []).find(x => x.job_id === template?.job_id && x.numero === template?.numero_version)
  return v?.chemin_apercu || null
}

// Boutons d'un template pour l'utilisateur connecté. Seul Hugues décide
// (la base le garantit aussi) ; on approuve sur un aperçu, donc pas sans.
export function actionsTemplate({ template, email, apercuPret }) {
  const hugues = canApproveVideoTemplates(email)
  const decider = hugues && template?.statut === 'propose'
  return {
    approuver: decider,
    refuser: decider,
    approuverDesactive: decider && !apercuPret,
    archiver: hugues && template?.statut === 'approuve',
  }
}

// Mise à jour envoyée pour une décision. approuve_par / approuve_le sont
// remplis par la base.
export function changementDecision(action, motif = '') {
  if (action === 'approuver') return { statut: 'approuve' }
  if (action === 'refuser') return { statut: 'refuse', motif_refus: (motif || '').trim().slice(0, MOTIF_MAX) || null }
  if (action === 'archiver') return { statut: 'archive' }
  throw new Error(`Décision inconnue : ${action}`)
}

const ORDRE = { propose: 0, approuve: 1, refuse: 2, archive: 3 }

// Proposés d'abord, puis approuvés, refusés, archivés ; les plus récents en haut.
export function trierTemplates(templates) {
  return [...(templates || [])].sort((a, b) =>
    (ORDRE[a.statut] ?? 9) - (ORDRE[b.statut] ?? 9) || new Date(b.created_at) - new Date(a.created_at))
}

// Date affichée : la décision pour un template tranché, sinon la proposition.
export function dateTemplate(template) {
  return template?.statut === 'propose' ? template.created_at : (template?.approuve_le || template?.created_at)
}

// Messages du fil de l'éditeur pour les templates proposés depuis ce montage :
// la proposition, puis où elle en est. Format de filConversation.
export function messagesTemplates(templates, taches) {
  return (templates || []).map(t => {
    const s = statutTemplate(t, tacheStyle(taches, t.id))
    const texte = t.statut === 'propose' ? s.detail : `Template « ${t.nom} » : ${s.label.toLowerCase()}. ${s.detail || ''}`.trim()
    return {
      date: t.created_at,
      messages: [
        { cle: `tp${t.id}`, role: 'demande', texte: `Proposer la v${t.numero_version} comme template « ${t.nom} »`, auteur: t.propose_par, date: t.created_at },
        { cle: `ts${t.id}`, role: 'agent', texte, date: dateTemplate(t), version: t.numero_version },
      ],
    }
  })
}

// Erreur à la proposition ou à la décision → message clair.
export function messageErreurTemplate(err) {
  const msg = `${err?.message || ''} ${err?.details || ''}`
  if (/Seul Hugues/i.test(msg)) return 'Seul Hugues peut approuver, refuser ou archiver un template.'
  if (/Passage de statut non permis/i.test(msg)) return "Ce template a déjà changé de statut. Recharge la page."
  if (err?.code === '42501' || /row-level security/i.test(msg)) {
    return "Ton compte n'a pas l'autorisation de faire ça. Demande à Hugues de vérifier ton accès au module."
  }
  if (/failed to fetch|network|load failed|fetch failed|networkerror/i.test(msg) || err?.name === 'TypeError') {
    return "La connexion a été coupée : rien n'est parti. Vérifie ta connexion, puis réessaie."
  }
  return `Ça n'a pas fonctionné : ${err?.message || 'erreur inconnue'}.`
}
