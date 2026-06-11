import { useState, useMemo } from 'react'
import Card from '../../shared/Card'
import Button from '../../shared/Button'
import { supabase } from '../../../lib/supabase'
import { NATUROS, formatCAD, num } from '../../../lib/performanceCalc'

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function naturoLabel(key) {
  return NATUROS.find(n => n.key === key)?.label || (key === 'cloe' ? 'Cloé' : key)
}

function suggestion(row, params) {
  const capPct = num(params?.reer_match_cap_pct) || 0.03
  const salaryKey = row.naturo_key === 'cloe' ? 'salaire_cloe' : NATUROS.find(x => x.key === row.naturo_key)?.salaryKey
  const cap = capPct * (num(params?.[salaryKey]) / 12)
  return Math.min(num(row.montant_naturo), cap)
}

function Row({ row, params, onConfirm }) {
  const label = naturoLabel(row.naturo_key)
  const [montant, setMontant] = useState(String(Math.round(suggestion(row, params) * 100) / 100))
  const [saving, setSaving] = useState(false)

  async function viewProof() {
    if (!row.proof_path) return
    const { data } = await supabase.storage.from('reer-proofs').createSignedUrl(row.proof_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function confirm() {
    setSaving(true)
    await onConfirm(row.naturo_key, row.year, row.month, montant)
    setSaving(false)
  }

  return (
    <div className="flex items-center gap-3 flex-wrap px-3 py-2 rounded-lg border border-[#e5e7eb] bg-white">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#1a1a1a]">{label} — {MONTHS_FR[row.month - 1]} {row.year}</p>
        <p className="text-xs text-[#6b7280]">A cotisé <span className="font-semibold text-[#1a1a1a]">{formatCAD(row.montant_naturo)}</span></p>
      </div>
      {row.proof_path && (
        <button onClick={viewProof} className="text-xs font-semibold text-[#00bbb1] hover:underline">Voir la preuve</button>
      )}
      <div className="relative">
        <input type="number" value={montant} onChange={e => setMontant(e.target.value)}
          className="w-28 px-3 py-1.5 pr-6 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#9ca3af]">$</span>
      </div>
      <Button size="sm" onClick={confirm} loading={saving}>Confirmer NEO</Button>
    </div>
  )
}

// Boîte admin : cotisations soumises par les naturos, admissibles, à confirmer.
export default function AdminContribInbox({ snapshots, params, onConfirm }) {
  const pending = useMemo(() => {
    return (snapshots || [])
      .filter(r => num(r.montant_naturo) > 0 && r.plancher_atteint && r.marge_ok && !r.neo_confirmed_at)
      .sort((a, b) => b.year - a.year || b.month - a.month)
  }, [snapshots])

  if (!pending.length) return null

  return (
    <Card className="p-5 border-[#00bbb1]/40">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-[#00bbb1] animate-pulse" />
        <h3 className="text-sm font-bold text-[#1a1a1a]">Cotisations à confirmer ({pending.length})</h3>
      </div>
      <p className="text-xs text-[#6b7280] mb-3">Un naturo a cotisé et son statut du mois est « NEO verse ». Confirme le montant que NEO dépose.</p>
      <div className="space-y-2">
        {pending.map(r => (
          <Row key={`${r.naturo_key}-${r.year}-${r.month}`} row={r} params={params} onConfirm={onConfirm} />
        ))}
      </div>
    </Card>
  )
}
