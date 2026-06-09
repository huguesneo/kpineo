import { useState, useEffect, useMemo, useRef } from 'react'
import Card from '../../shared/Card'
import Button from '../../shared/Button'
import Badge from '../../shared/Badge'
import MonthNavigator from '../../shared/MonthNavigator'
import MonthlyForm from '../components/MonthlyForm'
import MonthSummaryCard from '../components/MonthSummaryCard'
import NaturoProfitCard from '../components/NaturoProfitCard'
import ImportCSVModal from '../components/ImportCSVModal'
import ImportNaturoModal from '../components/ImportNaturoModal'
import {
  NATUROS, VARIABLE_KEYS, FIXED_KEYS, REER_CONTRIB_KEYS, calcProfitNEO, calcREER, calcAllNaturos,
  buildPlaceholders, formatCAD, hasMonthData, num,
} from '../../../lib/performanceCalc'

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
// Champs numériques saisissables : revenus, revenus/naturo, coûts variables, coûts fixes du mois.
const NUMERIC_KEYS = ['revenue_total', ...NATUROS.map(n => n.revenueKey), ...VARIABLE_KEYS, ...FIXED_KEYS]
// Coûts fixes optionnels : vides => on retombe sur les paramètres globaux.
const NULLABLE_KEYS = new Set(FIXED_KEYS)

function emptyForm(year, month) {
  const f = { year, month, notes: '' }
  NUMERIC_KEYS.forEach(k => { f[k] = '' })
  return f
}

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

export default function MonthlyTab({ data }) {
  const { months, params, selectedMonth, selectMonth, getMonthData, saveMonth } = data
  const { year, month } = selectedMonth

  const existing = getMonthData(year, month)
  const [form, setForm] = useState(() => existing ? { ...existing } : emptyForm(year, month))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(existing?.updated_at || null)
  const [importOpen, setImportOpen] = useState(false)
  const [naturoOpen, setNaturoOpen] = useState(false)
  // Import en attente d'application après un changement de mois. Stocké dans un ref
  // (et non dans le state) pour ne PAS re-déclencher l'effet et écraser le formulaire.
  // { year, month, mode: 'replace' | 'merge', form?, merge? }
  const pendingRef = useRef(null)

  // Recharge le formulaire quand le mois sélectionné change
  useEffect(() => {
    const p = pendingRef.current
    if (p && p.year === year && p.month === month) {
      pendingRef.current = null
      if (p.mode === 'replace') {
        setForm(p.form)
      } else {
        const e = getMonthData(year, month)
        const base = e ? { ...e } : emptyForm(year, month)
        setForm({ ...base, ...p.merge })
      }
      setDirty(true)
      return
    }
    const e = getMonthData(year, month)
    setForm(e ? { ...e } : emptyForm(year, month))
    setDirty(false)
    setLastSaved(e?.updated_at || null)
  }, [year, month, getMonthData])

  const placeholders = useMemo(() => buildPlaceholders(months), [months])

  function handleFormChange(next) {
    setForm(next)
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = { year, month, notes: form.notes || '' }
    NUMERIC_KEYS.forEach(k => {
      // Coûts fixes laissés vides => null (on retombe sur les paramètres globaux)
      if (NULLABLE_KEYS.has(k) && (form[k] === '' || form[k] == null)) payload[k] = null
      else payload[k] = num(form[k])
    })
    const { data: saved, error } = await saveMonth(payload)
    setSaving(false)
    if (!error) {
      setDirty(false)
      setLastSaved(saved.updated_at)
    }
  }

  // Applique un import CSV : conserve les revenus par naturo + notes déjà présents.
  function handleImport(metrics) {
    const sameMonth = metrics.year === year && metrics.month === month
    const src = sameMonth ? form : (getMonthData(metrics.year, metrics.month) || {})
    const merged = { ...emptyForm(metrics.year, metrics.month) }
    NATUROS.forEach(n => { merged[n.revenueKey] = src[n.revenueKey] ?? '' })
    REER_CONTRIB_KEYS.forEach(k => { merged[k] = src[k] ?? '' })
    merged.notes = src.notes || ''
    Object.keys(metrics).forEach(k => {
      if (k === 'year' || k === 'month') return
      merged[k] = metrics[k]
    })
    if (sameMonth) {
      setForm(merged)
      setDirty(true)
    } else {
      pendingRef.current = { year: metrics.year, month: metrics.month, mode: 'replace', form: merged }
      selectMonth(metrics.year, metrics.month)
    }
    setImportOpen(false)
  }

  // Applique un import xlsx de revenus par naturo (fusion, préserve le reste).
  function handleImportNaturo({ year: y, month: mo, revenues }) {
    const rev = {}
    Object.entries(revenues).forEach(([key, val]) => {
      const n = NATUROS.find(x => x.key === key)
      if (n) rev[n.revenueKey] = val
    })
    if (y === year && mo === month) {
      setForm(prev => ({ ...prev, ...rev }))
      setDirty(true)
    } else {
      pendingRef.current = { year: y, month: mo, mode: 'merge', merge: rev }
      selectMonth(y, mo)
    }
    setNaturoOpen(false)
  }

  const metricsForCalc = useMemo(() => {
    const m = { year, month }
    NUMERIC_KEYS.forEach(k => {
      // Préserve "vide" pour les coûts fixes (utilise alors les paramètres)
      if (NULLABLE_KEYS.has(k) && (form[k] === '' || form[k] == null)) m[k] = null
      else m[k] = num(form[k])
    })
    // Cotisations REER (saisies dans l'onglet REER, conservées au chargement du mois)
    REER_CONTRIB_KEYS.forEach(k => { m[k] = num(form[k]) })
    return m
  }, [form, year, month])

  const neo = calcProfitNEO(metricsForCalc, params)
  const reer = calcREER(metricsForCalc, params)
  const naturos = calcAllNaturos(metricsForCalc, params)
  const filled = hasMonthData(metricsForCalc)

  const history = useMemo(() => {
    return [...months]
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .slice(0, 12)
  }, [months])

  return (
    <div className="space-y-6">
      {/* Header : navigation mois */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <MonthNavigator month={month} year={year} onChange={(m, y) => selectMonth(y, m)} />
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="text-xs font-semibold text-amber-600 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Non sauvegardé
            </span>
          )}
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
            Importer un CSV QuickBooks
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setNaturoOpen(true)}>
            Importer revenus naturo (xlsx)
          </Button>
        </div>
      </div>

      {/* Coup d'œil rapide */}
      {!filled ? (
        <Card className="p-6 text-center">
          <p className="text-sm font-semibold text-[#6b7280]">
            Données non saisies pour {MONTHS_FR[month - 1]} {year}.
          </p>
          <p className="text-xs text-[#9ca3af] mt-1">Remplissez le formulaire ci-dessous pour voir les calculs.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Revenu du mois" value={formatCAD(neo.revenue_total)} />
          <MetricCard
            label="Profit NEO"
            value={formatCAD(neo.profit_neo)}
            color={num(neo.profit_neo) >= 0 ? '#10b981' : '#ef4444'}
            badge={
              reer.plancherAtteint
                ? <Badge variant="success" className="mt-1">▲ Plancher atteint</Badge>
                : <Badge variant="danger" className="mt-1">▼ Sous le plancher</Badge>
            }
          />
          <MetricCard
            label="REER versé par NEO"
            value={reer.total_match > 0 ? formatCAD(reer.total_match) : '— $'}
            sub={reer.plancherAtteint ? (reer.total_match > 0 ? null : 'Aucune cotisation saisie') : 'Plancher non atteint'}
          />
          <MetricCard
            label="Gain net NEO après REER"
            value={formatCAD(reer.profit_apres_reer)}
            color="#0a1628"
          />
        </div>
      )}

      {/* Saisie du mois */}
      <Card className="p-6">
        <h3 className="text-base font-bold text-[#1a1a1a] mb-4">Saisie du mois — {MONTHS_FR[month - 1]} {year}</h3>
        <MonthlyForm form={form} placeholders={placeholders} params={params} onChange={handleFormChange} />

        <div className="mt-4">
          <label className="text-xs font-semibold text-[#6b7280]">Notes</label>
          <textarea
            value={form.notes || ''}
            onChange={e => handleFormChange({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full mt-1 px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent"
            placeholder="Contexte du mois, éléments exceptionnels…"
          />
        </div>

        <div className="flex items-center gap-4 mt-4">
          <Button onClick={handleSave} loading={saving}>Sauvegarder</Button>
          <span className="text-xs text-[#9ca3af]">
            {lastSaved
              ? `Dernière sauvegarde : ${new Date(lastSaved).toLocaleString('fr-CA')}`
              : 'Jamais sauvegardé'}
          </span>
        </div>
      </Card>

      {/* Profit par naturopathe */}
      {filled && (
        <div>
          <h3 className="text-base font-bold text-[#1a1a1a] mb-3">Profit par naturopathe</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {naturos.map(n => (
              <NaturoProfitCard
                key={n.key}
                naturo={n}
                reerAmount={reer.parNaturo[n.key]}
                reerActive={reer.active}
              />
            ))}
          </div>
        </div>
      )}

      {/* Historique */}
      <div>
        <h3 className="text-base font-bold text-[#1a1a1a] mb-3">Historique (12 derniers mois)</h3>
        {history.length === 0 ? (
          <p className="text-sm text-[#9ca3af]">Aucun mois enregistré pour l'instant.</p>
        ) : (
          <div className="space-y-2">
            {history.map(m => (
              <MonthSummaryCard
                key={`${m.year}-${m.month}`}
                metrics={m}
                params={params}
                isActive={m.year === year && m.month === month}
                onClick={() => selectMonth(m.year, m.month)}
              />
            ))}
          </div>
        )}
      </div>

      <ImportCSVModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />
      <ImportNaturoModal
        isOpen={naturoOpen}
        onClose={() => setNaturoOpen(false)}
        onImport={handleImportNaturo}
      />
    </div>
  )
}
