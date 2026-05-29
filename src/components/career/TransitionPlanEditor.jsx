import { useState } from 'react'
import Card from '../shared/Card'
import Button from '../shared/Button'
import Modal from '../shared/Modal'
import { useTransitionPlans, upsertTransitionPlan, deleteTransitionPlan, toggleTransitionPlanVisibility } from '../../hooks/useTransitionPlan'

function monthLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' })
}

function toMonthValue(dateStr) {
  // dateStr = "2025-07-01" → "2025-07"
  return dateStr ? dateStr.slice(0, 7) : ''
}

function toFirstOfMonth(monthInput) {
  // monthInput = "2025-07" → "2025-07-01"
  return monthInput ? `${monthInput}-01` : ''
}

const emptyForm = {
  id: null,
  month: '',
  time_split: '',
  focus_items: [''],
  notes: '',
  visible_to_member: false,
}

export default function TransitionPlanEditor({ userId }) {
  const { plans, loading, refetch } = useTransitionPlans(userId)

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [togglingId, setTogglingId] = useState(null)

  function openNew() {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    setForm({ ...emptyForm, month: currentMonth, focus_items: [''] })
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(plan) {
    setForm({
      id: plan.id,
      month: toMonthValue(plan.month),
      time_split: plan.time_split || '',
      focus_items: plan.focus_items?.length ? plan.focus_items : [''],
      notes: plan.notes || '',
      visible_to_member: plan.visible_to_member,
    })
    setFormError('')
    setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.month) { setFormError('Le mois est obligatoire.'); return }
    const cleanedItems = form.focus_items.filter(f => f.trim())
    setFormLoading(true)
    setFormError('')
    const { error } = await upsertTransitionPlan({
      id: form.id || undefined,
      user_id: userId,
      month: toFirstOfMonth(form.month),
      time_split: form.time_split.trim() || null,
      focus_items: cleanedItems,
      notes: form.notes.trim() || null,
      visible_to_member: form.visible_to_member,
    })
    setFormLoading(false)
    if (error) { setFormError(error.message); return }
    setModalOpen(false)
    refetch()
  }

  async function handleDelete(id) {
    await deleteTransitionPlan(id)
    setConfirmDeleteId(null)
    refetch()
  }

  async function handleToggleVisibility(plan) {
    setTogglingId(plan.id)
    await toggleTransitionPlanVisibility(plan.id, !plan.visible_to_member)
    setTogglingId(null)
    refetch()
  }

  function setFocusItem(index, value) {
    setForm(f => {
      const items = [...f.focus_items]
      items[index] = value
      return { ...f, focus_items: items }
    })
  }

  function addFocusItem() {
    setForm(f => ({ ...f, focus_items: [...f.focus_items, ''] }))
  }

  function removeFocusItem(index) {
    setForm(f => ({
      ...f,
      focus_items: f.focus_items.length > 1
        ? f.focus_items.filter((_, i) => i !== index)
        : [''],
    }))
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-sm text-[#1a1a1a]">Plan de transition</h3>
          <p className="text-xs text-[#6b7280]">Répartition du temps et focus mensuel</p>
        </div>
        <Button size="sm" onClick={openNew}>+ Ajouter un mois</Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : plans.length === 0 ? (
        <p className="text-sm text-[#6b7280] py-2">Aucun plan de transition défini.</p>
      ) : (
        <div className="space-y-2">
          {plans.map(plan => (
            <div key={plan.id} className="border border-[#e5e7eb] rounded-xl px-4 py-3 bg-gray-50">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-sm text-[#1a1a1a] capitalize">{monthLabel(plan.month)}</p>
                    {plan.visible_to_member && (
                      <span className="text-xs font-semibold text-[#00bbb1] bg-[#00bbb1]/10 px-2 py-0.5 rounded-full">Visible au membre</span>
                    )}
                  </div>
                  {plan.time_split && (
                    <p className="text-xs text-[#6b7280] mt-1">{plan.time_split}</p>
                  )}
                  {plan.focus_items?.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {plan.focus_items.map((item, i) => (
                        <li key={i} className="text-xs text-[#374151] flex items-start gap-1.5">
                          <span className="text-[#00bbb1] mt-0.5">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {plan.notes && (
                    <p className="text-xs text-[#6b7280] mt-1.5 italic">{plan.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Toggle visibilité */}
                  <button
                    onClick={() => handleToggleVisibility(plan)}
                    disabled={togglingId === plan.id}
                    title={plan.visible_to_member ? 'Cacher au membre' : 'Rendre visible au membre'}
                    className={`p-1.5 rounded-lg transition-colors ${
                      plan.visible_to_member
                        ? 'text-[#00bbb1] hover:bg-[#00bbb1]/10'
                        : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {plan.visible_to_member
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      }
                    </svg>
                  </button>
                  {/* Modifier */}
                  <button
                    onClick={() => openEdit(plan)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  {/* Supprimer */}
                  {confirmDeleteId === plan.id ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[#6b7280]">Confirmer ?</span>
                      <Button size="sm" variant="danger" onClick={() => handleDelete(plan.id)}>Oui</Button>
                      <Button size="sm" variant="secondary" onClick={() => setConfirmDeleteId(null)}>Non</Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(plan.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setFormError('') }}
        title={form.id ? 'Modifier le plan de transition' : 'Nouveau plan de transition'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {/* Mois */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-[#1a1a1a]">Mois</label>
            <input
              type="month"
              value={form.month}
              onChange={e => setForm(f => ({ ...f, month: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
              required
            />
          </div>

          {/* Répartition du temps */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-[#1a1a1a]">Répartition du temps <span className="font-normal text-[#6b7280]">(optionnel)</span></label>
            <input
              type="text"
              value={form.time_split}
              onChange={e => setForm(f => ({ ...f, time_split: e.target.value }))}
              placeholder="Ex: 65% admin, 35% contenu"
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
            />
          </div>

          {/* Focus du mois */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-[#1a1a1a]">Focus du mois</label>
            <div className="space-y-2">
              {form.focus_items.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[#00bbb1] text-sm font-bold">•</span>
                  <input
                    type="text"
                    value={item}
                    onChange={e => setFocusItem(i, e.target.value)}
                    placeholder="Ex: Setup système CRM"
                    className="flex-1 px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
                  />
                  <button
                    type="button"
                    onClick={() => removeFocusItem(i)}
                    className="text-gray-300 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addFocusItem}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#00bbb1] hover:text-[#009d94] transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Ajouter un focus
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-[#1a1a1a]">Notes <span className="font-normal text-[#6b7280]">(optionnel)</span></label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Contexte, objectif global du mois..."
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1] resize-none"
            />
          </div>

          {/* Visible au membre */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setForm(f => ({ ...f, visible_to_member: !f.visible_to_member }))}
              className={`relative w-10 h-6 rounded-full transition-colors ${form.visible_to_member ? 'bg-[#00bbb1]' : 'bg-gray-200'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.visible_to_member ? 'translate-x-5' : 'translate-x-1'}`} />
            </div>
            <span className="text-sm font-semibold text-[#1a1a1a]">Visible au membre</span>
          </label>

          {formError && <p className="text-sm text-red-500">{formError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => { setModalOpen(false); setFormError('') }}>Annuler</Button>
            <Button type="submit" loading={formLoading}>Enregistrer</Button>
          </div>
        </form>
      </Modal>
    </Card>
  )
}
