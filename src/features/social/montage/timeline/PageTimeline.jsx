import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Layout from '../../../../components/layout/Layout'
import Card from '../../../../components/shared/Card'
import { supabase } from '../../../../lib/supabase'
import { jobIdValide } from '../../../../lib/montageEditeur'
import { isAgentEnLigne } from '../../../../lib/montageVideo'
import { tacheTerminer, texteConfirmationTerminer } from '../../../../lib/montageFin'
import {
  MESSAGE_PAS_RECETTE, brouillonPerime, peutOuvrirTimeline, raisonTerminerTimeline,
  tacheActiveDe, tachePreparer, timelineAPreparer,
} from '../../../../lib/montageTimeline'
import { useAgentStatus } from '../useMontageVideo'
import { creerLiens } from './liens'
import { creerSourceHub } from './sourceHub'

// Remotion et la timeline : téléchargés seulement quand on ouvre une timeline
const TimelineHub = lazy(() => import('./TimelineHub'))

const COLONNES_JOB = 'id, titre, statut, etape, progression, erreur, personnes, template_id, version_courante, supprime_le, format'

// Ce que la page doit montrer avant la timeline (fonction pure : testée)
export function etapePage({ job, ligne, clips, taches, derniereVersion, choixBrouillon }) {
  if (!job || job.supprime_le) return { etape: 'introuvable' }
  if (!peutOuvrirTimeline(job)) return { etape: 'fermee', message: MESSAGE_PAS_RECETTE }
  // Sans recette publiée, un seul clip Principal (sinon l'ancien moteur a fait le montage)
  if (!ligne?.recette && clips && (clips.length !== 1 || clips[0].role !== 'principal')) return { etape: 'fermee', message: MESSAGE_PAS_RECETTE }
  if (!(job.version_courante > 0)) {
    if (job.statut === 'erreur') return { etape: 'erreur_v1', message: job.erreur || "Le Mac a signalé une erreur sans message." }
    return { etape: 'v1' }
  }
  if (timelineAPreparer(ligne)) {
    const preparer = tacheActiveDe(taches, 'timeline_preparer')
    return { etape: 'preparation', enCours: Boolean(preparer) }
  }
  if (!choixBrouillon && brouillonPerime(ligne, derniereVersion)) return { etape: 'perime', version: derniereVersion.numero }
  return { etape: 'pret' }
}

function Attente({ titre, texte, children, jobId }) {
  return (
    <Layout>
      <Link to={jobId ? `/reseaux-sociaux/montage/${jobId}` : '/reseaux-sociaux/montage'} className="inline-flex items-center gap-1 text-sm font-semibold text-[#6b7280] hover:text-[#1a1a1a] mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        {jobId ? 'Retour au montage' : 'Retour aux montages'}
      </Link>
      <Card className="p-8 text-center max-w-xl">
        <p className="text-base font-semibold text-[#1a1a1a]">{titre}</p>
        {texte && <p className="text-sm text-[#6b7280] mt-1">{texte}</p>}
        {children && <div className="mt-4">{children}</div>}
      </Card>
    </Layout>
  )
}

function Progression({ job }) {
  return (
    <div className="max-w-xs mx-auto">
      <div className="flex justify-between gap-2 text-xs text-[#6b7280]">
        <span className="truncate">{job.etape || 'En attente du Mac…'}</span>
        <span className="tabular-nums">{job.progression ?? 0} %</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full bg-[#00bbb1] transition-all" style={{ width: `${job.progression ?? 0}%` }} />
      </div>
    </div>
  )
}

export default function PageTimeline() {
  const { jobId } = useParams()
  if (!jobIdValide(jobId)) return <Attente titre="Montage introuvable" texte="L'adresse de ce montage n'est pas valide." />
  return <Page key={jobId} jobId={jobId} />
}

function Page({ jobId }) {
  const navigate = useNavigate()
  const agent = useAgentStatus()
  const [donnees, setDonnees] = useState(null)
  const [erreurLecture, setErreurLecture] = useState(null)
  const [erreurPreparer, setErreurPreparer] = useState(null)
  const [choixBrouillon, setChoixBrouillon] = useState(false)
  const [erreurSauvegarde, setErreurSauvegarde] = useState(null)
  const preparerDemande = useRef(false)
  const ouverteLe = useRef(new Date().toISOString())

  const charger = useCallback(async () => {
    const [j, l, t, c, v] = await Promise.all([
      supabase.from('video_jobs').select(COLONNES_JOB).eq('id', jobId).maybeSingle(),
      supabase.from('video_timeline').select('job_id, numero_version, recette, brouillon, brouillon_le, ressources').eq('job_id', jobId).maybeSingle(),
      supabase.from('video_taches').select('id, type, statut, erreur, created_at').eq('job_id', jobId).order('created_at', { ascending: false }).limit(20),
      supabase.from('video_clips').select('role').eq('job_id', jobId),
      supabase.from('video_versions').select('numero, created_at').eq('job_id', jobId).order('numero', { ascending: false }).limit(1),
    ])
    const erreur = [j, l, t, c, v].find(r => r.error)?.error
    if (erreur) { setErreurLecture(erreur.message); return }
    setErreurLecture(null)
    setDonnees({ job: j.data, ligne: l.data, taches: t.data || [], clips: c.data || [], derniereVersion: v.data?.[0] || null })
  }, [jobId])

  const etat = donnees ? etapePage({ ...donnees, choixBrouillon }) : { etape: 'chargement' }
  const pret = etat.etape === 'pret'

  // Avant la timeline : suivi en temps réel (montage, tâches, timeline), avec un relevé de secours toutes les 5 s
  useEffect(() => {
    charger()
    if (pret) return undefined
    const canal = supabase.channel(`montage-timeline-${jobId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_jobs', filter: `id=eq.${jobId}` }, () => charger())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_taches', filter: `job_id=eq.${jobId}` }, () => charger())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_timeline', filter: `job_id=eq.${jobId}` }, () => charger())
      .subscribe()
    const secours = setInterval(charger, 5000)
    return () => { clearInterval(secours); supabase.removeChannel(canal) }
  }, [charger, jobId, pret])

  // Préparation demandée une fois par ouverture
  const preparer = useCallback(async () => {
    preparerDemande.current = true
    setErreurPreparer(null)
    const { error } = await supabase.from('video_taches').insert(tachePreparer(jobId))
    if (error) setErreurPreparer(error.message)
    charger()
  }, [jobId, charger])

  useEffect(() => {
    if (etat.etape === 'preparation' && !etat.enCours && !preparerDemande.current) preparer()
  }, [etat.etape, etat.enCours, preparer])

  // Échec de la préparation demandée par cette page
  const echec = donnees?.taches.find(t => t.type === 'timeline_preparer' && new Date(t.created_at) >= new Date(ouverteLe.current) - 60_000)
  const echecPreparer = etat.etape === 'preparation' && !etat.enCours && echec?.statut === 'erreur' ? echec.erreur : erreurPreparer

  // Source et liens créés une fois la timeline prête (session de la personne connectée)
  const liens = useMemo(() => (pret ? creerLiens(supabase) : null), [pret])
  const source = useMemo(() => (pret && donnees ? creerSourceHub({ client: supabase, job: donnees.job, liens, onErreur: setErreurSauvegarde }) : null),
    [pret, liens]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => liens?.arreter(), [liens])

  const enLigne = !agent.error && isAgentEnLigne(agent.status?.dernier_signal, agent.maintenant)

  async function terminer(brouillon, enCours) {
    const raison = raisonTerminerTimeline({ brouillon, enCours })
    if (raison) { window.alert(raison); return }
    const { data: job } = await supabase.from('video_jobs').select(COLONNES_JOB).eq('id', jobId).maybeSingle()
    if (!job || !window.confirm(texteConfirmationTerminer(job))) return
    const { error } = await supabase.from('video_taches').insert(tacheTerminer(jobId))
    if (error) { window.alert(`Terminer n'est pas parti : ${error.message}`); return }
    navigate(`/reseaux-sociaux/montage/${jobId}`)
  }

  async function annulerTravail() {
    if (!window.confirm('Annuler le travail en cours sur le Mac ?')) return
    try { await source.annuler() } catch (e) { window.alert(`Annulation impossible : ${e.message}`) }
  }

  const extra = ({ brouillon, enCours }) => (
    <>
      <button onClick={() => navigate(`/reseaux-sociaux/montage/${jobId}`)} title="Retour à l'éditeur du montage (le brouillon reste sauvé)">← Montage</button>
      {!enLigne && <span style={{ color: 'var(--ambre)', alignSelf: 'center', fontSize: 12 }}>Mac hors ligne : les demandes attendront</span>}
      {enCours && <button onClick={annulerTravail}>Annuler le travail</button>}
      <button onClick={() => terminer(brouillon, enCours)} title={raisonTerminerTimeline({ brouillon, enCours }) || 'Rendu HD de la dernière version dans Google Drive'}
        disabled={Boolean(raisonTerminerTimeline({ brouillon, enCours }))}>Terminer</button>
    </>
  )

  if (erreurLecture) {
    return <Attente jobId={jobId} titre="Impossible de charger la timeline" texte={erreurLecture}>
      <button onClick={charger} className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-gray-200 hover:bg-gray-50">Réessayer</button>
    </Attente>
  }
  switch (etat.etape) {
    case 'chargement': return <Attente jobId={jobId} titre="Chargement de la timeline…" />
    case 'introuvable': return <Attente titre="Montage introuvable" texte="Ce montage n'existe plus, est dans la corbeille, ou ton compte n'y a pas accès." />
    case 'fermee': return <Attente jobId={jobId} titre="Timeline fermée" texte={etat.message} />
    case 'erreur_v1': return <Attente jobId={jobId} titre="La première version n'a pas pu être faite" texte={etat.message} />
    case 'v1': return (
      <Attente jobId={jobId} titre={`« ${donnees.job.titre} » : première version en cours`} texte="La timeline s'ouvrira dès qu'elle sera prête (tu peux quitter la page, le montage continue sur le Mac).">
        <Progression job={donnees.job} />
        {!enLigne && <p className="text-xs text-amber-700 mt-3">Le Mac est hors ligne : le montage partira dès son retour.</p>}
      </Attente>
    )
    case 'preparation': return (
      <Attente jobId={jobId} titre="Préparation de la timeline" texte="Le Mac prépare la copie légère de la vidéo, les cartes et les formes d'onde (environ 1 min la première fois).">
        {echecPreparer ? (
          <div>
            <p className="text-sm text-red-700">{echecPreparer}</p>
            <button onClick={preparer} className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-gray-200 hover:bg-gray-50">Réessayer</button>
          </div>
        ) : <p className="text-sm text-[#6b7280]">{enLigne ? 'En cours…' : 'Le Mac est hors ligne : la préparation partira dès son retour.'}</p>}
      </Attente>
    )
    case 'perime': return (
      <Attente jobId={jobId} titre="Le montage a changé depuis ton brouillon" texte={`Une version plus récente existe (v${etat.version}). Ton brouillon de la timeline part d'avant : s'il est appliqué, il remplacera ce qui a changé depuis.`}>
        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={async () => {
            await supabase.from('video_timeline').update({ brouillon: null }).eq('job_id', jobId)
            setChoixBrouillon(true)
            charger()
          }} className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#00bbb1] text-white hover:bg-[#009e95]">Repartir de la v{etat.version}</button>
          <button onClick={() => setChoixBrouillon(true)} className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-gray-200 hover:bg-gray-50">Reprendre mon brouillon</button>
        </div>
      </Attente>
    )
    default: return (
      <Suspense fallback={<div className="timeline-neo" style={{ position: 'fixed', inset: 0, background: '#0a1416' }} />}>
        <TimelineHub source={source} liens={liens} erreur={erreurSauvegarde} extra={extra} />
      </Suspense>
    )
  }
}
