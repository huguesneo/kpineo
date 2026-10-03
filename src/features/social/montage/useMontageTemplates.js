import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { ligneProposition, changementDecision } from '../../../lib/montageTemplates'

export const COLONNES_TEMPLATE =
  'id, nom, description, type_video, statut, propose_par, approuve_par, approuve_le, motif_refus, chemin_apercu, style_enregistre, reference_video_neo, job_id, numero_version, created_at'
const COLONNES_TACHE_STYLE = 'id, type, payload, statut, erreur, created_at'

function remplacer(liste, row) {
  return [...liste.filter(x => x.id !== row.id), row]
}

// Tâches enregistrer_style (job_id vide : créées par la base à l'approbation).
async function lireTachesStyle() {
  const { data, error } = await supabase.from('video_taches').select(COLONNES_TACHE_STYLE)
    .eq('type', 'enregistrer_style').order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  return data ?? []
}

// Templates proposés depuis un montage (pour l'éditeur), en direct, et la
// proposition d'une version.
export function useTemplatesDuMontage(jobId) {
  const [templates, setTemplates] = useState([])
  const [tachesStyle, setTachesStyle] = useState([])

  const reload = useCallback(async () => {
    const { data } = await supabase.from('video_templates').select(COLONNES_TEMPLATE).eq('job_id', jobId)
    if (data) setTemplates(data)
    lireTachesStyle().then(setTachesStyle).catch(() => {})
  }, [jobId])

  useEffect(() => {
    reload()
    const channel = supabase.channel(`montage-templates-${jobId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_templates', filter: `job_id=eq.${jobId}` }, (payload) => {
        if (payload.eventType === 'DELETE') { setTemplates(prev => prev.filter(x => x.id !== payload.old?.id)); return }
        setTemplates(prev => remplacer(prev, payload.new))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_taches', filter: 'type=eq.enregistrer_style' }, (payload) => {
        if (payload.eventType === 'DELETE') return
        setTachesStyle(prev => remplacer(prev, payload.new))
      })
      .subscribe((etat) => { if (etat === 'SUBSCRIBED') reload() })
    return () => { supabase.removeChannel(channel) }
  }, [jobId, reload])

  // Crée la proposition (statut « propose » forcé par la base). Aucune tâche :
  // enregistrer_style partira à l'approbation de Hugues.
  const proposer = useCallback(async ({ numero, nom, description }) => {
    const { data, error } = await supabase.from('video_templates')
      .insert(ligneProposition({ jobId, numero, nom, description })).select(COLONNES_TEMPLATE).single()
    if (error) throw error
    setTemplates(prev => remplacer(prev, data))
    return data
  }, [jobId])

  return { templates, tachesStyle, proposer }
}

// Tous les templates (écran Templates) : montage d'origine, aperçu de la
// version proposée, tâche enregistrer_style. En direct.
export function useTemplates() {
  const [templates, setTemplates] = useState([])
  const [jobs, setJobs] = useState({})
  const [versions, setVersions] = useState([])
  const [tachesStyle, setTachesStyle] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setError(null)
    const { data, error: err } = await supabase.from('video_templates').select(COLONNES_TEMPLATE).order('created_at', { ascending: false })
    if (err) { setError(err.message || 'Erreur inconnue'); setLoading(false); return }
    setTemplates(data ?? [])
    const ids = [...new Set((data ?? []).map(t => t.job_id).filter(Boolean))]
    if (ids.length) {
      const [j, v] = await Promise.all([
        supabase.from('video_jobs').select('id, titre').in('id', ids),
        supabase.from('video_versions').select('job_id, numero, chemin_apercu').in('job_id', ids),
      ])
      if (j.data) setJobs(Object.fromEntries(j.data.map(x => [x.id, x.titre])))
      if (v.data) setVersions(v.data)
    }
    lireTachesStyle().then(setTachesStyle).catch(() => {})
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
    const channel = supabase.channel('montage-templates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_templates' }, (payload) => {
        if (payload.eventType === 'DELETE') { setTemplates(prev => prev.filter(x => x.id !== payload.old?.id)); return }
        // Une nouvelle proposition peut venir d'un autre montage : on relit tout.
        if (payload.eventType === 'INSERT') { reload(); return }
        setTemplates(prev => remplacer(prev, payload.new))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_taches', filter: 'type=eq.enregistrer_style' }, (payload) => {
        if (payload.eventType === 'DELETE') return
        setTachesStyle(prev => remplacer(prev, payload.new))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [reload])

  // Approuver, refuser (motif facultatif) ou archiver. Une ligne non modifiée
  // (déjà tranchée, ou pas le droit) est signalée.
  const decider = useCallback(async (id, action, motif) => {
    const { data, error: err } = await supabase.from('video_templates')
      .update(changementDecision(action, motif)).eq('id', id).select(COLONNES_TEMPLATE)
    if (err) throw err
    if (!data?.length) throw new Error("Ce template n'a pas pu être modifié (déjà tranché, ou ton compte n'y a pas droit).")
    setTemplates(prev => remplacer(prev, data[0]))
    if (action === 'approuver') lireTachesStyle().then(setTachesStyle).catch(() => {})
  }, [])

  return { templates, jobs, versions, tachesStyle, loading, error, reload, decider }
}
