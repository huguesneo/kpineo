import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { EVALUATION } from '../../../lib/v2/salesConfig'
import { fmtHeure } from '../../../lib/v2/format'

const MOTIFS = {
  creneau_pris: 'Cette plage vient d’être prise. Les disponibilités sont à jour : choisis-en une autre.',
  ghl_indisponible: 'GoHighLevel ne répond pas pour le moment. Réessaie dans un instant ou utilise le calendrier GHL.',
  contact_refuse: 'GoHighLevel a refusé la mise à jour du contact (courriel ou téléphone invalide ?).',
  non_autorise: 'Ton compte n’a pas accès à la prise de rendez-vous.',
}

function libelleJour(jour) {
  const d = new Date(`${jour}T12:00:00Z`)
  return {
    semaine: new Intl.DateTimeFormat('fr-CA', { weekday: 'short', timeZone: 'UTC' }).format(d).replace('.', ''),
    num: d.getUTCDate(),
    mois: new Intl.DateTimeFormat('fr-CA', { month: 'short', timeZone: 'UTC' }).format(d).replace('.', ''),
    long: new Intl.DateTimeFormat('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d),
  }
}

async function appeler(body) {
  const { data, error } = await supabase.functions.invoke('ghl-eval-book', { body })
  if (error) {
    // Erreur HTTP : le corps porte souvent { motif }
    try { return await error.context.json() } catch { return { ok: false, motif: 'erreur' } }
  }
  return data
}

const champCls = 'w-full px-3 py-2.5 sm:py-2 text-base sm:text-sm border border-[#e5e7eb] rounded-lg bg-white outline-none focus:border-[#00bbb1]'

// Recherche d'un contact existant (cache ghl_contacts) : nom, courriel ou téléphone.
// Seules les colonnes utiles sont lues (jamais raw).
function RechercheClient({ contactId, onChoisir }) {
  const [q, setQ] = useState('')
  const [resultats, setResultats] = useState([])
  useEffect(() => {
    const terme = q.trim()
    if (terme.length < 2) { setResultats([]); return undefined }
    const t = setTimeout(async () => {
      const motif = `%${terme.replace(/[%_,()]/g, ' ')}%`
      const { data } = await supabase
        .from('ghl_contacts')
        .select('ghl_id, first_name, last_name, email, phone')
        .or(`first_name.ilike.${motif},last_name.ilike.${motif},email.ilike.${motif},phone.ilike.${motif}`)
        .order('created_at_ghl', { ascending: false })
        .limit(8)
      setResultats(data ?? [])
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <input className={champCls} value={q} onChange={e => setQ(e.target.value)}
          placeholder="Chercher un client existant (nom, courriel, téléphone)" aria-label="Chercher un client" />
        {contactId && (
          <button onClick={() => { onChoisir(null); setQ('') }}
            className="flex-shrink-0 px-3 rounded-lg border border-[#e5e7eb] text-xs font-semibold text-[#6b7280] hover:bg-gray-50">
            Nouveau client
          </button>
        )}
      </div>
      {resultats.length > 0 && (
        <ul className="border border-[#e5e7eb] rounded-lg divide-y divide-[#f3f4f6] max-h-48 overflow-y-auto">
          {resultats.map(c => (
            <li key={c.ghl_id}>
              <button onClick={() => { onChoisir(c); setQ(''); setResultats([]) }}
                className="w-full text-left px-3 py-2.5 min-h-[44px] hover:bg-[#00bbb1]/5">
                <span className="text-sm font-semibold text-[#1a1a1a]">{`${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || 'Sans nom'}</span>
                <span className="block text-xs text-[#6b7280] truncate">{[c.email, c.phone].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] font-semibold" style={{ color: contactId ? '#047857' : '#6b7280' }}>
        {contactId ? 'Client existant sélectionné' : 'Nouveau client (ou choisis-le ci-dessus)'}
      </p>
    </div>
  )
}

// Contenu de la réservation d'une rencontre d'évaluation : type, membre, plage,
// formulaire. Utilisé dans la fenêtre du script de vente (ModalEvaluation) et
// directement dans la page du Centre de vente.
//   rechercheClient : affiche la recherche de client (Centre de vente)
export default function EvaluationReservation({
  client = null, contactId: contactIdInitial = null, onSecours, onConfirme, onTermine,
  libelleTermine = 'Fermer', rechercheClient = false,
}) {
  const [contactId, setContactId] = useState(contactIdInitial)
  const [type, setType] = useState('clinique')
  const [membre, setMembre] = useState('') // '' = tout membre disponible (round robin)
  const [jours, setJours] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [jour, setJour] = useState(null)
  const [creneau, setCreneau] = useState(null)
  const [form, setForm] = useState({
    prenom: client?.first_name ?? '', nom: client?.last_name ?? '',
    telephone: client?.phone ?? '', courriel: client?.email ?? '',
    forfait: '', nbPaiements: '',
  })
  const [envoi, setEnvoi] = useState(false)
  const [confirme, setConfirme] = useState(null)

  const typeChoisi = EVALUATION.types.find(t => t.cle === type)
  const set = cle => e => setForm(f => ({ ...f, [cle]: e.target.value }))

  const charger = useCallback(async () => {
    setChargement(true)
    setErreur(null)
    const r = await appeler({ action: 'slots', type, userId: membre || undefined })
    if (r?.ok) {
      setJours(r.jours ?? [])
      setJour(j => (r.jours ?? []).some(x => x.jour === j) ? j : (r.jours?.[0]?.jour ?? null))
    } else {
      setJours([])
      setErreur(MOTIFS[r?.motif] ?? 'Impossible de charger les disponibilités.')
    }
    setChargement(false)
  }, [type, membre])

  useEffect(() => { setCreneau(null); charger() }, [charger])

  const creneauxDuJour = useMemo(() => jours.find(j => j.jour === jour)?.creneaux ?? [], [jours, jour])
  const complet = creneau && form.prenom.trim() && form.nom.trim() && form.forfait && form.nbPaiements
    && (form.courriel.trim() || form.telephone.trim())

  async function confirmer() {
    if (!complet || envoi) return
    setEnvoi(true)
    setErreur(null)
    const r = await appeler({
      action: 'book', type, userId: membre || undefined, contactId: contactId || undefined, startTime: creneau,
      prenom: form.prenom, nom: form.nom, telephone: form.telephone, courriel: form.courriel,
      forfait: form.forfait, nbPaiements: form.nbPaiements,
    })
    setEnvoi(false)
    if (r?.ok) {
      setConfirme(r.rdv)
      onConfirme?.(r.rdv)
      return
    }
    setErreur(MOTIFS[r?.motif] ?? `Le rendez-vous n’a pas été créé${r?.detail ? ` : ${r.detail}` : '.'}`)
    if (r?.jours) { setJours(r.jours); setCreneau(null) }
  }

  const nomMembre = id => EVALUATION.membres.find(m => m.userId === id)?.nom

  return (
    <>
        {confirme ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-6 py-12">
            <div className="w-12 h-12 rounded-full bg-[#ecfdf5] flex items-center justify-center">
              <svg className="w-6 h-6 text-[#10b981]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            </div>
            <p className="text-lg font-black text-[#1a1a1a]">Rendez-vous confirmé</p>
            <p className="text-sm text-[#4b5563]">
              {typeChoisi.libelle}, {libelleJour(new Date(confirme.startTime).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })).long} à {fmtHeure(confirme.startTime)}
              {confirme.assignedUserId && nomMembre(confirme.assignedUserId) ? ` avec ${nomMembre(confirme.assignedUserId)}` : ''}.
            </p>
            <p className="text-xs text-[#9ca3af]">Le rendez-vous est dans GoHighLevel ; les confirmations partent comme d'habitude.</p>
            <button onClick={onTermine} className="mt-2 px-5 py-2.5 rounded-lg bg-[#00bbb1] text-white text-sm font-semibold hover:bg-[#009e95]">{libelleTermine}</button>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 flex flex-col gap-5">
            {/* 1. Type */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {EVALUATION.types.map(t => (
                <button key={t.cle} onClick={() => setType(t.cle)}
                  className={`min-h-[48px] px-4 py-2.5 rounded-xl border-2 text-sm font-bold text-left sm:text-center transition-colors ${type === t.cle ? 'border-[#00bbb1] bg-[#00bbb1]/5 text-[#00897f]' : 'border-[#e5e7eb] text-[#4b5563] hover:border-[#00bbb1]/40'}`}>
                  {t.libelle}<span className="block text-[11px] font-semibold text-[#9ca3af]">{t.duree} min{t.enLigne ? ' · en ligne' : ' · en clinique'}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-6">
              {/* 2. Membre + 3. Plages */}
              <div className="flex flex-col gap-4 min-w-0">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-[#6b7280] uppercase tracking-wide">Membre du personnel</span>
                  <select value={membre} onChange={e => setMembre(e.target.value)} className={champCls}>
                    <option value="">Tout membre disponible (répartition automatique)</option>
                    {EVALUATION.membres.map(m => <option key={m.userId} value={m.userId}>{m.nom}</option>)}
                  </select>
                </label>

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold text-[#6b7280] uppercase tracking-wide">Date et heure</span>
                  {chargement ? (
                    <div className="h-40 rounded-xl bg-gray-50 animate-pulse" />
                  ) : jours.length === 0 ? (
                    <p className="text-sm text-[#6b7280] bg-gray-50 rounded-xl px-4 py-6 text-center">
                      {erreur ?? 'Aucune disponibilité dans les 30 prochains jours.'}
                    </p>
                  ) : (
                    <>
                      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                        {jours.map(j => {
                          const l = libelleJour(j.jour)
                          const actif = j.jour === jour
                          return (
                            <button key={j.jour} onClick={() => { setJour(j.jour); setCreneau(null) }}
                              className={`flex-shrink-0 w-16 py-2 rounded-xl border text-center ${actif ? 'bg-[#00bbb1] border-[#00bbb1] text-white' : 'bg-white border-[#e5e7eb] text-[#1a1a1a] hover:border-[#00bbb1]/50'}`}>
                              <span className="block text-[11px] font-semibold capitalize">{l.semaine}</span>
                              <span className="block text-lg font-black leading-tight">{l.num}</span>
                              <span className="block text-[11px] capitalize">{l.mois}</span>
                            </button>
                          )
                        })}
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {creneauxDuJour.map(c => (
                          <button key={c} onClick={() => setCreneau(c)}
                            className={`min-h-[44px] rounded-lg border text-sm font-semibold ${creneau === c ? 'bg-[#00bbb1] border-[#00bbb1] text-white' : 'bg-white border-[#00bbb1]/40 text-[#00897f] hover:bg-[#00bbb1]/5'}`}>
                            {fmtHeure(c)}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 4. Formulaire */}
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold text-[#6b7280] uppercase tracking-wide">Informations du client</span>
                {rechercheClient && (
                  <RechercheClient
                    contactId={contactId}
                    onChoisir={c => {
                      setContactId(c?.ghl_id ?? null)
                      setForm(f => ({
                        ...f,
                        prenom: c?.first_name ?? '', nom: c?.last_name ?? '',
                        telephone: c?.phone ?? '', courriel: c?.email ?? '',
                      }))
                    }}
                  />
                )}
                <div className="grid grid-cols-2 gap-3">
                  <input className={champCls} value={form.prenom} onChange={set('prenom')} placeholder="Prénom" aria-label="Prénom" />
                  <input className={champCls} value={form.nom} onChange={set('nom')} placeholder="Nom de famille" aria-label="Nom de famille" />
                </div>
                <input className={champCls} value={form.telephone} onChange={set('telephone')} placeholder="Téléphone" aria-label="Téléphone" inputMode="tel" />
                <input className={champCls} value={form.courriel} onChange={set('courriel')} placeholder="Courriel" aria-label="Courriel" type="email" />
                <select className={champCls} value={form.forfait} onChange={set('forfait')} aria-label="Type de forfait">
                  <option value="">Type de forfait…</option>
                  {EVALUATION.forfaits.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <select className={champCls} value={form.nbPaiements} onChange={set('nbPaiements')} aria-label="Nombre de paiements">
                  <option value="">Nombre de paiements…</option>
                  {EVALUATION.nbPaiements.map(n => <option key={n} value={n}>{n} paiement{n === '1' ? '' : 's'}</option>)}
                </select>

                {erreur && jours.length > 0 && <p className="text-sm font-semibold text-[#b91c1c]">{erreur}</p>}

                <button onClick={confirmer} disabled={!complet || envoi}
                  className="min-h-[48px] mt-1 rounded-xl bg-[#00bbb1] text-white text-sm font-bold hover:bg-[#009e95] disabled:opacity-50 disabled:cursor-not-allowed">
                  {envoi ? 'Réservation…' : creneau
                    ? `Confirmer : ${libelleJour(jour).long} à ${fmtHeure(creneau)}`
                    : 'Choisis une date et une heure'}
                </button>
                <p className="text-[11px] text-[#9ca3af]">
                  {contactId
                    ? 'Le contact est mis à jour dans GoHighLevel (coordonnées, forfait, paiements) et le rendez-vous y est créé.'
                    : 'Nouveau client : le contact est créé dans GoHighLevel (ou retrouvé par courriel ou téléphone), puis le rendez-vous.'}
                </p>
              </div>
            </div>

            <button onClick={onSecours} className="self-center text-xs font-semibold text-[#6b7280] underline underline-offset-2 hover:text-[#1a1a1a]">
              Un problème ? Ouvrir le calendrier GoHighLevel
            </button>
          </div>
        )}
    </>
  )
}
