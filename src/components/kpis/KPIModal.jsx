import { useState, useEffect, useMemo } from 'react'
import Modal from '../shared/Modal'
import Button from '../shared/Button'
import Input from '../shared/Input'
import { supabase } from '../../lib/supabase'
import { useKPITypes, getTypesForRole } from '../../hooks/useKPITypes'
import { useMembers } from '../../hooks/useMembers'
import { format } from 'date-fns'

export default function KPIModal({
  isOpen,
  onClose,
  userId,          // pré-sélectionné (optionnel)
  userRole,        // pré-sélectionné (optionnel)
  onCreated,
  allowClinic = false,
  allowMemberSelect = false,
}) {
  const { types: allTypes, loading: typesLoading } = useKPITypes()
  const { members } = useMembers()

  const [scope, setScope] = useState('individual')
  const [selectedUserId, setSelectedUserId] = useState(userId || '')
  const [selectedRole, setSelectedRole] = useState(userRole || '')
  const [form, setForm] = useState({
    kpi_type: '',
    value: '',
    entry_date: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isClinic = scope === 'clinic'

  // Types disponibles selon scope + rôle sélectionné
  const availableTypes = useMemo(
    () => getTypesForRole(allTypes, selectedRole, scope),
    [allTypes, selectedRole, scope]
  )

  // Réinitialiser le type sélectionné quand les types changent
  useEffect(() => {
    setForm(f => ({ ...f, kpi_type: availableTypes[0]?.value || '' }))
  }, [availableTypes])

  // Sync quand userId/userRole changent en prop
  useEffect(() => {
    setSelectedUserId(userId || '')
    setSelectedRole(userRole || '')
  }, [userId, userRole])

  function handleScopeChange(newScope) {
    setScope(newScope)
    setError('')
  }

  function handleMemberChange(memberId) {
    setSelectedUserId(memberId)
    const member = members.find(m => m.id === memberId)
    setSelectedRole(member?.role || '')
  }

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isClinic && !selectedUserId) { setError('Veuillez sélectionner un membre.'); return }
    if (!form.kpi_type) { setError('Veuillez sélectionner un type de KPI.'); return }
    if (!form.value) { setError('La valeur est obligatoire.'); return }
    if (!form.entry_date) { setError('La date est obligatoire.'); return }

    setLoading(true)
    setError('')

    const entry = {
      kpi_type: form.kpi_type,
      value: Number(form.value),
      entry_date: form.entry_date,
      notes: form.notes.trim() || null,
      scope,
    }
    if (!isClinic) entry.user_id = selectedUserId

    const { error: err } = await supabase.from('kpi_entries').insert(entry)
    setLoading(false)
    if (err) { setError(err.message); return }

    // Reset
    setForm({ kpi_type: availableTypes[0]?.value || '', value: '', entry_date: format(new Date(), 'yyyy-MM-dd'), notes: '' })
    setScope('individual')
    if (!userId) setSelectedUserId('')
    onCreated?.()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ajouter une entrée KPI">
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Toggle Individuel / Clinique */}
        {allowClinic && (
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
            <button type="button" onClick={() => handleScopeChange('individual')}
              className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${!isClinic ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#6b7280] hover:text-[#1a1a1a]'}`}>
              Individuel
            </button>
            <button type="button" onClick={() => handleScopeChange('clinic')}
              className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${isClinic ? 'bg-[#00bbb1] text-white shadow-sm' : 'text-[#6b7280] hover:text-[#1a1a1a]'}`}>
              Clinique
            </button>
          </div>
        )}

        {isClinic && (
          <div className="bg-[#00bbb1]/10 border border-[#00bbb1]/20 rounded-lg px-4 py-2.5">
            <p className="text-xs font-semibold text-[#00bbb1]">Cette entrée sera visible par toute l'équipe.</p>
          </div>
        )}

        {/* Sélecteur de membre (individuel seulement) */}
        {!isClinic && (allowMemberSelect || !userId) && (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-[#1a1a1a]">Membre *</label>
            <select
              value={selectedUserId}
              onChange={e => handleMemberChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
            >
              <option value="">Sélectionner un membre</option>
              {members.filter(m => m.role !== 'admin').map(m => (
                <option key={m.id} value={m.id}>{m.full_name} ({m.role})</option>
              ))}
            </select>
          </div>
        )}

        {/* Type de KPI */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-[#1a1a1a]">Type de KPI *</label>
          {typesLoading ? (
            <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
          ) : availableTypes.length === 0 ? (
            <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-700">
                {!isClinic && !selectedRole
                  ? 'Sélectionnez un membre pour voir les types disponibles.'
                  : 'Aucun type disponible pour ce rôle. Ajoutez-en dans Paramètres.'}
              </p>
            </div>
          ) : (
            <select
              name="kpi_type"
              value={form.kpi_type}
              onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
            >
              {availableTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          )}
        </div>

        <Input label="Valeur *" name="value" type="number" min="0" step="any" value={form.value} onChange={handleChange} placeholder="Ex: 3500" />
        <Input label="Date *" name="entry_date" type="date" value={form.entry_date} onChange={handleChange} />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-[#1a1a1a]">Notes (optionnel)</label>
          <textarea name="notes" value={form.notes} onChange={handleChange} rows={2}
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1] resize-none" />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading} disabled={availableTypes.length === 0 && !isClinic}>Enregistrer</Button>
        </div>
      </form>
    </Modal>
  )
}
