import { useState } from 'react'
import Layout from '../components/layout/Layout'
import Card from '../components/shared/Card'
import Button from '../components/shared/Button'
import TaskSection from '../components/tasks/TaskSection'
import TaskItem from '../components/tasks/TaskItem'
import TaskModal from '../components/tasks/TaskModal'
import { SkeletonCard } from '../components/shared/Skeleton'
import { useTasks } from '../hooks/useTasks'
import { useMembers } from '../hooks/useMembers'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

function MemberProgressHeader({ tasks }) {
  const prioritaire = tasks.filter(t => t.priority === 'prioritaire' && !t.is_completed)
  const done = tasks.filter(t => t.priority === 'prioritaire' && t.is_completed).length
  const total = tasks.filter(t => t.priority === 'prioritaire').length
  if (total === 0) return null

  const pct = Math.round((done / total) * 100)
  const allDone = done === total

  const state = allDone ? 'done' : pct >= 75 ? 'almost' : pct >= 50 ? 'half' : done > 0 ? 'started' : 'fresh'
  const config = {
    done:    { label: 'Toutes les priorités complétées !', sub: 'Excellent travail aujourd\'hui.', color: '#10b981', bg: 'bg-emerald-50 border-emerald-100' },
    almost:  { label: `${done}/${total} priorités complétées`, sub: 'Presque fini, continue !', color: '#f97316', bg: 'bg-orange-50 border-orange-100' },
    half:    { label: `${done}/${total} priorités complétées`, sub: 'Bonne progression, garde le rythme.', color: '#3b82f6', bg: 'bg-blue-50 border-blue-100' },
    started: { label: `${done}/${total} priorité${done > 1 ? 's' : ''} complétée${done > 1 ? 's' : ''}`, sub: 'C\'est un bon début !', color: '#f59e0b', bg: 'bg-amber-50 border-amber-100' },
    fresh:   { label: 'Priorités du jour', sub: `${total} tâche${total > 1 ? 's' : ''} à compléter`, color: '#9ca3af', bg: 'bg-gray-50 border-gray-100' },
  }
  const c = config[state]

  return (
    <div className={`rounded-2xl border p-4 mb-6 ${c.bg}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-bold text-[#1a1a1a]">{c.label}</p>
          <p className="text-xs text-[#6b7280] mt-0.5">{c.sub}</p>
        </div>
        <span className="text-2xl font-black" style={{ color: c.color }}>{pct}%</span>
      </div>
      <div className="w-full bg-white/70 rounded-full h-1.5">
        <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: c.color }} />
      </div>
    </div>
  )
}

function CompletedSection({ tasks, isAdmin, showMember, currentUserId, onUpdate }) {
  const [expanded, setExpanded] = useState(true)

  const completed = [...tasks]
    .filter(t => t.is_completed)
    .sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0))

  if (completed.length === 0) return null

  // Group by date
  const groups = {}
  completed.forEach(t => {
    const key = t.completed_at
      ? format(new Date(t.completed_at), 'd MMMM yyyy', { locale: fr })
      : 'Date inconnue'
    if (!groups[key]) groups[key] = []
    groups[key].push(t)
  })

  return (
    <div>
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 mb-2 px-1 w-full group"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
        <span className="text-xs font-bold text-[#6b7280] uppercase tracking-wider">Terminées</span>
        <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-600 rounded-full px-2 py-0.5">
          {completed.length}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-[#9ca3af] ml-auto transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="space-y-3">
          {Object.entries(groups).map(([date, items]) => (
            <div key={date}>
              <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider px-1 mb-1">{date}</p>
              <div className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden divide-y divide-[#f3f4f6]">
                {items.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onUpdate={onUpdate}
                    isAdmin={isAdmin}
                    showMember={showMember}
                    currentUserId={currentUserId}
                    showCompletedAt
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatPill({ value, label, color }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-5 py-3">
      <span className="text-2xl font-black" style={{ color }}>{value}</span>
      <span className="text-xs font-semibold text-[#9ca3af]">{label}</span>
    </div>
  )
}

export default function Taches() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [memberFilter, setMemberFilter] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  const taskFilters = isAdmin
    ? { ...(memberFilter && { userId: memberFilter }) }
    : { userId: profile?.id }

  const { tasks, loading, refetch } = useTasks(taskFilters)
  const { members } = useMembers()

  const pendingCount = tasks.filter(t => !t.is_completed).length
  const doneCount = tasks.filter(t => t.is_completed).length
  const overdueCount = tasks.filter(t =>
    !t.is_completed && t.due_date && new Date(t.due_date + 'T23:59:59') < new Date()
  ).length

  const filteredMembers = members.filter(m => m.role !== 'admin')
  const currentUserId = profile?.id

  const taskSectionProps = {
    tasks,
    onUpdate: refetch,
    isAdmin,
    showMember: isAdmin && !memberFilter,
    currentUserId,
    userId: isAdmin ? (memberFilter || null) : profile?.id,
  }

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Tâches</h1>
          <p className="text-sm text-[#9ca3af] mt-0.5">
            {isAdmin ? 'Gérez les tâches de votre équipe' : 'Vos tâches du moment'}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Nouvelle tâche
        </Button>
      </div>

      {/* Stats */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex divide-x divide-[#e5e7eb]">
          <StatPill value={pendingCount} label="À faire" color="#00bbb1" />
          <StatPill value={doneCount} label="Complétées" color="#10b981" />
          <StatPill value={overdueCount} label="En retard" color={overdueCount > 0 ? '#ef4444' : '#9ca3af'} />
        </div>
      </Card>

      {/* Filtre membre (admin) */}
      {isAdmin && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setMemberFilter('')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              memberFilter === '' ? 'bg-[#00bbb1] text-white shadow-sm' : 'bg-white border border-[#e5e7eb] text-[#6b7280] hover:border-[#00bbb1]/40'
            }`}
          >
            Tous
          </button>
          {filteredMembers.map(m => (
            <button
              key={m.id}
              onClick={() => setMemberFilter(m.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                memberFilter === m.id ? 'bg-[#00bbb1] text-white shadow-sm' : 'bg-white border border-[#e5e7eb] text-[#6b7280] hover:border-[#00bbb1]/40'
              }`}
            >
              {m.full_name.split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      {/* Bannière progression (membre) */}
      {!isAdmin && !loading && <MemberProgressHeader tasks={tasks} />}

      {/* Sections */}
      {loading ? (
        <div className="space-y-6">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="space-y-6">
          <TaskSection {...taskSectionProps} priority="prioritaire" />
          <TaskSection {...taskSectionProps} priority="secondaire" />
          <CompletedSection
            tasks={tasks}
            isAdmin={isAdmin}
            showMember={isAdmin && !memberFilter}
            currentUserId={currentUserId}
            onUpdate={refetch}
          />
        </div>
      )}

      <TaskModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        userId={isAdmin ? (memberFilter || null) : profile?.id}
        onCreated={refetch}
        isAdmin={isAdmin}
      />
    </Layout>
  )
}
