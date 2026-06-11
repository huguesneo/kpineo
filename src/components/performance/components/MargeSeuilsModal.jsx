import { useState, useMemo } from 'react'
import Modal from '../../shared/Modal'
import Button from '../../shared/Button'
import {
  NATUROS, calcMargeNaturo, margeSeuilKey, objectifDebutKey,
  hasMonthData, formatPct, num,
} from '../../../lib/performanceCalc'

function todayStr() { return new Date().toISOString().slice(0, 10) }

// Moyenne de la marge des N derniers mois saisis (ignore les mois sans revenu).
function avgMarge(months, params, naturoKey, n = 3) {
  const sorted = [...months].filter(hasMonthData).sort((a, b) => b.year - a.year || b.month - a.month).slice(0, n)
  const vals = sorted.map(m => calcMargeNaturo(m, params, naturoKey)).filter(v => v != null)
  if (!vals.length) return null
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

export default function MargeSeuilsModal({ isOpen, onClose, params, months, margeHistorique, onSave }) {
  const init = () => {
    const d = {}
    NATUROS.forEach(n => {
      d[n.key] = {
        seuil: num(params[margeSeuilKey(n.key)]),
        dateEffet: todayStr(),
        objectifDebut: params[objectifDebutKey(n.key)] || '',
      }
    })
    return d
  }
  const [draft, setDraft] = useState(init)
  const [cloe, setCloe] = useState({
    seuilReels: num(params.reer_seuil_reels_cloe),
    seuilLeads: num(params.reer_seuil_leads_cloe),
  })
  const [saving, setSaving] = useState(false)

  const avgs = useMemo(() => {
    const a = {}
    NATUROS.forEach(n => { a[n.key] = avgMarge(months, params, n.key) })
    return a
  }, [months, params])

  function set(key, field, value) {
    setDraft(d => ({ ...d, [key]: { ...d[key], [field]: value } }))
  }

  async function handleSave() {
    setSaving(true)
    const paramUpdates = {}
    const historyRows = []
    NATUROS.forEach(n => {
      const nv = num(draft[n.key].seuil)
      const ov = num(params[margeSeuilKey(n.key)])
      paramUpdates[margeSeuilKey(n.key)] = nv
      paramUpdates[objectifDebutKey(n.key)] = draft[n.key].objectifDebut || null
      if (nv !== ov) {
        historyRows.push({
          naturo: n.key,
          ancien_seuil: ov,
          nouveau_seuil: nv,
          date_effet: draft[n.key].dateEffet || todayStr(),
          note: null,
        })
      }
    })
    // Seuils KPI de Cloé (le salaire se règle dans « Modifier les paramètres fixes »)
    paramUpdates.reer_seuil_reels_cloe = Math.round(num(cloe.seuilReels))
    paramUpdates.reer_seuil_leads_cloe = Math.round(num(cloe.seuilLeads))
    await onSave(paramUpdates, historyRows)
    setSaving(false)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Seuils de marge & objectifs 12 mois" size="lg">
      <div className="space-y-5">
        {NATUROS.map(n => {
          const avg = avgs[n.key]
          const seuil = num(draft[n.key].seuil)
          const warn = avg != null && seuil > avg
          return (
            <div key={n.key} className="rounded-lg border border-[#e5e7eb] p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-[#1a1a1a]">{n.label}</h4>
                <span className="text-xs text-[#6b7280]">
                  Marge moy. 3 mois : <span className="font-semibold">{avg != null ? formatPct(avg / 100, 1) : '—'}</span>
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[#6b7280]">Seuil de marge requis (%)</label>
                  <input type="number" step="0.5" value={draft[n.key].seuil}
                    onChange={e => set(n.key, 'seuil', e.target.value)}
                    className="px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[#6b7280]">Date d'effet du seuil</label>
                  <input type="date" value={draft[n.key].dateEffet}
                    onChange={e => set(n.key, 'dateEffet', e.target.value)}
                    className="px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[#6b7280]">Début objectif 12 mois</label>
                  <input type="date" value={draft[n.key].objectifDebut}
                    onChange={e => set(n.key, 'objectifDebut', e.target.value)}
                    className="px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
                </div>
              </div>
              {warn && (
                <p className="mt-2 text-xs font-semibold text-amber-600">
                  ⚠ {n.label} ne recevra pas de REER avec ce seuil (marge moy. récente : {formatPct(avg / 100, 1)})
                </p>
              )}
            </div>
          )
        })}

        {/* Cloé — conditions KPI */}
        <div className="rounded-lg border border-[#e5e7eb] p-4">
          <h4 className="text-sm font-bold text-[#1a1a1a] mb-2">Cloé — Conditions KPI</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#6b7280]">Seuil Reels / mois</label>
              <input type="number" value={cloe.seuilReels}
                onChange={e => setCloe(c => ({ ...c, seuilReels: e.target.value }))}
                className="px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#6b7280]">Seuil leads organiques / mois</label>
              <input type="number" value={cloe.seuilLeads}
                onChange={e => setCloe(c => ({ ...c, seuilLeads: e.target.value }))}
                className="px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
            </div>
          </div>
          <p className="text-xs text-[#9ca3af] mt-2">
            Les conditions de Cloé sont basées sur ses KPIs réseaux sociaux plutôt que sur une marge individuelle, puisqu'elle est en support.
            Les seuils doivent être équivalents en effort aux conditions des naturos. Mettre le seuil leads à 0 désactive cette condition.
          </p>
        </div>

        {/* Historique */}
        {margeHistorique?.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-[#6b7280] uppercase mb-2">Historique des changements</h4>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {margeHistorique.map(h => {
                const label = NATUROS.find(x => x.key === h.naturo)?.label || h.naturo
                return (
                  <div key={h.id} className="flex justify-between text-xs text-[#6b7280] border-b border-[#f1f5f9] py-1">
                    <span><span className="font-semibold text-[#1a1a1a]">{label}</span> · {h.date_effet}</span>
                    <span>{num(h.ancien_seuil)} % → <span className="font-semibold">{num(h.nouveau_seuil)} %</span></span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-[#e5e7eb]">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSave} loading={saving}>Enregistrer</Button>
        </div>
      </div>
    </Modal>
  )
}
