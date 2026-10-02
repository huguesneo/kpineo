import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import MonerisCardFrame from '../components/terminal/MonerisCardFrame'
import { supabase } from '../lib/supabase'
import { formatCents, todayMontreal } from '../../supabase/functions/_shared/schedule.js'

// Page publique : le client entre sa carte à partir du lien envoyé par le closeur.

async function callLink(body) {
  const { data, error } = await supabase.functions.invoke('moneris-pay-link', { body })
  if (error) {
    let msg = 'Une erreur est survenue.'
    try { const j = await error.context.json(); msg = j.error ?? j.message ?? msg } catch { /* réponse non JSON */ }
    throw new Error(msg)
  }
  return data
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function PayerLien() {
  const { token } = useParams()
  const frameRef = useRef(null)
  const [plan, setPlan] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    callLink({ action: 'get', token }).then(setPlan).catch(e => setError(e.message))
  }, [token])

  const onToken = useCallback(async (tempToken) => {
    try {
      const r = await callLink({ action: 'submit', token, temporaryToken: tempToken })
      setDone(r.message)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }, [token])
  const onFrameError = useCallback((msg) => { setError(msg); setBusy(false) }, [])

  const first = plan?.installments?.[0]
  const chargeNow = first && first.due_date <= todayMontreal()
  const multi = (plan?.installments?.length ?? 0) > 1

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-start justify-center p-4 sm:p-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-[#e5e7eb] p-6">
        <p className="text-center text-xl font-bold text-[#1a1a1a] mb-1">NEO Performance</p>
        <p className="text-center text-sm text-[#6b7280] mb-6">Paiement sécurisé</p>

        {done && (
          <div className="text-center space-y-2">
            <p className="text-lg font-semibold text-emerald-700">Merci {plan?.firstName} !</p>
            <p className="text-sm text-[#374151]">{done}</p>
            <p className="text-sm text-[#6b7280]">Tu recevras ton reçu par courriel.</p>
          </div>
        )}

        {!done && !plan && !error && <p className="text-center text-sm text-[#6b7280]">Chargement...</p>}
        {!done && !plan && error && <p className="text-center text-sm text-red-600">{error}</p>}

        {!done && plan && (
          <div className="space-y-5">
            <div>
              <p className="text-sm text-[#374151]">Bonjour {plan.firstName},</p>
              <p className="text-sm text-[#374151] mt-1">{plan.productName}</p>
              <p className="text-2xl font-bold text-[#1a1a1a] mt-2">{formatCents(plan.totalCents)}</p>
            </div>

            <div className="rounded-lg bg-[#f5f5f7] p-4">
              <p className="text-sm font-semibold mb-2">
                {multi ? `Paiement en ${plan.installments.length} versements` : 'Paiement unique'}
              </p>
              <ul className="text-sm text-[#374151] space-y-1">
                {plan.installments.map(i => (
                  <li key={i.number} className="flex justify-between">
                    <span>{i.due_date <= todayMontreal() ? 'Aujourd’hui' : formatDate(i.due_date)}</span>
                    <span className="font-semibold">{formatCents(i.amount_cents)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <MonerisCardFrame ref={frameRef} onToken={onToken} onError={onFrameError} />

            {multi && (
              <label className="flex items-start gap-2 text-xs text-[#374151]">
                <input type="checkbox" className="mt-0.5" checked={accepted} onChange={e => setAccepted(e.target.checked)} />
                <span>
                  J’autorise NEO Performance à conserver ma carte de façon sécurisée chez Moneris et à la débiter
                  selon l’échéancier ci-dessus.
                </span>
              </label>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              disabled={busy || (multi && !accepted)}
              onClick={() => { setError(''); setBusy(true); frameRef.current?.tokenize() }}
              className="w-full py-3 rounded-lg bg-[#00bbb1] hover:bg-[#009e95] text-white font-semibold disabled:opacity-50"
            >
              {busy ? 'Traitement...' : chargeNow ? `Payer ${formatCents(first.amount_cents)}` : 'Enregistrer ma carte'}
            </button>
            <p className="text-xs text-center text-[#6b7280]">
              Ta carte est traitée directement par Moneris. NEO ne voit jamais ton numéro de carte.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
