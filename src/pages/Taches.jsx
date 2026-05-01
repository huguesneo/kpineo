import { useState } from 'react'
import Layout from '../components/layout/Layout'
import Header from '../components/layout/Header'
import Card from '../components/shared/Card'
import Button from '../components/shared/Button'
import TaskSection from '../components/tasks/TaskSection'
import TaskModal from '../components/tasks/TaskModal'
import { SkeletonCard } from '../components/shared/Skeleton'
import { useTasks } from '../hooks/useTasks'
import { useMembers } from '../hooks/useMembers'
import { useAuth } from '../context/AuthContext'

function MemberProgressBanner({ tasks }) {
  const prioritaire = tasks.filter(t => t.priority === 'prioritaire')
  const done = prioritaire.filter(t => t.is_completed).length
  const total = prioritaire.length

  if (total === 0) return null

  const pct = Math.round((done / total) * 100)
  const allDone = done === total

  let emoji = '🌱'
  let message = `${done}/${total} priorités complétées`
  let bg = 'bg-gray-50 border-[#e5e7eb]'
  let barColor = '#9ca3af'

  if (allDone) {
    emoji = '🏆'
    message = 'Toutes tes priorités sont complétées !'
    bg = 'bg-emerald-50 border-emerald-200'
    barColor = '#10b981'
  } else if (pct >= 75) {
    emoji = '🔥'
    message = `${done}/${total} priorités — presque fini !`
    bg = 'bg-orange-50 border-orange-200'
    barColor = '#f97316'
  } else if (pct >= 50) {
    emoji = '💪'
    message = `${done}/${total} priorités — bonne progression !`
    bg = 'bg-blue-50 border-blue-200'
    barColor = '#3b82f6'
  } else if (done > 0) {
    emoji = '📈'
    message = `${done}/${total} priorité${done > 1 ? 's' : ''} complétée${done > 1 ? 's' : ''}`
    bg = 'bg-amber-50 border-amber-200'
    barColor = '#f59e0b'
  }

  return (
    <Card className={`p-4 mb-6 border ${bg}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{emoji}</span>
          <div>
            <p className="text-sm font-bold text-[#1a1a1a]">Priorités du jour</p>
            <p className="text-xs text-[#6b7280]">{message}</p>
          </div>
        </div>
        <p className="text-2xl font-bold" style={{ color: barColor }}>{pct}%</p>
      </div>
      <div className="w-full bg-white/80 rounded-full h-2">
        <div
          className="h-2 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
    </Card>
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
  const overdueCount = tasks.filter(t => {
    return !t.is_completed && t.due_date && new Date(t.due_date + 'T23:59:59') < new Date()
  }).length

  return (
    <Layout>
      <Header title="Tâches" />

      {/* Compteurs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'À faire', value: pendingCount, color: '#00bbb1' },
          { label: 'Complétées', value: doneCount, color: '#10b981' },
          { label: 'En retard', value: overdueCount, color: '#ef4444' },
        ].map(s => (
          <Card key={s.label} className="p-4 flex items-center gap-3">
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-sm font-semibold text-[#6b7280]">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Filtres + bouton ajout admin */}
      {isAdmin && (
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <select
            value={memberFilter}
            onChange={e => setMemberFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
          >
            <option value="">Tous les membres</option>
            {members.filter(m => m.role !== 'admin').map(m => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
          <div className="ml-auto">
            <Button onClick={() => setAddOpen(true)}>+ Ajouter une tâche</Button>
          </div>
        </div>
      )}

      {/* Bannière progression membre */}
      {!isAdmin && !loading && <MemberProgressBanner tasks={tasks} />}

      {/* Sections */}
      {loading ? (
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="space-y-4">
          <TaskSection
            tasks={tasks}
            priority="prioritaire"
            userId={isAdmin ? (memberFilter || null) : profile?.id}
            onUpdate={refetch}
            isAdmin={isAdmin}
            showMember={isAdmin && !memberFilter}
          />
          <TaskSection
            tasks={tasks}
            priority="secondaire"
            userId={isAdmin ? (memberFilter || null) : profile?.id}
            onUpdate={refetch}
            isAdmin={isAdmin}
            showMember={isAdmin && !memberFilter}
          />
        </div>
      )}

      {isAdmin && (
        <TaskModal
          isOpen={addOpen}
          onClose={() => setAddOpen(false)}
          userId={memberFilter || null}
          onCreated={refetch}
        />
      )}
    </Layout>
  )
}
