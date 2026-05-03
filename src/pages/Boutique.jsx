import { useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import { useAuth } from '../context/AuthContext'
import { useUserPoints } from '../hooks/usePoints'
import { useRewardsCatalog, createRedemption } from '../hooks/useRewards'

const CATEGORY_LABELS = {
  temps_off:  { label: 'Temps off',   icon: '🏖️' },
  cadeau:     { label: 'Cadeaux',     icon: '🎁' },
  experience: { label: 'Expériences', icon: '✨' },
  monetaire:  { label: 'Monétaire',   icon: '💰' },
}

function PointsHeader({ points }) {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-gradient-to-br from-white to-[#f0fdfc] p-4 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-1">Mon solde</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-black text-[#1a1a1a]">{points?.points_total ?? 0}</p>
            <p className="text-sm font-semibold text-[#6b7280]">pts</p>
          </div>
          <p className="text-xs text-[#00bbb1] font-semibold mt-0.5">
            +{points?.points_current_month ?? 0} ce mois
          </p>
        </div>
        <Link
          to="/boutique/mes-echanges"
          className="flex items-center gap-1.5 text-xs font-semibold text-[#00bbb1] hover:text-[#009e95] transition-colors bg-[#00bbb1]/8 px-3 py-2 rounded-xl"
        >
          Mes échanges
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  )
}

function RewardCard({ reward, userPoints, onRedeem }) {
  const balance = userPoints?.points_total ?? 0
  const canAfford = balance >= reward.cost_points
  const outOfStock = reward.stock_remaining !== null && reward.stock_remaining <= 0

  const cat = CATEGORY_LABELS[reward.category] ?? { label: reward.category, icon: '🎯' }

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden flex flex-col transition-all duration-200 ${
      outOfStock ? 'border-[#e5e7eb] opacity-60' : 'border-[#e5e7eb] hover:border-[#00bbb1]/40 hover:shadow-sm'
    }`}>
      {/* Category badge + stock */}
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#6b7280] bg-gray-100 rounded-full px-2 py-0.5">
          <span>{cat.icon}</span>
          {cat.label}
        </span>
        {reward.stock_remaining !== null && (
          <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
            reward.stock_remaining <= 2
              ? 'bg-red-50 text-red-500'
              : 'bg-gray-50 text-[#9ca3af]'
          }`}>
            {outOfStock ? 'Épuisé' : `${reward.stock_remaining} restant${reward.stock_remaining > 1 ? 's' : ''}`}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="px-4 pb-4 flex-1 flex flex-col">
        <p className="text-sm font-bold text-[#1a1a1a] leading-snug mb-1">{reward.title}</p>
        {reward.description && (
          <p className="text-xs text-[#6b7280] leading-relaxed flex-1 mb-3">{reward.description}</p>
        )}
        {reward.expiration_days && (
          <p className="text-[10px] text-[#9ca3af] mb-2">Valable {reward.expiration_days} jours après validation</p>
        )}

        {/* Points + button */}
        <div className="flex items-center justify-between gap-2 mt-auto">
          <span className="text-lg font-black text-amber-600">{reward.cost_points} pts</span>
          <button
            onClick={() => !outOfStock && onRedeem(reward)}
            disabled={!canAfford || outOfStock}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              outOfStock
                ? 'bg-gray-100 text-[#9ca3af] cursor-not-allowed'
                : canAfford
                ? 'bg-[#00bbb1] text-white hover:bg-[#009e95] active:scale-95'
                : 'bg-gray-100 text-[#9ca3af] cursor-not-allowed'
            }`}
          >
            {outOfStock ? 'Épuisé' : !canAfford ? `Il vous manque ${reward.cost_points - balance} pts` : 'Échanger'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ reward, onConfirm, onCancel, loading }) {
  if (!reward) return null
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-6">
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-[#00bbb1]/10 flex items-center justify-center text-2xl mx-auto mb-3">
            {CATEGORY_LABELS[reward.category]?.icon ?? '🎁'}
          </div>
          <p className="text-base font-bold text-[#1a1a1a]">{reward.title}</p>
          <p className="text-sm text-[#6b7280] mt-1">
            Cette action déduira <span className="font-bold text-amber-600">{reward.cost_points} points</span> de votre solde.
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-5 text-xs text-amber-700 font-medium">
          La récompense sera validée par l'admin avant d'être disponible.
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-[#e5e7eb] text-sm font-semibold text-[#6b7280] hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#00bbb1] text-white text-sm font-bold hover:bg-[#009e95] active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {loading ? 'En cours…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Boutique() {
  const { profile } = useAuth()
  const { points } = useUserPoints(profile?.id)
  const { rewards, loading } = useRewardsCatalog()

  const [categoryFilter, setCategoryFilter] = useState('all')
  const [confirmReward, setConfirmReward]   = useState(null)
  const [redeeming, setRedeeming]           = useState(false)
  const [toastMsg, setToastMsg]             = useState(null)

  const categories = ['all', ...Object.keys(CATEGORY_LABELS).filter(
    c => rewards.some(r => r.category === c)
  )]

  const filtered = categoryFilter === 'all'
    ? rewards
    : rewards.filter(r => r.category === categoryFilter)

  function showToast(msg, type = 'success') {
    setToastMsg({ msg, type })
    setTimeout(() => setToastMsg(null), 3500)
  }

  async function handleConfirm() {
    if (!confirmReward || !profile?.id) return
    setRedeeming(true)
    const { error } = await createRedemption(profile.id, confirmReward.id, confirmReward.cost_points)
    setRedeeming(false)
    setConfirmReward(null)
    if (error) {
      showToast('Erreur lors de l\'échange. Réessayez.', 'error')
    } else {
      showToast(`Demande envoyée ! L'admin validera votre récompense sous peu.`, 'success')
    }
  }

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Boutique</h1>
          <p className="text-sm text-[#9ca3af] mt-0.5">Échangez vos points contre des récompenses</p>
        </div>
      </div>

      {/* Points header */}
      <PointsHeader points={points} />

      {/* Category tabs */}
      {!loading && categories.length > 1 && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                categoryFilter === c
                  ? 'bg-[#00bbb1] text-white shadow-sm'
                  : 'bg-white border border-[#e5e7eb] text-[#6b7280] hover:border-[#00bbb1]/40'
              }`}
            >
              {c !== 'all' && <span>{CATEGORY_LABELS[c]?.icon}</span>}
              {c === 'all' ? 'Tout' : CATEGORY_LABELS[c]?.label}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#e5e7eb] p-4 animate-pulse">
              <div className="h-3 bg-gray-100 rounded w-1/3 mb-3" />
              <div className="h-5 bg-gray-100 rounded w-2/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-full mb-1" />
              <div className="h-3 bg-gray-100 rounded w-3/4 mb-5" />
              <div className="h-8 bg-gray-100 rounded w-full" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-3xl mb-3">🛍️</p>
          <p className="text-sm font-semibold text-[#6b7280]">Aucune récompense disponible pour le moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(reward => (
            <RewardCard
              key={reward.id}
              reward={reward}
              userPoints={points}
              onRedeem={setConfirmReward}
            />
          ))}
        </div>
      )}

      {/* Confirm modal */}
      <ConfirmModal
        reward={confirmReward}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmReward(null)}
        loading={redeeming}
      />

      {/* Toast */}
      {toastMsg && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold transition-all ${
          toastMsg.type === 'success' ? 'bg-[#00bbb1] text-white' : 'bg-red-500 text-white'
        }`}>
          {toastMsg.msg}
        </div>
      )}
    </Layout>
  )
}
