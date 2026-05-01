import { useState } from 'react'
import Modal from '../shared/Modal'
import Button from '../shared/Button'
import Input from '../shared/Input'
import { createTask } from '../../hooks/useTasks'
import { useAuth } from '../../context/AuthContext'
import { useMembers } from '../../hooks/useMembers'

export default function TaskModal({ isOpen, onClose, userId, defaultPriority = 'prioritaire', onCreated }) {
  const { user } = useAuth()
  const { members } = useMembers()
  const [form, setForm] = useState({
    user_id: userId || '',
    title: '',
    description: '',
    due_date: '',
    priority: defaultPriority,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const needsMemberSelect = !userId

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (needsMemberSelect && !form.user_id) { setError('Veuillez sélectionner un membre.'); return }
    if (!form.title.trim()) { setError('Le titre est obligatoire.'); return }
    setLoading(true)
    setError('')
    const { error: err } = await createTask({
      user_id: userId || form.user_id,
      created_by: user.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_date: form.due_date || null,
      priority: form.priority,
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setForm({ user_id: userId || '', title: '', description: '', due_date: '', priority: defaultPriority })
    onCreated?.()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ajouter une tâche">
      <form onSubmit={handleSubmit} className="space-y-4">
        {needsMemberSelect && (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-[#1a1a1a]">Membre assigné *</label>
            <select
              name="user_id"
              value={form.user_id}
              onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
            >
              <option value="">Sélectionner un membre</option>
              {members.filter(m => m.role !== 'admin').map(m => (
                <option key={m.id} value={m.id}>{m.full_name} ({m.role})</option>
              ))}
            </select>
          </div>
        )}
        <Input
          label="Titre *"
          name="title"
          value={form.title}
          onChange={handleChange}
          placeholder="Ex: Préparer le rapport mensuel"
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-[#1a1a1a]">Description (optionnel)</label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white placeholder:text-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#00bbb1] resize-none"
            placeholder="Détails supplémentaires..."
          />
        </div>
        <Input
          label="Date limite (optionnel)"
          name="due_date"
          type="date"
          value={form.due_date}
          onChange={handleChange}
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-[#1a1a1a]">Priorité</label>
          <select
            name="priority"
            value={form.priority}
            onChange={handleChange}
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
          >
            <option value="prioritaire">🔴 Prioritaire</option>
            <option value="secondaire">🟡 Secondaire</option>
          </select>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>Créer la tâche</Button>
        </div>
      </form>
    </Modal>
  )
}
