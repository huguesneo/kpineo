import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { COMMISSION_RATE, fmtCommissionPct } from '../../lib/ghlHelpers'

const HUGUES_EMAIL = 'hugues@neoperformance.ca'

// Éditeur du taux de commission individuel d'un closer.
// Visible uniquement par Hugues (la base refuse l'écriture aux autres via le
// trigger trg_closer_commission_rate_guard — le masquage ici n'est que du confort).
// tone = 'hero' (sur fond turquoise) | 'card' (sur fond blanc)
export default function CommissionRateEditor({ member, onSaved, tone = 'hero' }) {
  const { user } = useAuth()
  const [open,   setOpen]   = useState(false)
  const [value,  setValue]  = useState(
    member?.closer_commission_rate != null ? String(member.closer_commission_rate * 100) : ''
  )
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  if (user?.email !== HUGUES_EMAIL || !member?.id) return null

  const dark = tone === 'hero'

  async function handleSave() {
    const raw = value.trim().replace('%', '').replace(',', '.').trim()
    let rate = null
    if (raw !== '') {
      const pct = Number(raw)
      if (isNaN(pct) || pct < 0 || pct > 100) {
        setError('Pourcentage entre 0 et 100 (ex : 8,6)')
        return
      }
      rate = Number((pct / 100).toFixed(5))
    }

    setError(null)
    setSaving(true)
    const { error: err } = await supabase
      .from('profiles')
      .update({ closer_commission_rate: rate })
      .eq('id', member.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    setOpen(false)
    onSaved?.()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Modifier le taux de commission de ce closer"
        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border transition-colors ${
          dark
            ? 'bg-white/20 border-white/30 text-white hover:bg-white/30'
            : 'bg-[#00bbb1]/10 border-[#00bbb1]/30 text-[#00bbb1] hover:bg-[#00bbb1]/20'
        }`}
      >
        ✎ Modifier le %
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          placeholder={String(COMMISSION_RATE * 100)}
          value={value}
          onChange={e => { setValue(e.target.value); setError(null) }}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setOpen(false) }}
          className={`w-20 px-2 py-1 text-xs font-mono rounded-lg border focus:outline-none ${
            dark
              ? 'bg-white/20 border-white/40 text-white placeholder-white/50'
              : 'bg-white border-[#e5e7eb] text-[#1a1a1a] focus:border-[#00bbb1]'
          }`}
        />
        <span className={`text-xs font-semibold ${dark ? 'text-white/80' : 'text-[#6b7280]'}`}>%</span>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`text-[11px] font-bold px-2.5 py-1 rounded-lg disabled:opacity-50 transition-colors ${
            dark ? 'bg-white text-[#00bbb1] hover:bg-white/90' : 'bg-[#00bbb1] text-white hover:bg-[#009e95]'
          }`}
        >
          {saving ? '…' : 'Enregistrer'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className={`text-[11px] font-semibold px-2 py-1 rounded-lg ${dark ? 'text-white/70 hover:text-white' : 'text-[#9ca3af] hover:text-[#6b7280]'}`}
        >
          Annuler
        </button>
      </div>
      <p className={`text-[11px] ${dark ? 'text-white/70' : 'text-[#9ca3af]'}`}>
        Vide = taux global ({fmtCommissionPct(COMMISSION_RATE)}). Rétroactif sur toutes les périodes.
      </p>
      {error && <p className={`text-[11px] font-semibold ${dark ? 'text-white' : 'text-[#ef4444]'}`}>{error}</p>}
    </div>
  )
}
