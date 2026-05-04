import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ─── Helpers async (exportés pour useTasks + Boutique) ────────

/**
 * Met à jour les points d'un membre et inscrit la transaction.
 * Appelé depuis toggleTaskCompletion (tâches) et createRedemption (boutique).
 * @param {string} userId
 * @param {number} delta  — positif ou négatif
 * @param {string} referenceId — UUID de la tâche ou de la redemption
 * @param {'task_completed'|'task_uncompleted'|'redemption'|'refund'} type
 */
export async function updateUserPoints(userId, delta, referenceId, type) {
  // Lire le solde actuel (ou créer la ligne si elle n'existe pas encore)
  const { data: existing } = await supabase
    .from('user_points')
    .select('points_total, points_current_month')
    .eq('user_id', userId)
    .maybeSingle()

  const currentTotal   = existing?.points_total          ?? 0
  const currentMonthly = existing?.points_current_month  ?? 0

  const newTotal   = Math.max(0, currentTotal   + delta)
  const newMonthly = Math.max(0, currentMonthly + delta)

  // Upsert user_points (crée la ligne si absente)
  await supabase.from('user_points').upsert(
    {
      user_id:               userId,
      points_total:          newTotal,
      points_current_month:  newMonthly,
      updated_at:            new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )

  // Log immuable
  await supabase.from('points_transactions').insert({
    user_id:      userId,
    amount:       delta,
    type,
    reference_id: referenceId ?? null,
    balance_after: newTotal,
  })
}

/**
 * Vérifie et met à jour le streak du membre.
 * À appeler une fois par jour (la fonction est idempotente via last_streak_check_date).
 * Règle : streak +1 si TOUTES les tâches prioritaires avec due_date = hier ont été complétées.
 *         Reset à 0 sinon, ou si last_streak_check_date a plus d'1 jour de retard.
 */
export async function checkAndUpdateStreak(userId) {
  if (!userId) return

  const today     = new Date()
  const todayStr  = today.toISOString().split('T')[0]

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  // Lire l'état actuel
  const { data: pts } = await supabase
    .from('user_points')
    .select('current_streak_days, last_streak_check_date')
    .eq('user_id', userId)
    .maybeSingle()

  // Déjà vérifié aujourd'hui → on sort
  if (pts?.last_streak_check_date === todayStr) return

  // Si plus d'1 jour de retard → reset automatique
  const lastCheck    = pts?.last_streak_check_date
  const currentStreak = pts?.current_streak_days ?? 0

  let gapDays = Infinity
  if (lastCheck) {
    gapDays = Math.floor(
      (new Date(todayStr) - new Date(lastCheck)) / (1000 * 60 * 60 * 24)
    )
  }

  let newStreak = currentStreak

  if (gapDays > 1) {
    // L'utilisateur a sauté au moins un jour
    newStreak = 0
  } else {
    // Compter les prioritaires avec due_date = hier
    const { data: yesterdayTasks } = await supabase
      .from('tasks')
      .select('id, is_completed')
      .eq('user_id', userId)
      .eq('priority', 'prioritaire')
      .eq('due_date', yesterdayStr)

    const total     = yesterdayTasks?.length ?? 0
    const completed = yesterdayTasks?.filter(t => t.is_completed).length ?? 0

    if (total === 0) {
      // Aucune tâche due hier — on maintient le streak (pas de pénalité)
      newStreak = currentStreak
    } else if (completed === total) {
      newStreak = currentStreak + 1
    } else {
      newStreak = 0
    }
  }

  await supabase.from('user_points').upsert(
    {
      user_id:                userId,
      current_streak_days:    newStreak,
      last_streak_check_date: todayStr,
      updated_at:             new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
}

/**
 * Reset mensuel des points — appelle le RPC Supabase.
 * Idempotent : le RPC vérifie last_monthly_reset avant d'agir.
 */
export async function resetMonthlyPointsIfNeeded(userId) {
  if (!userId) return
  await supabase.rpc('reset_monthly_points', { p_user_id: userId })
}

// ─── Hook : useUserPoints ─────────────────────────────────────
/**
 * Lit le solde en temps réel d'un membre.
 * Déclenche le reset mensuel et le calcul du streak au mount.
 */
export function useUserPoints(userId) {
  const [points, setPoints] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }

    async function load() {
      try {
        // Reset mensuel + streak (idempotents)
        await resetMonthlyPointsIfNeeded(userId)
        await checkAndUpdateStreak(userId)

        const { data } = await supabase
          .from('user_points')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle()

        setPoints(data ?? {
          points_total: 0,
          points_current_month: 0,
          points_pending: 0,
          current_streak_days: 0,
        })
      } catch {
        setPoints({
          points_total: 0,
          points_current_month: 0,
          points_pending: 0,
          current_streak_days: 0,
        })
      } finally {
        setLoading(false)
      }
    }

    load()

    // Realtime : solde mis à jour en live quand points changent
    const channel = supabase
      .channel(`user-points-${userId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'user_points',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new) setPoints(payload.new)
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [userId])

  return { points, loading }
}

// ─── Hook : usePointsTransactions ────────────────────────────
/**
 * Lit l'historique des transactions de points d'un membre.
 * @param {string}  userId
 * @param {object}  opts — { month?: number, year?: number, limit?: number }
 */
export function usePointsTransactions(userId, { month, year, limit = 50 } = {}) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }

    async function load() {
      let query = supabase
        .from('points_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (year && month) {
        const from = `${year}-${String(month).padStart(2, '0')}-01T00:00:00`
        const toDate = new Date(year, month, 1) // 1er du mois suivant
        const to = toDate.toISOString().split('T')[0] + 'T00:00:00'
        query = query.gte('created_at', from).lt('created_at', to)
      }

      const { data } = await query
      setTransactions(data ?? [])
      setLoading(false)
    }

    load()
  }, [userId, month, year, limit])

  return { transactions, loading }
}

// ─── Hook : usePointsHistory ──────────────────────────────────
/**
 * Lit les snapshots mensuels agrégés d'un membre.
 */
export function usePointsHistory(userId) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }

    supabase
      .from('user_points_history')
      .select('*')
      .eq('user_id', userId)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .then(({ data }) => {
        setHistory(data ?? [])
        setLoading(false)
      })
  }, [userId])

  return { history, loading }
}
