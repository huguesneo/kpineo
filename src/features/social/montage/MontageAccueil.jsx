import { useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../../components/layout/Layout'
import Header from '../../../components/layout/Header'
import Card from '../../../components/shared/Card'
import Badge from '../../../components/shared/Badge'
import { SkeletonTable } from '../../../components/shared/Skeleton'
import { useAuth } from '../../../context/AuthContext'
import { canConfigureMontageVideo } from '../../../lib/montageVideoAccess'
import {
  isAgentEnLigne, statutMontage, positionsFile, rangFr, lienDriveMontage, STATUTS_EN_TRAITEMENT, erreurAgent,
} from '../../../lib/montageVideo'
import { useMontageJobs, useAgentStatus, useDernieresTaches, ouvrirDernierApercu } from './useMontageVideo'
import PastilleMac, { dateFr } from './PastilleMac'

function EtatVide({ titre, texte, action }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-6">
      <div className="w-14 h-14 rounded-full bg-[#00bbb1]/10 text-[#00bbb1] flex items-center justify-center mb-4">
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>
      <p className="text-base font-semibold text-[#1a1a1a]">{titre}</p>
      <p className="text-sm text-[#6b7280] mt-1 max-w-sm">{texte}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

function BoutonNouvelleVideo() {
  return (
    <Link
      to="/reseaux-sociaux/montage/nouvelle"
      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-base font-semibold bg-[#00bbb1] hover:bg-[#009e95] text-white transition-colors"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      Nouvelle vidéo
    </Link>
  )
}

function LienDrive({ job }) {
  const lien = lienDriveMontage(job)
  if (lien) {
    return (
      <a href={lien.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[#00bbb1] hover:underline">
        {lien.label}
      </a>
    )
  }
  if (job.lien_drive_export) {
    return <span className="text-xs text-[#6b7280] break-all" title="Chemin dans Google Drive">{job.lien_drive_export}</span>
  }
  return <span className="text-sm text-[#9ca3af]">Aucun lien</span>
}

// Dépannage avant l'éditeur (phase 3) : la dernière version dans un nouvel onglet.
function BoutonApercu({ job }) {
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState(null)
  if (!(job.version_courante > 0)) return null
  async function ouvrir() {
    setEnCours(true)
    setErreur(null)
    try {
      await ouvrirDernierApercu(job.id)
    } catch (e) {
      setErreur(e.message || "L'aperçu ne peut pas être ouvert.")
    } finally {
      setEnCours(false)
    }
  }
  return (
    <div className="mt-2">
      <button onClick={ouvrir} disabled={enCours} className="inline-flex items-center gap-1 text-sm font-semibold text-[#00bbb1] hover:underline disabled:opacity-50">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86A1 1 0 008 5.14z" /></svg>
        {enCours ? 'Ouverture...' : `Voir l'aperçu (v${job.version_courante})`}
      </button>
      {erreur && <p className="text-xs text-red-600 mt-1">{erreur}</p>}
    </div>
  )
}

function ListeMontages({ jobs, noms, loading, error, reload, positions, taches }) {
  if (loading && jobs.length === 0) return <div className="p-5"><SkeletonTable rows={3} /></div>
  if (error) {
    return (
      <EtatVide
        titre="Impossible de charger les montages"
        texte={`Vérifie ta connexion, puis réessaie. Détail : ${error}`}
        action={
          <button onClick={reload} className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-white border border-gray-200 hover:bg-gray-50 text-gray-700">
            Réessayer
          </button>
        }
      />
    )
  }
  if (jobs.length === 0) {
    return (
      <EtatVide
        titre="Aucun montage pour l'instant"
        texte="Dépose une vidéo, choisis un template ou écris ce que tu veux : le montage se fait sur le Mac et apparaît ici."
        action={<BoutonNouvelleVideo />}
      />
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[#6b7280] border-b border-[#e5e7eb]">
            <th className="px-5 py-3">Titre</th>
            <th className="px-5 py-3">Statut</th>
            <th className="px-5 py-3">Auteur</th>
            <th className="px-5 py-3">Date</th>
            <th className="px-5 py-3">Google Drive</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map(job => {
            const statut = statutMontage(job.statut)
            const position = positions[job.id]
            return (
              <tr key={job.id} className="border-b border-[#f0f0f2] last:border-0 align-top">
                <td className="px-5 py-4">
                  <Link to={`/reseaux-sociaux/montage/${job.id}`} className="font-semibold text-[#1a1a1a] hover:text-[#00bbb1] hover:underline">
                    {job.titre}
                  </Link>
                  {erreurAgent(job, taches[job.id]) && (
                    <p className="text-xs text-red-600 mt-1 max-w-md">{erreurAgent(job, taches[job.id])}</p>
                  )}
                  <BoutonApercu job={job} />
                </td>
                <td className="px-5 py-4 whitespace-nowrap">
                  <Badge variant={statut.variant}>{statut.label}</Badge>
                  {position && <p className="text-xs text-[#6b7280] mt-1">{rangFr(position)} dans la file</p>}
                  {STATUTS_EN_TRAITEMENT.includes(job.statut) && (
                    <div className="mt-2 w-40">
                      <div className="flex justify-between gap-2 text-xs text-[#6b7280]">
                        <span className="truncate" title={job.etape || ''}>{job.etape || statut.label}</span>
                        <span className="tabular-nums">{job.progression ?? 0} %</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full bg-[#00bbb1] transition-all" style={{ width: `${job.progression ?? 0}%` }} />
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-5 py-4 text-[#374151]">{noms[job.cree_par] || job.cree_par}</td>
                <td className="px-5 py-4 text-[#6b7280] whitespace-nowrap">{dateFr(job.created_at)}</td>
                <td className="px-5 py-4"><LienDrive job={job} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FileAttente({ jobs, positions, noms, enLigne }) {
  const enCours = jobs.filter(j => STATUTS_EN_TRAITEMENT.includes(j.statut))
  const enAttente = jobs.filter(j => positions[j.id]).sort((a, b) => positions[a.id] - positions[b.id])

  if (enCours.length === 0 && enAttente.length === 0) {
    return <p className="text-sm text-[#6b7280] px-5 pb-5">Aucun montage en attente. Le Mac est libre.</p>
  }
  return (
    <div className="px-5 pb-5 space-y-3">
      {enCours.map(job => (
        <div key={job.id} className="rounded-lg border border-[#00bbb1]/30 bg-[#00bbb1]/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[#1a1a1a] truncate">{job.titre}</p>
            <span className="text-xs font-semibold text-[#00bbb1] whitespace-nowrap">En cours</span>
          </div>
          <p className="text-xs text-[#6b7280] mt-0.5">{job.etape || statutMontage(job.statut).label}</p>
          <div className="mt-2 h-2 rounded-full bg-white overflow-hidden">
            <div className="h-full bg-[#00bbb1] transition-all" style={{ width: `${job.progression ?? 0}%` }} />
          </div>
        </div>
      ))}
      {enAttente.map(job => (
        <div key={job.id} className="flex items-center gap-3 rounded-lg border border-[#e5e7eb] bg-white p-3">
          <span className="w-9 h-9 flex-shrink-0 rounded-full bg-gray-100 text-[#374151] text-sm font-bold flex items-center justify-center">
            {rangFr(positions[job.id])}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#1a1a1a] truncate">{job.titre}</p>
            <p className="text-xs text-[#6b7280]">{noms[job.cree_par] || job.cree_par}</p>
          </div>
        </div>
      ))}
      {!enLigne && enAttente.length > 0 && (
        <p className="text-xs text-amber-700">La file reprendra dès que le Mac sera en ligne.</p>
      )}
    </div>
  )
}

export default function MontageAccueil() {
  const { user } = useAuth()
  const { jobs, noms, loading, error, reload, direct } = useMontageJobs()
  const agent = useAgentStatus()
  const taches = useDernieresTaches()
  const positions = positionsFile(jobs)
  const enLigne = !agent.error && isAgentEnLigne(agent.status?.dernier_signal, agent.maintenant)

  return (
    <Layout>
      <Header title="Montage vidéo" />

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <PastilleMac {...agent} />
        <div className="flex items-center gap-3">
          {canConfigureMontageVideo(user?.email) && (
            <Link
              to="/reseaux-sociaux/montage/configuration"
              className="inline-flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
              Configuration
            </Link>
          )}
          <BoutonNouvelleVideo />
        </div>
      </div>

      {!agent.loading && !enLigne && (
        <Card className="p-4 mb-6 border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-800">
            {agent.error ? "Impossible de savoir si le Mac de montage est en ligne." : 'Le Mac de montage est hors ligne.'}
          </p>
          <p className="text-sm text-amber-700 mt-0.5">
            Tu peux quand même préparer une vidéo : elle attendra dans la file et le montage partira dès que le Mac sera de retour.
          </p>
        </Card>
      )}

      {!direct && !error && (
        <Card className="p-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[#374151]">
              La mise à jour en direct est interrompue. Les statuts affichés peuvent dater de quelques instants.
            </p>
            <button onClick={reload} className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-gray-200 hover:bg-gray-50 text-gray-700">
              Actualiser
            </button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h2 className="text-base font-bold text-[#1a1a1a] px-5 pt-5 pb-3">Montages</h2>
          <ListeMontages jobs={jobs} noms={noms} loading={loading} error={error} reload={reload} positions={positions} taches={taches} />
        </Card>
        <Card className="self-start">
          <h2 className="text-base font-bold text-[#1a1a1a] px-5 pt-5 pb-3">File d'attente</h2>
          {error
            ? <p className="text-sm text-[#6b7280] px-5 pb-5">File indisponible tant que les montages ne sont pas chargés.</p>
            : <FileAttente jobs={jobs} positions={positions} noms={noms} enLigne={enLigne} />}
        </Card>
      </div>
    </Layout>
  )
}
