import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import Card from '../components/shared/Card'
import Badge from '../components/shared/Badge'
import Button from '../components/shared/Button'
import Modal from '../components/shared/Modal'
import Input from '../components/shared/Input'
import TaskSection from '../components/tasks/TaskSection'
import KPIModal from '../components/kpis/KPIModal'
import CareerPlanEditor from '../components/career/CareerPlanEditor'
import BonusTracker from '../components/career/BonusTracker'
import { SkeletonCard } from '../components/shared/Skeleton'
import { useMember } from '../hooks/useMembers'
import { useObjectives, createObjective, deleteObjective, OBJECTIVE_TYPES_BY_ROLE, OBJECTIVE_TYPE_LABELS } from '../hooks/useObjectives'
import { useTasks } from '../hooks/useTasks'
import { useKPIEntries, useEODReports, KPI_TYPE_LABELS } from '../hooks/useKPIs'
import { useQuarterlyBonus } from '../hooks/useCareerPlan'
import { format, isAfter, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

const ROLE_LABELS = { naturopathe: 'Naturopathe', closer: 'Closer', setter: 'Setter', admin: 'Admin' }
const TABS = ['Objectifs', 'Tâches', 'KPIs & Rapports', 'Plan de carrière']

function ObjectiveModal({ isOpen, onClose, userId, role, onCreated }) {
  const types = OBJECTIVE_TYPES_BY_ROLE[role] || []
  const [form, setForm] = useState({ type: types[0]?.value || '', target_value: '', period_start: '', period_end: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.type || !form.target_value || !form.period_start || !form.period_end) {
      setError('Tous les champs sont obligatoires.'); return
    }
    setLoading(true)
    const { error: err } = await createObjective({
      user_id: userId,
      type: form.type,
      target_value: Number(form.target_value),
      period_start: form.period_start,
      period_end: form.period_end,
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setForm({ type: types[0]?.value || '', target_value: '', period_start: '', period_end: '' })
    onCreated?.()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ajouter un objectif">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-[#1a1a1a]">Type d'objectif</label>
          <select name="type" value={form.type} onChange={handleChange} className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]">
            {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <Input label="Valeur cible" name="target_value" type="number" min="0" value={form.target_value} onChange={handleChange} placeholder="Ex: 10000" />
        <Input label="Début de période" name="period_start" type="date" value={form.period_start} onChange={handleChange} />
        <Input label="Fin de période" name="period_end" type="date" value={form.period_end} onChange={handleChange} />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>Créer l'objectif</Button>
        </div>
      </form>
    </Modal>
  )
}

function ObjectivesTab({ member, objectives, loading, refetch }) {
  const [modalOpen, setModalOpen] = useState(false)
  const today = format(new Date(), 'yyyy-MM-dd')

  const active = objectives.filter(o => o.period_end >= today)
  const past = objectives.filter(o => o.period_end < today)

  function progressColor(pct) {
    if (pct >= 80) return 'bg-emerald-500'
    if (pct >= 50) return 'bg-amber-500'
    return 'bg-red-500'
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-[#1a1a1a]">Objectifs actifs</h3>
        <Button onClick={() => setModalOpen(true)}>+ Ajouter un objectif</Button>
      </div>

      {loading ? (
        <SkeletonCard />
      ) : active.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm text-[#6b7280]">Aucun objectif actif.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {active.map(obj => (
            <Card key={obj.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-sm text-[#1a1a1a]">{OBJECTIVE_TYPE_LABELS[obj.type] || obj.type}</p>
                  <p className="text-xs text-[#6b7280] mt-0.5">
                    {format(parseISO(obj.period_start), 'd MMM yyyy', { locale: fr })} → {format(parseISO(obj.period_end), 'd MMM yyyy', { locale: fr })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-lg font-bold text-[#1a1a1a]">{obj.target_value.toLocaleString('fr-CA')}</p>
                  <button onClick={() => deleteObjective(obj.id).then(refetch)} className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className={`h-2 rounded-full ${progressColor(0)} transition-all`} style={{ width: '0%' }} />
              </div>
              <p className="text-xs text-[#6b7280] mt-1">Progression : données des KPI requises</p>
            </Card>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h3 className="font-bold text-[#1a1a1a] mb-3">Historique</h3>
          <div className="space-y-2">
            {past.map(obj => (
              <div key={obj.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-[#e5e7eb]">
                <div>
                  <p className="text-sm font-semibold text-[#6b7280]">{OBJECTIVE_TYPE_LABELS[obj.type] || obj.type}</p>
                  <p className="text-xs text-[#6b7280]">{format(parseISO(obj.period_start), 'd MMM yyyy', { locale: fr })} → {format(parseISO(obj.period_end), 'd MMM yyyy', { locale: fr })}</p>
                </div>
                <p className="text-sm font-bold text-[#6b7280]">{obj.target_value.toLocaleString('fr-CA')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <ObjectiveModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        userId={member?.id}
        role={member?.role}
        onCreated={refetch}
      />
    </div>
  )
}

function TasksTab({ member, tasks, loading, refetch }) {
  return (
    <div className="space-y-4">
      {loading ? (
        <SkeletonCard />
      ) : (
        <>
          <TaskSection tasks={tasks} priority="prioritaire" userId={member?.id} onUpdate={refetch} isAdmin={true} />
          <TaskSection tasks={tasks} priority="secondaire" userId={member?.id} onUpdate={refetch} isAdmin={true} />
        </>
      )}
    </div>
  )
}

function EODReportItem({ report }) {
  const [expanded, setExpanded] = useState(false)
  const dataKeys = Object.keys(report.data || {})

  return (
    <div className="border border-[#e5e7eb] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div>
          <p className="text-sm font-semibold text-[#1a1a1a]">
            Rapport du {format(parseISO(report.report_date), 'd MMMM yyyy', { locale: fr })}
          </p>
          <p className="text-xs text-[#6b7280]">Soumis à {format(new Date(report.submitted_at), 'HH:mm', { locale: fr })}</p>
        </div>
        <svg className={`w-4 h-4 text-[#6b7280] transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="px-4 py-3 bg-gray-50 border-t border-[#e5e7eb]">
          {dataKeys.length === 0 ? (
            <p className="text-sm text-[#6b7280]">Aucune donnée.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {dataKeys.map(k => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-[#6b7280] font-semibold">{k} :</span>
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
  const [period, setPeriod] = useState('mois')
  const [kpiModalOpen, setKpiModalOpen] = useState(false)
  const { entries, loading: kpiLoading, refetch: refetchKPIs } = useKPIEntries({ userId })
  const { reports, loading: eodLoading } = useEODReports({ userId })

  const periods = [
    { value: 'semaine', label: 'Semaine' },
    { value: 'mois', label: 'Mois' },
    { value: 'trimestre', label: 'Trimestre' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {periods.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              period === p.value ? 'bg-[#00bbb1] text-white' : 'bg-white text-[#6b7280] border border-[#e5e7eb] hover:bg-gray-50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-[#1a1a1a]">Entrées KPI</h3>
          <Button size="sm" onClick={() => setKpiModalOpen(true)}>+ Ajouter un KPI</Button>
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
                  {entry.notes && <p className="text-xs text-[#6b7280] mt-0.5">{entry.notes}</p>}
                </div>
                <p className="text-lg font-bold text-[#1a1a1a]">{entry.value.toLocaleString('fr-CA')}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-bold text-[#1a1a1a] mb-3">Rapports End of Day</h3>
        {eodLoading ? <SkeletonCard /> : reports.length === 0 ? (
          <Card className="p-5"><p className="text-sm text-[#6b7280]">Aucun rapport soumis.</p></Card>
        ) : (
          <div className="space-y-2">
            {reports.map(r => <EODReportItem key={r.id} report={r} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function CareerTab({ member, onMemberUpdated }) {
  const [baseSalary, setBaseSalary] = useState(member?.base_salary ?? null)
  const { bonus, achievement, loading: bonusLoading, quarterStart, quarterEnd } = useQuarterlyBonus(member?.id, baseSalary)

  return (
    <div className="space-y-6">
      <BonusTracker
        bonus={bonus}
        achievement={achievement}
        loading={bonusLoading}
        quarterStart={quarterStart}
        quarterEnd={quarterEnd}
        baseSalary={baseSalary}
      />
      <CareerPlanEditor
        userId={member?.id}
        baseSalary={baseSalary}
        onBaseSalaryUpdated={val => { setBaseSalary(val); onMemberUpdated?.() }}
      />
    </div>
  )
}

export default function MembreDossier() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState(0)
  const { member, loading: memberLoading, refetch: refetchMember } = useMember(id)
  const { objectives, loading: objLoading, refetch: refetchObj } = useObjectives(id)
  const { tasks, loading: tasksLoading, refetch: refetchTasks } = useTasks({ userId: id })

  if (memberLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </Layout>
    )
  }

  if (!member) {
    return (
      <Layout>
        <Card className="p-8 text-center">
          <p className="text-[#6b7280]">Membre introuvable.</p>
          <Button className="mt-4" variant="secondary" onClick={() => navigate('/membres')}>Retour</Button>
        </Card>
      </Layout>
    )
  }

  return (
    <Layout>
      {/* En-tête */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/membres')} className="p-2 rounded-lg hover:bg-gray-100 text-[#6b7280] transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-4 flex-1">
          <div className="w-14 h-14 rounded-2xl bg-[#00bbb1]/10 flex items-center justify-center text-[#00bbb1] font-bold text-xl">
            {member.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a1a]">{member.full_name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={member.role}>{ROLE_LABELS[member.role] || member.role}</Badge>
              <Badge variant={member.is_active ? 'success' : 'default'}>{member.is_active ? 'Actif' : 'Inactif'}</Badge>
            </div>
          </div>
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

      {/* Contenu des onglets */}
      {activeTab === 0 && (
        <ObjectivesTab member={member} objectives={objectives} loading={objLoading} refetch={refetchObj} />
      )}
      {activeTab === 1 && (
        <TasksTab member={member} tasks={tasks} loading={tasksLoading} refetch={refetchTasks} />
      )}
      {activeTab === 2 && (
        <KPIsTab userId={id} userRole={member.role} />
      )}
      {activeTab === 3 && (
        <CareerTab member={member} onMemberUpdated={refetchMember} />
      )}
    </Layout>
  )
}
