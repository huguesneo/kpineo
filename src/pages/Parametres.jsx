import { useState } from 'react'
import Layout from '../components/layout/Layout'
import Header from '../components/layout/Header'
import Card from '../components/shared/Card'
import Badge from '../components/shared/Badge'
import Button from '../components/shared/Button'
import Input from '../components/shared/Input'
import Modal from '../components/shared/Modal'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useKPITypes, createKPIType, deactivateKPIType } from '../hooks/useKPITypes'

const ROLE_SCOPE_LABELS = {
  all: 'Tous les rôles',
  naturopathe: 'Naturopathe',
  closer: 'Closer',
  setter: 'Setter',
  clinic: 'Clinique',
}

const ROLE_SCOPE_VARIANTS = {
  all: 'primary',
  naturopathe: 'naturopathe',
  closer: 'closer',
  setter: 'setter',
  clinic: 'success',
}

function AddKPITypeModal({ isOpen, onClose, onCreated }) {
  const [form, setForm] = useState({ label: '', role_scope: 'all' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.label.trim()) { setError('Le nom est obligatoire.'); return }
    setLoading(true)
    setError('')
    const { error: err } = await createKPIType(form)
    setLoading(false)
    if (err) {
      setError(err.message.includes('unique') ? 'Un type avec ce nom existe déjà.' : err.message)
      return
    }
    setForm({ label: '', role_scope: 'all' })
    onCreated?.()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ajouter un type de KPI">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nom du type *"
          name="label"
          value={form.label}
          onChange={handleChange}
          placeholder="Ex: Nouveaux clients"
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-[#1a1a1a]">S'applique à</label>
          <select
            name="role_scope"
            value={form.role_scope}
            onChange={handleChange}
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
          >
            {Object.entries(ROLE_SCOPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>Ajouter</Button>
        </div>
      </form>
    </Modal>
  )
}

function KPITypesSection() {
  const { types, loading, refetch } = useKPITypes()
  const [addOpen, setAddOpen] = useState(false)
  const [confirmId, setConfirmId] = useState(null)

  async function handleDeactivate(id) {
    await deactivateKPIType(id)
    setConfirmId(null)
    refetch()
  }

  const grouped = {
    all: types.filter(t => t.role_scope === 'all'),
    naturopathe: types.filter(t => t.role_scope === 'naturopathe'),
    closer: types.filter(t => t.role_scope === 'closer'),
    setter: types.filter(t => t.role_scope === 'setter'),
    clinic: types.filter(t => t.role_scope === 'clinic'),
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-[#1a1a1a]">Types de KPI</h2>
          <p className="text-sm text-[#6b7280] mt-0.5">Ces types apparaissent dans le formulaire d'ajout de KPI.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>+ Ajouter un type</Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).filter(([, items]) => items.length > 0).map(([scope, items]) => (
            <div key={scope}>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={ROLE_SCOPE_VARIANTS[scope]}>{ROLE_SCOPE_LABELS[scope]}</Badge>
              </div>
              <div className="space-y-1.5">
                {items.map(type => (
                  <div key={type.id} className="flex items-center justify-between px-4 py-2.5 bg-gray-50 rounded-lg border border-[#e5e7eb]">
                    <div>
                      <p className="text-sm font-semibold text-[#1a1a1a]">{type.label}</p>
                      <p className="text-xs text-[#6b7280] font-mono">{type.value}</p>
                    </div>
                    {confirmId === type.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#6b7280]">Confirmer ?</span>
                        <Button size="sm" variant="danger" onClick={() => handleDeactivate(type.id)}>Oui</Button>
                        <Button size="sm" variant="secondary" onClick={() => setConfirmId(null)}>Non</Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmId(type.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                        title="Retirer ce type"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddKPITypeModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={refetch}
      />
    </Card>
  )
}

export default function Parametres() {
  const { profile, user } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [pwForm, setPwForm] = useState({ new: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')

  function handlePwChange(e) {
    setPwForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handlePwSubmit(e) {
    e.preventDefault()
    if (pwForm.new !== pwForm.confirm) { setPwError('Les mots de passe ne correspondent pas.'); return }
    if (pwForm.new.length < 6) { setPwError('Minimum 6 caractères.'); return }
    setPwLoading(true); setPwError(''); setPwSuccess('')
    const { error } = await supabase.auth.updateUser({ password: pwForm.new })
    setPwLoading(false)
    if (error) setPwError(error.message)
    else { setPwSuccess('Mot de passe mis à jour.'); setPwForm({ new: '', confirm: '' }) }
  }

  return (
    <Layout>
      <Header title="Paramètres" />

      <div className="max-w-2xl space-y-6">
        {/* Compte */}
        <Card className="p-6">
          <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">Informations du compte</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-[#6b7280]">Nom complet</label>
              <p className="text-sm font-semibold text-[#1a1a1a] mt-1">{profile?.full_name}</p>
            </div>
            <div>
              <label className="text-sm font-semibold text-[#6b7280]">Adresse email</label>
              <p className="text-sm font-semibold text-[#1a1a1a] mt-1">{profile?.email || user?.email}</p>
            </div>
            <div>
              <label className="text-sm font-semibold text-[#6b7280]">Rôle</label>
              <p className="text-sm font-semibold text-[#1a1a1a] mt-1 capitalize">{profile?.role}</p>
            </div>
          </div>
        </Card>

        {/* Mot de passe */}
        <Card className="p-6">
          <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">Changer le mot de passe</h2>
          <form onSubmit={handlePwSubmit} className="space-y-4">
            <Input label="Nouveau mot de passe" name="new" type="password" value={pwForm.new} onChange={handlePwChange} placeholder="••••••••" />
            <Input label="Confirmer" name="confirm" type="password" value={pwForm.confirm} onChange={handlePwChange} placeholder="••••••••" />
            {pwError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3"><p className="text-sm text-red-600">{pwError}</p></div>}
            {pwSuccess && <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3"><p className="text-sm text-emerald-600 font-semibold">{pwSuccess}</p></div>}
            <div className="flex justify-end">
              <Button type="submit" loading={pwLoading}>Mettre à jour</Button>
            </div>
          </form>
        </Card>

        {/* Types de KPI — admin seulement */}
        {isAdmin && <KPITypesSection />}
      </div>
    </Layout>
  )
}
