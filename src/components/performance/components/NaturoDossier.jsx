import { useMemo } from 'react'
import Card from '../../shared/Card'
import Badge from '../../shared/Badge'
import AccessCard from './AccessCard'
import {
  NATUROS, calcProfitNaturo, calcMargeNaturo, calcREER,
  margeSeuilKey, objectifDebutKey, contribKey,
  formatCAD, formatPct, hasMonthData, num,
} from '../../../lib/performanceCalc'

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function margeColor(marge, seuil) {
  if (marge == null) return 'text-[#9ca3af]'
  return marge >= seuil ? 'text-emerald-600' : 'text-red-600'
}

export default function NaturoDossier({ naturoKey, data }) {
  const { months, params } = data
  const naturo = NATUROS.find(n => n.key === naturoKey)
  const seuil = num(params[margeSeuilKey(naturoKey)])
  const objectifDebut = params[objectifDebutKey(naturoKey)]

  // Toutes les lignes mensuelles (récent → ancien) pour ce naturo
  const rows = useMemo(() => {
    return [...months]
      .filter(hasMonthData)
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .map(m => {
        const np = calcProfitNaturo(m, params, naturoKey)
        const marge = calcMargeNaturo(m, params, naturoKey)
        const reer = calcREER(m, params)
        return {
          year: m.year, month: m.month,
          revenu: num(m[naturo.revenueKey]),
          profit: np.profit_naturo,
          marge,
          atteint: marge != null && marge >= seuil,
          contrib: num(m[contribKey(naturoKey)]),
          match: num(reer.parNaturo[naturoKey]),
        }
      })
  }, [months, params, naturoKey, naturo, seuil])

  const last = rows[0]

  // Objectif 12 mois : fenêtre [début, début + 12 mois)
  const objectif = useMemo(() => {
    if (!objectifDebut) return null
    const start = new Date(objectifDebut)
    const end = new Date(start)
    end.setFullYear(end.getFullYear() + 1)
    const inWindow = rows.filter(r => {
      const d = new Date(r.year, r.month - 1, 1)
      return d >= new Date(start.getFullYear(), start.getMonth(), 1) && d < end
    })
    const withMarge = inWindow.filter(r => r.marge != null)
    const moisAtteints = inWindow.filter(r => r.atteint).length
    const avg = withMarge.length ? withMarge.reduce((s, r) => s + r.marge, 0) / withMarge.length : null
    const monthsElapsed = inWindow.length
    return { start, end, inWindow, moisAtteints, avg, monthsElapsed }
  }, [objectifDebut, rows])

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-black text-[#0a1628]">Dossier — {naturo.label}</h3>
        <span className="text-sm text-[#6b7280]">Seuil de marge requis : <span className="font-bold text-[#1a1a1a]">{num(seuil)} %</span></span>
      </div>

      {/* Réglages d'accès (admin) */}
      <AccessCard naturoKey={naturoKey} label={naturo.label} data={data} />

      {/* Cartes résumé (dernier mois) */}
      {last && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4">
            <p className="text-[11px] font-bold text-[#6b7280] uppercase mb-1">Dernier revenu</p>
            <p className="text-lg font-black text-[#1a1a1a]">{formatCAD(last.revenu)}</p>
            <p className="text-xs text-[#9ca3af]">{MONTHS_FR[last.month - 1]} {last.year}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[11px] font-bold text-[#6b7280] uppercase mb-1">Profit individuel</p>
            <p className={`text-lg font-black ${last.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCAD(last.profit)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[11px] font-bold text-[#6b7280] uppercase mb-1">Marge du mois</p>
            <p className={`text-lg font-black ${margeColor(last.marge, seuil)}`}>{last.marge != null ? formatPct(last.marge / 100, 1) : '—'}</p>
            <p className="text-xs text-[#9ca3af]">seuil {num(seuil)} %</p>
          </Card>
          <Card className="p-4">
            <p className="text-[11px] font-bold text-[#6b7280] uppercase mb-1">Objectif marge</p>
            {last.atteint
              ? <Badge variant="success">✅ Atteint</Badge>
              : <Badge variant="danger">❌ Non atteint</Badge>}
          </Card>
        </div>
      )}

      {/* Objectif 12 mois */}
      {objectif ? (
        <Card className="p-5">
          <h4 className="text-sm font-bold text-[#1a1a1a] mb-2">Objectif 12 mois</h4>
          <div className="flex flex-wrap gap-6 text-sm">
            <span className="text-[#6b7280]">Période : <span className="font-semibold text-[#1a1a1a]">{objectif.start.toISOString().slice(0, 10)} → {objectif.end.toISOString().slice(0, 10)}</span></span>
            <span className="text-[#6b7280]">Mois écoulés : <span className="font-semibold">{objectif.monthsElapsed}/12</span></span>
            <span className="text-[#6b7280]">Mois marge atteinte : <span className="font-semibold text-emerald-600">{objectif.moisAtteints}</span></span>
            <span className="text-[#6b7280]">Marge moy. période : <span className={`font-semibold ${margeColor(objectif.avg, seuil)}`}>{objectif.avg != null ? formatPct(objectif.avg / 100, 1) : '—'}</span></span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-[#00bbb1]" style={{ width: `${Math.min(100, (objectif.monthsElapsed / 12) * 100)}%` }} />
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <p className="text-sm text-[#9ca3af]">Aucune date d'objectif 12 mois définie — réglable via « Modifier les seuils de marge ».</p>
        </Card>
      )}

      {/* Historique mensuel (backtrack) */}
      <Card className="p-4 overflow-x-auto">
        <h4 className="text-sm font-bold text-[#1a1a1a] mb-3">Historique mensuel</h4>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-[#9ca3af] text-left">
              <th className="px-3 py-2">Mois</th>
              <th className="px-3 py-2 text-right">Revenu</th>
              <th className="px-3 py-2 text-right">Profit indiv.</th>
              <th className="px-3 py-2 text-right">Marge</th>
              <th className="px-3 py-2 text-center">Objectif</th>
              <th className="px-3 py-2 text-right">Il cotise</th>
              <th className="px-3 py-2 text-right">REER NEO</th>
            </tr>
          </thead>
          <tbody className="text-[#1a1a1a]">
            {rows.map(r => (
              <tr key={`${r.year}-${r.month}`} className="border-t border-[#f1f5f9]">
                <td className="px-3 py-2 font-semibold">{MONTHS_FR[r.month - 1].slice(0, 3)} {r.year}</td>
                <td className="px-3 py-2 text-right">{formatCAD(r.revenu)}</td>
                <td className={`px-3 py-2 text-right ${r.profit >= 0 ? '' : 'text-red-600'}`}>{formatCAD(r.profit)}</td>
                <td className={`px-3 py-2 text-right font-semibold ${margeColor(r.marge, seuil)}`}>{r.marge != null ? formatPct(r.marge / 100, 1) : '—'}</td>
                <td className="px-3 py-2 text-center">{r.atteint ? '✅' : '❌'}</td>
                <td className="px-3 py-2 text-right">{r.contrib > 0 ? formatCAD(r.contrib) : '— $'}</td>
                <td className="px-3 py-2 text-right font-semibold text-[#00bbb1]">{r.match > 0 ? formatCAD(r.match) : '— $'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-sm text-[#9ca3af] text-center py-4">Aucun mois enregistré.</p>}
      </Card>
    </div>
  )
}
