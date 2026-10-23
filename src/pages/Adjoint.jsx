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
import Toast from '../components/adjoint/Toast'
import { Carte, Chargement, Erreur, Icone, Puce, Vide } from '../components/adjoint/ui'
import { SECTIONS, sousSectionsDe } from '../../supabase/functions/_shared/adjoint.js'
import { appelAdjoint, signalerMaj } from '../lib/adjoint/api'
import { creerEnvoiDiffere } from '../lib/adjoint/envoiDiffere'
import { useAdjointCompteurs } from '../hooks/useAdjointCompteurs'

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
  const personne = params.get('email') || params.get('client') ? { email: params.get('email'), client_id: params.get('client') } : null

  const { compteurs } = useAdjointCompteurs(true)
  const [version, setVersion] = useState(0)
  const [toast, setToast] = useState(null)
  const envoi = useRef(creerEnvoiDiffere())

  const naviguer = useCallback((maj, remplacer = false) => {
    setParams(prev => {
      const n = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(maj)) { if (v == null || v === '') n.delete(k); else n.set(k, v) }
      return n
    }, { replace: remplacer })
  }, [setParams])
  const choisir = useCallback((id, remplacer = false) => naviguer({ id }, remplacer), [naviguer])

  // ── File à traiter ─────────────────────────────────────────────────────────
  const [file, setFile] = useState({ dossiers: [], chargement: true, erreur: null })
  const [masques, setMasques] = useState(() => new Set())
  const fileVisible = useMemo(() => file.dossiers.filter(d => !masques.has(d.id)), [file.dossiers, masques])
  const vueFile = sous === 'a_traiter' && section !== 'reseaux_sociaux'

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
    if (!selection) { setOuvert({ id: null, donnees: null, chargement: false, erreur: null }); return undefined }
    let actif = true
    setOuvert(o => ({ ...o, id: selection, chargement: true, erreur: null }))
    appelAdjoint('dossier', { id: selection })
      .then(r => actif && setOuvert({ id: selection, donnees: r, chargement: false, erreur: null }))
      .catch(e => actif && setOuvert({ id: selection, donnees: null, chargement: false, erreur: e.message }))
    return () => { actif = false }
  }, [selection, rechargeDossier])

  // ── Décision : 6 secondes pour annuler, puis l'edge function ─────────────
  useEffect(() => {
    const e = envoi.current
    const avantDeQuitter = (ev) => { if (e.enAttente) { ev.preventDefault(); ev.returnValue = '' } }
    window.addEventListener('beforeunload', avantDeQuitter)
    return () => { window.removeEventListener('beforeunload', avantDeQuitter); e.vider() }
  }, [])

  const decider = useCallback((args, { toast: texte }) => {
    const id = selection
    if (!id) return
    const i = fileVisible.findIndex(d => d.id === id)
    const suivant = i >= 0 ? (fileVisible[i + 1] ?? fileVisible[i - 1] ?? null) : null
    const masquer = (oui) => setMasques(m => { const n = new Set(m); if (oui) n.add(id); else n.delete(id); return n })
    if (i >= 0) { masquer(true); choisir(suivant?.id ?? null) }

    const cle = Date.now()
    const annuler = envoi.current.programmer({
      executer: () => appelAdjoint('decider', { id, ...args }),
      surSucces: (r) => {
        const nonArchive = r?.gmail?.erreur ? { ton: 'erreur', texte: `${texte}, mais non archivé dans Gmail : ouvre le dossier pour réessayer` } : null
        setToast(t => (t?.cle === cle ? (nonArchive ? { cle, ...nonArchive } : { cle, texte: r?.enAttenteDeMake ? `${texte} : transmis à Make` : texte }) : t))
        signalerMaj()
        setVersion(v => v + 1)
        setMasques(m => { const n = new Set(m); n.delete(id); return n })
        if (i < 0) setRechargeDossier(n => n + 1)
      },
      surErreur: (e) => {
        masquer(false)
        setToast({ cle: Date.now(), ton: 'erreur', texte: e.message })
        setVersion(v => v + 1)
        choisir(id)
        setRechargeDossier(n => n + 1)
      },
      surAnnulation: () => {
        masquer(false)
        setToast(null)
        choisir(id)
      },
    })
    setToast({ cle, texte, onAnnuler: () => annuler() })
  }, [selection, fileVisible, choisir])

  useEffect(() => {
    if (!toast || toast.onAnnuler) return undefined
    const t = setTimeout(() => setToast(null), toast.ton === 'erreur' ? 10000 : 4000)
    return () => clearTimeout(t)
  }, [toast])
  // Le toast « Annuler » disparaît à la fin du délai (le succès le remplace)
  useEffect(() => {
    if (!toast?.onAnnuler) return undefined
    const t = setTimeout(() => setToast(x => (x?.cle === toast.cle && x.onAnnuler ? { cle: x.cle, texte: `${x.texte} : envoi en cours` } : x)), 6000)
    return () => clearTimeout(t)
  }, [toast])

  // ── Rendu ──────────────────────────────────────────────────────────────────
  const d = ouvert.donnees
  const colonnesDossier = (
    <>
      <section aria-label="Dossier" className={`${colonneCls} flex-[999_1_420px] min-w-0`}>
        {ouvert.chargement && !d && <Chargement />}
        {ouvert.erreur && <Erreur onReessayer={() => setRechargeDossier(n => n + 1)}>{ouvert.erreur}</Erreur>}
        {d && <Dossier d={d.dossier} fiche={d.fiche} onDecider={decider} occupe={ouvert.chargement} onRecharger={() => { setRechargeDossier(n => n + 1); setVersion(v => v + 1) }} />}
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
              {file.chargement && !file.dossiers.length ? <Chargement /> : !file.erreur && <File dossiers={fileVisible} selection={selection} onChoisir={choisir} />}
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
      <Toast toast={toast} onFermer={() => setToast(null)} />
    </Layout>
  )
}
