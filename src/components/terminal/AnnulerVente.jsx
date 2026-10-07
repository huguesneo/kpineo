// Terminal : bouton « Annuler » d'une vente, avec trois choix et une confirmation pour chacun.
//   Annuler le paiement   prochains prélèvements annulés chez Moneris, le client reste dans son programme
//   Annuler le programme  prélèvements arrêtés + programme annulé (tag GHL)
//   Retirer               erreur ou carte refusée, 0 $ encaissé : la vente disparaît de la liste (trace gardée)
import { useState } from 'react'
import Button from '../shared/Button'
import Modal from '../shared/Modal'
import { cancelChoices, confirmText } from '../../../supabase/functions/_shared/terminalAttribution.js'

// who : { isSupervisor, profileId } ; onConfirm(cle, raison) : promesse, rejetée avec un message d'erreur
// ouvertInitial / choixInitial : pour les tests
export default function AnnulerVente({ plan, who, onConfirm, ouvertInitial = false, choixInitial = null }) {
  const [open, setOpen] = useState(ouvertInitial)
  const [choice, setChoice] = useState(choixInitial)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const choices = cancelChoices(plan, who).filter(c => c.visible)
  if (!choices.length) return null

  const close = () => { if (busy) return; setOpen(false); setChoice(null); setReason(''); setError('') }
  const needsReason = choice === 'remove_plan'

  async function confirm() {
    setBusy(true); setError('')
    try {
      await onConfirm(choice, reason.trim())
      setBusy(false); setOpen(false); setChoice(null); setReason('')
    } catch (e) {
      setError(e.message); setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>Annuler</Button>
      <Modal isOpen={open} onClose={close} title={choice ? choices.find(c => c.key === choice)?.label : 'Annuler'}>
        {!choice && (
          <div className="space-y-2">
            {choices.map(c => (
              <div key={c.key}>
                <Button className="w-full" variant="secondary" disabled={!c.enabled} onClick={() => setChoice(c.key)}>{c.label}</Button>
                {!c.enabled && c.reason && <p className="text-xs text-[#6b7280] mt-1">{c.reason}</p>}
              </div>
            ))}
          </div>
        )}
        {choice && (
          <div className="space-y-4" role="alertdialog">
            <p className="text-sm text-[#374151]">{confirmText(choice, plan)}</p>
            {needsReason && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold text-[#1a1a1a]">Raison</label>
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex. carte refusée, saisie en double"
                  className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" disabled={busy} onClick={() => { setChoice(null); setError('') }}>Retour</Button>
              <Button variant="danger" loading={busy} disabled={needsReason && !reason.trim()} onClick={confirm}>Confirmer</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
