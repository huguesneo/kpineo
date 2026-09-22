import { useState } from 'react'
import { OBJECTIONS } from '../../../lib/closers/objections'

// Boutons Show / No-show / Annulé. Un show demande « Vendu ? » ; un show sans
// vente exige l'objection principale (même règle que le rapport de fin de journée).
export default function StatuerRdv({ appt, onStatuer }) {
  const [etape, setEtape] = useState('statut') // statut | vendu | objection
  const [objection, setObjection] = useState('')
  const [precision, setPrecision] = useState('')
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState(null)

  async function envoyer(payload) {
    setSaving(true)
    setErreur(null)
    const { error } = await onStatuer(appt, payload)
    setSaving(false)
    if (error) setErreur(error)
  }

  const btn = 'text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-white border disabled:opacity-50'

  if (etape === 'vendu') {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-semibold text-[#374151] mr-1">Vendu ?</span>
        <button disabled={saving} onClick={() => envoyer({ status: 'show', isClosed: true })} className={`${btn} text-[#047857] border-[#a7f3d0] hover:bg-[#ecfdf5]`}>Oui</button>
        <button disabled={saving} onClick={() => setEtape('objection')} className={`${btn} text-[#b91c1c] border-[#fecaca] hover:bg-[#fef2f2]`}>Non</button>
        <button disabled={saving} onClick={() => setEtape('statut')} className="text-xs font-semibold text-[#6b7280] px-1">Retour</button>
        {erreur && <p className="w-full text-xs font-semibold text-[#b91c1c]">{erreur}</p>}
      </div>
    )
  }

  if (etape === 'objection') {
    const valide = objection && (objection !== 'Autre' || precision.trim())
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-[#374151]">Objection principale <span className="text-[#ef4444]">(obligatoire)</span></p>
        <div className="flex gap-1.5 flex-wrap">
          {OBJECTIONS.map(o => (
            <button key={o} onClick={() => setObjection(o)}
              className={`text-[13px] font-semibold px-3 py-1.5 rounded-lg border ${objection === o ? 'bg-[#00bbb1] border-[#00bbb1] text-white' : 'bg-white border-[#e5e7eb] text-[#374151] hover:bg-[#f9fafb]'}`}>
              {o}
            </button>
          ))}
        </div>
        {objection === 'Autre' && (
          <input value={precision} onChange={e => setPrecision(e.target.value)} placeholder="Précise l'objection"
            className="text-xs px-2 py-1.5 border border-[#e5e7eb] rounded-lg bg-white outline-none focus:border-[#00bbb1]" />
        )}
        <div className="flex gap-1.5 items-center">
          <button disabled={!valide || saving}
            onClick={() => envoyer({ status: 'show', isClosed: false, objection, precision })}
            className="text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-[#00bbb1] text-white disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button disabled={saving} onClick={() => setEtape('vendu')} className="text-xs font-semibold text-[#6b7280] px-1">Retour</button>
        </div>
        {erreur && <p className="text-xs font-semibold text-[#b91c1c]">{erreur}</p>}
      </div>
    )
  }

  return (
    <div className="flex gap-1.5 flex-wrap">
      <button disabled={saving} onClick={() => setEtape('vendu')} className={`${btn} text-[#047857] border-[#a7f3d0] hover:bg-[#ecfdf5]`}>Show</button>
      <button disabled={saving} onClick={() => envoyer({ status: 'noshow' })} className={`${btn} text-[#b91c1c] border-[#fecaca] hover:bg-[#fef2f2]`}>No-show</button>
      <button disabled={saving} onClick={() => envoyer({ status: 'annule' })} className={`${btn} text-[#4b5563] border-[#e5e7eb] hover:bg-[#f9fafb]`}>Annulé</button>
      {erreur && <p className="w-full text-xs font-semibold text-[#b91c1c]">{erreur}</p>}
    </div>
  )
}
