import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import Layout from '../components/layout/Layout'
import { useAuth } from '../context/AuthContext'
import { useRedemptions, updateRedemptionStatus } from '../hooks/useRewards'

const STATUS_CONFIG = {
  pending:   { label: 'En attente',     color: 'bg-amber-50 text-amber-600',   dot: 'bg-amber-400' },
  available: { label: 'Disponible',     color: 'bg-emerald-50 text-emerald-600', dot: 'bg-emerald-400' },
  used:      { label: 'Utilisé',        color: 'bg-gray-100 text-[#6b7280]',   dot: 'bg-gray-300' },
  cancelled: { label: 'Annulé',         color: 'bg-red-50 text-red-500',       dot: 'bg-red-300' },
  expired:   { label: 'Expiré',         color: 'bg-gray-100 text-[#9ca3af]',   dot: 'bg-gray-200' },
}

const TABS = [
  { key: 'available', label: 'À utiliser' },
  { key: 'pending',   label: 'En attente' },
  { key: 'history',   label: 'Historique' },
]

function fmt(d) {
  try { return format(new Date(d), 'd MMM yyyy', { locale: fr }) } catch { return '—' }
}

function RedemptionCard({ redemption, onUse }) {
  const s = STATUS_CONFIG[redemption.status] ?? STATUS_CONFIG.pending
  const reward = redemption.reward

  return (
    <div className="bg-white rounded-2xl border border-[#e5e7eb] p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#1a1a1a] leading-snug">{reward?.title ?? '—'}</p>
          {reward?.description && (
            <p className="text-xs text-[#6b7280] mt-0.5 line-clamp-2">{reward.description}</p>
          )}
        </div>
        <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${s.color}`}>
          {s.label}
        </span>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 text-[11px] text-[#9ca3af] flex-wrap">
        <span className="font-semibold text-amber-600">{redemption.points_spent} pts déduits</span>
        <span>·</span>
        <span>Demandé le {fmt(redemption.redeemed_at)}</span>
        {redemption.validated_at && (
          <>
            <span>·</span>
            <span>Validé le {fmt(redemption.validated_at)}</span>
          </>
        )}
        {redemption.used_at && (
          <>
            <span>·</span>
            <span>Utilisé le {fmt(redemption.used_at)}</span>
          </>
        )}
      </div>

      {/* Admin notes */}
      {redemption.admin_notes && (
        <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-[#6b7280]">
          <span className="font-semibold text-[#1a1a1a]">Note admin : </span>
          {redemption.admin_notes}
        </div>
      )}

      {/* Action */}
      {redemption.status === 'available' && (
        <button
          onClick={() => onUse(redemption.id)}
          className="w-full mt-1 px-4 py-2.5 bg-[#00bbb1] text-white rounded-xl text-xs font-bold hover:bg-[#009e95] active:scale-[0.98] transition-all"
        >
          ✓ Marquer comme utilisé
        </button>
      )}
    </div>
  )
}

export default function MesEchanges() {
  const { profile } = useAuth()
  const { redemptions, loading, refetch } = useRedemptions(profile?.id)
  const [activeTab, setActiveTab] = useState('available')
  const [marking, setMarking] = useState(null)

  async function handleMarkUsed(id) {
    setMarking(id)
    await updateRedemptionStatus(id, 'used')
    setMarking(null)
    refetch()
  }

  const available  = redemptions.filter(r => r.status === 'available')
  const pending    = redemptions.filter(r => r.status === 'pending')
  const history    = redemptions.filter(r => ['used', 'cancelled', 'expired'].includes(r.status))

  const countMap = { available: available.length, pending: pending.length, history: history.length }

  const displayed = activeTab === 'available' ? available
    : activeTab === 'pending'   ? pending
    : history

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/boutique"
          className="p-2 rounded-lg hover:bg-gray-100 text-[#6b7280] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Mes échanges</h1>
          <p className="text-sm text-[#9ca3af] mt-0.5">Historique de vos récompenses</p>
        </div>
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
            <div key={i} className="bg-white rounded-2xl border border-[#e5e7eb] p-4 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/2 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-full mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-3xl mb-3">
            {activeTab === 'available' ? '🎉' : activeTab === 'pending' ? '⏳' : '📜'}
          </p>
          <p className="text-sm font-semibold text-[#6b7280]">
            {activeTab === 'available' ? 'Aucune récompense disponible pour le moment.'
              : activeTab === 'pending' ? 'Aucune demande en attente.'
              : 'Votre historique est vide.'}
          </p>
          {activeTab !== 'history' && (
            <Link to="/boutique" className="inline-block mt-4 text-sm font-semibold text-[#00bbb1] hover:underline">
              Visiter la boutique →
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {displayed.map(r => (
            <RedemptionCard
              key={r.id}
              redemption={r}
              onUse={handleMarkUsed}
            />
          ))}
        </div>
      )}
    </Layout>
  )
}
