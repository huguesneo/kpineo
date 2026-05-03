import { useState } from 'react'
import Layout from '../components/layout/Layout'
import Card from '../components/shared/Card'
import Button from '../components/shared/Button'
import Input from '../components/shared/Input'
import Modal from '../components/shared/Modal'
import {
  useRewardsCatalog,
  createReward,
  updateReward,
  deleteReward,
  reorderRewards,
} from '../hooks/useRewards'

const CATEGORIES = [
  { value: 'temps_off',  label: 'Temps off',   icon: '🏖️' },
  { value: 'cadeau',     label: 'Cadeau',       icon: '🎁' },
  { value: 'experience', label: 'Expérience',   icon: '✨' },
  { value: 'monetaire',  label: 'Monétaire',    icon: '💰' },
]

const EMPTY_FORM = {
  title:           '',
  description:     '',
  cost_points:     10,
  category:        'cadeau',
  stock_remaining: '',   // '' = unlimited
  expiration_days: '',
  sort_order:      0,
  is_active:       true,
}

function RewardFormModal({ isOpen, onClose, initial, onSaved }) {
  const isEdit = !!initial?.id
  const [form, setForm]     = useState(initial ?? EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [err, setErr]       = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e) {
    e.preventDefault()
    if (!form.title.trim()) { setErr('Le titre est obligatoire.'); return }
    if (!form.cost_points || form.cost_points < 1) { setErr('Minimum 1 point.'); return }
    setErr('')
    setLoading(true)
    const payload = {
      title:           form.title.trim(),
      description:     form.description.trim() || null,
      cost_points:     Number(form.cost_points),
      category:        form.category,
      stock_remaining: form.stock_remaining === '' ? null : Number(form.stock_remaining),
      expiration_days: form.expiration_days === '' ? null : Number(form.expiration_days),
      sort_order:      Number(form.sort_order) || 0,
      is_active:       form.is_active,
    }
    const { error } = isEdit
      ? await updateReward(initial.id, payload)
      : await createReward(payload)
    setLoading(false)
    if (error) { setErr(error.message); return }
    onSaved()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Modifier la récompense' : 'Nouvelle récompense'}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Titre *"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="Ex: 1 journée de congé"
        />
        <div>
          <label className="block text-sm font-semibold text-[#1a1a1a] mb-1">Description</label>
          <textarea
            rows={2}
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Optionnel…"
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1] resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Coût (pts) *"
            type="number" min="1"
            value={form.cost_points}
            onChange={e => set('cost_points', e.target.value)}
          />
          <div>
            <label className="block text-sm font-semibold text-[#1a1a1a] mb-1">Catégorie</label>
            <select
              value={form.category}
              onChange={e => set('category', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
            >
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Stock (vide = illimité)"
            type="number" min="0"
            value={form.stock_remaining}
            onChange={e => set('stock_remaining', e.target.value)}
            placeholder="Illimité"
          />
          <Input
            label="Expiration (jours)"
            type="number" min="1"
            value={form.expiration_days}
            onChange={e => set('expiration_days', e.target.value)}
            placeholder="Pas d'expiration"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Ordre d'affichage"
            type="number" min="0"
            value={form.sort_order}
            onChange={e => set('sort_order', e.target.value)}
          />
          <div className="flex flex-col justify-end pb-0.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => set('is_active', !form.is_active)}
                className={`w-10 h-6 rounded-full transition-colors ${form.is_active ? 'bg-[#00bbb1]' : 'bg-gray-200'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white shadow mt-1 transition-transform mx-1 ${form.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
              <span className="text-sm font-semibold text-[#1a1a1a]">Active</span>
            </label>
          </div>
        </div>

        {err && <p className="text-sm text-red-500">{err}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>{isEdit ? 'Enregistrer' : 'Créer'}</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function BoutiqueCatalogue() {
  const { rewards, loading, refetch } = useRewardsCatalog(true)
  const [modalOpen, setModalOpen]     = useState(false)
  const [editing, setEditing]         = useState(null)
  const [deleting, setDeleting]       = useState(null)
  const [catFilter, setCatFilter]     = useState('all')

  async function handleDelete(id) {
    if (!confirm('Supprimer cette récompense ?')) return
    await deleteReward(id)
    refetch()
  }

  async function handleToggleActive(reward) {
    await updateReward(reward.id, { is_active: !reward.is_active })
    refetch()
  }

  async function handleMoveUp(reward) {
    const idx = displayed.indexOf(reward)
    if (idx <= 0) return
    const prev = displayed[idx - 1]
    await reorderRewards([
      { id: reward.id, sort_order: prev.sort_order },
      { id: prev.id,   sort_order: reward.sort_order },
    ])
    refetch()
  }

  async function handleMoveDown(reward) {
    const idx = displayed.indexOf(reward)
    if (idx >= displayed.length - 1) return
    const next = displayed[idx + 1]
    await reorderRewards([
      { id: reward.id, sort_order: next.sort_order },
      { id: next.id,   sort_order: reward.sort_order },
    ])
    refetch()
  }

  function openEdit(r) {
    setEditing({
      ...r,
      stock_remaining: r.stock_remaining ?? '',
      expiration_days: r.expiration_days ?? '',
    })
    setModalOpen(true)
  }

  const cats = ['all', ...CATEGORIES.map(c => c.value).filter(v => rewards.some(r => r.category === v))]
  const displayed = catFilter === 'all' ? rewards : rewards.filter(r => r.category === catFilter)

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Catalogue récompenses</h1>
          <p className="text-sm text-[#9ca3af] mt-0.5">Gérez les récompenses disponibles</p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true) }}>
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Nouvelle récompense
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total', value: rewards.length, color: '#1a1a1a' },
          { label: 'Actives', value: rewards.filter(r => r.is_active).length, color: '#10b981' },
          { label: 'Inactives', value: rewards.filter(r => !r.is_active).length, color: '#9ca3af' },
        ].map(s => (
          <Card key={s.label} className="p-4 text-center">
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs font-semibold text-[#9ca3af] mt-0.5">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Filter */}
      {cats.length > 1 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {cats.map(c => {
            const cfg = CATEGORIES.find(x => x.value === c)
            return (
              <button
                key={c}
                onClick={() => setCatFilter(c)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  catFilter === c
                    ? 'bg-[#00bbb1] text-white shadow-sm'
                    : 'bg-white border border-[#e5e7eb] text-[#6b7280] hover:border-[#00bbb1]/40'
                }`}
              >
                {cfg && <span>{cfg.icon}</span>}
                {c === 'all' ? 'Tout' : cfg?.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#e5e7eb] h-16 animate-pulse" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-[#9ca3af]">Aucune récompense. Créez-en une!</p>
        </Card>
      ) : (
        <div className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden">
          <div className="divide-y divide-[#f3f4f6]">
            {displayed.map((r, idx) => {
              const cat = CATEGORIES.find(c => c.value === r.category)
              return (
                <div key={r.id} className={`flex items-center gap-3 px-4 py-3 group ${!r.is_active ? 'opacity-50' : ''}`}>
                  {/* Reorder */}
                  <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleMoveUp(r)} className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30" disabled={idx === 0}>
                      <svg className="w-3 h-3 text-[#9ca3af]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button onClick={() => handleMoveDown(r)} className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30" disabled={idx === displayed.length - 1}>
                      <svg className="w-3 h-3 text-[#9ca3af]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  {/* Icon */}
                  <span className="text-lg">{cat?.icon ?? '🎯'}</span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1a1a1a] truncate">{r.title}</p>
                    <p className="text-[10px] text-[#9ca3af]">
                      {cat?.label}
                      {r.stock_remaining !== null ? ` · ${r.stock_remaining} en stock` : ' · Illimité'}
                    </p>
                  </div>

                  {/* Cost */}
                  <span className="text-sm font-black text-amber-600">{r.cost_points} pts</span>

                  {/* Sort order input */}
                  <input
                    type="number"
                    value={r.sort_order ?? 0}
                    onChange={async e => {
                      await reorderRewards([{ id: r.id, sort_order: Number(e.target.value) }])
                      refetch()
                    }}
                    className="w-12 text-center text-xs border border-[#e5e7eb] rounded-lg px-1 py-1 focus:outline-none focus:ring-1 focus:ring-[#00bbb1]"
                  />

                  {/* Toggle active */}
                  <button
                    onClick={() => handleToggleActive(r)}
                    className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 relative ${r.is_active ? 'bg-[#00bbb1]' : 'bg-gray-200'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${r.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>

                  {/* Actions */}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(r)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-[#6b7280] transition-colors"
                      title="Modifier"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-[#d1d5db] hover:text-red-400 transition-colors"
                      title="Supprimer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <RewardFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initial={editing}
        onSaved={refetch}
      />
    </Layout>
  )
}
