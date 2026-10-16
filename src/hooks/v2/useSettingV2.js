import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchAllRows } from '../../lib/ghlHelpers'
import { indexerAppels, ajouterEvenement } from '../../lib/v2/settingV2'
import { CALENDARS_DECOUVERTE } from '../../lib/v2/salesConfig'
import { useRealtimeRefetch } from './useRealtimeRefetch'

const JOURS_APPELS = 31

// Données du Setting v2 : journal d'appels (copie GHL), propriété des leads,
// mes rappels, contacts sortis par un résultat, noms des profils, interrupteur
// des écritures GHL. Temps réel sur les tables setting_*.
export function useSettingV2({ userId, enabled = true } = {}) {
  const [etat, setEtat] = useState({
    appels: [], proprietes: [], rappels: [], traites: [], profils: [], rencontres: [], ecrituresReelles: false,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!enabled) { setLoading(false); return }
    try {
      const depuis = new Date(Date.now() - JOURS_APPELS * 86_400_000).toISOString()
      const [appels, props, rappels, traites, profils, config, rencontres] = await Promise.all([
        fetchAllRows((a, b) => supabase.from('setting_appels')
          .select('id, contact_id, user_id, sortant, statut, duree, appele_le')
          .gte('appele_le', depuis).order('id').range(a, b)),
        supabase.from('setting_proprietes').select('*'),
        supabase.from('setting_rappels').select('*').eq('statut', 'actif').order('rappel_le'),
        supabase.rpc('setting_contacts_traites', { p_jours: 90 }),
        supabase.from('profiles').select('id, full_name, role, secondary_roles'),
        supabase.from('setting_config').select('cle, valeur').eq('cle', 'ecritures_ghl_reelles').maybeSingle(),
        // Contacts qui ont déjà eu (ou ont) une rencontre découverte non annulée
        fetchAllRows((a, b) => supabase.from('ghl_appointments').select('contact_id, start_time')
          .in('calendar_id', CALENDARS_DECOUVERTE).neq('status', 'cancelled').order('id').range(a, b)),
      ])
      for (const r of [props, rappels, traites, profils]) if (r.error) throw r.error
      setEtat({
        appels,
        proprietes: props.data ?? [],
        rappels: rappels.data ?? [],
        traites: traites.data ?? [],
        profils: profils.data ?? [],
        ecrituresReelles: config.data?.valeur === true,
        rencontres,
      })
      setError(null)
    } catch (err) {
      console.error('[useSettingV2]', err)
      setError(err.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch(['setting_appels', 'setting_proprietes', 'setting_rappels', 'setting_resultats'], load, { enabled })

  const derive = useMemo(() => {
    const nomsParId = Object.fromEntries(etat.profils.map(p => [p.id, p.full_name]))
    const setters = etat.profils
      .filter(p => [p.role, ...(p.secondary_roles ?? [])].some(r => ['setter', 'resp_vente', 'admin'].includes(r)))
      .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)))
    return {
      nomsParId,
      setters,
      appelsParContact: indexerAppels(etat.appels),
      proprietes: new Map(etat.proprietes.map(p => [p.contact_id, p])),
      // Rappels du setter connecté (l'admin lit aussi ceux des autres)
      mesRappels: etat.rappels.filter(r => r.user_id === userId),
      rappelsParContact: new Map(etat.rappels.filter(r => r.user_id === userId).map(r => [r.contact_id, r])),
      tousRappelsParContact: new Map(etat.rappels.map(r => [r.contact_id, r])),
      traites: new Set(etat.traites.map(t => t.contact_id)),
      // Date du dernier événement qui sort un lead des listes : résultat
      // (Non qualifié / Pas intéressé) ou rencontre découverte. Voir sortiDesListes.
      evenementsSortie: (() => {
        const m = new Map()
        for (const t of etat.traites) ajouterEvenement(m, t.contact_id, t.cree_le)
        for (const r of etat.rencontres) ajouterEvenement(m, r.contact_id, r.start_time)
        return m
      })(),
    }
  }, [etat, userId])

  return { ...etat, ...derive, loading, error, refetch: load }
}

// Appel des actions serveur (Résultat, rappel, réassignation)
export async function actionSetting(body) {
  const { data, error } = await supabase.functions.invoke('setting-actions', { body })
  if (error) {
    let msg = error.message
    try { msg = (await error.context.json()).error ?? msg } catch { /* réponse non JSON */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
