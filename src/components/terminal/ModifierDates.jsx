// Terminal : bouton « Modifier les dates » d'une vente (hugues@ et info@ seulement).
// Change les dates des versements « prévu » : nouvel échéancier Moneris sur la carte enregistrée,
// l'ancien est annulé. Les versements déjà payés ne bougent pas.
import { useMemo, useState } from 'react'
import Button from '../shared/Button'
import Modal from '../shared/Modal'
import { addDays, rescheduleInstallments, todayMontreal } from '../../../supabase/functions/_shared/schedule.js'
import { rescheduleChoice } from '../../../supabase/functions/_shared/terminalAttribution.js'

const UNITS = [
  { value: 'DAY', label: 'jour(s)' },
  { value: 'WEEK', label: 'semaine(s)' },
  { value: 'MONTH', label: 'mois' },
]
const champCls = 'px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]'

// who : { isSupervisor } ; onConfirm({ startDate, frequencyUnit, frequencyInterval }) : promesse,
// rejetée avec un message d'erreur. ouvertInitial : pour les tests
export default function ModifierDates({ plan, who, onConfirm, ouvertInitial = false }) {
  const prochain = (plan.payment_installments ?? []).filter(i => i.status === 'scheduled')
    .sort((a, b) => a.number - b.number)[0]
  const [open, setOpen] = useState(ouvertInitial)
  const [startDate, setStartDate] = useState(prochain?.due_date ?? '')
  const [unit, setUnit] = useState(plan.frequency_unit || 'WEEK')
  const [freq, setFreq] = useState(String(plan.frequency_interval || 2))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const today = todayMontreal()
  const valide = startDate > today && Number.isInteger(Number(freq)) && Number(freq) >= 1 && Number(freq) <= 99
  const nouvelles = useMemo(() => {
    if (!valide) return new Map()
    const moves = rescheduleInstallments(plan.payment_installments, { startDate, unit, interval: Number(freq) })
    return new Map(moves.map(m => [m.id, m.due_date]))
  }, [plan.payment_installments, startDate, unit, freq, valide])

  const choice = rescheduleChoice(plan, who)
  if (!choice.visible || !choice.enabled) return null

  const close = () => { if (busy) return; setOpen(false); setError('') }

  async function confirm() {
    setBusy(true); setError('')
    try {
      await onConfirm({ startDate, frequencyUnit: unit, frequencyInterval: Number(freq) })
      setBusy(false); setOpen(false)
    } catch (e) {
      setError(e.message); setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Modifier les dates</Button>
      <Modal isOpen={open} onClose={close} title="Modifier les dates">
        <div className="space-y-4">
          <p className="text-sm text-[#374151]">
            {plan.client_first_name} {plan.client_last_name} · les paiements déjà passés ne bougent pas.
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-[#1a1a1a]" htmlFor="md-date">Prochain prélèvement</label>
            <input id="md-date" type="date" min={addDays(today, 1)} value={startDate}
              onChange={e => setStartDate(e.target.value)} className={champCls} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-[#1a1a1a]">Puis aux</span>
            <div className="flex gap-2">
              <input type="number" min="1" max="99" step="1" value={freq} aria-label="Fréquence"
                onChange={e => setFreq(e.target.value)} className={`${champCls} w-20`} />
              <select value={unit} onChange={e => setUnit(e.target.value)} aria-label="Unité" className={champCls}>
                {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
          </div>

          <ul className="text-sm divide-y divide-[#e5e7eb]">
            {[...(plan.payment_installments ?? [])].sort((a, b) => a.number - b.number).map(i => {
              const nouvelle = nouvelles.get(i.id)
              const change = nouvelle && nouvelle !== i.due_date
              return (
                <li key={i.id} className="py-1.5 flex justify-between gap-3">
                  <span>{i.number}.</span>
                  <span className={i.status === 'scheduled' ? '' : 'text-[#9ca3af]'}>
                    {change ? <><s className="text-[#9ca3af]">{i.due_date}</s> <b>{nouvelle}</b></> : i.due_date}
                  </span>
                  <span className="text-xs text-[#6b7280]">{i.status === 'paid' ? 'Payé, inchangé' : i.status === 'scheduled' ? 'Prévu' : i.status}</span>
                </li>
              )
            })}
          </ul>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" disabled={busy} onClick={close}>Retour</Button>
            <Button loading={busy} disabled={!valide} onClick={confirm}>Confirmer</Button>
          </div>
          <p className="text-xs text-[#6b7280]">
            Un nouvel échéancier est créé chez Moneris avec la carte déjà enregistrée, puis l’ancien est annulé. Aucun débit aujourd’hui.
          </p>
        </div>
      </Modal>
    </>
  )
}
