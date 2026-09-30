import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Layout from '../components/layout/Layout'
import Card from '../components/shared/Card'
import Button from '../components/shared/Button'
import Input from '../components/shared/Input'
import Badge from '../components/shared/Badge'
import Modal from '../components/shared/Modal'
import MonerisCardFrame from '../components/terminal/MonerisCardFrame'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  TERMINAL_PRODUCTS, buildSchedule, installmentsForProduct, todayMontreal, formatCents, addDays,
} from '../../supabase/functions/_shared/schedule.js'

const FREQUENCIES = [
  { days: 7, label: 'Chaque semaine' },
  { days: 14, label: 'Aux 2 semaines' },
  { days: 21, label: 'Aux 3 semaines' },
  { days: 28, label: 'Aux 4 semaines' },
  { days: 30, label: 'Aux 30 jours' },
]

const PLAN_STATUS = {
  pending_card: { label: 'En attente de la carte', variant: 'warning' },
  card_failed:  { label: 'Carte refusée', variant: 'danger' },
  active:       { label: 'Actif', variant: 'primary' },
  completed:    { label: 'Payé en entier', variant: 'success' },
  canceled:     { label: 'Annulé', variant: 'default' },
}
const INST_STATUS = {
  scheduled:  { label: 'Prévu', variant: 'default' },
  processing: { label: 'En cours', variant: 'warning' },
  paid:       { label: 'Payé', variant: 'success' },
  declined:   { label: 'Refusé', variant: 'danger' },
  canceled:   { label: 'Annulé', variant: 'default' },
}

const PROVINCES = ['QC', 'ON', 'NB', 'NS', 'PE', 'NL', 'MB', 'SK', 'AB', 'BC', 'YT', 'NT', 'NU']

const emptyForm = () => ({
  clientFirstName: '', clientLastName: '', clientEmail: '', clientPhone: '',
  clientStreetNumber: '', clientStreetName: '', clientUnit: '', clientCity: '', clientProvince: 'QC', clientPostalCode: '',
  productName: TERMINAL_PRODUCTS[0], totalAmount: '', frequencyDays: 21,
  payToday: true, chargeDate: '', notes: '',
})

const selectCls = 'w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#00bbb1]'

async function callTerminal(body) {
  const { data, error } = await supabase.functions.invoke('moneris-terminal', { body })
  if (error) {
    let msg = error.message
    try { const j = await error.context.json(); msg = j.error ?? j.message ?? msg } catch { /* réponse non JSON */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// ── Formulaire de nouvelle vente ─────────────────────────────

function NewPlanForm({ onCreated }) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const today = todayMontreal()
  const count = installmentsForProduct(form.productName)
  // Payer aujourd'hui : la date choisie est celle du 2e prélèvement
  // (inutile pour un paiement unique). Sinon, c'est celle du 1er.
  const needsDate = !form.payToday || count > 1
  const dateLabel = form.payToday ? '2e prélèvement' : (count > 1 ? '1er prélèvement' : 'Date du prélèvement')

  const schedule = useMemo(() => {
    try {
      if (needsDate && !form.chargeDate) return null
      return buildSchedule({
        totalCents: Math.round(Number(form.totalAmount) * 100),
        count,
        frequencyDays: count > 1 ? Number(form.frequencyDays) : 0,
        firstDate: form.payToday ? today : form.chargeDate,
        secondDate: form.payToday && count > 1 ? form.chargeDate : undefined,
      })
    } catch { return null }
  }, [form.totalAmount, form.frequencyDays, form.chargeDate, form.payToday, count, needsDate, today])

  async function submit(mode) {
    setError('')
    if (!schedule) { setError('Vérifie le montant et la date.'); return }
    setSaving(mode)
    try {
      const { planId } = await callTerminal({
        action: 'create_plan', ...form,
        totalAmount: Number(form.totalAmount), frequencyDays: Number(form.frequencyDays),
      })
      setForm(emptyForm())
      await onCreated(planId, mode)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving('')
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">Nouvelle vente</h2>
      <form onSubmit={(e) => { e.preventDefault(); submit('card') }} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Prénom du client" value={form.clientFirstName} onChange={set('clientFirstName')} required />
          <Input label="Nom du client" value={form.clientLastName} onChange={set('clientLastName')} required />
          <Input label="Courriel" type="email" value={form.clientEmail} onChange={set('clientEmail')} required />
          <Input label="Téléphone" value={form.clientPhone} onChange={set('clientPhone')} />
        </div>

        <div className="grid grid-cols-6 gap-3">
          <div className="col-span-2"><Input label="No civique" value={form.clientStreetNumber} onChange={set('clientStreetNumber')} required /></div>
          <div className="col-span-4"><Input label="Rue" value={form.clientStreetName} onChange={set('clientStreetName')} required /></div>
          <div className="col-span-2"><Input label="App. (optionnel)" value={form.clientUnit} onChange={set('clientUnit')} /></div>
          <div className="col-span-4"><Input label="Ville" value={form.clientCity} onChange={set('clientCity')} required /></div>
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-sm font-semibold text-[#1a1a1a]">Province</label>
            <select value={form.clientProvince} onChange={set('clientProvince')} className={selectCls}>
              {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="col-span-4"><Input label="Code postal" value={form.clientPostalCode} onChange={set('clientPostalCode')} placeholder="J4Z 1A7" required /></div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-[#1a1a1a]">Produit</label>
          <select value={form.productName} onChange={set('productName')} className={selectCls}>
            {TERMINAL_PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Montant total ($, taxes incluses)" type="number" min="1" step="0.01"
            value={form.totalAmount} onChange={set('totalAmount')} required />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-[#1a1a1a]">Fréquence</label>
            <select value={form.frequencyDays} onChange={set('frequencyDays')} disabled={count === 1} className={selectCls}>
              {FREQUENCIES.map(f => <option key={f.days} value={f.days}>{f.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 items-end">
          <label className="flex items-center gap-2 text-sm font-semibold text-[#1a1a1a] h-10">
            <input type="checkbox" className="w-4 h-4 accent-[#00bbb1]" checked={form.payToday}
              onChange={e => setForm(f => ({ ...f, payToday: e.target.checked }))} />
            Payer aujourd’hui
          </label>
          {needsDate && (
            <Input label={dateLabel} type="date" min={form.payToday ? addDays(today, 1) : today}
              value={form.chargeDate} onChange={set('chargeDate')} required />
          )}
        </div>

        <Input label="Note (optionnel)" value={form.notes} onChange={set('notes')} />

        {schedule && (
          <div className="rounded-lg bg-[#f5f5f7] p-4">
            <p className="text-sm font-semibold text-[#1a1a1a] mb-2">
              Échéancier : {count} versement{count > 1 ? 's' : ''}
            </p>
            <ul className="text-sm text-[#374151] space-y-1">
              {schedule.map(s => (
                <li key={s.number} className="flex justify-between">
                  <span>{s.number}. {s.dueDate === today ? 'Aujourd’hui' : s.dueDate}</span>
                  <span className="font-semibold">{formatCents(s.amountCents)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" loading={saving === 'card'} disabled={!!saving} className="w-full">Entrer la carte</Button>
      </form>
    </Card>
  )
}

// ── Saisie de la carte par le closeur ────────────────────────

function CardEntryModal({ plan, onClose, onDone }) {
  const frameRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [consent, setConsent] = useState(false)
  const first = plan.payment_installments?.find(i => i.number === 1)
  const chargeNow = first && first.due_date <= todayMontreal()

  const onToken = useCallback(async (token) => {
    try {
      const r = await callTerminal({ action: 'attach_card', planId: plan.id, temporaryToken: token })
      onDone(r.message)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }, [plan.id, onDone])
  const onError = useCallback((msg) => { setError(msg); setBusy(false) }, [])

  return (
    <Modal isOpen onClose={busy ? () => {} : onClose} title="Entrer la carte du client">
      <div className="p-6 space-y-4">
        <p className="text-sm text-[#374151]">
          {plan.client_first_name} {plan.client_last_name} · {plan.product_name}
        </p>
        <p className="text-sm font-semibold">
          {chargeNow
            ? `La carte sera débitée maintenant de ${formatCents(first.amount_cents)}.`
            : `La carte sera validée sans débit. 1er prélèvement le ${first?.due_date}.`}
        </p>
        <MonerisCardFrame ref={frameRef} onToken={onToken} onError={onError} />
        <label className="flex items-start gap-2 text-xs text-[#374151]">
          <input type="checkbox" className="mt-0.5" checked={consent} onChange={e => setConsent(e.target.checked)} />
          <span>Le client m’a autorisé verbalement à conserver sa carte et à la débiter selon l’échéancier.</span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button className="w-full" loading={busy} disabled={!consent}
          onClick={() => { setError(''); setBusy(true); frameRef.current?.tokenize() }}>
          {chargeNow ? 'Débiter et enregistrer la carte' : 'Valider et enregistrer la carte'}
        </Button>
        <p className="text-xs text-[#6b7280]">
          Le numéro de carte est traité directement par Moneris. NEO ne le voit ni ne le conserve.
        </p>
      </div>
    </Modal>
  )
}

// ── Liste des ventes ─────────────────────────────────────────

function PlanRow({ plan, isManager, onAction, highlight }) {
  const [open, setOpen] = useState(highlight)
  const [busy, setBusy] = useState('')
  const paid = (plan.payment_installments ?? []).filter(i => i.status === 'paid').reduce((a, i) => a + i.amount_cents, 0)
  const st = PLAN_STATUS[plan.status] ?? { label: plan.status, variant: 'default' }
  const needsCard = ['pending_card', 'card_failed'].includes(plan.status)

  async function run(label, fn) {
    setBusy(label)
    try { await fn() } catch (err) { onAction.toast(err.message, true) } finally { setBusy('') }
  }

  const cancel = () => run('cancel', async () => {
    await callTerminal({ action: 'cancel_plan', planId: plan.id }); onAction.refresh()
  })
  const retry = (instId) => run(instId, async () => {
    const r = await callTerminal({ action: 'retry_installment', installmentId: instId })
    onAction.toast(r.message); onAction.refresh()
  })

  return (
    <Card className={`p-4 ${highlight ? 'ring-2 ring-[#00bbb1]' : ''}`}>
      <button className="w-full flex items-center justify-between text-left" onClick={() => setOpen(o => !o)}>
        <div>
          <p className="font-semibold text-[#1a1a1a]">{plan.client_first_name} {plan.client_last_name}</p>
          <p className="text-xs text-[#6b7280]">
            {plan.product_name}{isManager ? ` · ${plan.closer_name}` : ''}
          </p>
        </div>
        <div className="text-right">
          <Badge variant={st.variant}>{st.label}</Badge>
          <p className="text-xs text-[#6b7280] mt-1">{formatCents(paid)} / {formatCents(plan.total_amount_cents)}</p>
        </div>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {plan.card_last4 && (
            <p className="text-sm text-[#374151]">Carte : {plan.card_brand} •••• {plan.card_last4} ({plan.card_expiry})</p>
          )}
          <ul className="text-sm divide-y divide-[#e5e7eb]">
            {(plan.payment_installments ?? []).sort((a, b) => a.number - b.number).map(i => {
              const s = INST_STATUS[i.status] ?? { label: i.status, variant: 'default' }
              return (
                <li key={i.id} className="py-2 flex items-center justify-between gap-3">
                  <span>{i.number}. {i.due_date}</span>
                  <span className="font-semibold">{formatCents(i.amount_cents)}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant={s.variant}>{s.label}</Badge>
                    {i.status === 'declined' && plan.status === 'active' && (
                      <Button size="sm" variant="secondary" loading={busy === i.id} onClick={() => retry(i.id)}>Relancer</Button>
                    )}
                  </span>
                  {i.error_message && i.status !== 'paid' && (
                    <span className="basis-full text-xs text-red-600">{i.error_message}</span>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="flex flex-wrap gap-2">
            {needsCard && <Button size="sm" onClick={() => onAction.enterCard(plan)}>Entrer la carte</Button>}
            {!['completed', 'canceled'].includes(plan.status) && (
              <Button size="sm" variant="ghost" loading={busy === 'cancel'}
                onClick={() => { if (window.confirm('Annuler les versements à venir de cette vente ?')) cancel() }}>
                Annuler la vente
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

export default function Terminal() {
  const { isAdmin, isRespVente } = useAuth()
  const isManager = isAdmin || isRespVente
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('open')
  const [cardPlan, setCardPlan] = useState(null)
  const [highlightId, setHighlightId] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError })
    setTimeout(() => setToast(null), 5000)
  }

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('payment_plans')
      .select('*, payment_installments(*)')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) showToast(error.message, true)
    setPlans(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const visible = plans.filter(p => {
    if (filter === 'open') return !['completed', 'canceled'].includes(p.status)
    if (filter === 'issues') return p.status === 'card_failed' || (p.payment_installments ?? []).some(i => i.status === 'declined')
    return true
  })

  async function onCreated(planId) {
    const { data: plan } = await supabase.from('payment_plans')
      .select('*, payment_installments(*)').eq('id', planId).single()
    await load()
    setHighlightId(planId)
    if (plan) setCardPlan(plan)
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1a1a1a]">Terminal de paiement</h1>
        <p className="text-sm text-[#6b7280]">Prends le paiement, enregistre la carte, les versements suivants se font tout seuls.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <NewPlanForm onCreated={onCreated} />

        <div className="space-y-3">
          <div className="flex gap-2">
            {[['open', 'En cours'], ['issues', 'À régler'], ['all', 'Toutes']].map(([k, l]) => (
              <Button key={k} size="sm" variant={filter === k ? 'primary' : 'secondary'} onClick={() => setFilter(k)}>{l}</Button>
            ))}
          </div>
          {loading && <p className="text-sm text-[#6b7280]">Chargement...</p>}
          {!loading && visible.length === 0 && <p className="text-sm text-[#6b7280]">Aucune vente.</p>}
          {visible.map(p => (
            <PlanRow key={p.id} plan={p} isManager={isManager} highlight={p.id === highlightId}
              onAction={{ refresh: load, toast: showToast, enterCard: setCardPlan }} />
          ))}
        </div>
      </div>

      {cardPlan && (
        <CardEntryModal plan={cardPlan} onClose={() => setCardPlan(null)}
          onDone={(msg) => { setCardPlan(null); showToast(msg); load() }} />
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm text-white ${toast.isError ? 'bg-red-600' : 'bg-[#1a1a1a]'}`}>
          {toast.msg}
        </div>
      )}
    </Layout>
  )
}
