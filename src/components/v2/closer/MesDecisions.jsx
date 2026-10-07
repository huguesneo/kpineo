import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { lienFicheGHL } from '../../../lib/v2/salesConfig'
import { fmtCAD, fmtRdvAvecHeure, prenom } from '../../../lib/v2/format'
import { jourMontreal } from '../../../lib/v2/setterFiles'

const CLE = 'neo.v2.relances'
function lireRelances() {
  try { return JSON.parse(localStorage.getItem(CLE) ?? '{}') } catch { return {} }
}
function ecrireRelances(v) {
  try { localStorage.setItem(CLE, JSON.stringify(v)) } catch { /* stockage indisponible */ }
}

const NIVEAUX = {
  rouge:  { ageBg: '#ef4444', ageColor: '#ffffff', bordure: '#fecaca' },
  orange: { ageBg: '#f59e0b', ageColor: '#ffffff', bordure: '#fde68a' },
  ok:     { ageBg: '#f3f4f6', ageColor: '#4b5563', bordure: '#e5e7eb' },
}

// Décisions en cours du closeur. « Relancé » écrit une note GHL sur le contact.
// Avec un RDV décision à venir : sa date et son heure, rien à relancer.
export default function MesDecisions({ decisions, profile, now = Date.now() }) {
  const [relances, setRelances] = useState(lireRelances)
  const [erreurs, setErreurs] = useState({})
  const aujourdhui = jourMontreal(new Date())

  async function relancer(d) {
    const texte = `Relance du prospect en décision faite depuis l'app par ${prenom(profile?.full_name) || 'le closeur'}`
    const { data, error } = await supabase.functions.invoke('ghl-add-contact-note', { body: { contactId: d.contactId, note: texte } })
    if (error || data?.error) {
      setErreurs(prev => ({ ...prev, [d.ghlId]: data?.error ?? error.message }))
      return
    }
    const n = { ...relances, [d.ghlId]: aujourdhui }
    setRelances(n)
    ecrireRelances(n)
  }

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2.5 mb-3 flex-wrap">
        <h2 className="text-[15px] font-bold">Mes décisions</h2>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#f3f4f6] text-[#4b5563]">{decisions.length}</span>
        <span className="text-xs text-[#6b7280]">Orange après 72 h sans changement d'étape ni RDV décision, rouge après 7 jours</span>
      </div>
      {decisions.length === 0 ? (
        <div className="bg-[#fcfcfd] border border-[#e5e7eb] rounded-xl p-6 text-center text-sm text-[#6b7280]">
          Aucun prospect en décision pour l'instant.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {decisions.map(d => {
            const fait = relances[d.ghlId] === aujourdhui
            const n = NIVEAUX[d.niveau]
            return (
              <div key={d.ghlId} className="bg-[#fcfcfd] rounded-xl shadow-sm p-4 flex flex-col gap-2.5 border" style={{ borderColor: n.bordure }}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${d.decisionBookee ? 'bg-[#00bbb1]/10 text-[#00897f]' : 'bg-[#eff6ff] text-[#1d4ed8]'}`}>{d.etape}</span>
                  {d.rdvDecision
                    ? <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#00bbb1]/10 text-[#00897f]">{fmtRdvAvecHeure(d.rdvDecision, now)}</span>
                    : <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: n.ageBg, color: n.ageColor }}>{d.jours} j</span>}
                </div>
                <div>
                  <p className="text-[15px] font-bold truncate">{d.nom}</p>
                  <p className="text-xs text-[#6b7280] mt-0.5">{d.valeur > 0 ? fmtCAD(d.valeur) : 'Montant non saisi'}</p>
                </div>
                <div className="flex items-center gap-2 mt-auto flex-wrap">
                  {!d.aRelancer ? null : fait
                    ? <span className="text-xs font-semibold text-[#047857] bg-[#ecfdf5] px-2.5 py-1 rounded-full">Relancé aujourd'hui</span>
                    : <button onClick={() => relancer(d)} className="text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-white text-[#374151] border border-[#e5e7eb] hover:bg-[#f9fafb]">Relancé</button>}
                  {d.contactId && (
                    <a href={lienFicheGHL(d.contactId)} target="_blank" rel="noreferrer"
                      className="text-[13px] font-semibold text-[#6b7280] px-2 py-1.5 rounded-lg hover:bg-[#f3f4f6] hover:text-[#1a1a1a]">Fiche GHL</a>
                  )}
                  {erreurs[d.ghlId] && <p className="w-full text-xs font-semibold text-[#b91c1c]">{erreurs[d.ghlId]}</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
