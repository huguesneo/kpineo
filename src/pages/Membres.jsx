import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import Header from '../components/layout/Header'
import Card from '../components/shared/Card'
import Badge from '../components/shared/Badge'
import Button from '../components/shared/Button'
import Modal from '../components/shared/Modal'
import Input from '../components/shared/Input'
import { SkeletonTable } from '../components/shared/Skeleton'
import { useMembers, updateMember, deleteMember } from '../hooks/useMembers'
import { useAuth } from '../context/AuthContext'
import { supabase, supabaseAdmin } from '../lib/supabase'

const HUGUES_EMAIL = 'hugues@neoperformance.ca'

const ROLE_LABELS = {
  naturopathe:    'Naturopathe',
  closer:         'Closer',
  setter:         'Setter',
  service_client: 'Service clients & gestion',
  resp_vente:     'Resp. équipe de vente',
  admin:          'Admin',
}
const ROLES = ['naturopathe', 'closer', 'setter', 'service_client', 'resp_vente', 'admin']

function AddMemberModal({ isOpen, onClose, onCreated }) {
  const [form, setForm] = useState({ full_name: '', email: '', role: 'naturopathe', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleChange(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.full_name.trim() || !form.email.trim() || !form.password.trim()) { setError('Tous les champs sont obligatoires.'); return }
    setLoading(true); setError('')
    const client = supabaseAdmin || supabase
    const { data, error: authErr } = await client.auth.admin.createUser({
      email: form.email, password: form.password, email_confirm: true,
      user_metadata: { full_name: form.full_name, role: form.role },
    })
    if (authErr) { setError(authErr.message); setLoading(false); return }
    await supabase.from('profiles').upsert({ id: data.user.id, full_name: form.full_name, email: form.email, role: form.role })
    setLoading(false)
    setForm({ full_name: '', email: '', role: 'naturopathe', password: '' })
    onCreated?.(); onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ajouter un membre">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Nom complet *" name="full_name" value={form.full_name} onChange={handleChange} placeholder="Jean Dupont" />
        <Input label="Email *" name="email" type="email" value={form.email} onChange={handleChange} placeholder="jean@exemple.com" />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-[#1a1a1a]">Rôle *</label>
          <select name="role" value={form.role} onChange={handleChange} className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]">
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <Input label="Mot de passe temporaire *" name="password" type="password" value={form.password} onChange={handleChange} placeholder="••••••••" />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>Ajouter</Button>
        </div>
      </form>
    </Modal>
  )
}

const SECONDARY_ROLE_OPTIONS = [
  { value: 'closer', label: 'Closer' },
  { value: 'setter', label: 'Setter' },
]

function EditMemberModal({ isOpen, onClose, member, onSaved, onDeleted }) {
  const { user } = useAuth()
  const isHugues = user?.email === HUGUES_EMAIL
  const [form, setForm] = useState({
    full_name:       member?.full_name || '',
    role:            member?.role || 'naturopathe',
    secondary_roles: member?.secondary_roles ?? [],
    is_active:       member?.is_active ?? true,
    new_password:    '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [deleting, setDeleting] = useState(false)

  function handleChange(e) {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm(f => ({ ...f, [e.target.name]: val }))
  }

  function toggleSecondary(role) {
    setForm(f => {
      const current = f.secondary_roles ?? []
      const next = current.includes(role) ? current.filter(r => r !== role) : [...current, role]
      return { ...f, secondary_roles: next }
    })
  }

  // Si le rôle principal change, retirer ce rôle des secondaires
  function handleRoleChange(e) {
    const newRole = e.target.value
    setForm(f => ({
      ...f,
      role: newRole,
      secondary_roles: (f.secondary_roles ?? []).filter(r => r !== newRole),
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault(); setLoading(true); setError('')
    const { new_password, ...profileUpdates } = form
    const { error: profileErr } = await updateMember(member.id, profileUpdates)
    if (profileErr) { setError(profileErr.message); setLoading(false); return }
    if (new_password.trim()) {
      const client = supabaseAdmin || supabase
      const { error: pwErr } = await client.auth.admin.updateUserById(member.id, { password: new_password.trim() })
      if (pwErr) { setError(pwErr.message); setLoading(false); return }
    }
    setLoading(false)
    onSaved?.(); onClose()
  }

  async function handleDelete() {
    if (!window.confirm(`Supprimer définitivement ${member.full_name} (${member.email}) ?\n\nCette action est irréversible.`)) return
    setDeleting(true); setError('')
    const { error: delErr } = await deleteMember(member.id)
    setDeleting(false)
    if (delErr) { setError(delErr.message); return }
    onDeleted?.(); onClose()
  }

  const availableSecondary = SECONDARY_ROLE_OPTIONS.filter(o => o.value !== form.role)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Modifier le membre">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Nom complet" name="full_name" value={form.full_name} onChange={handleChange} />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-[#1a1a1a]">Rôle principal</label>
          <select name="role" value={form.role} onChange={handleRoleChange} className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]">
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>

        {availableSecondary.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[#1a1a1a]">Rôles secondaires</label>
            <div className="flex gap-3">
              {availableSecondary.map(({ value, label }) => {
                const active = (form.secondary_roles ?? []).includes(value)
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleSecondary(value)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${
                      active
                        ? 'bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/40'
                        : 'bg-white text-[#6b7280] border-[#e5e7eb] hover:border-[#3b82f6]/40 hover:text-[#3b82f6]'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${active ? 'bg-[#3b82f6] border-[#3b82f6]' : 'border-[#d1d5db]'}`}>
                      {active && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </span>
                    {label}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-[#9ca3af]">
              Un rôle secondaire donne accès aux pages et dashboards de ce rôle dans le menu.
            </p>
          </div>
        )}

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} className="w-4 h-4 accent-[#00bbb1]" />
          <span className="text-sm font-semibold text-[#1a1a1a]">Membre actif</span>
        </label>
        <Input label="Nouveau mot de passe (optionnel)" name="new_password" type="password" value={form.new_password} onChange={handleChange} placeholder="Laisser vide pour ne pas changer" />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-between items-center gap-3 pt-2">
          {isHugues ? (
            <Button type="button" variant="danger" loading={deleting} onClick={handleDelete}>Supprimer</Button>
          ) : <span />}
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
            <Button type="submit" loading={loading}>Enregistrer</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

// Vue admin : liste complète avec actions
function AdminMembresView() {
  const navigate = useNavigate()
  const [roleFilter, setRoleFilter] = useState('tous')
  const [addOpen, setAddOpen] = useState(false)
  const [editMember, setEditMember] = useState(null)
  const { members, loading, refetch } = useMembers(roleFilter !== 'tous' ? { role: roleFilter } : {})
  const roles = ['tous', 'naturopathe', 'closer', 'setter', 'service_client', 'resp_vente']

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2">
          {roles.map(r => (
            <button key={r} onClick={() => setRoleFilter(r)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${roleFilter === r ? 'bg-[#00bbb1] text-white' : 'bg-white text-[#6b7280] border border-[#e5e7eb] hover:bg-gray-50'}`}>
              {r === 'tous' ? 'Tous' : ROLE_LABELS[r]}
            </button>
          ))}
        </div>
        <Button onClick={() => setAddOpen(true)}>+ Ajouter un membre</Button>
      </div>

      <Card className="p-6">
        {loading ? <SkeletonTable rows={6} /> : members.length === 0 ? (
          <p className="text-sm text-[#6b7280] py-4">Aucun membre trouvé.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e5e7eb]">
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Membre</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Rôle</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Statut</th>
                  <th className="text-right py-3 px-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} className="border-b border-[#f5f5f7] hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#00bbb1]/10 flex items-center justify-center text-[#00bbb1] font-bold text-sm">
                          {m.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-[#1a1a1a]">{m.full_name}</p>
                          <p className="text-xs text-[#6b7280]">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={m.role}>{ROLE_LABELS[m.role] || m.role}</Badge>
                        {(m.secondary_roles ?? []).map(r => (
                          <span key={r} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#3b82f6]/10 text-[#3b82f6]">
                            +{ROLE_LABELS[r] || r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3"><Badge variant={m.is_active ? 'success' : 'default'}>{m.is_active ? 'Actif' : 'Inactif'}</Badge></td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setEditMember(m)}>Modifier</Button>
                        <Button size="sm" onClick={() => navigate(`/membres/${m.id}`)}>Gérer le dossier</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AddMemberModal isOpen={addOpen} onClose={() => setAddOpen(false)} onCreated={refetch} />
      {editMember && (
        <EditMemberModal
          isOpen={!!editMember}
          onClose={() => setEditMember(null)}
          member={editMember}
          onSaved={() => { refetch(); setEditMember(null) }}
          onDeleted={() => { refetch(); setEditMember(null) }}
        />
      )}
    </>
  )
}

// Vue membre : annuaire en lecture seule
function MemberMembresView() {
  const [roleFilter, setRoleFilter] = useState('tous')
  const { members, loading } = useMembers(roleFilter !== 'tous' ? { role: roleFilter } : {})
  const roles = ['tous', 'naturopathe', 'closer', 'setter', 'service_client', 'resp_vente']

  return (
    <>
      <div className="flex gap-2 mb-6">
        {roles.map(r => (
          <button key={r} onClick={() => setRoleFilter(r)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${roleFilter === r ? 'bg-[#00bbb1] text-white' : 'bg-white text-[#6b7280] border border-[#e5e7eb] hover:bg-gray-50'}`}>
            {r === 'tous' ? 'Tous' : ROLE_LABELS[r]}
          </button>
        ))}
      </div>

      <Card className="p-6">
        {loading ? <SkeletonTable rows={5} /> : members.length === 0 ? (
          <p className="text-sm text-[#6b7280] py-4">Aucun membre trouvé.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e5e7eb]">
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Membre</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Rôle</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Statut</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} className="border-b border-[#f5f5f7]">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#00bbb1]/10 flex items-center justify-center text-[#00bbb1] font-bold text-sm">
                          {m.full_name.charAt(0).toUpperCase()}
                        </div>
                        <p className="font-semibold text-sm text-[#1a1a1a]">{m.full_name}</p>
                      </div>
                    </td>
                    <td className="py-3 px-3"><Badge variant={m.role}>{ROLE_LABELS[m.role] || m.role}</Badge></td>
                    <td className="py-3 px-3"><Badge variant={m.is_active ? 'success' : 'default'}>{m.is_active ? 'Actif' : 'Inactif'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}

// Vue resp_vente : lecture seule + accès dossier setter/closer
function RespVenteMembresView() {
  const navigate = useNavigate()
  const [roleFilter, setRoleFilter] = useState('tous')
  const { members, loading } = useMembers(roleFilter !== 'tous' ? { role: roleFilter } : {})
  const roles = ['tous', 'naturopathe', 'closer', 'setter', 'service_client', 'resp_vente']
  const SALES_ROLES = ['closer', 'setter']

  return (
    <>
      <div className="flex gap-2 mb-6">
        {roles.map(r => (
          <button key={r} onClick={() => setRoleFilter(r)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${roleFilter === r ? 'bg-[#00bbb1] text-white' : 'bg-white text-[#6b7280] border border-[#e5e7eb] hover:bg-gray-50'}`}>
            {r === 'tous' ? 'Tous' : ROLE_LABELS[r]}
          </button>
        ))}
      </div>

      <Card className="p-6">
        {loading ? <SkeletonTable rows={5} /> : members.length === 0 ? (
          <p className="text-sm text-[#6b7280] py-4">Aucun membre trouvé.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e5e7eb]">
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Membre</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Rôle</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Statut</th>
                  <th className="text-right py-3 px-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Dossier</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} className="border-b border-[#f5f5f7] hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#00bbb1]/10 flex items-center justify-center text-[#00bbb1] font-bold text-sm">
                          {m.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-[#1a1a1a]">{m.full_name}</p>
                          <p className="text-xs text-[#6b7280]">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3"><Badge variant={m.role}>{ROLE_LABELS[m.role] || m.role}</Badge></td>
                    <td className="py-3 px-3"><Badge variant={m.is_active ? 'success' : 'default'}>{m.is_active ? 'Actif' : 'Inactif'}</Badge></td>
                    <td className="py-3 px-3 text-right">
                      {(SALES_ROLES.includes(m.role) || (m.secondary_roles ?? []).some(r => SALES_ROLES.includes(r))) && (
                        <Button size="sm" onClick={() => navigate(`/membres/${m.id}`)}>Gérer le dossier</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}

export default function Membres() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const isRespVente = profile?.role === 'resp_vente'

  return (
    <Layout>
      <Header title="Membres" />
      {isAdmin ? <AdminMembresView /> : isRespVente ? <RespVenteMembresView /> : <MemberMembresView />}
    </Layout>
  )
}
