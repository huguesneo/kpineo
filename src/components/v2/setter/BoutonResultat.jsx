import { useEffect, useRef, useState } from 'react'
import { RAISONS_NON_QUALIFIE, erreurResultat } from '../../../lib/v2/settingV2'
import { actionSetting } from '../../../hooks/v2/useSettingV2'

// Bouton « Résultat ▾ » : un seul bouton, un petit menu.
//   Prendre rendez-vous → ouvre la prise de rendez-vous (comportement actuel)
//   Non qualifié      → raison obligatoire (Âge, Hors cible, Mauvais numéro, Autre + texte)
//   Pas intéressé     → confirmation
// onRdv(lead) ; onTermine(lead, { resultat, reel }) après l'enregistrement.
export default function BoutonResultat({ lead, onRdv, onTermine, mobile = false, pleineLargeur = false }) {
  const [ouvert, setOuvert] = useState(false)
  const [etape, setEtape] = useState(null) // null | 'non_qualifie' | 'pas_interesse'
  const [raison, setRaison] = useState('')
  const [texte, setTexte] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)
  const zone = useRef(null)

  useEffect(() => {
    if (!ouvert) return undefined
    const dehors = e => { if (zone.current && !zone.current.contains(e.target)) fermer() }
    const echap = e => { if (e.key === 'Escape') fermer() }
    document.addEventListener('mousedown', dehors)
    document.addEventListener('keydown', echap)
    return () => { document.removeEventListener('mousedown', dehors); document.removeEventListener('keydown', echap) }
  }, [ouvert])

  function fermer() {
    setOuvert(false); setEtape(null); setRaison(''); setTexte(''); setErreur(null)
  }

  const sansCarte = !lead?.opportunityId
  const titreSansCarte = 'Pas de carte dans le pipeline setting pour ce lead : utilise GHL'

  async function envoyer(resultat) {
    const body = { action: 'resultat', contactId: lead.contactId, opportunityId: lead.opportunityId, resultat, raison, raisonTexte: texte }
    const err = erreurResultat(body)
    if (err) { setErreur(err); return }
    setEnvoi(true); setErreur(null)
    try {
      const r = await actionSetting(body)
      fermer()
      onTermine?.(lead, { resultat, reel: r.reel })
    } catch (e) {
      setErreur(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div ref={zone} className={`relative ${pleineLargeur || mobile ? 'flex-1' : ''}`}>
      <button
        onClick={() => setOuvert(o => !o)}
        aria-haspopup="menu" aria-expanded={ouvert}
        className={`inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold px-3 ${mobile ? 'h-11 w-full' : 'py-1.5'} ${pleineLargeur ? 'w-full' : ''} rounded-lg bg-[#00bbb1] text-white border border-[#00bbb1] whitespace-nowrap hover:bg-[#009e95]`}
      >
        Résultat
        <svg className={`w-3.5 h-3.5 transition-transform ${ouvert ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {ouvert && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] bg-white border border-[#e5e7eb] rounded-xl shadow-lg p-1.5 text-left">
          {etape == null && (
            <>
              <button role="menuitem" onClick={() => { fermer(); onRdv?.(lead) }}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-[#047857] hover:bg-[#ecfdf5]">
                📅 Prendre rendez-vous
              </button>
              <button role="menuitem" disabled={sansCarte} title={sansCarte ? titreSansCarte : ''} onClick={() => setEtape('non_qualifie')}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-[#1a1a1a] hover:bg-[#f3f4f6] disabled:opacity-40 disabled:cursor-not-allowed">
                🗑️ Non qualifié
              </button>
              <button role="menuitem" disabled={sansCarte} title={sansCarte ? titreSansCarte : ''} onClick={() => setEtape('pas_interesse')}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-[#1a1a1a] hover:bg-[#f3f4f6] disabled:opacity-40 disabled:cursor-not-allowed">
                🚫 Pas intéressé
              </button>
            </>
          )}

          {etape === 'non_qualifie' && (
            <div className="p-2 flex flex-col gap-2">
              <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide">Non qualifié : raison</p>
              <div className="grid grid-cols-2 gap-1.5">
                {RAISONS_NON_QUALIFIE.map(r => (
                  <button key={r.cle} onClick={() => setRaison(r.cle)}
                    className={`px-2 py-2 rounded-lg text-[13px] font-semibold border ${raison === r.cle ? 'border-[#00bbb1] bg-[#00bbb1]/10 text-[#00796f]' : 'border-[#e5e7eb] text-[#4b5563] hover:bg-[#f9fafb]'}`}>
                    {r.libelle}
                  </button>
                ))}
              </div>
              {raison === 'autre' && (
                <input autoFocus value={texte} onChange={e => setTexte(e.target.value)} maxLength={300}
                  placeholder="Précise (ex. pas apte à utiliser Internet)"
                  className="w-full px-2.5 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:border-[#00bbb1]" />
              )}
              {erreur && <p className="text-xs text-[#b91c1c]">{erreur}</p>}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEtape(null)} className="px-3 py-1.5 text-xs font-semibold text-[#6b7280]">Retour</button>
                <button disabled={envoi} onClick={() => envoyer('non_qualifie')}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[#1a1a1a] text-white disabled:opacity-50">
                  {envoi ? 'Envoi…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          )}

          {etape === 'pas_interesse' && (
            <div className="p-2 flex flex-col gap-2">
              <p className="text-sm text-[#1a1a1a]">Le lead a été joint et ne veut pas de rendez-vous ? L’opportunité sera marquée <b>Perdue</b>.</p>
              {erreur && <p className="text-xs text-[#b91c1c]">{erreur}</p>}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEtape(null)} className="px-3 py-1.5 text-xs font-semibold text-[#6b7280]">Retour</button>
                <button disabled={envoi} onClick={() => envoyer('pas_interesse')}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[#1a1a1a] text-white disabled:opacity-50">
                  {envoi ? 'Envoi…' : 'Confirmer'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
