import { useState } from 'react'
import Modal from '../../shared/Modal'
import Button from '../../shared/Button'
import { FIXED_KEYS, FIXED_LABELS, NATUROS } from '../../../lib/performanceCalc'

function NumField({ label, value, onChange, suffix = '$' }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-[#6b7280]">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 pr-8 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#9ca3af]">{suffix}</span>
      </div>
    </div>
  )
}

export default function ParamsModal({ isOpen, onClose, params, onSave }) {
  const [draft, setDraft] = useState(params)
  const [saving, setSaving] = useState(false)

  // Re-sync si on rouvre avec de nouveaux params
  function set(key, value) {
    setDraft(d => ({ ...d, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    // Convertir les % saisis en ratio si besoin (ils sont déjà en ratio ici)
    const payload = {
      ...draft,
      charges_sociales_pct: Number(draft.charges_sociales_pct),
      cogs_ratio: Number(draft.cogs_ratio),
      marge_incrementale: Number(draft.marge_incrementale),
      reer_match_cap_pct: Number(draft.reer_match_cap_pct),
    }
    FIXED_KEYS.forEach(k => { payload[k] = Number(draft[k]) })
    NATUROS.forEach(n => { payload[n.salaryKey] = Number(draft[n.salaryKey]) })
    payload.reer_plancher = Number(draft.reer_plancher)
    await onSave(payload)
    setSaving(false)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Modifier les paramètres fixes" size="lg">
      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-bold text-[#1a1a1a] mb-3">Coûts fixes mensuels</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {FIXED_KEYS.map(k => (
              <NumField key={k} label={FIXED_LABELS[k]} value={draft[k]} onChange={v => set(k, v)} />
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold text-[#1a1a1a] mb-3">Salaires annuels des naturopathes</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {NATUROS.map(n => (
              <NumField key={n.key} label={n.label} value={draft[n.salaryKey]} onChange={v => set(n.salaryKey, v)} />
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold text-[#1a1a1a] mb-3">Ratios &amp; REER</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <NumField label="Charges sociales (ratio)" value={draft.charges_sociales_pct} onChange={v => set('charges_sociales_pct', v)} suffix="" />
            <NumField label="Ratio COGS" value={draft.cogs_ratio} onChange={v => set('cogs_ratio', v)} suffix="" />
            <NumField label="Marge incrémentale" value={draft.marge_incrementale} onChange={v => set('marge_incrementale', v)} suffix="" />
            <NumField label="Plancher REER" value={draft.reer_plancher} onChange={v => set('reer_plancher', v)} />
            <NumField label="Plafond match REER (ratio du salaire)" value={draft.reer_match_cap_pct} onChange={v => set('reer_match_cap_pct', v)} suffix="" />
          </div>
          <p className="text-xs text-[#9ca3af] mt-2">Les ratios sont en décimal : 0,16 = 16 %.</p>
        </section>

        <div className="flex justify-end gap-2 pt-2 border-t border-[#e5e7eb]">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSave} loading={saving}>Enregistrer</Button>
        </div>
      </div>
    </Modal>
  )
}
