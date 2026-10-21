// Terminal : paiement unique hors produit (hugues@ et info@ seulement), comme le terminal en clinique.
// Un seul débit aujourd'hui, taxes ajoutées. Rien dans QuickBooks (reçu fait à la main), pas de carte 🎯 Vente.
import { useState } from 'react'
import Card from '../shared/Card'
import Button from '../shared/Button'
import Input from '../shared/Input'
import { formatCents, priceSale, withTax } from '../../../supabase/functions/_shared/schedule.js'

const vide = { clientFirstName: '', clientLastName: '', clientEmail: '', clientPhone: '', clientPostalCode: '', description: '', pretaxAmount: '' }

// onCreate(form) : promesse qui crée le paiement et ouvre la saisie de carte, rejetée avec un message d'erreur
export default function PaiementUnique({ onCreate }) {
  const [form, setForm] = useState(vide)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  let taxes = null
  try { taxes = withTax(priceSale({ pretaxCents: Math.round(Number(form.pretaxAmount) * 100) }).pretaxTotal) } catch { /* montant incomplet */ }

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await onCreate({ ...form, pretaxAmount: Number(form.pretaxAmount) })
      setForm(vide)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold text-[#1a1a1a]">Paiement unique</h2>
      <p className="text-xs text-[#6b7280] mb-4">Un seul débit, taxes ajoutées. Rien n’est créé dans QuickBooks : le reçu se fait à la main.</p>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Prénom du client" value={form.clientFirstName} onChange={set('clientFirstName')} required />
          <Input label="Nom du client" value={form.clientLastName} onChange={set('clientLastName')} required />
          <Input label="Courriel (optionnel)" type="email" value={form.clientEmail} onChange={set('clientEmail')} />
          <Input label="Code postal (optionnel)" value={form.clientPostalCode} onChange={set('clientPostalCode')} placeholder="J4Z 1A7" />
        </div>
        <Input label="Description" value={form.description} onChange={set('description')} placeholder="Ex. suppléments, consultation" required />
        <Input label="Montant avant taxes ($)" type="number" min="0.01" step="0.01" value={form.pretaxAmount} onChange={set('pretaxAmount')} required />
        {taxes && (
          <p className="text-xs text-[#6b7280]">
            Avant taxes {formatCents(taxes.pretax)} + TPS {formatCents(taxes.tps)} + TVQ {formatCents(taxes.tvq)} = <span className="font-semibold text-[#1a1a1a]">{formatCents(taxes.total)}</span>
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" loading={busy} disabled={busy}>Entrer la carte</Button>
      </form>
    </Card>
  )
}
