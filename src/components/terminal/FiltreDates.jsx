// Terminal : filtre des ventes par date (hugues@ et info@ seulement). Date de la vente = création, heure de Montréal.
import Button from '../shared/Button'
import { addDays, formatCents, todayMontreal } from '../../../supabase/functions/_shared/schedule.js'
import { avantTaxes } from '../../../supabase/functions/_shared/venteValeur.js'

export const SANS_DATE = { mode: 'all', du: '', au: '' }

// Plage effective { du, au } (AAAA-MM-JJ, bornes incluses), ou null si aucune date ne filtre
export function plageDates(f, today = todayMontreal()) {
  if (f.mode === 'today') return { du: today, au: today }
  if (f.mode === 'range' && (f.du || f.au)) {
    const du = f.du || f.au, au = f.au || f.du
    return du <= au ? { du, au } : { du: au, au: du }
  }
  return null
}

export const dateVente = (plan) => todayMontreal(new Date(plan.created_at))

export const dansPlage = (plan, plage) => !plage || (dateVente(plan) >= plage.du && dateVente(plan) <= plage.au)

// Bornes UTC larges (un jour de marge) pour la requête ; le tri exact se fait avec dansPlage
export const bornesRequete = (plage) => ({ debut: `${addDays(plage.du, -1)}T00:00:00Z`, fin: `${addDays(plage.au, 2)}T00:00:00Z` })

const inputCls = 'px-2 py-1.5 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]'

// plans : ventes affichées, pour le total de la période (montants avant taxes)
export default function FiltreDates({ value, onChange, plans }) {
  const plage = plageDates(value)
  const actives = plans.filter(p => p.status !== 'canceled')
  const vendu = actives.reduce((a, p) => a + avantTaxes(p.total_amount_cents), 0)
  const encaisse = plans.reduce((a, p) => a + avantTaxes((p.payment_installments ?? [])
    .filter(i => i.status === 'paid').reduce((s, i) => s + i.amount_cents, 0)), 0)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {[['all', 'Toutes dates'], ['today', 'Aujourd’hui'], ['range', 'Plage de dates']].map(([k, l]) => (
          <Button key={k} size="sm" variant={value.mode === k ? 'primary' : 'secondary'}
            onClick={() => onChange({ ...value, mode: k })}>{l}</Button>
        ))}
      </div>
      {value.mode === 'range' && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#374151]">
          <span>Du</span>
          <input type="date" className={inputCls} value={value.du} onChange={e => onChange({ ...value, du: e.target.value })} />
          <span>au</span>
          <input type="date" className={inputCls} value={value.au} onChange={e => onChange({ ...value, au: e.target.value })} />
        </div>
      )}
      {plage && (
        <p className="text-sm text-[#374151]">
          {actives.length} vente{actives.length > 1 ? 's' : ''}
          {plage.du === plage.au ? ` le ${plage.du}` : ` du ${plage.du} au ${plage.au}`}
          {' '}· Avant taxes : vendu <span className="font-semibold">{formatCents(vendu)}</span>
          {' '}· déjà encaissé sur ces ventes <span className="font-semibold">{formatCents(encaisse)}</span>
        </p>
      )}
    </div>
  )
}
