import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchCloserOpps, fetchAllRows } from '../../lib/ghlHelpers'
import { loadSetterCommissionData } from '../../lib/commissions/loadSetterData'
import { computeSetterCommissions } from '../../lib/commissions/setterCommissions'
import { ventesParCloseur, classement, sommeCash, rythme, banniereSetter, banniereCloseur } from '../../lib/v2/scoreboard'
import { jourMontreal } from '../../lib/v2/setterFiles'
import { prenom } from '../../lib/v2/format'
import { DELAIS } from '../../lib/v2/salesConfig'

function bornes(today) {
  const [y, m, d] = today.split('-').map(Number)
  const joursDansMois = new Date(y, m, 0).getDate()
  const q = Math.floor((m - 1) / 3)
  const qFinMois = q * 3 + 3
  return {
    moisDebut: `${today.slice(0, 7)}-01`,
    moisFin: `${today.slice(0, 7)}-${String(joursDansMois).padStart(2, '0')}`,
    trimDebut: `${y}-${String(q * 3 + 1).padStart(2, '0')}-01`,
    trimFin: `${y}-${String(qFinMois).padStart(2, '0')}-${String(new Date(y, qFinMois, 0).getDate()).padStart(2, '0')}`,
    jour: d, joursDansMois,
  }
}

const aRole = (p, r) => p.role === r || (p.secondary_roles ?? []).includes(r)

// Données du scoreboard : ventes par closeur, show-ups par setter (moteur de
// commissions), cash d'équipe du mois vs objectif, bannières « il te manque ».
export function useScoreboard(profile) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const today = jourMontreal(new Date())
      const b = bornes(today)
      const [opps, setterRaw, profils, cashMois, cashTrim, objectifs] = await Promise.all([
        fetchCloserOpps('contact_id, stage_name, raw, closed_at'),
        loadSetterCommissionData(supabase),
        supabase.from('profiles').select('id, full_name, role, secondary_roles, annual_bonus, is_active').eq('is_active', true),
        fetchAllRows((f, t) => supabase.from('closer_payment_tracking').select('closer_name, amount')
          .gte('txn_date', b.moisDebut).lte('txn_date', b.moisFin).order('id').range(f, t)),
        fetchAllRows((f, t) => supabase.from('closer_payment_tracking').select('closer_name, amount')
          .gte('txn_date', b.trimDebut).lte('txn_date', b.trimFin).order('id').range(f, t)),
        supabase.from('objectives').select('user_id, type, scope, target_value, period_start, period_end')
          .in('type', ['team_cash_target', 'setter_showup_target', 'quarterly_revenue'])
          .lte('period_start', today).gte('period_end', today),
      ])
      const membres = profils.data ?? []
      const objs = objectifs.data ?? []

      // Show-ups du mois par setter : même moteur que la paie
      const setters = membres.filter(p => aRole(p, 'setter'))
      const showups = setters.map(p => {
        const r = computeSetterCommissions({ ...setterRaw, setterName: p.full_name, start: b.moisDebut, end: today })
        return { profil: p, nom: prenom(p.full_name), valeur: r.showupCount ?? 0 }
      })

      const cash = sommeCash(cashMois)
      const objectifEquipe = objs.find(o => o.type === 'team_cash_target' && ['team', 'clinic'].includes(o.scope))?.target_value ?? null

      // Bannières : setters (show-ups du mois), closeurs (cash du trimestre)
      const bannieres = []
      for (const s of showups) {
        const obj = objs.find(o => o.user_id === s.profil.id && o.type === 'setter_showup_target'
          && o.period_start === b.moisDebut && o.period_end === b.moisFin)?.target_value
        const bn = banniereSetter({
          prenom: s.nom, showups: s.valeur, objectif: Number(obj ?? 0),
          bonusMensuel: s.profil.annual_bonus ? s.profil.annual_bonus / 12 : null,
        })
        if (bn) bannieres.push({ userId: s.profil.id, ...bn })
      }
      for (const p of membres.filter(m => aRole(m, 'closer'))) {
        const obj = objs.find(o => o.user_id === p.id && o.type === 'quarterly_revenue'
          && o.period_start === b.trimDebut && o.period_end === b.trimFin)?.target_value
        const cle = prenom(p.full_name).toLowerCase()
        const bn = banniereCloseur({
          prenom: prenom(p.full_name),
          cashTrimestre: sommeCash(cashTrim.filter(c => String(c.closer_name ?? '').toLowerCase() === cle)),
          objectifTrimestre: Number(obj ?? 0),
        })
        if (bn) bannieres.push({ userId: p.id, ...bn })
      }

      setData({
        today, ...b,
        ventes: ventesParCloseur(opps, b.moisDebut, b.moisFin),
        showups: classement(showups.map(s => ({ nom: s.nom, valeur: s.valeur }))),
        cash, objectifEquipe,
        rythme: rythme({ objectif: objectifEquipe, cash, jour: b.jour, joursDansMois: b.joursDansMois }),
        bannieres,
        majA: new Date(),
      })
    } catch (err) {
      console.error('[useScoreboard]', err)
      setError(err.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  // Rafraîchissement toutes les 5 minutes
  useEffect(() => {
    const iv = setInterval(load, DELAIS.refetchSecoursMs)
    return () => clearInterval(iv)
  }, [load])

  const maBanniere = data?.bannieres.find(x => x.userId === profile?.id) ?? null
  return { data, loading, error, maBanniere, refetch: load }
}
