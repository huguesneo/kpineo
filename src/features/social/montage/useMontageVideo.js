import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { CLE_DOSSIER_BRUT_ID, CLE_DOSSIER_BRUT_NOM, lireDossierBrut } from '../../../lib/montageVideo'

const COLONNES_JOB =
  'id, titre, cree_par, statut, etape, progression, created_at, updated_at, fichier_drive_id, nom_source, lien_drive_export, erreur, format'

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
