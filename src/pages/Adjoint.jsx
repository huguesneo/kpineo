import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import File from '../components/adjoint/File'
import Dossier from '../components/adjoint/Dossier'
import FichePersonne from '../components/adjoint/FichePersonne'
import ListeTraites from '../components/adjoint/ListeTraites'
import TableCommandes from '../components/adjoint/TableCommandes'
import Recherche from '../components/adjoint/Recherche'
import PagePersonne from '../components/adjoint/PagePersonne'
import Bandeau from '../components/adjoint/Bandeau'
import { Carte, Chargement, Erreur, Icone, Puce, Vide } from '../components/adjoint/ui'
import { SECTIONS, sousSectionsDe } from '../../supabase/functions/_shared/adjoint.js'
import { appelAdjoint, signalerMaj } from '../lib/adjoint/api'
import { creerEnvoiDiffere } from '../lib/adjoint/envoiDiffere'
import { bilanLot, suivantApres } from '../lib/adjoint/actions'
import { useAdjointCompteurs } from '../hooks/useAdjointCompteurs'
import { useInboxNonTraites } from '../hooks/useInboxNonTraites'
import CourrielNonTraite from '../components/adjoint/CourrielNonTraite'
import { courrielsNonTraites, elementFileInbox, PREFIXE_INBOX } from '../../supabase/functions/_shared/gmailSync.js'
import { delaiAttente } from '../../supabase/functions/_shared/adjoint.js'

// Page Adjoint : ce que Léo soumet (file d'approbation), ce qui est déjà traité,
// ce qu'il fait seul, l'historique des commandes et la recherche par personne.
// Maquette : docs/maquettes/adjoint-v2.dc.html. Tout passe par l'edge function leo-adjoint.

const dateDuJour = () => {
  const t = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Montreal', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function Compteur({ valeur, label, alerte }) {
  return (
    <div className="bg-white border border-[#e6e8ec] rounded-[10px] px-4 py-2.5 min-w-[120px] flex-1 sm:flex-none">
      <p className={`m-0 text-[22px] font-extrabold ${alerte ? 'text-[#b42318]' : ''}`}>{valeur ?? '·'}</p>
      <p className="m-0 text-xs text-[#5b616e]">{label}</p>
    </div>
  )
}

const colonneCls = 'bg-white border border-[#e6e8ec] rounded-xl flex flex-col overflow-hidden lg:h-[calc(100vh-300px)] lg:min-h-[620px]'

export default function Adjoint() {
  const [params, setParams] = useSearchParams()
  const section = params.get('s') ?? 'tout'
  const sousSections = sousSectionsDe(section)
  const sous = params.get('v') ?? (section === 'autonome' ? 'aujourdhui' : 'a_traiter')
  const selection = params.get('id')
  const modeInitial = params.get('m')
  const personne = params.get('email') || params.get('client') ? { email: params.get('email'), client_id: params.get('client') } : null

  const { compteurs } = useAdjointCompteurs(true)
  const [version, setVersion] = useState(0)
  const [actions, setActions] = useState([]) // en attente ou en cours d'envoi
  const [erreurs, setErreurs] = useState([])
  const envoi = useRef(creerEnvoiDiffere())

  const naviguer = useCallback((maj, remplacer = false) => {
    setParams(prev => {
      const n = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(maj)) { if (v == null || v === '') n.delete(k); else n.set(k, v) }
      return n
    }, { replace: remplacer })
  }, [setParams])
  const choisir = useCallback((id, remplacer = false) => naviguer({ id, m: null }, remplacer), [naviguer])

  // ── File à traiter ─────────────────────────────────────────────────────────
  const [file, setFile] = useState({ dossiers: [], chargement: true, erreur: null })
  const [masques, setMasques] = useState(() => new Set())
  const vueFile = sous === 'a_traiter' && section !== 'reseaux_sociaux'
  // Courriels arrivés dans info@ que Léo n'a pas encore traités (temps réel), en tête de
  // la file Tout et Courriels, jamais en double avec un dossier de Léo
  const inbox = useInboxNonTraites(vueFile && (section === 'tout' || section === 'courriel'), () => setVersion(v => v + 1))
  const nonTraites = useMemo(() => courrielsNonTraites(inbox.messages, file.dossiers), [inbox.messages, file.dossiers])
  const fileVisible = useMemo(() => [
    ...(section === 'tout' || section === 'courriel' ? nonTraites.map(m => elementFileInbox(m, delaiAttente({ created_at: m.recu_le }))) : []),
    ...file.dossiers.filter(d => !masques.has(d.id)),
  ], [file.dossiers, masques, nonTraites, section])
  const courrielOuvert = selection?.startsWith(PREFIXE_INBOX)
    ? nonTraites.find(m => `${PREFIXE_INBOX}${m.gmail_message_id}` === selection) ?? null
    : null

  const chargerFile = useCallback(async () => {
    setFile(f => ({ ...f, chargement: true, erreur: null }))
    try {
      const r = await appelAdjoint('liste', { section, sousSection: 'a_traiter' })
      setFile({ dossiers: r.dossiers, chargement: false, erreur: null })
    } catch (e) {
      setFile({ dossiers: [], chargement: false, erreur: e.message })
    }
  }, [section])
  useEffect(() => { if (vueFile) chargerFile() }, [vueFile, chargerFile, version])

  // Premier dossier de la file ouvert d'office
  useEffect(() => {
    if (vueFile && !selection && fileVisible.length) choisir(fileVisible[0].id, true)
  }, [vueFile, selection, fileVisible, choisir])

  // ── Dossier ouvert ─────────────────────────────────────────────────────────
  const [ouvert, setOuvert] = useState({ id: null, donnees: null, chargement: false, erreur: null })
  const [rechargeDossier, setRechargeDossier] = useState(0)
  useEffect(() => {
    if (selection?.startsWith(PREFIXE_INBOX)) { setOuvert({ id: null, donnees: null, chargement: false, erreur: null }); return undefined }
    if (!selection) { setOuvert({ id: null, donnees: null, chargement: false, erreur: null }); return undefined }
    let actif = true
    setOuvert(o => ({ ...o, id: selection, chargement: true, erreur: null }))
    appelAdjoint('dossier', { id: selection })
      .then(r => actif && setOuvert({ id: selection, donnees: r, chargement: false, erreur: null }))
      .catch(e => actif && setOuvert({ id: selection, donnees: null, chargement: false, erreur: e.message }))
    return () => { actif = false }
  }, [selection, rechargeDossier])

  // ── Décision : 6 secondes pour annuler, puis l'edge function ─────────────
  // Une file d'actions : chacune part à la fin de SES 6 secondes, même si Cloé change de
  // dossier ou en décide un autre. Quitter la page avec une action en attente : avertissement,
  // puis envoi immédiat si elle quitte quand même.
  useEffect(() => {
    const e = envoi.current
    const avantDeQuitter = (ev) => { if (e.enAttente) { ev.preventDefault(); ev.returnValue = '' } }
    const enQuittant = () => e.vider()
    window.addEventListener('beforeunload', avantDeQuitter)
    window.addEventListener('pagehide', enQuittant)
    return () => { window.removeEventListener('beforeunload', avantDeQuitter); window.removeEventListener('pagehide', enQuittant); e.vider() }
  }, [])

  const ajouterErreur = useCallback((texte) => setErreurs(l => [...l, { cle: `${Date.now()}-${Math.random()}`, texte }]), [])
  const finAction = useCallback((cle) => setActions(l => l.filter(x => x.cle !== cle)), [])
  const masquer = useCallback((ids, oui) => setMasques(m => {
    const n = new Set(m)
    for (const id of ids) { if (oui) n.add(id); else n.delete(id) }
    return n
  }), [])

  // Une action (un dossier ou une sélection) : retirée de la file tout de suite, envoyée
  // après 6 s. Pas de toast de succès : le bandeau se vide. Toute erreur reste en rouge.
  const programmer = useCallback(({ ids, appel, texte, surResultat, rouvrir }) => {
    const cle = `${Date.now()}-${ids.join(',')}`
    const dansFile = ids.filter(id => fileVisible.some(d => d.id === id))
    let annuler
    try {
      annuler = envoi.current.programmer({
        executer: async () => {
          setActions(l => l.map(x => (x.cle === cle ? { ...x, annulable: false } : x)))
          const r = await appel()
          // Jamais de succès silencieux : la fonction doit confirmer ce qu'elle a écrit
          if (!r?.ok) throw new Error(r?.error ?? 'Le hub n’a pas confirmé l’enregistrement. Rien n’a changé.')
          return r
        },
        surSucces: (r) => {
          const { aReafficher = [], erreurs: e = [] } = surResultat(r) ?? {}
          e.forEach(ajouterErreur)
          finAction(cle)
          signalerMaj()
          setVersion(v => v + 1)
          // Les dossiers fermés restent masqués jusqu'au rechargement de la file
          masquer(aReafficher, false)
          if (!dansFile.length) setRechargeDossier(n => n + 1)
        },
        surErreur: (e) => {
          masquer(ids, false)
          finAction(cle)
          ajouterErreur(`${texte} : échec. ${e.message}`)
          setVersion(v => v + 1)
          setRechargeDossier(n => n + 1)
        },
        surAnnulation: () => {
          masquer(ids, false)
          finAction(cle)
          if (rouvrir) choisir(rouvrir)
        },
      })
    } catch (e) {
      ajouterErreur(`${texte} : l’action n’a pas pu être programmée (${e.message}). Rien n’a été enregistré.`)
      return false
    }
    if (dansFile.length) {
      masquer(dansFile, true)
      const suivant = suivantApres(fileVisible, dansFile, selection)
      if (suivant !== selection) choisir(suivant)
    }
    setActions(l => [...l, { cle, annulable: true, annuler: () => annuler() }])
    return true
  }, [fileVisible, selection, choisir, masquer, ajouterErreur, finAction])

  const decider = useCallback((args, { toast: texte }) => {
    const id = selection
    if (!id) return
    programmer({
      ids: [id],
      texte,
      rouvrir: id,
      appel: () => appelAdjoint('decider', { id, ...args }),
      surResultat: (r) => ({ erreurs: r?.gmail?.erreur ? [`${texte}, mais non archivé dans Gmail : ouvre le dossier pour réessayer`] : [] }),
    })
  }, [selection, programmer])

  // Sélection multiple : une seule action groupée, annulable pendant 6 s
  const [coches, setCoches] = useState(() => new Set())
  useEffect(() => { setCoches(new Set()) }, [section, sous])
  const deciderSelection = useCallback((action) => {
    const ids = [...coches].filter(id => fileVisible.some(d => d.id === id && !d.inbox))
    if (!ids.length) return
    const texte = action === 'rejeter' ? `Rejet de ${ids.length} dossiers` : `${ids.length} dossiers déjà traités`
    const ok = programmer({
      ids,
      texte,
      appel: async () => {
        const r = await appelAdjoint('deciderLot', { ids, action })
        const b = bilanLot(r, action, ids.length)
        if (b.echecs === null) throw new Error(b.erreurs[0])
        return r
      },
      surResultat: (r) => {
        const b = bilanLot(r, action, ids.length)
        return { aReafficher: b.echecs, erreurs: b.erreurs }
      },
    })
    if (ok) setCoches(new Set())
  }, [coches, fileVisible, programmer])

  // ── Rendu ──────────────────────────────────────────────────────────────────
  const d = ouvert.donnees
  const colonnesDossier = (
    <>
      <section aria-label="Dossier" className={`${colonneCls} flex-[999_1_420px] min-w-0`}>
        {ouvert.chargement && !d && <Chargement />}
        {ouvert.erreur && <Erreur onReessayer={() => setRechargeDossier(n => n + 1)}>{ouvert.erreur}</Erreur>}
        {courrielOuvert && (
          <CourrielNonTraite
            m={courrielOuvert}
            onOuvrirDossier={(id, mode) => { naviguer({ id, m: mode }); setVersion(v => v + 1) }}
          />
        )}
        {selection?.startsWith(PREFIXE_INBOX) && !courrielOuvert && (
          <div className="flex-1 flex items-center justify-center p-10 text-center">
            <p className="m-0 text-[15px] text-[#5b616e]">Ce courriel n’est plus dans la file : Léo ou quelqu’un d’autre l’a traité.</p>
          </div>
        )}
        {d && !selection?.startsWith(PREFIXE_INBOX) && <Dossier modeInitial={modeInitial} d={d.dossier} fiche={d.fiche} onDecider={decider} occupe={ouvert.chargement} onRecharger={() => { setRechargeDossier(n => n + 1); setVersion(v => v + 1) }} />}
        {!selection && !ouvert.chargement && (
          <div className="flex-1 flex items-center justify-center p-10 text-center">
            <p className="m-0 text-[15px] text-[#5b616e]">{vueFile ? "File vide. Léo n'a rien d'autre à te soumettre." : 'Choisis un dossier dans la liste.'}</p>
          </div>
        )}
      </section>
      <section aria-label="Fiche de la personne" className={`${colonneCls} flex-[1_1_260px] lg:max-w-[320px]`}>
        {d && (
          <FichePersonne
            fiche={d.fiche}
            nomSecours={d.dossier.resume?.nom}
            ligneDuTemps={d.ligneDuTemps}
            actif={selection}
            onOuvrir={(id) => choisir(id)}
            onOuvrirPersonne={() => naviguer({ email: d.fiche.courriel, client: d.fiche.clientId, id: null })}
          />
        )}
      </section>
    </>
  )

  let contenu
  if (personne) {
    contenu = (
      <PagePersonne
        cible={personne}
        onRetour={() => naviguer({ email: null, client: null })}
        onOuvrirDossier={(id) => naviguer({ email: null, client: null, id })}
      />
    )
  } else if (section === 'reseaux_sociaux') {
    contenu = <Carte><Vide>Bientôt : Léo traitera aussi Instagram et Facebook ici.</Vide></Carte>
  } else if (section === 'commande' && sous === 'historique_commandes') {
    contenu = selection
      ? (
        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => choisir(null)} className="self-start inline-flex items-center gap-2 text-[13px] font-bold text-[#00857e]">
            <Icone nom="retour" taille={16} />Toutes les commandes
          </button>
          <div className="flex flex-wrap gap-4">{colonnesDossier}</div>
        </div>
      )
      : <TableCommandes onOuvrir={(id) => choisir(id)} version={version} />
  } else {
    contenu = (
      <div className="flex flex-wrap gap-4">
        <section aria-label="Liste" className={`${colonneCls} flex-[1_1_300px] lg:max-w-[360px] max-h-[480px] lg:max-h-none`}>
          {vueFile ? (
            <div className="flex-1 overflow-y-auto">
              {file.erreur && <Erreur onReessayer={chargerFile}>{file.erreur}</Erreur>}
              {file.chargement && !file.dossiers.length ? <Chargement /> : !file.erreur && <File dossiers={fileVisible} selection={selection} onChoisir={choisir} coches={coches} onCocher={setCoches} onDeciderSelection={deciderSelection} />}
            </div>
          ) : (
            <ListeTraites section={section} sousSection={sous} selection={selection} onChoisir={choisir} version={version} />
          )}
        </section>
        {colonnesDossier}
      </div>
    )
  }

  const parCanal = compteurs?.parCanal ?? {}
  const compteSection = (s) => (s.autonome ? null : s.canaux ? s.canaux.reduce((n, c) => n + (parCanal[c] ?? 0), 0) : compteurs?.aTraiter)
  const sousOnglets = section === 'commande' ? [...sousSections, { cle: 'historique_commandes', label: 'Historique des commandes' }] : sousSections

  return (
    <Layout>
      <div className="font-['Montserrat',system-ui,sans-serif] text-[#16181d] flex flex-col gap-4">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="m-0 text-2xl font-extrabold">Adjoint</h1>
            <p className="m-0 mt-1 text-[13px] text-[#5b616e]">{dateDuJour()} · ce que Léo te soumet et ce qu’il a fait seul</p>
          </div>
          <div className="flex flex-wrap gap-3 w-full sm:w-auto">
            <Compteur valeur={compteurs?.aTraiter} label="à traiter" />
            <Compteur valeur={compteurs?.plusDe24h} label="plus de 24 h" alerte={compteurs?.plusDe24h > 0} />
            <Compteur valeur={compteurs?.traitesAujourdhui} label="traités aujourd’hui" />
            <Compteur valeur={compteurs?.faitsSeulsAujourdhui} label="faits seuls par Léo" />
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-3 justify-between">
          <nav aria-label="Sections" className="flex flex-wrap gap-1.5">
            {SECTIONS.map(s => (
              <Puce
                key={s.cle}
                actif={!personne && section === s.cle}
                desactive={s.bientot}
                compte={compteSection(s)}
                onClick={() => naviguer({ s: s.cle, v: null, id: null, email: null, client: null })}
              >
                {s.label}{s.bientot ? ' · bientôt' : ''}
              </Puce>
            ))}
          </nav>
          <Recherche
            onPersonne={(p) => naviguer({ email: p.email, client: p.client_id, id: null })}
            onDossier={(id) => naviguer({ s: 'commande', v: 'historique_commandes', id, email: null, client: null })}
          />
        </div>

        {!personne && section !== 'reseaux_sociaux' && (
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Sous-sections">
            {sousOnglets.map(o => (
              <button
                key={o.cle}
                type="button"
                role="tab"
                aria-selected={sous === o.cle}
                onClick={() => naviguer({ v: o.cle, id: null })}
                className={`px-3 py-1.5 text-[13px] font-bold rounded-lg ${sous === o.cle ? 'bg-[#e3f6f4] text-[#00665f]' : 'text-[#5b616e] hover:bg-white'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        {contenu}
      </div>
      <Bandeau actions={actions} erreurs={erreurs} onFermerErreur={(cle) => setErreurs(l => l.filter(x => x.cle !== cle))} />
    </Layout>
  )
}
