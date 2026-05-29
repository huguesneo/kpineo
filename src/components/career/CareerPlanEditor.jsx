import { useState } from 'react'
import Card from '../shared/Card'
import Button from '../shared/Button'
import Input from '../shared/Input'
import Modal from '../shared/Modal'
import { useCareerPlan, upsertCareerPlan, deleteCareerPlan, updateBaseSalary, updateAnnualBonus } from '../../hooks/useCareerPlan'

export default function CareerPlanEditor({ userId, baseSalary, annualBonus, onBaseSalaryUpdated, onAnnualBonusUpdated }) {
  const { plans, loading, refetch } = useCareerPlan(userId)

  const [salaryEdit, setSalaryEdit] = useState(false)
  const [salaryValue, setSalaryValue] = useState(baseSalary || '')
  const [salaryLoading, setSalaryLoading] = useState(false)

  const [bonusEdit, setBonusEdit] = useState(false)
  const [bonusValue, setBonusValue] = useState(annualBonus || '')
  const [bonusLoading, setBonusLoading] = useState(false)

  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ id: null, year: new Date().getFullYear() + 1, planned_salary: '', notes: '', effective_date: '' })
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  async function handleSaveSalary() {
    if (!salaryValue) return
    setSalaryLoading(true)
    await updateBaseSalary(userId, Number(salaryValue))
    setSalaryLoading(false)
    setSalaryEdit(false)
    onBaseSalaryUpdated?.(Number(salaryValue))
  }

  async function handleSaveBonus() {
    if (!bonusValue) return
    setBonusLoading(true)
    await updateAnnualBonus(userId, Number(bonusValue))
    setBonusLoading(false)
    setBonusEdit(false)
    onAnnualBonusUpdated?.(Number(bonusValue))
  }

  const emptyForm = { id: null, year: new Date().getFullYear() + 1, planned_salary: '', notes: '', effective_date: '' }

  async function handleAddPlan(e) {
    e.preventDefault()
    if (!form.planned_salary) { setFormError('Le salaire est obligatoire.'); return }
    setFormLoading(true)
    setFormError('')
    const { error } = await upsertCareerPlan({
      id: form.id || undefined,
      user_id: userId,
      year: Number(form.year),
      planned_salary: Number(form.planned_salary),
      notes: form.notes.trim() || null,
      effective_date: form.effective_date || null,
    })
    setFormLoading(false)
    if (error) { setFormError(error.message); return }
    setForm(emptyForm)
    refetch()
    setAddOpen(false)
  }

  function openEdit(plan) {
    setForm({
      id: plan.id,
      year: plan.year,
      planned_salary: plan.planned_salary,
      notes: plan.notes || '',
      effective_date: plan.effective_date || '',
    })
    setAddOpen(true)
  }

  async function handleDelete(id) {
    await deleteCareerPlan(id)
    setConfirmDeleteId(null)
    refetch()
  }

  const currentYear = new Date().getFullYear()

  return (
    <div className="space-y-6">
      {/* Boni annuel */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-sm text-[#1a1a1a]">Boni annuel cible</h3>
            <p className="text-xs text-[#6b7280]">Divisé en 4 trimestres · paiement proportionnel à l'atteinte (min 80%)</p>
          </div>
          {!bonusEdit && (
            <Button size="sm" variant="secondary" onClick={() => { setBonusValue(annualBonus || ''); setBonusEdit(true) }}>
              Modifier
            </Button>
          )}
        </div>
        {bonusEdit ? (
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label="Boni annuel ($)"
                type="number"
                min="0"
                value={bonusValue}
                onChange={e => setBonusValue(e.target.value)}
                placeholder="Ex: 6000"
              />
            </div>
            <div className="flex gap-2 pb-0.5">
              <Button size="sm" variant="secondary" onClick={() => setBonusEdit(false)}>Annuler</Button>
              <Button size="sm" loading={bonusLoading} onClick={handleSaveBonus}>Enregistrer</Button>
            </div>
          </div>
        ) : (
          <p className="text-2xl font-bold text-[#1a1a1a]">
            {annualBonus
              ? Number(annualBonus).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
              : <span className="text-[#6b7280] text-base font-semibold">Non défini</span>}
          </p>
        )}
        {annualBonus && (
          <p className="text-xs text-[#6b7280] mt-2">
            Par trimestre (à 100%) : {(Number(annualBonus) / 4).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
            {' · '}Ex. à 112% : {Math.round(Number(annualBonus) / 4 * 1.12).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
          </p>
        )}
      </Card>

      {/* Salaire de base */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-sm text-[#1a1a1a]">Salaire de base annuel</h3>
            <p className="text-xs text-[#6b7280]">Utilisé pour le plan de carrière</p>
          </div>
          {!salaryEdit && (
            <Button size="sm" variant="secondary" onClick={() => { setSalaryValue(baseSalary || ''); setSalaryEdit(true) }}>
              Modifier
            </Button>
          )}
        </div>
        {salaryEdit ? (
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label="Salaire ($)"
                type="number"
                min="0"
                value={salaryValue}
                onChange={e => setSalaryValue(e.target.value)}
                placeholder="Ex: 60000"
              />
            </div>
            <div className="flex gap-2 pb-0.5">
              <Button size="sm" variant="secondary" onClick={() => setSalaryEdit(false)}>Annuler</Button>
              <Button size="sm" loading={salaryLoading} onClick={handleSaveSalary}>Enregistrer</Button>
            </div>
          </div>
        ) : (
          <p className="text-2xl font-bold text-[#1a1a1a]">
            {baseSalary
              ? Number(baseSalary).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
              : <span className="text-[#6b7280] text-base font-semibold">Non défini</span>}
          </p>
        )}
      </Card>

      {/* Plan de carrière */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-sm text-[#1a1a1a]">Plan de carrière</h3>
            <p className="text-xs text-[#6b7280]">Salaire prévu par année</p>
          </div>
          <Button size="sm" onClick={() => { setForm(emptyForm); setFormError(''); setAddOpen(true) }}>+ Ajouter une entrée</Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
        ) : plans.length === 0 ? (
          <p className="text-sm text-[#6b7280] py-2">Aucun plan de carrière défini.</p>
        ) : (
          <div className="space-y-2">
            {plans.map(plan => (
              <div
                key={plan.id}
                className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                  plan.year === currentYear
                    ? 'border-[#00bbb1]/30 bg-[#00bbb1]/5'
                    : plan.year < currentYear
                    ? 'border-[#e5e7eb] bg-white opacity-75'
                    : 'border-[#e5e7eb] bg-gray-50'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className={`font-bold text-sm ${plan.year < currentYear ? 'text-[#6b7280]' : 'text-[#1a1a1a]'}`}>{plan.year}</p>
                    {plan.year === currentYear && (
                      <span className="text-xs font-semibold text-[#00bbb1] bg-[#00bbb1]/10 px-2 py-0.5 rounded-full">Année en cours</span>
                    )}
                    {plan.year < currentYear && (
                      <span className="text-xs font-semibold text-[#6b7280] bg-gray-100 px-2 py-0.5 rounded-full">Historique</span>
                    )}
                  </div>
                  {plan.effective_date && (
                    <p className="text-xs text-[#6b7280] mt-0.5">
                      En vigueur le {new Date(plan.effective_date + 'T00:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                  {plan.notes && <p className="text-xs text-[#6b7280] mt-0.5 whitespace-pre-wrap">{plan.notes}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <p className={`font-bold ${plan.year < currentYear ? 'text-[#6b7280]' : 'text-[#1a1a1a]'}`}>
                    {Number(plan.planned_salary).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
                  </p>
                  {confirmDeleteId === plan.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#6b7280]">Confirmer ?</span>
                      <Button size="sm" variant="danger" onClick={() => handleDelete(plan.id)}>Oui</Button>
                      <Button size="sm" variant="secondary" onClick={() => setConfirmDeleteId(null)}>Non</Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(plan)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-gray-600 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(plan.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal isOpen={addOpen} onClose={() => { setAddOpen(false); setForm(emptyForm); setFormError('') }} title={form.id ? 'Modifier l\'entrée' : 'Ajouter une entrée au plan'}>
        <form onSubmit={handleAddPlan} className="space-y-4">
          <Input
            label="Année"
            type="number"
            min={currentYear - 20}
            max={currentYear + 20}
            value={form.year}
            onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
          />
          <Input
            label="Date d'entrée en vigueur (optionnel)"
            type="date"
            value={form.effective_date}
            onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))}
          />
          <Input
            label="Salaire prévu ($)"
            type="number"
            min="0"
            value={form.planned_salary}
            onChange={e => setForm(f => ({ ...f, planned_salary: e.target.value }))}
            placeholder="Ex: 65000"
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-[#1a1a1a]">Notes (optionnel)</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Ex: Promotion prévue, nouvelle responsabilité..."
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1] resize-none"
            />
          </div>
          {formError && <p className="text-sm text-red-500">{formError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => { setAddOpen(false); setForm(emptyForm); setFormError('') }}>Annuler</Button>
            <Button type="submit" loading={formLoading}>Enregistrer</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
