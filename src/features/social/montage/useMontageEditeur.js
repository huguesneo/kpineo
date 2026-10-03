import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { tacheDemande, delaiRenouvellement } from '../../../lib/montageEditeur'
import { tacheCorrection, erreurBase } from '../../../lib/montageSousTitres'
import { tacheRestaurer, tacheTerminer } from '../../../lib/montageFin'
import { tacheVariante } from '../../../lib/montageVariantes'
import { ligneAjoutClip } from '../../../lib/montageClips'
import { urlSigneeApercu } from './useMontageVideo'

const COLONNES_JOB =
  'id, titre, cree_par, statut, etape, progression, created_at, updated_at, erreur, format, version_courante, template_id, prompt, lien_drive_export, variante_de'
const COLONNES_VERSION = 'id, job_id, numero, chemin_apercu, prompt, reponse_agent, auteur, created_at, sous_titres'
const COLONNES_TACHE = 'id, job_id, type, payload, statut, cree_par, erreur, created_at'
const COLONNES_CLIP = 'id, job_id, ordre, role, nom, nom_source, duree_s, remplace_ordre, ajoute_en_version'
const COLONNES_VARIANTE = 'id, titre, statut, format, version_courante, created_at, variante_de'
const POLLING_MS = 3000

function remplacer(liste, row) {
  return [...liste.filter(x => x.id !== row.id), row]
}

// Un montage, ses versions et ses tâches, en direct (ses clips : relus avec le
// reste, sans temps réel ; une erreur de lecture des clips ne bloque pas l'éditeur). Temps réel Supabase filtré
// sur le montage ; si le canal n'est pas abonné, rechargement toutes les 3 s.
export function useMontageEditeur(jobId) {
  const [job, setJob] = useState(null)
  const [versions, setVersions] = useState([])
  const [taches, setTaches] = useState([])
  const [clips, setClips] = useState([])
  // Variantes de ce montage (video_jobs.variante_de = ce montage) et, pour une
  // variante, son montage d'origine { id, titre }.
  const [variantes, setVariantes] = useState([])
  const [origine, setOrigine] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [introuvable, setIntrouvable] = useState(false)
  // null = connexion en cours, true = abonné, false = coupé
  const [direct, setDirect] = useState(null)

  const reload = useCallback(async () => {
    const [j, v, t, c, va] = await Promise.all([
      supabase.from('video_jobs').select(COLONNES_JOB).eq('id', jobId).maybeSingle(),
      supabase.from('video_versions').select(COLONNES_VERSION).eq('job_id', jobId).order('numero'),
      supabase.from('video_taches').select(COLONNES_TACHE).eq('job_id', jobId).order('created_at'),
      supabase.from('video_clips').select(COLONNES_CLIP).eq('job_id', jobId).order('ordre'),
      supabase.from('video_jobs').select(COLONNES_VARIANTE).eq('variante_de', jobId).order('created_at'),
    ])
    const err = j.error || v.error || t.error
    if (err) {
      setError(err.message || 'Erreur inconnue')
    } else {
      setError(null)
      setIntrouvable(!j.data)
      setJob(j.data)
      setVersions(v.data ?? [])
      setTaches(t.data ?? [])
      if (!c.error) setClips(c.data ?? [])
      if (!va.error) setVariantes(va.data ?? [])
    }
    setLoading(false)
  }, [jobId])

  useEffect(() => {
    let annule = false
    setLoading(true)
    reload()
    let coupe = false
    const filtre = `job_id=eq.${jobId}`
    const channel = supabase.channel(`montage-editeur-${jobId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_jobs', filter: `id=eq.${jobId}` }, (payload) => {
        if (payload.eventType === 'DELETE') { setJob(null); setIntrouvable(true); return }
        setJob(prev => ({ ...prev, ...payload.new }))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_jobs', filter: `variante_de=eq.${jobId}` }, (payload) => {
        if (payload.eventType === 'DELETE') { setVariantes(prev => prev.filter(x => x.id !== payload.old?.id)); return }
        setVariantes(prev => remplacer(prev, payload.new).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_versions', filter: filtre }, (payload) => {
        if (payload.eventType === 'DELETE') { setVersions(prev => prev.filter(x => x.id !== payload.old?.id)); return }
        setVersions(prev => remplacer(prev, payload.new))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_taches', filter: filtre }, (payload) => {
        if (payload.eventType === 'DELETE') { setTaches(prev => prev.filter(x => x.id !== payload.old?.id)); return }
        setTaches(prev => remplacer(prev, payload.new))
      })
      .subscribe((etat) => {
        if (annule) return
        if (etat === 'SUBSCRIBED') {
          // Reconnexion après une coupure : on recharge pour ne rien manquer.
          if (coupe) reload()
          coupe = false
          setDirect(true)
        } else if (etat === 'CHANNEL_ERROR' || etat === 'TIMED_OUT' || etat === 'CLOSED') {
          coupe = true
          setDirect(false)
        }
      })
    return () => {
      annule = true
      supabase.removeChannel(channel)
    }
  }, [jobId, reload])

  // Secours : polling tant que le temps réel n'est pas abonné.
  useEffect(() => {
    if (direct === true) return
    const minuterie = setInterval(reload, POLLING_MS)
    return () => clearInterval(minuterie)
  }, [direct, reload])

  // Envoie une demande. La tâche est ajoutée tout de suite (sans attendre le
  // temps réel) pour que le champ se désactive aussitôt.
  const envoyer = useCallback(async (prompt) => {
    const { data, error: err } = await supabase.from('video_taches').insert(tacheDemande(jobId, prompt)).select(COLONNES_TACHE).single()
    if (err) throw err
    setTaches(prev => remplacer(prev, data))
  }, [jobId])

  // Corrections de sous-titres, restauration, export : même principe que envoyer.
  const creerTache = useCallback(async (tache) => {
    const { data, error: err } = await supabase.from('video_taches').insert(tache).select(COLONNES_TACHE).single()
    if (err) throw err
    setTaches(prev => remplacer(prev, data))
  }, [])
  // Corrections de sous-titres faites sur la version numeroBase. Avant l'envoi,
  // on relit le montage et ses tâches actives : si une autre version est
  // arrivée ou attend (une suppression décale les numéros de mots), rien ne
  // part et l'éditeur se recharge avec les sous-titres de la nouvelle version.
  const corriger = useCallback(async (corrections, { numeroBase, totalMots }) => {
    const tache = tacheCorrection(jobId, corrections, totalMots)
    const [j, t] = await Promise.all([
      supabase.from('video_jobs').select('id, version_courante').eq('id', jobId).maybeSingle(),
      supabase.from('video_taches').select('id').eq('job_id', jobId).in('statut', ['en_attente', 'en_cours']),
    ])
    if (j.error || t.error) throw j.error || t.error
    const erreur = erreurBase({ numeroBase, job: j.data, tachesActives: t.data })
    if (erreur) {
      reload()
      throw Object.assign(new Error(erreur), { clair: true })
    }
    await creerTache(tache)
  }, [creerTache, jobId, reload])
  const restaurer = useCallback((numero) => creerTache(tacheRestaurer(jobId, numero)), [creerTache, jobId])
  const terminer = useCallback(() => creerTache(tacheTerminer(jobId)), [creerTache, jobId])
  const creerVariante = useCallback((choix) => creerTache(tacheVariante(jobId, choix)), [creerTache, jobId])

  // Ajoute ou remplace un clip après la v1 (la base donne l'ordre et refuse
  // pendant un rendu final). Renvoie la ligne créée. Aucune ronde ne part.
  const ajouterClip = useCallback(async (choix) => {
    const { data, error: err } = await supabase.from('video_clips').insert(ligneAjoutClip(jobId, clips, choix)).select(COLONNES_CLIP).single()
    if (err) throw err
    setClips(prev => [...prev.filter(c => c.id !== data.id), data])
    return data
  }, [jobId, clips])

  // Montage d'origine d'une variante : son titre pour le lien.
  const varianteDe = job?.variante_de ?? null
  useEffect(() => {
    if (!varianteDe) { setOrigine(null); return }
    let annule = false
    supabase.from('video_jobs').select('id, titre').eq('id', varianteDe).maybeSingle()
      .then(({ data }) => { if (!annule) setOrigine(data ?? { id: varianteDe, titre: null }) })
    return () => { annule = true }
  }, [varianteDe])

  return {
    job, versions, taches, clips, variantes, origine, loading, error, introuvable, direct, reload,
    envoyer, corriger, restaurer, terminer, creerVariante, ajouterClip,
  }
}

export const MESSAGE_SORTIE = "Tes corrections de sous-titres n'ont pas été envoyées. Quitter la page quand même ?"

// Tant que `actif` : avertit avant de fermer ou recharger l'onglet, et demande
// confirmation avant de suivre un lien interne (menu, « Retour aux montages ») :
// BrowserRouter n'a pas de blocage de navigation.
export function useConfirmerSortie(actif, message = MESSAGE_SORTIE) {
  useEffect(() => {
    if (!actif) return
    const avant = (e) => { e.preventDefault(); e.returnValue = '' }
    const clic = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const lien = e.target?.closest?.('a[href]')
      if (!lien || lien.target === '_blank') return
      if (!window.confirm(message)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', avant)
    document.addEventListener('click', clic, true)
    return () => {
      window.removeEventListener('beforeunload', avant)
      document.removeEventListener('click', clic, true)
    }
  }, [actif, message])
}

// Noms des auteurs (courriels → nom du profil).
export function useNoms(courriels) {
  const [noms, setNoms] = useState({})
  const cle = [...new Set((courriels || []).filter(Boolean))].sort().join(',')
  useEffect(() => {
    if (!cle) return
    let annule = false
    supabase.from('profiles').select('email, full_name').in('email', cle.split(','))
      .then(({ data }) => {
        if (!annule && data) setNoms(Object.fromEntries(data.map(p => [p.email, p.full_name])))
      })
    return () => { annule = true }
  }, [cle])
  return noms
}

// URL signée de l'aperçu affiché, renouvelée 5 min avant l'expiration d'1 h.
// `renouveler` sert aussi quand la vidéo n'arrive plus à se charger.
export function useUrlApercu(chemin) {
  const [etat, setEtat] = useState({ chemin: null, url: null, erreur: null })
  const cache = useRef({})
  const [tour, setTour] = useState(0)

  const renouveler = useCallback(() => {
    if (chemin) delete cache.current[chemin]
    setTour(t => t + 1)
  }, [chemin])

  useEffect(() => {
    if (!chemin) { setEtat({ chemin: null, url: null, erreur: null }); return }
    let annule = false
    let minuterie
    const planifier = (obtenueLe) => {
      minuterie = setTimeout(renouveler, delaiRenouvellement(obtenueLe))
    }
    const enCache = cache.current[chemin]
    if (enCache && delaiRenouvellement(enCache.obtenueLe) > 0) {
      setEtat({ chemin, url: enCache.url, erreur: null })
      planifier(enCache.obtenueLe)
    } else {
      setEtat(e => (e.chemin === chemin ? e : { chemin, url: null, erreur: null }))
      urlSigneeApercu(chemin)
        .then((url) => {
          if (annule) return
          const obtenueLe = Date.now()
          cache.current[chemin] = { url, obtenueLe }
          setEtat({ chemin, url, erreur: null })
          planifier(obtenueLe)
        })
        .catch((e) => { if (!annule) setEtat({ chemin, url: null, erreur: e.message || "L'aperçu est introuvable." }) })
    }
    return () => {
      annule = true
      clearTimeout(minuterie)
    }
  }, [chemin, tour, renouveler])

  return { ...etat, renouveler }
}
