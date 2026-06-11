import { useState, useMemo, useEffect } from 'react'
import Card from '../shared/Card'
import Badge from '../shared/Badge'
import Button from '../shared/Button'
import { SkeletonCard } from '../shared/Skeleton'
import { NATUROS, formatCAD, formatPct, num } from '../../lib/performanceCalc'

const MONTHS_FR_FULL = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

// Encadré de saisie de cotisation pour un mois (avec pièce jointe obligatoire).
function ContributionBox({ row, onSubmit, getProofUrl }) {
  const [montant, setMontant] = useState(row.montant_naturo || '')
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null)
  const [proofUrl, setProofUrl] = useState(null)

  useEffect(() => {
    setMontant(row.montant_naturo || '')
    setFile(null)
    setMsg(null)
    setProofUrl(null)
    if (row.proof_path) getProofUrl(row.proof_path).then(setProofUrl)
  }, [row.year, row.month, row.proof_path, row.montant_naturo, getProofUrl])

  const conditionsHorsCotisation = row.plancher_atteint && row.marge_ok

  async function handleSubmit() {
    setMsg(null)
    const m = Number(montant) || 0
    if (m > 0 && !file && !row.proof_path) {
      setMsg({ type: 'error', text: 'Une pièce jointe (JPG, PNG ou PDF) est requise pour une cotisation.' })
      return
    }
    setSubmitting(true)
    const { error } = await onSubmit(row.year, row.month, m, file)
    setSubmitting(false)
    if (error) setMsg({ type: 'error', text: error.message })
    else setMsg({ type: 'ok', text: 'Cotisation envoyée. L\'administrateur sera notifié.' })
  }

  return (
    <Card className="p-5">
      <h3 className="text-sm font-bold text-[#1a1a1a] mb-1">Ma cotisation — {MONTHS_FR_FULL[row.month - 1]} {row.year}</h3>
      <p className="text-xs text-[#9ca3af] mb-3">
        {conditionsHorsCotisation
          ? 'Conditions remplies ce mois — si tu cotises, NEO versera (selon le plafond).'
          : 'Note : ce mois, les conditions (plancher NEO et/ou tes objectifs) ne sont pas toutes atteintes — NEO ne versera pas, mais tu peux quand même enregistrer ta cotisation.'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-[#6b7280]">Montant cotisé ($)</label>
          <input type="number" value={montant} onChange={e => setMontant(e.target.value)} placeholder="0"
            className="px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-[#6b7280]">Preuve (JPG, PNG, PDF)</label>
          <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={e => setFile(e.target.files?.[0] || null)}
            className="text-xs text-[#6b7280] file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#00bbb1] file:text-white hover:file:bg-[#009e95] file:cursor-pointer" />
        </div>
        <Button onClick={handleSubmit} loading={submitting} size="sm">Envoyer ma cotisation</Button>
      </div>

      {msg && (
        <p className={`mt-2 text-xs font-semibold ${msg.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</p>
      )}

      {/* État actuel */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-[#e5e7eb]">
        <div className="p-3 rounded-lg bg-gray-50">
          <p className="text-[11px] font-bold text-[#6b7280] uppercase">Cotisation enregistrée</p>
          <p className="text-lg font-black text-[#1a1a1a]">{row.montant_naturo > 0 ? formatCAD(row.montant_naturo) : '— $'}</p>
          {proofUrl && <a href={proofUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#00bbb1] hover:underline">Voir ma preuve →</a>}
        </div>
        <div className="p-3 rounded-lg bg-[#00bbb1]/5">
          <p className="text-[11px] font-bold text-[#6b7280] uppercase">NEO verse</p>
          <p className="text-lg font-black text-[#00bbb1]">{row.neo_confirmed_at ? formatCAD(row.montant_neo) : 'En attente'}</p>
          {!row.neo_confirmed_at && row.montant_naturo > 0 && <p className="text-[11px] text-[#9ca3af]">à confirmer par l'admin</p>}
        </div>
        <div className="p-3 rounded-lg bg-gray-50 flex items-center">
          {row.neo_confirmed_at
            ? <Badge variant="success">✅ NEO a versé {formatCAD(row.montant_neo)}</Badge>
            : (conditionsHorsCotisation
              ? <Badge variant="primary">Admissible au versement NEO</Badge>
              : <Badge variant="default">Non admissible ce mois</Badge>)}
        </div>
      </div>
    </Card>
  )
}

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const MONTHS_ABBR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

function MetricCard({ label, value, sub, color = '#00bbb1', badge }) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: `${color}18` }}>
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-[#6b7280] uppercase tracking-wide mb-1">{label}</p>
          <p className="text-xl font-black text-[#1a1a1a]">{value}</p>
          {badge}
          {sub && <p className="text-xs text-[#9ca3af] mt-0.5">{sub}</p>}
        </div>
      </div>
    </Card>
  )
}

function margeColor(marge, seuil) {
  if (marge == null) return 'text-[#9ca3af]'
  return num(marge) >= num(seuil) ? 'text-emerald-600' : 'text-red-600'
}

export default function NaturoSelfView({ rows, naturoKey, loading, submitContribution, getProofUrl }) {
  const isCloe = naturoKey === 'cloe'
  const label = NATUROS.find(n => n.key === naturoKey)?.label || (isCloe ? 'Cloé' : '')
  const sorted = useMemo(
    () => [...(rows || [])].sort((a, b) => b.year - a.year || b.month - a.month),
    [rows],
  )
  const [idx, setIdx] = useState(0)
  const cur = sorted[idx]

  if (loading) {
    return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
  }

  if (!sorted.length) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm font-semibold text-[#6b7280]">Aucune donnée disponible pour le moment.</p>
        <p className="text-xs text-[#9ca3af] mt-1">Tes résultats apparaîtront ici une fois publiés.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-[#0a1628]">Ma performance &amp; REER</h1>
        <p className="text-sm text-[#6b7280]">{label}</p>
      </div>

      {/* Navigation mois */}
      <div className="flex items-center gap-1">
        <button onClick={() => setIdx(i => Math.min(sorted.length - 1, i + 1))} disabled={idx >= sorted.length - 1}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#6b7280] disabled:opacity-25">‹</button>
        <span className="text-sm font-semibold text-[#1a1a1a] min-w-[130px] text-center">{MONTHS_FR[cur.month - 1]} {cur.year}</span>
        <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx <= 0}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#6b7280] disabled:opacity-25">›</button>
      </div>

      {/* Cartes du mois */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Profit NEO" value={formatCAD(cur.profit_neo)}
          color={cur.plancher_atteint ? '#10b981' : '#ef4444'}
          badge={cur.plancher_atteint
            ? <Badge variant="success" className="mt-1">▲ Plancher atteint</Badge>
            : <Badge variant="danger" className="mt-1">▼ Sous le plancher</Badge>} />
        <MetricCard label="Dépenses du mois" value={formatCAD(cur.depenses_total)} color="#0a1628" />
        {isCloe ? (
          <>
            <MetricCard label="Reels publiés"
              value={`${num(cur.kpi_reels)} / ${num(cur.kpi_seuil_reels)}`}
              color={num(cur.kpi_reels) >= num(cur.kpi_seuil_reels) ? '#10b981' : '#ef4444'}
              badge={num(cur.kpi_reels) >= num(cur.kpi_seuil_reels)
                ? <Badge variant="success" className="mt-1">✅ Seuil atteint</Badge>
                : <Badge variant="danger" className="mt-1">❌ Sous le seuil</Badge>} />
            <MetricCard label="Leads organiques"
              value={num(cur.kpi_seuil_leads) > 0 ? `${num(cur.kpi_leads)} / ${num(cur.kpi_seuil_leads)}` : `${num(cur.kpi_leads)}`}
              sub={num(cur.kpi_seuil_leads) > 0 ? null : 'Non requis'}
              color={num(cur.kpi_seuil_leads) <= 0 || num(cur.kpi_leads) >= num(cur.kpi_seuil_leads) ? '#10b981' : '#ef4444'} />
          </>
        ) : (
          <MetricCard label="Ma marge"
            value={cur.own_marge != null ? formatPct(num(cur.own_marge) / 100, 1) : '—'}
            sub={`Seuil requis : ${num(cur.marge_seuil)} %`}
            color={num(cur.own_marge) >= num(cur.marge_seuil) ? '#10b981' : '#ef4444'}
            badge={cur.marge_ok
              ? <Badge variant="success" className="mt-1">✅ Marge atteinte</Badge>
              : <Badge variant="danger" className="mt-1">❌ Marge insuffisante</Badge>} />
        )}
      </div>

      {/* Cotisation du mois (saisie + preuve) */}
      <ContributionBox row={cur} onSubmit={submitContribution} getProofUrl={getProofUrl} />

      {/* Historique mensuel */}
      <Card className="p-4 overflow-x-auto">
        <h3 className="text-sm font-bold text-[#1a1a1a] mb-3">Mon historique mensuel</h3>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-[#9ca3af] text-left">
              <th className="px-3 py-2">Mois</th>
              <th className="px-3 py-2 text-right">Profit NEO</th>
              {isCloe ? (
                <>
                  <th className="px-3 py-2 text-right">Reels</th>
                  <th className="px-3 py-2 text-right">Leads</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-2 text-right">Mon revenu</th>
                  <th className="px-3 py-2 text-right">Ma marge</th>
                </>
              )}
              <th className="px-3 py-2 text-center">Conditions</th>
              <th className="px-3 py-2 text-right">Ma cotis.</th>
              <th className="px-3 py-2 text-right">NEO verse</th>
            </tr>
          </thead>
          <tbody className="text-[#1a1a1a]">
            {sorted.map((r, i) => (
              <tr key={`${r.year}-${r.month}`} className={`border-t border-[#f1f5f9] cursor-pointer ${i === idx ? 'bg-[#00bbb1]/5' : ''}`} onClick={() => setIdx(i)}>
                <td className="px-3 py-2 font-semibold">{MONTHS_ABBR[r.month - 1]} {r.year}</td>
                <td className={`px-3 py-2 text-right ${r.plancher_atteint ? 'text-emerald-600' : 'text-red-600'}`}>{formatCAD(r.profit_neo)}</td>
                {isCloe ? (
                  <>
                    <td className={`px-3 py-2 text-right font-semibold ${num(r.kpi_reels) >= num(r.kpi_seuil_reels) ? 'text-emerald-600' : 'text-red-600'}`}>{num(r.kpi_reels)}/{num(r.kpi_seuil_reels)}</td>
                    <td className="px-3 py-2 text-right">{num(r.kpi_seuil_leads) > 0 ? `${num(r.kpi_leads)}/${num(r.kpi_seuil_leads)}` : '—'}</td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 text-right">{formatCAD(r.own_revenue)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${margeColor(r.own_marge, r.marge_seuil)}`}>{r.own_marge != null ? formatPct(num(r.own_marge) / 100, 1) : '—'}</td>
                  </>
                )}
                <td className="px-3 py-2 text-center">{r.marge_ok ? '✅' : '❌'}</td>
                <td className="px-3 py-2 text-right">{r.montant_naturo > 0 ? formatCAD(r.montant_naturo) : '— $'}</td>
                <td className="px-3 py-2 text-right font-semibold text-[#00bbb1]">{r.montant_neo > 0 ? formatCAD(r.montant_neo) : '— $'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
