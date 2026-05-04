import { useState } from 'react'
import MemberLayout from '../components/layout/MemberLayout'
import Card from '../components/shared/Card'
import Badge from '../components/shared/Badge'
import Button from '../components/shared/Button'
import TaskSection from '../components/tasks/TaskSection'
import KPIModal from '../components/kpis/KPIModal'
import { SkeletonCard } from '../components/shared/Skeleton'
import { useAuth } from '../context/AuthContext'
import { useObjectives, OBJECTIVE_TYPE_LABELS } from '../hooks/useObjectives'
import { useTasks } from '../hooks/useTasks'
import { useKPIEntries, useEODReports, KPI_TYPE_LABELS } from '../hooks/useKPIs'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

const TABS = ['Mes objectifs', 'Mes tâches', 'Mes KPIs']

const ROLE_LABELS = {
  naturopathe:    'Naturopathe',
  closer:         'Closer',
  setter:         'Setter',
  service_client: 'Service clients & gestion',
  resp_vente:     'Resp. équipe de vente',
}

function ObjectivesTab({ userId }) {
  const { objectives, loading } = useObjectives(userId)
  const today = format(new Date(), 'yyyy-MM-dd')
  const active = objectives.filter(o => o.period_end >= today)
  const past = objectives.filter(o => o.period_end < today)

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-[#1a1a1a]">Objectifs actifs</h3>
      {loading ? <SkeletonCard /> : active.length === 0 ? (
        <Card className="p-5"><p className="text-sm text-[#6b7280]">Aucun objectif actif pour le moment.</p></Card>
      ) : (
        active.map(obj => (
          <Card key={obj.id} className="p-5">
            <p className="font-semibold text-sm text-[#1a1a1a]">{OBJECTIVE_TYPE_LABELS[obj.type] || obj.type}</p>
            <p className="text-xs text-[#6b7280] mt-0.5">
              {format(parseISO(obj.period_start), 'd MMM yyyy', { locale: fr })} → {format(parseISO(obj.period_end), 'd MMM yyyy', { locale: fr })}
            </p>
            <p className="text-2xl font-bold text-[#00bbb1] mt-2">{obj.target_value.toLocaleString('fr-CA')}</p>
          </Card>
        ))
      )}

      {past.length > 0 && (
        <>
          <h3 className="font-bold text-[#1a1a1a] mt-6">Historique</h3>
          {past.map(obj => (
            <div key={obj.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-[#e5e7eb]">
              <div>
                <p className="text-sm font-semibold text-[#6b7280]">{OBJECTIVE_TYPE_LABELS[obj.type] || obj.type}</p>
                <p className="text-xs text-[#6b7280]">{format(parseISO(obj.period_start), 'd MMM yyyy', { locale: fr })} → {format(parseISO(obj.period_end), 'd MMM yyyy', { locale: fr })}</p>
              </div>
              <p className="text-sm font-bold text-[#6b7280]">{obj.target_value.toLocaleString('fr-CA')}</p>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function EODItem({ report }) {
  const [expanded, setExpanded] = useState(false)
  const dataKeys = Object.keys(report.data || {})

  return (
    <div className="border border-[#e5e7eb] rounded-lg overflow-hidden">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left">
        <div>
          <p className="text-sm font-semibold text-[#1a1a1a]">Rapport du {format(parseISO(report.report_date), 'd MMMM yyyy', { locale: fr })}</p>
          <p className="text-xs text-[#6b7280]">Soumis à {format(new Date(report.submitted_at), 'HH:mm')}</p>
        </div>
        <svg className={`w-4 h-4 text-[#6b7280] transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="px-4 py-3 bg-gray-50 border-t border-[#e5e7eb]">
          {dataKeys.length === 0 ? <p className="text-sm text-[#6b7280]">Aucune donnée.</p> : (
            <div className="flex flex-wrap gap-4">
              {dataKeys.map(k => (
                <div key={k} className="text-sm">
                  <span className="text-[#6b7280] font-semibold">{k} : </span>
                  <span className="font-bold text-[#1a1a1a]">{String(report.data[k])}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function KPIsTab({ userId, userRole }) {
  const [kpiModalOpen, setKpiModalOpen] = useState(false)
  const { entries, loading: kpiLoading, refetch: refetchKPIs } = useKPIEntries({ userId })
  const { reports, loading: eodLoading } = useEODReports({ userId })

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-[#1a1a1a]">Mes entrées KPI</h3>
          <Button size="sm" onClick={() => setKpiModalOpen(true)}>+ Ajouter</Button>
        </div>
        <KPIModal
          isOpen={kpiModalOpen}
          onClose={() => setKpiModalOpen(false)}
          userId={userId}
          userRole={userRole}
          onCreated={refetchKPIs}
        />
        {kpiLoading ? <SkeletonCard /> : entries.length === 0 ? (
          <Card className="p-5"><p className="text-sm text-[#6b7280]">Aucune entrée KPI.</p></Card>
        ) : (
          <div className="space-y-2">
            {entries.map(entry => (
              <div key={entry.id} className="flex items-center justify-between px-4 py-3 bg-white rounded-lg border border-[#e5e7eb]">
                <div>
                  <p className="text-sm font-semibold text-[#1a1a1a]">{KPI_TYPE_LABELS[entry.kpi_type] || entry.kpi_type}</p>
                  <p className="text-xs text-[#6b7280]">{format(parseISO(entry.entry_date), 'd MMM yyyy', { locale: fr })}</p>
                  {entry.notes && <p className="text-xs text-[#6b7280]">{entry.notes}</p>}
                </div>
                <p className="text-lg font-bold text-[#1a1a1a]">{Number(entry.value).toLocaleString('fr-CA')}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-bold text-[#1a1a1a] mb-3">Mes rapports End of Day</h3>
        {eodLoading ? <SkeletonCard /> : reports.length === 0 ? (
          <Card className="p-5"><p className="text-sm text-[#6b7280]">Aucun rapport soumis.</p></Card>
        ) : (
          <div className="space-y-2">
            {reports.map(r => <EODItem key={r.id} report={r} />)}
          </div>
        )}
      </div>
    </div>
  )
}

export default function MonDossier() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState(0)
  const { tasks, loading: tasksLoading, refetch } = useTasks({ userId: profile?.id })

  if (!profile) return null

  return (
    <MemberLayout>
      {/* En-tête profil */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-2xl bg-[#00bbb1]/10 flex items-center justify-center text-[#00bbb1] font-bold text-xl">
          {profile.full_name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">{profile.full_name}</h1>
          <Badge variant={profile.role}>{ROLE_LABELS[profile.role] || profile.role}</Badge>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-[#e5e7eb] mb-6">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              activeTab === i
                ? 'border-[#00bbb1] text-[#00bbb1]'
                : 'border-transparent text-[#6b7280] hover:text-[#1a1a1a]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 0 && <ObjectivesTab userId={profile.id} />}
      {activeTab === 1 && (
        <div className="space-y-4">
          {tasksLoading ? <SkeletonCard /> : (
            <>
              <TaskSection tasks={tasks} priority="prioritaire" userId={profile.id} onUpdate={refetch} isAdmin={false} />
              <TaskSection tasks={tasks} priority="secondaire" userId={profile.id} onUpdate={refetch} isAdmin={false} />
            </>
          )}
        </div>
      )}
      {activeTab === 2 && <KPIsTab userId={profile.id} userRole={profile.role} />}
    </MemberLayout>
  )
}
