import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import Header from '../components/layout/Header'
import Card from '../components/shared/Card'
import Modal from '../components/shared/Modal'
import MonthNavigator from '../components/shared/MonthNavigator'
import { SkeletonCard } from '../components/shared/Skeleton'
import { supabase } from '../lib/supabase'
import { useUnassignedSales, useCloserMonthStats } from '../hooks/useCloserData'

// ─── Closer card ──────────────────────────────────────────────
function CloserCard({ member, startDate, endDate }) {
  const navigate = useNavigate()
  const { stats, loading } = useCloserMonthStats(member.full_name, startDate, endDate, member.ghl_user_id || null)

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-[#3b82f6]/10 flex items-center justify-center text-[#3b82f6] font-bold text-sm flex-shrink-0">
            {member.full_name.charAt(0).toUpperCase()}
          </div>
          <p className="font-semibold text-sm text-[#1a1a1a]">{member.full_name}</p>
        </div>
        <button
          onClick={() => navigate(`/membres/${member.id}`)}
          className="text-xs font-semibold text-[#00bbb1] hover:text-[#009e95] transition-colors flex-shrink-0"
        >
          Voir →
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-2 animate-pulse">
          {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-lg" />)}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'RDV',        value: stats.rdvCount,                                          color: '#6b7280' },
            { label: 'Show',       value: stats.hotCount,                                          color: '#10b981' },
            { label: 'Ventes',     value: stats.salesCount,                                        color: '#00bbb1' },
            { label: 'Taux close', value: stats.closeRate !== null ? `${stats.closeRate} %` : '—', color: '#6366f1' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
              <p className="text-[10px] text-[#9ca3af] font-semibold uppercase tracking-wide">{label}</p>
              <p className="text-base font-bold mt-0.5" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[#9ca3af]">Aucune donnée GHL disponible.</p>
      )}
    </Card>
  )
}

// ─── Setter card (placeholder) ────────────────────────────────
function SetterCard({ member }) {
  const navigate = useNavigate()
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-[#f59e0b]/10 flex items-center justify-center text-[#f59e0b] font-bold text-sm flex-shrink-0">
            {member.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-sm text-[#1a1a1a]">{member.full_name}</p>
            <p className="text-xs text-[#9ca3af] mt-0.5">Stats à venir</p>
          </div>
        </div>
        <button
          onClick={() => navigate(`/membres/${member.id}`)}
          className="text-xs font-semibold text-[#00bbb1] hover:text-[#009e95] transition-colors flex-shrink-0"
        >
          Voir →
        </button>
      </div>
    </Card>
  )
}

// ─── Modal assignation closer ─────────────────────────────────
function AssignCloserModal({ sale, closers, onClose, onSaved }) {
  const [closerName, setCloserName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  async function handleSave() {
    if (!closerName.trim()) { setError('Veuillez choisir un closer.'); return }
    setSaving(true)
    setError(null)

    const { error: fnErr } = await supabase.functions.invoke('ghl-update-opportunity', {
      body: { ghlOpportunityId: sale.ghlId, closerName: closerName.trim() },
    })

    setSaving(false)
    if (fnErr) { setError(fnErr.message); return }
    onSaved()
  }

  return (
    <div className="space-y-5">
      {/* Contact */}
      <div>
        <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-1">Contact</p>
        <p className="text-base font-bold text-[#1a1a1a]">{sale?.contactName}</p>
        {sale?.closeDate && (
          <p className="text-xs text-[#9ca3af] mt-0.5">
            Closé le {sale.closeDate.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        )}
      </div>

      {/* Nom du closer */}
      <div>
        <label className="block text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-1.5">
          Closer
        </label>
        <select
          value={closerName}
          onChange={e => setCloserName(e.target.value)}
          autoFocus
          className="w-full px-3 py-2.5 rounded-lg border border-[#e5e7eb] text-sm text-[#1a1a1a] focus:outline-none focus:border-[#00bbb1] bg-white"
        >
          <option value="">— Choisir un closer —</option>
          {(closers ?? []).map(c => (
            <option key={c.id} value={c.full_name}>{c.full_name}</option>
          ))}
        </select>
        <p className="text-[11px] text-[#9ca3af] mt-1">
          Sera écrit dans les champs <span className="font-mono">opportunity.closer</span> et <span className="font-mono">contact.closer_neo</span> dans GHL.
          Choisir dans la liste garantit un nom cohérent (évite les variantes d'orthographe).
        </p>
      </div>

      {error && (
        <p className="text-sm text-[#ef4444] bg-[#ef4444]/5 px-3 py-2 rounded-lg">{error}</p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          onClick={onClose}
          disabled={saving}
          className="flex-1 px-4 py-2.5 rounded-lg border border-[#e5e7eb] text-sm font-semibold text-[#6b7280] hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !closerName.trim()}
          className="flex-1 px-4 py-2.5 rounded-lg bg-[#00bbb1] text-white text-sm font-semibold hover:bg-[#009e95] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Enregistrement…
            </>
          ) : 'Enregistrer dans GHL'}
        </button>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────
export default function EquipeVente() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay   = new Date(year, month, 0).getDate()
  const endDate   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { sales: unassignedSales, refetch: refetchUnassigned } = useUnassignedSales(startDate, endDate)

  const [members, setMembers]               = useState([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [selectedSale, setSelectedSale]     = useState(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, role, secondary_roles, ghl_user_id')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) => { setMembers(data ?? []); setMembersLoading(false) })
  }, [])

  const closers = members.filter(m => m.role === 'closer' || (m.secondary_roles ?? []).includes('closer'))
  const setters = members.filter(m => m.role === 'setter' || (m.secondary_roles ?? []).includes('setter'))

  function handleSaved() {
    setSelectedSale(null)
    refetchUnassigned()
  }

  return (
    <Layout>
      <Header title="Équipe de vente" />

      {/* Sélecteur de mois */}
      <div className="flex items-center justify-between mb-6">
        <MonthNavigator month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y) }} />
      </div>

      {/* Alerte : ventes sans closer assigné */}
      {unassignedSales.length > 0 && (
        <div className="mb-6 px-4 py-3 rounded-xl border border-[#f59e0b]/40 bg-[#fffbeb] flex gap-3">
          <svg className="w-5 h-5 text-[#f59e0b] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#b45309] mb-2">
              {unassignedSales.length} vente{unassignedSales.length !== 1 ? 's' : ''} sans closer assigné dans GHL — cliquer pour corriger
            </p>
            <ul className="space-y-1">
              {unassignedSales.map((s, i) => (
                <li key={i}>
                  <button
                    onClick={() => setSelectedSale(s)}
                    className="flex items-center gap-2 text-left group"
                  >
                    <span className="text-xs font-semibold text-[#b45309] underline underline-offset-2 group-hover:text-[#92400e] transition-colors">
                      {s.contactName}
                    </span>
                    {s.closeDate && (
                      <span className="text-[11px] text-[#d97706]">
                        closé le {s.closeDate.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    <span className="text-[10px] font-bold text-[#f59e0b] bg-[#f59e0b]/15 px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      Assigner →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Section Closers ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide">Closers</h2>
          {!membersLoading && (
            <span className="text-xs font-bold text-[#3b82f6] bg-[#3b82f6]/10 px-2 py-0.5 rounded-full">
              {closers.length}
            </span>
          )}
        </div>

        {membersLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        ) : closers.length === 0 ? (
          <p className="text-sm text-[#9ca3af]">Aucun closer actif.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {closers.map(m => (
              <CloserCard key={m.id} member={m} startDate={startDate} endDate={endDate} />
            ))}
          </div>
        )}
      </div>

      {/* ── Section Setters ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wide">Setters</h2>
          {!membersLoading && (
            <span className="text-xs font-bold text-[#f59e0b] bg-[#f59e0b]/10 px-2 py-0.5 rounded-full">
              {setters.length}
            </span>
          )}
        </div>

        {membersLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <SkeletonCard /><SkeletonCard />
          </div>
        ) : setters.length === 0 ? (
          <p className="text-sm text-[#9ca3af]">Aucun setter actif.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {setters.map(m => <SetterCard key={m.id} member={m} />)}
          </div>
        )}
      </div>

      {/* ── Modal assignation closer ── */}
      <Modal
        isOpen={!!selectedSale}
        onClose={() => setSelectedSale(null)}
        title="Assigner un closer"
        size="sm"
      >
        {selectedSale && (
          <AssignCloserModal
            sale={selectedSale}
            closers={closers}
            onClose={() => setSelectedSale(null)}
            onSaved={handleSaved}
          />
        )}
      </Modal>
    </Layout>
  )
}
