import { useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../../components/layout/Layout'
import Header from '../../../components/layout/Header'
import Card from '../../../components/shared/Card'
import { SkeletonTable } from '../../../components/shared/Skeleton'
import { useAuth } from '../../../context/AuthContext'
import { canApproveVideoTemplates } from '../../../lib/montageVideoAccess'
import { trierTemplates } from '../../../lib/montageTemplates'
import { useTemplates } from './useMontageTemplates'
import { useAgentStatus } from './useMontageVideo'
import { isAgentEnLigne } from '../../../lib/montageVideo'
import { useNoms } from './useMontageEditeur'
import { ApercuTemplate } from './EtapeDirection'
import { CarteTemplateListe } from './TemplatesMontage'

// Liste des templates, sans état ni requête (rendue telle quelle dans les tests).
// onAnnulerStyle : bouton Annuler sur un style en cours d'enregistrement (Hugues).
export function ListeTemplates({ templates, jobs = {}, versions = [], taches = [], noms = {}, email, onApercu = () => {}, onDecider = async () => {}, onAnnulerStyle, enLigne = true }) {
  if (!templates.length) {
    return (
      <p className="text-sm text-[#6b7280] text-center py-10 px-4">
        Aucun template pour l&apos;instant. Dans l&apos;éditeur d&apos;un montage, « Proposer comme template » envoie une version ici.
      </p>
    )
  }
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-label="Templates">
      {trierTemplates(templates).map(t => (
        <CarteTemplateListe
          key={t.id}
          template={t}
          titreMontage={jobs[t.job_id]}
          versions={versions}
          taches={taches}
          noms={noms}
          email={email}
          onApercu={onApercu}
          onDecider={onDecider}
          onAnnulerStyle={onAnnulerStyle}
          enLigne={enLigne}
        />
      ))}
    </ul>
  )
}

export default function MontageTemplates() {
  const { user } = useAuth()
  const { templates, jobs, versions, tachesStyle, loading, error, reload, decider, annulerStyle } = useTemplates()
  const agent = useAgentStatus()
  const enLigne = !agent.error && isAgentEnLigne(agent.status?.dernier_signal, agent.maintenant)
  const noms = useNoms(templates.map(t => t.propose_par))
  const [apercu, setApercu] = useState(null)
  const hugues = canApproveVideoTemplates(user?.email)

  return (
    <Layout>
      <Link to="/reseaux-sociaux/montage" className="inline-flex items-center gap-1 text-sm font-semibold text-[#6b7280] hover:text-[#1a1a1a] mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Retour aux montages
      </Link>
      <Header title="Templates" />
      <p className="text-sm text-[#6b7280] mb-6 max-w-2xl">
        {hugues
          ? "Approuve une proposition après avoir vu l'aperçu de sa version : le Mac enregistre alors le style, puis le template apparaît dans « Nouvelle vidéo »."
          : "Tes propositions attendent l'approbation de Hugues. Une fois approuvées et le style enregistré, elles apparaissent dans « Nouvelle vidéo »."}
      </p>
      <Card className="p-5">
        {loading && templates.length === 0 ? (
          <SkeletonTable rows={3} />
        ) : error ? (
          <div className="text-sm text-red-700">
            Les templates ne peuvent pas être chargés. {error}{' '}
            <button onClick={reload} className="font-semibold underline">Réessayer</button>
          </div>
        ) : (
          <ListeTemplates
            templates={templates}
            jobs={jobs}
            versions={versions}
            taches={tachesStyle}
            noms={noms}
            email={user?.email}
            onApercu={setApercu}
            onDecider={decider}
            onAnnulerStyle={annulerStyle}
            enLigne={enLigne}
          />
        )}
      </Card>
      <ApercuTemplate template={apercu} onClose={() => setApercu(null)} />
    </Layout>
  )
}
