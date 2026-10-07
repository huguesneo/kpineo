// Terminal : closeur, setter et naturopathe de la vente. Obligatoires avant d'encaisser.
// hugues@ et info@ choisissent le closeur ; les autres closeurs sont inscrits eux-mêmes (verrouillé).
import { NONE } from '../../../supabase/functions/_shared/terminalAttribution.js'

const selectCls = 'w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#00bbb1]'

function Menu({ label, value, onChange, items, withNone, disabled, missing }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-semibold text-[#1a1a1a]">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        className={`${selectCls} ${missing ? 'border-amber-400' : ''}`}>
        {!disabled && <option value="">Choisir…</option>}
        {withNone && <option value={NONE}>Aucun</option>}
        {items.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
      </select>
    </div>
  )
}

// options : { lists: { closers, setters, therapists }, canChooseCloser, self: { id, name } } (null pendant le chargement)
// form : { closerId, setterId, therapistId } ; onChange(champ, valeur)
// fromGhl : true si au moins un champ a été prérempli depuis GHL
export default function AttributionVente({ options, form, onChange, fromGhl = false, error = '' }) {
  if (error) return <p className="text-sm text-red-600">Listes closeur / setter / naturopathe introuvables : {error}</p>
  if (!options) return <p className="text-sm text-[#6b7280]">Chargement du closeur, du setter et de la naturopathe…</p>
  const { lists, canChooseCloser, self } = options
  const closers = canChooseCloser ? lists.closers : [{ id: self.id, label: self.name }]
  const incomplete = !form.closerId || !form.setterId || !form.therapistId
  return (
    <div className="rounded-lg border border-[#e5e7eb] p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Menu label="Closeur" value={form.closerId} onChange={v => onChange('closerId', v)} items={closers}
          disabled={!canChooseCloser} missing={!form.closerId} />
        <Menu label="Setter" value={form.setterId} onChange={v => onChange('setterId', v)} items={lists.setters}
          withNone missing={!form.setterId} />
        <Menu label="Naturopathe" value={form.therapistId} onChange={v => onChange('therapistId', v)} items={lists.therapists}
          withNone missing={!form.therapistId} />
      </div>
      {fromGhl && <p className="text-xs text-[#6b7280]">Prérempli depuis GHL : vérifie avant d’encaisser.</p>}
      {incomplete && (
        <p className="text-xs text-amber-700">
          Choisis le closeur, le setter et la naturopathe pour encaisser (« Aucun » est permis pour le setter et la naturopathe).
        </p>
      )}
    </div>
  )
}
