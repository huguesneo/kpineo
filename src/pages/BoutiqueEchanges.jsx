import { useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import Layout from '../components/layout/Layout'
import Card from '../components/shared/Card'
import { useRedemptions, updateRedemptionStatus, cancelAndRefundRedemption } from '../hooks/useRewards'

const STATUS_CONFIG = {
  pending:   { label: 'En attente',  color: 'bg-amber-50 text-amber-600',     actions: ['available', 'cancelled'] },
  available: { label: 'Disponible',  color: 'bg-emerald-50 text-emerald-600', actions: ['used', 'cancelled'] },
  used:      { label: 'Utilisé',     color: 'bg-gray-100 text-[#6b7280]',     actions: [] },
  cancelled: { label: 'Annulé',      color: 'bg-red-50 text-red-500',         actions: [] },
  expired:   { label: 'Expiré',      color: 'bg-gray-100 text-[#9ca3af]',     actions: [] },
}

const TABS = [
  { key: 'pending',   label: 'À traiter' },
  { key: 'available', label: 'Disponibles' },
  { key: 'all',       label: 'Tout' },
]

function fmt(d) {
  if (!d) return '—'
  try { return format(new Date(d), 'd MMM yyyy à HH:mm', { locale: fr }) } catch { return '—' }
}

function RedemptionRow({ redemption, onAction, loading }) {
  const [notes, setNotes]     = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const s   = STATUS_CONFIG[redemption.status] ?? STATUS_CONFIG.pending
  const can = s.actions

  const member  = redemption.profile?.full_name ?? '—'
  const reward  = redemption.reward?.title ?? '—'
  const initial = member.charAt(0).toUpperCase()

  return (
    <div className="bg-white rounded-2xl border border-[#e5e7eb] p-4">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-[#00bbb1]/10 flex items-center justify-center text-[#00bbb1] text-sm font-bold flex-shrink-0">
          {initial}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="text-sm font-bold text-[#1a1a1a]">{member}</p>
              <p className="text-xs text-[#6b7280]">{reward}</p>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${s.color}`}>
              {s.label}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[#9ca3af] flex-wrap">
            <span className="font-semibold text-amber-600">{redemption.points_spent} pts</span>
            <span>·</span>
            <span>Demandé {fmt(redemption.redeemed_at)}</span>
            {redemption.validated_at && <><span>·</span><span>Validé {fmt(redemption.validated_at)}</span></>}
            {redemption.used_at      && <><span>·</span><span>Utilisé {fmt(redemption.used_at)}</span></>}
          </div>

          {redemption.admin_notes && (
            <div className="mt-2 bg-gray-50 rounded-lg px-3 py-2 text-xs text-[#6b7280]">
              <span className="font-semibold text-[#1a1a1a]">Note : </span>{redemption.admin_notes}
            </div>
          )}

          {/* Actions */}
          {can.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex gap-2 flex-wrap">
                {can.includes('available') && (
                  <button
                    onClick={() => onAction(redemption, 'available', notes)}
                    disabled={loading}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-60"
                  >
                    ✓ Valider
                  </button>
                )}
                {can.includes('used') && (
                  <button
                    onClick={() => onAction(redemption, 'used', notes)}
                    disabled={loading}
                    className="px-3.5 py-1.5 rounded-lg bg-[#00bbb1] text-white text-xs font-bold hover:bg-[#009e95] active:scale-95 transition-all disabled:opacity-60"
                  >
                    ✓ Marquer livré
                  </button>
                )}
                {can.includes('cancelled') && (
                  <button
                    onClick={() => onAction(redemption, 'cancelled', notes)}
                    disabled={loading}
                    className="px-3.5 py-1.5 rounded-lg bg-red-50 text-red-500 text-xs font-bold hover:bg-red-100 active:scale-95 transition-all disabled:opacity-60"
                  >
                    ✕ Refuser & rembourser
                  </button>
                )}
                <button
                  onClick={() => setShowNotes(s => !s)}
                  className="px-3 py-1.5 rounded-lg border border-[#e5e7eb] text-[#6b7280] text-xs font-semibold hover:bg-gray-50 transition-colors"
                >
                  {showNotes ? 'Masquer note' : '+ Note'}
                </button>
              </div>
              {showNotes && (
                <input
                  type="text"
                  placeholder="Note pour le membre (optionnel)…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function BoutiqueEchanges() {
  const { redemptions, loading, refetch } = useRedemptions()
  const [activeTab, setActiveTab] = useState('pending')
  const [actionLoading, setActionLoading] = useState(null)

  async function handleAction(redemption, newStatus, adminNotes) {
    setActionLoading(redemption.id)
    if (newStatus === 'cancelled') {
      await cancelAndRefundRedemption(redemption)
    } else {
      await updateRedemptionStatus(redemption.id, newStatus, adminNotes || null)
    }
    setActionLoading(null)
    refetch()
  }

  const pending   = redemptions.filter(r => r.status === 'pending')
  const available = redemptions.filter(r => r.status === 'available')
  const all       = redemptions

  const countMap = { pending: pending.length, available: available.length, all: all.length }

  const displayed = activeTab === 'pending'   ? pending
    : activeTab === 'available' ? available
    : all

  const stats = [
    { label: 'En attente',   value: pending.length,                                       color: '#f59e0b' },
    { label: 'Disponibles',  value: available.length,                                     color: '#10b981' },
    { label: 'Total pts dépensés', value: all.reduce((s, r) => s + (r.points_spent ?? 0), 0), color: '#00bbb1' },
  ]

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Échanges équipe</h1>
          <p className="text-sm text-[#9ca3af] mt-0.5">Gérez les demandes de récompenses</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {stats.map(s => (
          <Card key={s.label} className="p-4 text-center">
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs font-semibold text-[#9ca3af] mt-0.5">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#e5e7eb] mb-6">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-[#00bbb1] text-[#00bbb1]'
                : 'border-transparent text-[#6b7280] hover:text-[#1a1a1a]'
            }`}
          >
            {tab.label}
            {countMap[tab.key] > 0 && (
              <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${
                activeTab === tab.key ? 'bg-[#00bbb1]/15 text-[#00bbb1]' : 'bg-gray-100 text-[#9ca3af]'
              }`}>
                {countMap[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#e5e7eb] p-4 h-24 animate-pulse" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-3xl mb-3">✅</p>
          <p className="text-sm font-semibold text-[#6b7280]">
            {activeTab === 'pending' ? 'Aucune demande en attente.' : 'Aucun échange ici.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayed.map(r => (
            <RedemptionRow
              key={r.id}
              redemption={r}
              onAction={handleAction}
              loading={actionLoading === r.id}
            />
          ))}
        </div>
      )}
    </Layout>
  )
}
