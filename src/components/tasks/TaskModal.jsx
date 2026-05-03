import { useState, useEffect } from 'react'
import Modal from '../shared/Modal'
import Button from '../shared/Button'
import Input from '../shared/Input'
import { createTask } from '../../hooks/useTasks'
import { useAuth } from '../../context/AuthContext'
import { useMembers } from '../../hooks/useMembers'

const PRIORITIES = [
  { value: 'prioritaire', label: 'Prioritaire', dot: 'bg-red-400', desc: 'À traiter en premier' },
  { value: 'secondaire',  label: 'Secondaire',  dot: 'bg-amber-400', desc: 'Quand possible' },
]

const RECURRENCE_TYPES = [
  { value: 'daily',   label: 'Quotidien' },
  { value: 'weekly',  label: 'Hebdomadaire' },
  { value: 'monthly', label: 'Mensuel' },
]

const WEEKDAYS = [
  { value: 1, label: 'L' },
  { value: 2, label: 'M' },
  { value: 3, label: 'M' },
  { value: 4, label: 'J' },
  { value: 5, label: 'V' },
  { value: 6, label: 'S' },
  { value: 0, label: 'D' },
]

const END_TYPES = [
  { value: 'never', label: 'Jamais' },
  { value: 'count', label: 'Après X fois' },
  { value: 'date',  label: "Le..." },
]

const DEFAULT_RECURRENCE = {
  type: 'weekly',
  interval: 1,
  weekdays: [1], // lundi par défaut
  end_type: 'never',
  end_count: 10,
  end_date: '',
}

export default function TaskModal({ isOpen, onClose, userId, defaultPriority = 'prioritaire', onCreated, isAdmin = true }) {
  const { user } = useAuth()
  const { members } = useMembers()

  const [form, setForm] = useState({
    user_id: userId || '',
    title: '',
    description: '',
    due_date: '',
    priority: defaultPriority,
  })
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrence, setRecurrence] = useState(DEFAULT_RECURRENCE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setForm({ user_id: userId || '', title: '', description: '', due_date: '', priority: defaultPriority })
      setIsRecurring(false)
      setRecurrence(DEFAULT_RECURRENCE)
      setError('')
    }
  }, [isOpen, userId, defaultPriority])

  const needsMemberSelect = isAdmin && !userId

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  function setRec(key, value) {
    setRecurrence(r => ({ ...r, [key]: value }))
  }

  function toggleWeekday(day) {
    setRecurrence(r => {
      const days = r.weekdays.includes(day)
        ? r.weekdays.filter(d => d !== day)
        : [...r.weekdays, day]
      return { ...r, weekdays: days.length === 0 ? [day] : days }
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (needsMemberSelect && !form.user_id) { setError('Veuillez sélectionner un membre.'); return }
    if (!form.title.trim()) { setError('Le titre est obligatoire.'); return }
    if (isRecurring && recurrence.type === 'weekly' && recurrence.weekdays.length === 0) {
      setError('Sélectionnez au moins un jour de la semaine.')
      return
    }

    setLoading(true)
    setError('')

    const recurrence_rule = isRecurring ? {
      type: recurrence.type,
      interval: Math.max(1, parseInt(recurrence.interval) || 1),
      weekdays: recurrence.type === 'weekly' ? recurrence.weekdays : undefined,
      end_type: recurrence.end_type,
      end_count: recurrence.end_type === 'count' ? Math.max(1, parseInt(recurrence.end_count) || 1) : null,
      end_date: recurrence.end_type === 'date' ? recurrence.end_date : null,
    } : null

    const taskPayload = {
      user_id: userId || form.user_id,
      created_by: user.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_date: form.due_date || null,
      priority: form.priority,
    }
    if (recurrence_rule) {
      taskPayload.recurrence_rule = recurrence_rule
      taskPayload.recurrence_index = 0
    }

    const { error: err } = await createTask(taskPayload)

    setLoading(false)
    if (err) { setError(err.message); return }
    onCreated?.()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nouvelle tâche" size="md">
      <form onSubmit={handleSubmit} className="space-y-5">

        {needsMemberSelect && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-[#1a1a1a]">Membre assigné <span className="text-red-400">*</span></label>
            <select
              name="user_id"
              value={form.user_id}
              onChange={handleChange}
              className="w-full px-3 py-2.5 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
            >
              <option value="">Choisir un membre…</option>
              {members.filter(m => m.role !== 'admin').map(m => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
          </div>
        )}

        <Input
          label="Titre"
          name="title"
          value={form.title}
          onChange={handleChange}
          placeholder="Ex: Préparer le rapport mensuel"
          required
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-[#1a1a1a]">
            Description <span className="text-[#9ca3af] font-normal">(optionnel)</span>
          </label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            rows={2}
            className="w-full px-3 py-2.5 text-sm border border-[#e5e7eb] rounded-lg bg-white placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#00bbb1] resize-none"
            placeholder="Détails supplémentaires…"
          />
        </div>

        {/* Priorité */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-[#1a1a1a]">Priorité</label>
          <div className="grid grid-cols-2 gap-2">
            {PRIORITIES.map(p => (
              <button
                key={p.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, priority: p.value }))}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                  form.priority === p.value ? 'border-[#1a1a1a]' : 'border-[#e5e7eb] hover:border-[#9ca3af]'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${p.dot}`} />
                <div>
                  <p className="text-sm font-semibold text-[#1a1a1a]">{p.label}</p>
                  <p className="text-[10px] text-[#9ca3af]">{p.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Date limite */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-[#1a1a1a]">
            {isRecurring ? 'Date de début' : 'Date limite'}{' '}
            <span className="text-[#9ca3af] font-normal">(optionnel)</span>
          </label>
          <input
            type="date"
            name="due_date"
            value={form.due_date}
            onChange={handleChange}
            className="w-full px-3 py-2.5 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
          />
        </div>

        {/* Toggle récurrence */}
        <div className="border border-[#e5e7eb] rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setIsRecurring(r => !r)}
            className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold transition-colors ${
              isRecurring ? 'bg-[#00bbb1]/5 text-[#00bbb1]' : 'bg-white text-[#6b7280] hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Répéter cette tâche
            </div>
            <div className={`w-10 h-5 rounded-full transition-colors relative ${isRecurring ? 'bg-[#00bbb1]' : 'bg-gray-200'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isRecurring ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </button>

          {isRecurring && (
            <div className="px-4 pb-4 pt-3 space-y-4 bg-[#fafafa] border-t border-[#e5e7eb]">

              {/* Type */}
              <div>
                <label className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2 block">Fréquence</label>
                <div className="flex gap-1.5">
                  {RECURRENCE_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setRec('type', t.value)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        recurrence.type === t.value
                          ? 'bg-[#00bbb1] text-white'
                          : 'bg-white border border-[#e5e7eb] text-[#6b7280] hover:border-[#00bbb1]/40'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interval */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#6b7280]">Tous les</span>
                <input
                  type="number"
                  min="1"
                  max="52"
                  value={recurrence.interval}
                  onChange={e => setRec('interval', e.target.value)}
                  className="w-14 px-2 py-1.5 text-sm text-center border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
                />
                <span className="text-sm text-[#6b7280]">
                  {recurrence.type === 'daily' ? 'jour(s)' : recurrence.type === 'weekly' ? 'semaine(s)' : 'mois'}
                </span>
              </div>

              {/* Jours de la semaine */}
              {recurrence.type === 'weekly' && (
                <div>
                  <label className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2 block">Jours</label>
                  <div className="flex gap-1.5">
                    {WEEKDAYS.map(d => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => toggleWeekday(d.value)}
                        className={`w-9 h-9 rounded-full text-xs font-bold transition-all ${
                          recurrence.weekdays.includes(d.value)
                            ? 'bg-[#00bbb1] text-white'
                            : 'bg-white border border-[#e5e7eb] text-[#6b7280] hover:border-[#00bbb1]/40'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Fin */}
              <div>
                <label className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2 block">Se termine</label>
                <div className="space-y-2">
                  {END_TYPES.map(et => (
                    <label key={et.value} className="flex items-center gap-3 cursor-pointer">
                      <div className="relative">
                        <input
                          type="radio"
                          name="end_type"
                          value={et.value}
                          checked={recurrence.end_type === et.value}
                          onChange={() => setRec('end_type', et.value)}
                          className="sr-only"
                        />
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          recurrence.end_type === et.value ? 'border-[#00bbb1]' : 'border-[#d1d5db]'
                        }`}>
                          {recurrence.end_type === et.value && (
                            <div className="w-2 h-2 rounded-full bg-[#00bbb1]" />
                          )}
                        </div>
                      </div>
                      <span className="text-sm text-[#1a1a1a]">{et.label}</span>

                      {et.value === 'count' && recurrence.end_type === 'count' && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={recurrence.end_count}
                            onChange={e => setRec('end_count', e.target.value)}
                            className="w-16 px-2 py-1 text-sm text-center border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
                          />
                          <span className="text-sm text-[#6b7280]">occurrence{recurrence.end_count > 1 ? 's' : ''}</span>
                        </div>
                      )}

                      {et.value === 'date' && recurrence.end_type === 'date' && (
                        <input
                          type="date"
                          value={recurrence.end_date}
                          onChange={e => setRec('end_date', e.target.value)}
                          className="px-2 py-1 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
                        />
                      )}
                    </label>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>Créer la tâche</Button>
        </div>
      </form>
    </Modal>
  )
}
