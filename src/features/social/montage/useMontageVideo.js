import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import {
  CLE_DOSSIER_BRUT_ID, CLE_DOSSIER_BRUT_NOM, lireDossierBrut, premiereTacheMontage, cheminDernierApercu, derniereTacheParJob,
} from '../../../lib/montageVideo'
import { lignesClips } from '../../../lib/montageClips'

const COLONNES_JOB =
  'id, titre, cree_par, statut, etape, progression, created_at, updated_at, fichier_drive_id, nom_source, lien_drive_export, erreur, format, version_courante'

function trierParDate(jobs) {
  return [...jobs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

// Montages + noms des auteurs, mis à jour en direct (Realtime sur video_jobs).
export function useMontageJobs() {
  const [jobs, setJobs] = useState([])
  const [noms, setNoms] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [direct, setDirect] = useState(true)
  const coupe = useRef(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('video_jobs')
      .select(COLONNES_JOB)
      .order('created_at', { ascending: false })
    if (err) {
      setError(err.message || 'Erreur inconnue')
      setLoading(false)
      return
    }
    setJobs(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
    const channel = supabase.channel('montage-video-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_jobs' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setJobs(prev => prev.filter(j => j.id !== payload.old?.id))
          return
        }
        const row = payload.new
        setJobs(prev => trierParDate([row, ...prev.filter(j => j.id !== row.id)]))
      })
      .subscribe((etat) => {
        // Reconnexion après une coupure : on recharge pour ne rien manquer.
        if (etat === 'SUBSCRIBED') {
          if (coupe.current) reload()
          coupe.current = false
          setDirect(true)
        } else if (etat === 'CHANNEL_ERROR' || etat === 'TIMED_OUT') {
          coupe.current = true
          setDirect(false)
        }
      })
    return () => { supabase.removeChannel(channel) }
  }, [reload])

  // cree_par est un courriel : on affiche le nom du profil quand il existe.
  const courriels = [...new Set(jobs.map(j => j.cree_par).filter(Boolean))].sort().join(',')
  useEffect(() => {
    if (!courriels) return
    let annule = false
    supabase.from('profiles').select('email, full_name').in('email', courriels.split(','))
      .then(({ data }) => {
        if (annule || !data) return
        setNoms(Object.fromEntries(data.map(p => [p.email, p.full_name])))
      })
    return () => { annule = true }
  }, [courriels])

  return { jobs, noms, loading, error, reload, direct }
}

// Heartbeat de l'agent (ligne unique de video_agent_status), en direct.
// `maintenant` avance toutes les 5 s pour que la pastille passe hors ligne
// même quand plus aucun signal n'arrive.
export function useAgentStatus() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [maintenant, setMaintenant] = useState(() => Date.now())

  useEffect(() => {
    let annule = false
    supabase.from('video_agent_status').select('dernier_signal, tache_en_cours, version_agent').eq('id', 1).maybeSingle()
      .then(({ data, error: err }) => {
        if (annule) return
        if (err) setError(err.message || 'Erreur inconnue')
        else setStatus(data)
        setLoading(false)
      })
    const channel = supabase.channel('montage-video-agent')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_agent_status' }, (payload) => {
        if (payload.new) setStatus(payload.new)
      })
      .subscribe()
    const minuterie = setInterval(() => setMaintenant(Date.now()), 5000)
    return () => {
      annule = true
      clearInterval(minuterie)
      supabase.removeChannel(channel)
    }
  }, [])

  return { status, loading, error, maintenant }
}

// Dossier « NEO vidéo/Brut » mémorisé dans video_config.
export function useDossierBrut() {
  const [dossier, setDossier] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('video_config')
      .select('cle, valeur')
      .in('cle', [CLE_DOSSIER_BRUT_ID, CLE_DOSSIER_BRUT_NOM])
    if (err) setError(err.message || 'Erreur inconnue')
    else setDossier(lireDossierBrut(data))
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  const enregistrer = useCallback(async ({ id, nom }) => {
    const { error: err } = await supabase.from('video_config').upsert([
      { cle: CLE_DOSSIER_BRUT_ID, valeur: id },
      { cle: CLE_DOSSIER_BRUT_NOM, valeur: nom },
    ], { onConflict: 'cle' })
    if (err) throw new Error(err.message || 'Erreur inconnue')
    await reload()
  }, [reload])

  return { dossier, loading, error, reload, enregistrer }
}

// --- Phase 2 ------------------------------------------------------------------

const BUCKET_APERCUS = 'video-apercus'
const DUREE_URL_SIGNEE = 3600 // 1 h

export async function urlSigneeApercu(chemin) {
  const { data, error: err } = await supabase.storage.from(BUCKET_APERCUS).createSignedUrl(chemin, DUREE_URL_SIGNEE)
  if (err || !data?.signedUrl) throw new Error(err?.message || "L'aperçu est introuvable.")
  return data.signedUrl
}

// Templates approuvés (galerie de l'étape 2).
export function useTemplatesApprouves() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('video_templates')
      .select('id, nom, type_video, chemin_apercu, approuve_le')
      .eq('statut', 'approuve')
      .order('nom')
    if (err) setError(err.message || 'Erreur inconnue')
    else setTemplates(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])
  return { templates, loading, error, reload }
}

// Crée le montage, ses clips, puis sa tâche « montage ». Si le montage existe
// déjà (essai précédent arrivé à mi-chemin), il n'est pas recréé, et ses clips
// ne sont écrits que s'il n'en a encore aucun : pas de doublon.
// En cas d'échec, l'erreur porte `jobId` pour la nouvelle tentative.
export async function lancerMontage(ligne, jobIdExistant = null, clips = []) {
  let jobId = jobIdExistant
  if (!jobId) {
    const { data, error: err } = await supabase.from('video_jobs').insert(ligne).select('id').single()
    if (err) throw err
    jobId = data.id
  }
  if (clips.length) {
    const { count, error: errLecture } = await supabase
      .from('video_clips').select('id', { count: 'exact', head: true }).eq('job_id', jobId)
    if (errLecture) throw Object.assign(errLecture, { jobId })
    if (!count) {
      const { error: errClips } = await supabase.from('video_clips').insert(lignesClips(jobId, clips))
      if (errClips) throw Object.assign(errClips, { jobId })
    }
  }
  const { error: errTache } = await supabase.from('video_taches').insert(premiereTacheMontage(jobId, clips))
  if (errTache) throw Object.assign(errTache, { jobId })
  return jobId
}

// Ouvre l'aperçu de la dernière version dans un nouvel onglet. L'onglet est
// ouvert tout de suite (dans le clic), sinon Safari le bloque après l'attente.
export async function ouvrirDernierApercu(jobId) {
  const onglet = window.open('', '_blank')
  try {
    const { data, error: err } = await supabase
      .from('video_versions')
      .select('numero, chemin_apercu')
      .eq('job_id', jobId)
    if (err) throw new Error(err.message)
    const chemin = cheminDernierApercu(data)
    if (!chemin) throw new Error("Aucun aperçu n'est encore disponible pour ce montage.")
    const url = await urlSigneeApercu(chemin)
    if (onglet) onglet.location.href = url
    else window.location.assign(url)
  } catch (e) {
    onglet?.close()
    throw e
  }
}

// Dernière tâche de chaque montage, en direct (pour montrer un refus de l'agent).
export function useDernieresTaches() {
  const [taches, setTaches] = useState([])

  useEffect(() => {
    let annule = false
    supabase.from('video_taches')
      .select('id, job_id, type, statut, erreur, created_at')
      .order('created_at', { ascending: false })
      .limit(300)
      .then(({ data }) => { if (!annule && data) setTaches(data) })
    const channel = supabase.channel('montage-video-taches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_taches' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setTaches(prev => prev.filter(t => t.id !== payload.old?.id))
          return
        }
        const row = payload.new
        setTaches(prev => [row, ...prev.filter(t => t.id !== row.id)])
      })
      .subscribe()
    return () => {
      annule = true
      supabase.removeChannel(channel)
    }
  }, [])

  return derniereTacheParJob(taches)
}
