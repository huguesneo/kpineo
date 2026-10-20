import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EnteteEspace from '../../components/v2/EnteteEspace'
import Replie from '../../components/v2/Replie'
import BandeauJour from '../../components/v2/setter/BandeauJour'
import FileLeads from '../../components/v2/setter/FileLeads'
import FiltresAConfirmer from '../../components/v2/setter/FiltresAConfirmer'
import ModalPriseRdv from '../../components/v2/setter/ModalPriseRdv'
import FicheLead from '../../components/v2/setter/FicheLead'
import FilePriorite from '../../components/v2/setter/FilePriorite'
import { MesRappels, MesTaches, PanneauAdminSetting } from '../../components/v2/setter/SettingSections'
import { useSettingV2 } from '../../hooks/v2/useSettingV2'
import { leadFictif } from '../../components/v2/demo/demoFictif'
import { useSettingTaches } from '../../hooks/v2/useSettingTaches'
import { prioriserLeads, prioriserNouveaux, repartirLeads, sortiDesListes, ajouterEvenement } from '../../lib/v2/settingV2'
import { PIPELINE_VENTE } from '../../lib/v2/salesConfig'
import SetterDashboardView from '../../components/closer/SetterDashboardView'
import SetterEODForm from '../../components/eod/SetterEODForm'
import { useLeadLocks } from '../../hooks/v2/useLeadLocks'
import { useSetterDayStats } from '../../hooks/v2/useSetterDayStats'
import { useSetterActions } from '../../hooks/v2/useSetterActions'
import { useConfirmation } from '../../hooks/v2/useConfirmation'
import { useAppelsRecents } from '../../hooks/v2/useAppelsRecents'
import { usePayPeriodConfig, getCurrentPayPeriod } from '../../hooks/usePayPeriod'
import { rdvBookesAujourdhui, jourMontreal, aConfirmerAFaire, completerLead } from '../../lib/v2/setterFiles'
import { enrichirAConfirmer, filtrerAConfirmer, FILTRES_DEFAUT } from '../../lib/v2/confirmation'
import { fmtCAD, fmtRdvRelatif } from '../../lib/v2/format'

function sansEmoji(s) {
  return String(s ?? '').replace(/^[^\p{L}\p{N}]+/u, '').trim()
}

// Les files : nouveaux leads (🔥 chauds en tête), leads à rappeler, rebookings,
// confirmations, puis « Contact établi » (repliable). Tri par défaut : âge,
// du plus vieux au plus jeune ; Âge et Tentatives se cliquent.
// Setting v2 : « Nouveaux leads » et « Leads à rappeler » sont affichés par
// les listes à priorité (FilePriorite) ; les autres files restent les mêmes.
const FILES_PRIORITE = ['nouveauxLeads', 'aRappeler']
const FILES = [
  {
    cle: 'nouveauxLeads', titre: 'Nouveaux leads', sousTitre: '🔥 Chauds à relancer en tête, puis les nouveaux leads',
    couleur: '#6366f1', compteurBg: 'rgba(99,102,241,0.1)', compteurColor: '#4f46e5', rdvLabel: 'Statut',
    videTitre: 'File vide', videTexte: 'Aucun nouveau lead pour le moment.',
    rdv: l => ({ texte: l.chaud ? 'Chaud à relancer' : 'Nouveau', couleur: l.chaud ? '#c2410c' : '#1a1a1a' }),
  },
  {
    cle: 'aRappeler', titre: 'Leads à rappeler', sousTitre: '1 à 4 tentatives faites',
    couleur: '#8b5cf6', compteurBg: '#f5f3ff', compteurColor: '#6d28d9', rdvLabel: 'Statut',
    videTitre: 'Aucun rappel', videTexte: 'Personne à rappeler pour le moment.',
    rdv: l => ({
      texte: l.tentative >= 5 ? 'Dernière tentative' : sansEmoji(l.etape) || '—',
      couleur: l.tentative >= 4 ? '#b45309' : '#1a1a1a',
    }),
  },
  {
    cle: 'aRebooker', titre: 'À rebooker', sousTitre: 'No-shows et annulations des 72 dernières heures',
    couleur: '#ef4444', compteurBg: '#fef2f2', compteurColor: '#b91c1c', rdvLabel: 'RDV manqué',
    videTitre: 'Aucun rebooking en attente', videTexte: 'Tous les no-shows des 72 dernières heures ont un nouveau RDV.',
    rdv: (l, now) => ({
      texte: `${l.rdvRef?.status === 'noshow' ? 'No-show' : 'Annulé'} ${fmtRdvRelatif(l.rdvRef?.start, now).replace(/^Auj\. /, 'auj. ').replace(/^Hier /, 'hier ')}`,
      couleur: '#dc2626',
    }),
  },
  {
    cle: 'aConfirmer', titre: 'À confirmer', sousTitre: 'Étape ✅ Lead rencontre book, par heure du RDV',
    couleur: '#f59e0b', compteurBg: '#fffbeb', compteurColor: '#b45309', rdvLabel: 'RDV',
    videTitre: 'Aucun lead booké', videTexte: 'Aucune carte à l’étape « ✅ Lead rencontre book ».',
    triInitial: null, // par heure du RDV
    confirmation: true, // colonnes Confirmation, Appel, Setter ; « Confirmer la rencontre »
    rdv: (l, now) => (l.rdvAVenir
      ? { texte: fmtRdvRelatif(l.rdvRef?.start, now), couleur: '#1a1a1a' }
      : { texte: l.rdvRef ? `Passé · ${fmtRdvRelatif(l.rdvRef.start, now)}` : 'Aucun RDV à venir', couleur: '#9ca3af' }),
  },
  {
    cle: 'contactEtabli', titre: 'Contact établi', sousTitre: 'Étape 💬 Contact établi',
    couleur: '#0ea5e9', compteurBg: '#f0f9ff', compteurColor: '#0369a1', rdvLabel: 'Dernier changement',
    videTitre: 'Aucun contact établi en attente', videTexte: 'Personne à relancer à cette étape.',
    repliable: true,
    rdv: (l, now) => ({ texte: l.changementEtape ? fmtRdvRelatif(l.changementEtape, now) : '—', couleur: '#1a1a1a' }),
  },
]

const IconeDollar = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
const IconeRapport = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

// Écran setter « Ma journée » (maquette 01). Rendu dans MonEspace, qui fournit
// le Layout, le commutateur de mode (`droite`) et les files (useSetterFiles),
// chargées là-haut pour alimenter aussi le compteur du commutateur.
export default function SetterJournee({ profile, droite = null, setterFiles, onCompteur, demoActive = false, demoFiche = null, onLeadExemple, onRevoirDemo }) {
  const { files, raw, loading, error, refetch } = setterFiles
  const { locks, lock, unlock } = useLeadLocks(profile?.id)
  const stats = useSetterDayStats(profile)
  const actionsBase = useSetterActions({ profile, lock, unlock })
  const setting = useSettingV2({ userId: profile?.id })
  const tachesSetting = useSettingTaches(profile?.id)
  const estAdmin = profile?.role === 'admin'
  const superviseur = estAdmin || profile?.role === 'resp_vente'

  // Fiche pop-up du lead (clic sur le nom, une tâche ou une notification)
  const [ficheLead, setFicheLead] = useState(null)
  const [params, setParams] = useSearchParams()
  // Toutes les cartes connues, pour retrouver celle d'une fiche ouverte depuis une tâche
  const leadsConnus = useMemo(
    () => [...files.nouveauxLeads, ...files.aRappeler, ...files.contactEtabli, ...files.aRebooker, ...files.aConfirmer],
    [files],
  )
  const ouvrirLead = useCallback(lead => {
    setFicheLead(completerLead(lead, { leads: leadsConnus, opps: raw.opps }))
    lock?.(lead.contactId)
  }, [lock, leadsConnus, raw.opps])
  const fermerFiche = useCallback(() => {
    setFicheLead(null)
    if (params.get('fiche')) { const p = new URLSearchParams(params); p.delete('fiche'); setParams(p, { replace: true }) }
  }, [params, setParams])
  const actions = useMemo(() => ({
    ...actionsBase,
    ouvrirLead,
    onResultat: () => { setting.refetch() },
  }), [actionsBase, ouvrirLead, setting])

  // Horloge : âges, « pris depuis X min »
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(iv)
  }, [])

  // ── Listes Setting v2 : propriété (règle des 60 s), tri en 4 groupes ──
  const ctxPriorite = useMemo(() => ({
    appelsParContact: setting.appelsParContact, rappelsParContact: setting.rappelsParContact,
    nomsParId: setting.nomsParId, now,
  }), [setting, now])
  const repartition = useMemo(() => {
    // Hors listes : lead sorti par un résultat, passé en rencontre découverte ou
    // avec une carte Vente, sauf s'il est revenu depuis (sa carte setting a
    // changé d'étape après : lead magnet, carte remise à « Nouveau lead »)
    const evenements = new Map(setting.evenementsSortie)
    for (const o of raw.opps) if (o.pipeline_id === PIPELINE_VENTE.id) ajouterEvenement(evenements, o.contact_id, o.created_at_ghl)
    const garder = leads => leads.filter(l => !sortiDesListes(l, evenements))
    const opts = { proprietes: setting.proprietes, userId: profile?.id, estAdmin: superviseur }
    // Nouveaux leads (jamais contactés) et leads à rappeler (déjà tentés sans
    // succès) restent deux listes séparées, comme les étapes du pipeline.
    const n = repartirLeads(garder(files.nouveauxLeads), opts)
    const r = repartirLeads(garder(files.aRappeler), opts)
    // Un lead « Contact établi » assigné au setter va dans « Mes leads »
    const ce = repartirLeads(garder(files.contactEtabli), opts)
    return {
      mesLeads: prioriserLeads([...n.miens, ...r.miens, ...ce.miens], ctxPriorite),
      nouveaux: prioriserNouveaux(n.communs, ctxPriorite),
      aRappeler: prioriserLeads(r.communs, ctxPriorite),
      assignes: prioriserLeads([...n.assignes, ...r.assignes, ...ce.assignes], ctxPriorite),
      contactEtabli: ce.communs,
    }
  }, [files.nouveauxLeads, files.aRappeler, files.contactEtabli, raw.opps, setting, profile?.id, superviseur, ctxPriorite])
  // Les autres files : sans les leads d'un autre setter ni ceux sortis par un résultat
  const resultats = useMemo(() => {
    const m = new Map()
    for (const t of setting.traites) ajouterEvenement(m, t.contact_id, t.cree_le)
    return m
  }, [setting.traites])
  const filtrerAutres = useCallback(leads => leads.filter(l => {
    if (sortiDesListes(l, resultats)) return false
    const p = setting.proprietes.get(l.contactId)
    return !p || p.user_id === profile?.id || superviseur
  }), [setting, resultats, profile?.id, superviseur])

  // Démo guidée de la mise à jour (proposée à la connexion tant qu'elle n'est pas vue)
  // Démo guidée (pilotée par MonEspace) : premier lead visible comme exemple de
  // fiche ; une liste vide reçoit un lead fictif « (démo) » le temps de la démo
  const premierLead = repartition.mesLeads[0] ?? repartition.aRappeler[0] ?? repartition.nouveaux[0] ?? null
  useEffect(() => { onLeadExemple?.(premierLead) }, [premierLead, onLeadExemple])
  const listes = useMemo(() => {
    if (!demoActive) return repartition
    return {
      ...repartition,
      aRappeler: repartition.aRappeler.length ? repartition.aRappeler : prioriserLeads([leadFictif(profile?.id, now)], ctxPriorite),
      nouveaux: repartition.nouveaux.length ? repartition.nouveaux : prioriserNouveaux([leadFictif(profile?.id, now, { variante: 'nouveau' })], ctxPriorite),
    }
  }, [demoActive, repartition, profile?.id, now, ctxPriorite])

  // Ouverture depuis une notification : /mon-espace-v2?fiche=<contactId>
  useEffect(() => {
    const id = params.get('fiche')
    if (!id || ficheLead?.contactId === id) return
    setFicheLead(completerLead({ contactId: id, key: id, nom: 'Lead', opportunityId: null }, { leads: leadsConnus, opps: raw.opps }))
  }, [params, leadsConnus, raw.opps, ficheLead?.contactId])

  const rdvBookes = useMemo(
    () => rdvBookesAujourdhui({ appts: raw.appts, opps: raw.opps, setterName: profile?.full_name, now }),
    [raw, profile?.full_name, now],
  )

  // File « À confirmer » : état affiché (clic récent), appels depuis la réservation, filtres
  const aConfirmerSource = files.aConfirmer
  const confirmation = useConfirmation({ appointmentIds: aConfirmerSource.map(l => l.rdvRef?.ghlId) })
  const depuisAppels = useMemo(() => {
    const dates = aConfirmerSource.map(l => l.rdvRef?.dateAjout ?? l.changementEtape).filter(Boolean).map(d => new Date(d).getTime())
    return dates.length ? new Date(Math.min(...dates)).toISOString() : null
  }, [aConfirmerSource])
  const { appels, erreur: appelsErreur } = useAppelsRecents({ contactIds: aConfirmerSource.map(l => l.contactId), depuis: depuisAppels })
  const [filtres, setFiltres] = useState(FILTRES_DEFAUT)
  const aConfirmer = useMemo(
    () => enrichirAConfirmer(aConfirmerSource, { locaux: confirmation.locaux, appels: appelsErreur ? null : appels, now }),
    [aConfirmerSource, confirmation.locaux, appels, appelsErreur, now],
  )
  const aConfirmerFiltres = useMemo(() => filtrerAConfirmer(aConfirmer, filtres), [aConfirmer, filtres])
  const filtresActifs = filtres.confirmation !== 'tous' || filtres.appel !== 'tous'
  const nbAConfirmer = aConfirmerAFaire(aConfirmer).length

  const enAttente = FILES.filter(f => !FILES_PRIORITE.includes(f.cle)).reduce((n, f) => n + (f.cle === 'aConfirmer'
    ? nbAConfirmer
    : f.cle === 'contactEtabli' ? repartition.contactEtabli.length
      : filtrerAutres(files[f.cle]).filter(l => !actions.etats[l.key]).length), 0)
    + [...repartition.mesLeads, ...repartition.nouveaux, ...repartition.aRappeler].filter(l => l.groupe !== 4).length
  useEffect(() => { onCompteur?.(enAttente) }, [enAttente, onCompteur])

  const today = jourMontreal(new Date(now))
  const monthStart = `${today.slice(0, 7)}-01`
  const [periodType, setPeriodType] = useState('month')
  const [customStart, setCustomStart] = useState(monthStart)
  const [customEnd, setCustomEnd] = useState(today)
  // Même logique de période que la page Setter existante
  const { config: payConfig } = usePayPeriodConfig()
  const payPeriod = payConfig ? getCurrentPayPeriod(payConfig.reference_pay_date, payConfig.period_length_days) : null
  const startDate = periodType === 'paie' ? (payPeriod?.start || monthStart)
    : periodType === 'month' ? monthStart : (customStart || monthStart)
  const endDate = periodType === 'paie' ? (payPeriod?.end || today)
    : periodType === 'month' ? today : (customEnd || today)

  return (
    <div>
      <EnteteEspace profile={profile} droite={droite} />



      <BandeauJour stats={stats} rdvBookes={rdvBookes} aConfirmer={nbAConfirmer} nouveaux={files.nouveauxLeads} />

      <FicheLead lead={ficheLead ?? demoFiche} userId={profile?.id} estAdmin={superviseur} setting={setting}
        onClose={fermerFiche} onRdv={l => actions.prendreRdv(l)} onResultat={actions.onResultat} />
      {/* Après la fiche : la prise de rendez-vous s'ouvre par-dessus */}
      <ModalPriseRdv lead={actions.rdvEnCours} cleSetter={actions.cleSetter} onClose={actions.fermerRdv} />

      {!actions.cleSetter && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] text-sm text-[#92400e]">
          Ton prénom n'est pas dans la liste des setters du Centre de vente : à la prise de rendez-vous,
          il faudra choisir à qui l'attribuer. Demande à un admin de t'ajouter à la liste.
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] text-sm text-[#b91c1c]">
          Impossible de charger les files : {error}
          <button onClick={refetch} className="ml-3 font-semibold underline">Réessayer</button>
        </div>
      )}

      {setting.error && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] text-sm text-[#92400e]">
          Setting v2 indisponible (journal d’appels, rappels) : {setting.error}
        </div>
      )}

      <div className="flex flex-col gap-5">
        {estAdmin && <PanneauAdminSetting ecrituresReelles={setting.ecrituresReelles} onChange={setting.refetch} />}

        {(tachesSetting.duJour.length > 0 || tachesSetting.taches.some(t => !t.user_id)) && (
          <MesTaches taches={tachesSetting.duJour} userId={profile?.id} now={now}
            onOuvrir={ouvrirLead} onFaite={tachesSetting.marquerFaite} />
        )}

        <MesRappels rappels={setting.mesRappels} now={now} onOuvrir={ouvrirLead} />

        {loading ? (
          <div className="h-32 bg-white border border-[#e5e7eb] rounded-xl animate-pulse" />
        ) : (
          <>
            <FilePriorite
              titre="Mes leads" couleur="#6d28d9" tour="mes-leads"
              sousTitre="Leads qui t’appartiennent (appel de 60 s ou plus, ou rappel) : rappels dus, nouveaux, prêts, en attente"
              leads={listes.mesLeads} now={now} userId={profile?.id} locks={locks} nomsParId={setting.nomsParId}
              onOuvrir={ouvrirLead} onRdv={actions.prendreRdv} onResultat={actions.onResultat} onFicheGhl={actions.ouvrirFiche}
              videTexte="Aucun lead à toi pour l’instant. Un appel de 60 s ou plus avec un lead te le donne." />
            <FilePriorite
              titre="Nouveaux leads" couleur="#6366f1" colonneOptin tour="nouveaux"
              sousTitre="Jamais contactés : 🔥 chauds en tête, puis du plus ancien au plus récent"
              leads={listes.nouveaux} now={now} userId={profile?.id} locks={locks} nomsParId={setting.nomsParId}
              onOuvrir={ouvrirLead} onRdv={actions.prendreRdv} onResultat={actions.onResultat} onFicheGhl={actions.ouvrirFiche}
              videTexte="Aucun nouveau lead pour le moment." />
            <FilePriorite
              titre="Leads à rappeler" couleur="#8b5cf6" tour="a-rappeler"
              sousTitre="Déjà tentés sans succès : prêts à rappeler (24 h après la dernière tentative), puis en attente"
              leads={listes.aRappeler} now={now} userId={profile?.id} locks={locks} nomsParId={setting.nomsParId}
              onOuvrir={ouvrirLead} onRdv={actions.prendreRdv} onResultat={actions.onResultat} onFicheGhl={actions.ouvrirFiche}
              videTexte="Personne à rappeler pour le moment." />
            {superviseur && repartition.assignes.length > 0 && (
              <FilePriorite
                titre="Leads assignés aux setters" couleur="#9ca3af" montrerProprio
                sousTitre="Vue admin : leads qui ne sont plus dans la liste commune (réassigner depuis la fiche)"
                leads={repartition.assignes} now={now} userId={profile?.id} locks={locks} nomsParId={setting.nomsParId}
                onOuvrir={ouvrirLead} onRdv={actions.prendreRdv} onResultat={actions.onResultat} onFicheGhl={actions.ouvrirFiche}
                videTexte="" />
            )}
          </>
        )}

        {loading
          ? FILES.filter(f => !FILES_PRIORITE.includes(f.cle)).map(f => <div key={f.cle} className="h-32 bg-white border border-[#e5e7eb] rounded-xl animate-pulse" />)
          : FILES.filter(f => !FILES_PRIORITE.includes(f.cle)).map(f => (f.confirmation ? (
            <FileLeads key={f.cle}
              file={filtresActifs ? { ...f, videTitre: 'Aucun lead pour ces filtres', videTexte: 'Change les filtres pour voir les autres leads bookés.' } : f}
              leads={aConfirmerFiltres} userId={profile?.id} locks={locks} actions={actions} now={now}
              confirmation={{ ...confirmation, appelsErreur }} compteur={nbAConfirmer}
              barre={aConfirmer.length > 0 && (
                <FiltresAConfirmer filtres={filtres} onChange={setFiltres} appelsIndisponibles={appelsErreur} />
              )} />
          ) : (
            <FileLeads key={f.cle} file={f}
              leads={f.cle === 'contactEtabli' ? repartition.contactEtabli : filtrerAutres(files[f.cle])} userId={profile?.id}
              locks={locks} actions={actions} now={now} />
          )))}

        <div className="text-center">
          <button onClick={() => onRevoirDemo?.()} className="text-xs font-semibold text-[#00bbb1] hover:underline">
            ▶ Revoir la démo des nouveautés
          </button>
        </div>

        <div className="flex flex-col gap-2 mt-1">
          <Replie
            icone={IconeDollar}
            titre="Mes commissions du mois"
            extra={<span className="text-[13px] font-bold text-[#6366f1] ml-1">{stats.commissionLoading ? '…' : fmtCAD(stats.commission)}</span>}
          >
            <SetterDashboardView
              setterProfile={profile}
              isAdmin={false}
              startDate={startDate}
              endDate={endDate}
              periodType={periodType}
              onSetPeriod={setPeriodType}
              customStart={customStart}
              onCustomStart={setCustomStart}
              customEnd={customEnd}
              onCustomEnd={setCustomEnd}
              payPeriodLabel={null}
            />
          </Replie>
          <Replie icone={IconeRapport} titre="Rapport End of Day">
            <SetterEODForm userId={profile?.id} />
          </Replie>
        </div>
      </div>
    </div>
  )
}
