import { useMemo } from 'react'
import {
  NATUROS, FIXED_KEYS, FIXED_LABELS, VARIABLE_KEYS, VARIABLE_LABELS,
  calcFixedTotal, formatCAD, num,
} from '../../../lib/performanceCalc'

function MoneyInput({ label, value, placeholder, onChange, readOnly = false, accent = false }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-[#6b7280]">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={value === 0 || value ? value : ''}
          placeholder={placeholder}
          onChange={readOnly ? undefined : e => onChange(e.target.value)}
          readOnly={readOnly}
          className={`w-full px-3 py-2 pr-7 text-sm border rounded-lg focus:outline-none transition-colors ${
            readOnly
              ? 'bg-gray-50 border-[#e5e7eb] text-[#6b7280] cursor-default'
              : accent
                ? 'bg-[#00bbb1]/5 border-[#00bbb1]/30 focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent'
                : 'bg-white border-[#e5e7eb] focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent'
          }`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#9ca3af]">$</span>
      </div>
    </div>
  )
}

// Formulaire de saisie d'un mois. `form` est l'état contrôlé du parent.
export default function MonthlyForm({ form, placeholders = {}, params, onChange }) {
  const set = (key, value) => onChange({ ...form, [key]: value })

  const naturoTotal = useMemo(
    () => NATUROS.reduce((s, n) => s + num(form[n.revenueKey]), 0),
    [form],
  )
  const fixedTotal = calcFixedTotal(params, form)
  const ph = (key) => (placeholders[key] != null ? `ex: ${placeholders[key].toLocaleString('fr-CA')}` : 'ex: 0')
  const fixedPh = (key) => `défaut: ${num(params[key]).toLocaleString('fr-CA')}`

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Colonne 1 — Revenus par naturo */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-[#1a1a1a]">Revenus par naturopathe</h4>
        {NATUROS.map(n => (
          <MoneyInput
            key={n.key}
            label={n.label}
            value={form[n.revenueKey]}
            placeholder={ph(n.revenueKey)}
            onChange={v => set(n.revenueKey, v)}
          />
        ))}
        <div className="flex justify-between items-center pt-2 border-t border-[#e5e7eb] text-sm">
          <span className="font-semibold text-[#6b7280]">Total naturos</span>
          <span className="font-bold text-[#1a1a1a]">{formatCAD(naturoTotal)}</span>
        </div>
      </div>

      {/* Colonne 2 — Coûts variables */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-[#1a1a1a]">Coûts variables</h4>
        <MoneyInput
          label="Revenu total"
          value={form.revenue_total}
          placeholder={ph('revenue_total')}
          onChange={v => set('revenue_total', v)}
          accent
        />
        {VARIABLE_KEYS.map(k => (
          <MoneyInput
            key={k}
            label={VARIABLE_LABELS[k]}
            value={form[k]}
            placeholder={ph(k)}
            onChange={v => set(k, v)}
          />
        ))}
      </div>

      {/* Colonne 3 — Coûts fixes (réels du mois, sinon valeur par défaut) */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-[#1a1a1a]">Coûts fixes du mois</h4>
        {FIXED_KEYS.map(k => (
          <MoneyInput
            key={k}
            label={FIXED_LABELS[k]}
            value={form[k]}
            placeholder={fixedPh(k)}
            onChange={v => set(k, v)}
          />
        ))}
        <div className="flex justify-between items-center pt-2 border-t border-[#e5e7eb] text-sm">
          <span className="font-semibold text-[#6b7280]">Total fixe</span>
          <span className="font-bold text-[#1a1a1a]">{formatCAD(fixedTotal)}</span>
        </div>
      </div>
    </div>
  )
}
