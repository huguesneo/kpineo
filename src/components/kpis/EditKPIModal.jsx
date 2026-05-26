import { useState, useEffect } from 'react'
import Modal from '../shared/Modal'
import Button from '../shared/Button'
import Input from '../shared/Input'
import { updateKPIEntry, parseKPIValue } from '../../hooks/useKPIs'
import { useKPITypes } from '../../hooks/useKPITypes'

export default function EditKPIModal({ isOpen, onClose, entry, onUpdated }) {
  const { types: allTypes } = useKPITypes()
  const [form, setForm] = useState({ kpi_type: '', value: '', notes: '', entry_date: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!entry) return
    const { displayValue, notes } = parseKPIValue(entry)
    const isTextEntry = entry.value === 0 && entry.notes
    setForm({
      kpi_type: entry.kpi_type,
      value: isTextEntry ? displayValue : String(entry.value),
      notes: notes || '',
      entry_date: entry.entry_date,
    })
    setError('')
  }, [entry])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.value.trim()) { setError('La valeur est obligatoire.'); return }
    setLoading(true)
    setError('')
    const parsedValue = parseFloat(form.value)
    const isText = isNaN(parsedValue)
    const { error: err } = await updateKPIEntry(entry.id, {
      kpi_type: form.kpi_type,
      value: isText ? 0 : parsedValue,
      notes: isText
        ? JSON.stringify({ tv: form.value.trim(), ...(form.notes.trim() ? { n: form.notes.trim() } : {}) })
        : (form.notes.trim() || null),
      entry_date: form.entry_date,
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    onUpdated?.()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Modifier le KPI">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-[#1a1a1a]">Type de KPI</label>
          <select
            value={form.kpi_type}
            onChange={e => setForm(f => ({ ...f, kpi_type: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
          >
            {allTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <Input
          label="Valeur *"
          type="text"
          value={form.value}
          onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
          placeholder="Ex: 3500 ou Aucun retard"
        />
        <Input
          label="Date *"
          type="date"
          value={form.entry_date}
          onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))}
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-[#1a1a1a]">Notes (optionnel)</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1] resize-none"
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>Enregistrer</Button>
        </div>
      </form>
    </Modal>
  )
}
