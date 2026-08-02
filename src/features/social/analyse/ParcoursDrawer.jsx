import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { fmtInt, fmtDateLong } from '../../../lib/socialFormat'

// ============================================================================
// Parcours des contacts attribués à un contenu
//
// Un boni se conteste. Cet écran existe pour qu'une contestation se règle en
// regardant les faits : d'où la personne est venue la première fois, par quelle
// porte elle est revenue, combien de jours se sont écoulés, et ce que le
// rendez-vous est devenu.
//
// Ce que GHL ne donne pas : la date de chaque point de contact. Le délai
// affiché court donc de la création du contact à la réservation, pas du clic
// au clic. C'est écrit à l'écran plutôt que sous-entendu.
// ============================================================================

const STATUT_RDV = {
  showed:    { label: 'Honoré',    cls: 'bg-[#00bbb1]/10 text-[#009e95]' },
  noshow:    { label: 'No-show',   cls: 'bg-[#ef4444]/10 text-[#dc2626]' },
  confirmed: { label: 'Confirmé',  cls: 'bg-blue-50 text-blue-700' },
  cancelled: { label: 'Annulé',    cls: 'bg-gray-100 text-[#6b7280]' },
  booked:    { label: 'Réservé',   cls: 'bg-blue-50 text-blue-700' },
}

function Statut({ value }) {
  if (!value) return <span className="text-xs text-[#d1d5db]">aucun rendez-vous</span>
  const s = STATUT_RDV[value] ?? { label: value, cls: 'bg-gray-100 text-[#6b7280]' }
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.cls}`}>{s.label}</span>
}

function Delai({ jours }) {
  if (jours == null) return null
  const n = Number(jours)
  if (n < 1) return <span className="text-[11px] text-[#6b7280]">le jour même</span>
  return (
    <span className="text-[11px] text-[#6b7280]">
      {n < 2 ? '1 jour' : `${Math.round(n)} jours`} après le premier contact
    </span>
  )
}

export default function ParcoursDrawer({ post, onClose }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    supabase
      .rpc('social_attribution_parcours', { p_tracking_code: post.tracking_code })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) setError(err.message)
        else setRows(data ?? [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [post.tracking_code])

  const avecRdv = rows.filter(r => r.rdv_le)
  const honores = rows.filter(r => r.rdv_statut === 'showed')

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-[#14141a]/30" onClick={onClose} />
      <div
        className="absolute top-0 right-0 bottom-0 bg-white shadow-2xl overflow-y-auto"
        style={{ width: 'min(640px, 96vw)' }}
      >
        <div className="sticky top-0 bg-white border-b border-[#e5e7eb] px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-[#1a1a1a] truncate">{post.title}</h3>
            <p className="text-xs text-[#9ca3af] mt-0.5">
              <code>{post.tracking_code}</code> · {rows.length} contact{rows.length > 1 ? 's' : ''} attribué{rows.length > 1 ? 's' : ''}
              {avecRdv.length > 0 && ` · ${avecRdv.length} rendez-vous, ${honores.length} honoré${honores.length > 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full text-[#6b7280] hover:bg-gray-100 text-lg leading-none shrink-0"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <p className="text-xs text-[#9ca3af] leading-relaxed">
            Attribution au <b>dernier lien cliqué</b> avant la réservation. Le délai court de la
            création du contact à la réservation — GHL ne date pas chaque clic, seulement la
            première apparition du contact.
          </p>

          {loading && <p className="text-sm text-[#9ca3af]">Chargement du parcours…</p>}
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          {!loading && !error && !rows.length && (
            <p className="text-sm text-[#9ca3af]">
              Aucun contact n'est encore arrivé par un lien portant ce code.
            </p>
          )}

          {rows.map(r => (
            <div key={r.contact_id} className="border border-[#e5e7eb] rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#1a1a1a] truncate">
                    {r.nom || 'Contact sans nom'}
                  </div>
                  <div className="text-[11px] text-[#9ca3af]">
                    Premier contact le {fmtDateLong(r.cree_le)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <Statut value={r.rdv_statut} />
                  {r.rdv_le && (
                    <div className="text-[11px] text-[#9ca3af] mt-1">{fmtDateLong(r.rdv_le)}</div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5 text-xs">
                <div className="flex gap-2">
                  <span className="text-[#9ca3af] w-28 shrink-0">Arrivée</span>
                  <span className="text-[#4b5563] min-w-0 break-all">
                    {r.premiere_source || 'source inconnue'}
                    {r.referent && <span className="text-[#9ca3af]"> · via {r.referent}</span>}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-[#9ca3af] w-28 shrink-0">Retour</span>
                  <span className="text-[#4b5563] min-w-0 break-all">
                    {r.derniere_source || 'source inconnue'}
                    {r.touches > 1 && <span className="text-[#9ca3af]"> · {r.touches} passages</span>}
                  </span>
                </div>
                {r.delai_jours != null && (
                  <div className="flex gap-2">
                    <span className="text-[#9ca3af] w-28 shrink-0">Délai</span>
                    <Delai jours={r.delai_jours} />
                  </div>
                )}
                {r.vente && (
                  <div className="flex gap-2">
                    <span className="text-[#9ca3af] w-28 shrink-0">Vente</span>
                    <span className="font-semibold text-[#009e95]">{fmtInt(r.valeur)} $</span>
                  </div>
                )}
              </div>

              {r.meme_source ? (
                <p className="text-[11px] text-[#009e95] bg-[#00bbb1]/8 rounded-lg px-2.5 py-1.5">
                  Découverte <b>et</b> déclenchement par ce contenu — attribution la moins discutable.
                </p>
              ) : (
                <p className="text-[11px] text-[#a35c09] bg-amber-50 rounded-lg px-2.5 py-1.5">
                  Cette personne connaissait déjà NEO par une autre source. Ce contenu a déclenché
                  la réservation, pas la découverte.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
