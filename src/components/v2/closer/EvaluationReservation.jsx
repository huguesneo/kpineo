import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { EVALUATION } from '../../../lib/v2/salesConfig'
import { fmtHeure } from '../../../lib/v2/format'
import { jourDe, moisSuivant } from '../../../lib/v2/creneaux'
import CalendrierCreneaux from './CalendrierCreneaux'
import { prefillTerminal, decouperAdresse, codeProvince } from '../../../lib/v2/prefillTerminal'
import { TerminalPanel } from '../../../pages/Terminal'
import { canUseTerminal } from '../../../lib/terminal/flag'
import { useAuth } from '../../../context/AuthContext'

const PROVINCES = ['QC', 'ON', 'NB', 'NS', 'PE', 'NL', 'MB', 'SK', 'AB', 'BC', 'YT', 'NT', 'NU']

// Adresse d'un contact GHL (cache ghl_contacts : colonnes + raw) pour le formulaire
function adresseDe(c) {
  const raw = c?.raw ?? {}
  const { numero, rue } = decouperAdresse(c?.address1 ?? raw.address1 ?? '')
  return {
    numero, rue, app: '',
    ville: c?.city ?? raw.city ?? '',
    province: codeProvince(c?.state ?? raw.state ?? ''),
    codePostal: c?.postal_code ?? c?.postalCode ?? raw.postalCode ?? '',
  }
}

const MOTIFS = {
  creneau_pris: 'Cette plage vient d’être prise. Les disponibilités sont à jour : choisis-en une autre.',
  ghl_indisponible: 'GoHighLevel ne répond pas pour le moment. Réessaie dans un instant ou utilise le calendrier GHL.',
  contact_refuse: 'GoHighLevel a refusé la mise à jour du contact (courriel ou téléphone invalide ?).',
  non_autorise: 'Ton compte n’a pas accès à la prise de rendez-vous (rôle closeur, resp_vente ou admin requis).',
  session_expiree: 'Ta session a expiré : déconnecte-toi puis reconnecte-toi, et réessaie.',
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

async function appelerUneFois(body) {
  const { data, error } = await supabase.functions.invoke('ghl-eval-book', { body })
  if (error) {
    // Erreur HTTP : le corps porte souvent { motif }
    try { return await error.context.json() } catch { return { ok: false, motif: 'erreur' } }
  }
  return data
}

// Session expirée (ordinateur en veille…) : on la rafraîchit et on réessaie une fois
async function appeler(body) {
  const r = await appelerUneFois(body)
  if (r?.motif !== 'session_expiree') return r
  const { error } = await supabase.auth.refreshSession()
  return error ? r : appelerUneFois(body)
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
        .select('ghl_id, first_name, last_name, email, phone, address1:raw->>address1, city:raw->>city, state:raw->>state, postal_code:raw->>postalCode')
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
  // Mois affiché dans le calendrier ('AAAA-MM') ; on peut avancer jusqu'à 12 mois
  const moisCourant = jourDe(new Date().toISOString()).slice(0, 7)
  const [mois, setMois] = useState(moisCourant)
  const [calendrierOuvert, setCalendrierOuvert] = useState(false)
  const [jours, setJours] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [jour, setJour] = useState(null)
  const [creneau, setCreneau] = useState(null)
  const { isAdmin, isAdminOrRespVente, hasCloserRole } = useAuth()
  const terminalPermis = canUseTerminal({ isAdmin, isAdminOrRespVente, hasCloserRole })
  const [form, setForm] = useState({
    prenom: client?.first_name ?? '', nom: client?.last_name ?? '',
    telephone: client?.phone ?? '', courriel: client?.email ?? '',
    ...adresseDe(client),
    forfait: '', nbPaiements: '',
  })
  // Le terminal prérempli s'ouvre dès la confirmation (demande de Hugues)
  const [paiementOuvert, setPaiementOuvert] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  const [confirme, setConfirme] = useState(null)

  const typeChoisi = EVALUATION.types.find(t => t.cle === type)
  const set = cle => e => setForm(f => ({ ...f, [cle]: e.target.value }))

  const charger = useCallback(async () => {
    setChargement(true)
    setErreur(null)
    const r = await appeler({ action: 'slots', type, userId: membre || undefined, mois })
    if (r?.ok) {
      setJours(r.jours ?? [])
      setJour(j => (r.jours ?? []).some(x => x.jour === j) ? j : null)
    } else {
      setJours([])
      setErreur(MOTIFS[r?.motif] ?? 'Impossible de charger les disponibilités.')
    }
    setChargement(false)
  }, [type, membre, mois])

  useEffect(() => { setCreneau(null); charger() }, [charger])

  // Adresse complète exigée : le terminal de paiement la reprend
  const complet = creneau && form.prenom.trim() && form.nom.trim() && form.forfait && form.nbPaiements
    && (form.courriel.trim() || form.telephone.trim())
    && form.numero.trim() && form.rue.trim() && form.ville.trim() && form.codePostal.trim()

  async function confirmer() {
    if (!complet || envoi) return
    setEnvoi(true)
    setErreur(null)
    const r = await appeler({
      action: 'book', type, userId: membre || undefined, contactId: contactId || undefined, startTime: creneau,
      prenom: form.prenom, nom: form.nom, telephone: form.telephone, courriel: form.courriel,
      forfait: form.forfait, nbPaiements: form.nbPaiements,
      numero: form.numero, rue: form.rue, app: form.app, ville: form.ville, province: form.province, codePostal: form.codePostal,
    })
    setEnvoi(false)
    if (r?.ok) {
      setConfirme(r.rdv)
      onConfirme?.(r.rdv)
      return
    }
    setErreur(MOTIFS[r?.motif] ?? `Le rendez-vous n’a pas été créé${r?.detail ? ` : ${r.detail}` : '.'}`)
    if (r?.motif === 'creneau_pris') { setCreneau(null); setCalendrierOuvert(true); charger() }
  }

  const nomMembre = id => EVALUATION.membres.find(m => m.userId === id)?.nom

  // Terminal prérempli à partir du forfait, du nombre de paiements et de la date de l'évaluation
  const terminalPrerempli = confirme
    ? prefillTerminal({ forfait: form.forfait, nbPaiements: form.nbPaiements, dateEvaluation: confirme.startTime, client: form })
    : null

  return (
    <>
        {confirme ? (
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center text-center gap-3 px-4 sm:px-6 py-10">
            <div className="w-12 h-12 rounded-full bg-[#ecfdf5] flex items-center justify-center">
              <svg className="w-6 h-6 text-[#10b981]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            </div>
            <p className="text-lg font-black text-[#1a1a1a]">Rendez-vous confirmé</p>
            <p className="text-sm text-[#4b5563]">
              {typeChoisi.libelle}, {libelleJour(new Date(confirme.startTime).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })).long} à {fmtHeure(confirme.startTime)}
              {confirme.assignedUserId && nomMembre(confirme.assignedUserId) ? ` avec ${nomMembre(confirme.assignedUserId)}` : ''}.
            </p>
            <p className="text-xs text-[#9ca3af]">Le rendez-vous est dans GoHighLevel ; les confirmations partent comme d'habitude.</p>
            {terminalPrerempli && terminalPermis && !paiementOuvert && (
              <button onClick={() => setPaiementOuvert(true)} className="mt-2 px-5 py-2.5 rounded-lg bg-[#00bbb1] text-white text-sm font-semibold hover:bg-[#009e95]">
                Prendre le paiement
              </button>
            )}
            {terminalPrerempli && !terminalPermis && (
              <p className="text-xs text-[#9ca3af]">Le terminal de paiement n’est pas accessible pour ce compte.</p>
            )}
            <button onClick={onTermine}
              className={terminalPrerempli && terminalPermis && !paiementOuvert
                ? 'text-xs font-semibold text-[#6b7280] underline underline-offset-2'
                : 'mt-2 px-5 py-2.5 rounded-lg bg-[#00bbb1] text-white text-sm font-semibold hover:bg-[#009e95]'}>
              {libelleTermine}
            </button>
            {paiementOuvert && terminalPrerempli && terminalPermis && (
              <div className="w-full max-w-xl text-left mt-4">
                <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide mb-2">Paiement · prérempli depuis le rendez-vous</p>
                <TerminalPanel showHeader={false} seulementFormulaire prefill={terminalPrerempli} />
              </div>
            )}
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
                  <button onClick={() => setCalendrierOuvert(o => !o)} aria-expanded={calendrierOuvert}
                    className={`min-h-[48px] flex items-center justify-between gap-3 px-4 rounded-xl border-2 text-left ${creneau ? 'border-[#00bbb1] bg-[#00bbb1]/5' : 'border-[#e5e7eb] hover:border-[#00bbb1]/40'}`}>
                    <span className="flex items-center gap-2 min-w-0">
                      <svg className="w-5 h-5 text-[#00bbb1] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                      <span className={`text-sm font-semibold truncate ${creneau ? 'text-[#00897f]' : 'text-[#6b7280]'}`}>
                        {creneau ? `${libelleJour(jour).long} à ${fmtHeure(creneau)}` : 'Choisir la date et l’heure'}
                      </span>
                    </span>
                    <svg className={`w-4 h-4 text-[#6b7280] flex-shrink-0 transition-transform ${calendrierOuvert ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {calendrierOuvert && (
                    <div className="border border-[#e5e7eb] rounded-xl p-3">
                      <CalendrierCreneaux
                        mois={mois}
                        onMois={d => { setMois(m => moisSuivant(m, d)); setJour(null); setCreneau(null) }}
                        jours={jours}
                        chargement={chargement}
                        erreur={jours.length === 0 ? erreur : null}
                        peutReculer={mois > moisCourant}
                        peutAvancer={mois < moisSuivant(moisCourant, 12)}
                        jourChoisi={jour}
                        onJour={j => { setJour(j); setCreneau(null) }}
                        creneau={creneau}
                        onCreneau={c => { setCreneau(c); setCalendrierOuvert(false) }}
                      />
                    </div>
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
                        ...adresseDe(c),
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
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2.5fr)] gap-3">
                  <input className={champCls} value={form.numero} onChange={set('numero')} placeholder="N° civique" aria-label="Numéro civique" />
                  <input className={champCls} value={form.rue} onChange={set('rue')} placeholder="Rue" aria-label="Rue" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input className={champCls} value={form.app} onChange={set('app')} placeholder="App. (facultatif)" aria-label="Appartement" />
                  <input className={champCls} value={form.ville} onChange={set('ville')} placeholder="Ville" aria-label="Ville" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <select className={champCls} value={form.province} onChange={set('province')} aria-label="Province">
                    {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input className={champCls} value={form.codePostal} onChange={set('codePostal')} placeholder="Code postal" aria-label="Code postal" autoCapitalize="characters" />
                </div>
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
