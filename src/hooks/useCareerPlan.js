import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { startOfQuarter, endOfQuarter, format } from 'date-fns'

export function useCareerPlan(userId) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('career_plans')
      .select('*')
      .eq('user_id', userId)
      .order('year')
      .order('effective_date', { ascending: true, nullsFirst: true })
    setPlans(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { fetch() }, [fetch])

  return { plans, loading, refetch: fetch }
}

export async function upsertCareerPlan({ id, user_id, year, planned_salary, notes, effective_date }) {
  const payload = {
    user_id,
    year,
    planned_salary,
    notes: notes || null,
    effective_date: effective_date || null,
  }
  if (id) {
    const { error } = await supabase.from('career_plans').update(payload).eq('id', id)
    return { error }
  }
  const { error } = await supabase.from('career_plans').insert(payload)
  return { error }
}

export async function deleteCareerPlan(id) {
  const { error } = await supabase.from('career_plans').delete().eq('id', id)
  return { error }
}

export async function updateBaseSalary(userId, baseSalary) {
  const { error } = await supabase
    .from('profiles')
    .update({ base_salary: baseSalary })
    .eq('id', userId)
  return { error }
}

export async function updateAnnualBonus(userId, annualBonus) {
  const { error } = await supabase
    .from('profiles')
    .update({ annual_bonus: annualBonus })
    .eq('id', userId)
  return { error }
}

// ─── Quarterly bonus records ──────────────────────────────────

export function useQuarterlyBonusRecords(userId) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('quarterly_bonuses')
      .select('*')
      .eq('user_id', userId)
      .order('year', { ascending: false })
      .order('quarter', { ascending: true })
    setRecords(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  return { records, loading, refetch: load }
}

export async function upsertQuarterlyBonusRecord({ user_id, year, quarter, achievement_pct, bonus_paid, is_paid, notes }) {
  const { error } = await supabase
    .from('quarterly_bonuses')
    .upsert(
      { user_id, year, quarter, achievement_pct, bonus_paid, is_paid, notes, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,year,quarter' }
    )
  return { error }
}

// ─── Live quarterly bonus calculation (current quarter) ───────

const ROLE_TO_QB = { naturopathe: 'naturopathe', closer: 'closer', setter: 'setter' }

export function useQuarterlyBonus(userId, annualBonus, qbRevenue = null, memberRole = null) {
  const [bonus, setBonus] = useState(null)
  const [achievement, setAchievement] = useState(null)
  const [loading, setLoading] = useState(true)

  const quarterStart = format(startOfQuarter(new Date()), 'yyyy-MM-dd')
  const quarterEnd = format(endOfQuarter(new Date()), 'yyyy-MM-dd')

  useEffect(() => {
    if (!userId || !annualBonus) {
      setAchievement(null)
      setBonus(null)
      setLoading(false)
      return
    }
    loadBonus()
  }, [userId, annualBonus, qbRevenue])

  async function loadBonus() {
    setLoading(true)
    const [objRes, kpiRes] = await Promise.all([
      supabase.from('objectives').select('*').eq('user_id', userId).eq('scope', 'individual')
        .lte('period_start', quarterEnd).gte('period_end', quarterStart),
      supabase.from('kpi_entries').select('kpi_type, value').eq('user_id', userId).eq('scope', 'individual')
        .gte('entry_date', quarterStart).lte('entry_date', quarterEnd),
    ])

    const objectives = objRes.data || []
    const entries = kpiRes.data || []

    if (objectives.length === 0) {
      setAchievement(null)
      setBonus(null)
      setLoading(false)
      return
    }

    const qbField = ROLE_TO_QB[memberRole]
    const roleData = qbRevenue && qbField ? qbRevenue[qbField] : null
    const now = new Date()
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    let totalPct = 0, count = 0
    objectives.forEach(obj => {
      let current = 0

      if (roleData && (obj.type === 'monthly_revenue' || obj.type === 'quarterly_revenue')) {
        if (obj.type === 'quarterly_revenue') {
          current = roleData.quarterly ?? 0
        } else {
          const objStart = new Date(obj.period_start)
          if (objStart.getFullYear() === now.getFullYear() && objStart.getMonth() === now.getMonth()) {
            current = roleData.monthly ?? 0
          } else if (objStart.getFullYear() === prevMonthDate.getFullYear() && objStart.getMonth() === prevMonthDate.getMonth()) {
            current = roleData.prevMonthly ?? 0
          } else {
            current = entries.filter(k => k.kpi_type === obj.type).reduce((a, k) => a + Number(k.value), 0)
          }
        }
      } else {
        current = entries.filter(k => k.kpi_type === obj.type).reduce((a, k) => a + Number(k.value), 0)
      }

      if (obj.target_value > 0) {
        totalPct += (current / obj.target_value) * 100
        count++
      }
    })

    const achPct = count > 0 ? totalPct / count : 0
    setAchievement(Math.round(achPct * 10) / 10)

    // annualBonus / 4 = quarterly base, scales proportionally with achievement
    const quarterly_bonus_base = Number(annualBonus) / 4
    const bonusAmount = achPct >= 80 ? quarterly_bonus_base * (achPct / 100) : 0
    setBonus(Math.round(bonusAmount))
    setLoading(false)
  }

  return { bonus, achievement, loading, quarterStart, quarterEnd }
}
