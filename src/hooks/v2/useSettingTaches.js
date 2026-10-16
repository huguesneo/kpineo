import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { tachesDuJour } from '../../lib/v2/settingV2'

// Tâches automatiques du Setting v2 (setting_taches) du setter connecté, plus
// les tâches d'équipe (sans setter). Temps réel.
export function useSettingTaches(userId, { enabled = true } = {}) {
  const [taches, setTaches] = useState([])
  const [now, setNow] = useState(Date.now())

  const load = useCallback(async () => {
    if (!enabled || !userId) return
    const { data, error } = await supabase.from('setting_taches').select('*')
      .is('fait_le', null)
      .or(`user_id.eq.${userId},user_id.is.null`)
      .order('due_le')
      .limit(300)
    if (!error) setTaches(data ?? [])
  }, [userId, enabled])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!enabled || !userId) return undefined
    const ch = supabase.channel(`setting-taches-${userId}-${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'setting_taches' }, () => load())
      .subscribe()
    const iv = setInterval(() => setNow(Date.now()), 30_000)
    return () => { supabase.removeChannel(ch); clearInterval(iv) }
  }, [userId, enabled, load])

  const duJour = useMemo(() => tachesDuJour(taches, now), [taches, now])
  const dues = useMemo(() => taches.filter(t => new Date(t.due_le).getTime() <= now), [taches, now])

  const marquer = useCallback(async (id, champ) => {
    const valeur = new Date().toISOString()
    setTaches(ts => (champ === 'fait_le' ? ts.filter(t => t.id !== id) : ts.map(t => (t.id === id ? { ...t, [champ]: valeur } : t))))
    await supabase.from('setting_taches').update({ [champ]: valeur }).eq('id', id)
  }, [])

  return { taches, duJour, dues, now, marquerFaite: id => marquer(id, 'fait_le'), marquerNotifiee: id => marquer(id, 'notifie_le'), refetch: load }
}
