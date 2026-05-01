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
    setPlans(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { fetch() }, [fetch])

  return { plans, loading, refetch: fetch }
}

export async function upsertCareerPlan({ user_id, year, planned_salary, notes }) {
  const { error } = await supabase
    .from('career_plans')
    .upsert({ user_id, year, planned_salary, notes }, { onConflict: 'user_id,year' })
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

export function useQuarterlyBonus(userId, baseSalary) {
  const [bonus, setBonus] = useState(null)
  const [achievement, setAchievement] = useState(null)
  const [loading, setLoading] = useState(true)

  const quarterStart = format(startOfQuarter(new Date()), 'yyyy-MM-dd')
  const quarterEnd = format(endOfQuarter(new Date()), 'yyyy-MM-dd')

  useEffect(() => {
    if (!userId || !baseSalary) {
      setAchievement(null)
      setBonus(null)
      setLoading(false)
      return
    }
    loadBonus()
  }, [userId, baseSalary])

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

    let totalPct = 0, count = 0
    objectives.forEach(obj => {
      const sum = entries
        .filter(k => k.kpi_type === obj.type)
        .reduce((a, k) => a + Number(k.value), 0)
      if (obj.target_value > 0) {
        totalPct += (sum / obj.target_value) * 100
        count++
      }
    })

    const achPct = count > 0 ? totalPct / count : 0
    setAchievement(Math.round(achPct * 10) / 10)

    const quarterly_bonus_base = Number(baseSalary) * 0.025
    let bonusAmount = 0
    if (achPct >= 110) {
      bonusAmount = quarterly_bonus_base * 1.10
    } else if (achPct >= 80) {
      bonusAmount = quarterly_bonus_base * (achPct / 100)
    }
    setBonus(Math.round(bonusAmount))
    setLoading(false)
  }

  return { bonus, achievement, loading, quarterStart, quarterEnd }
}
