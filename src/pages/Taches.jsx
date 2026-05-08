import { useState } from 'react'
import { Link } from 'react-router-dom'
import { startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import { format } from 'date-fns'
import Layout from '../components/layout/Layout'
import Card from '../components/shared/Card'
import Button from '../components/shared/Button'
import TaskSection from '../components/tasks/TaskSection'
import MemberTaskSection from '../components/tasks/MemberTaskSection'
import TaskItem from '../components/tasks/TaskItem'
import TaskModal from '../components/tasks/TaskModal'
import { SkeletonCard } from '../components/shared/Skeleton'
import { useTasks, usePendingApprovalTasks, approveTask, rejectTask } from '../hooks/useTasks'
import { useMembers } from '../hooks/useMembers'
import { useAuth } from '../context/AuthContext'
import { useUserPoints } from '../hooks/usePoints'
import { useTeamPoints } from '../hooks/useRewards'

// ─── TeamPointsOverview (admin) ──────────────────────────────────────────────

function TeamPointsOverview() {
  const { teamPoints, loading } = useTeamPoints()
  if (loading) return null
  if (teamPoints.length === 0) return null

  return (
    <div className="mb-6">
      <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wider px-1 mb-2">Points équipe</p>
      <div className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden">
        <div className="divide-y divide-[#f3f4f6]">
          {teamPoints.map((row, i) => {
            const streak = row.current_streak_days ?? 0
            return (
              <div key={row.user_id} className="flex items-center gap-3 px-4 py-3">
                {/* Rank */}
                <span className="w-5 text-center text-[10px] font-bold text-[#9ca3af]">{i + 1}</span>
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-[#00bbb1]/10 flex items-center justify-center text-[#00bbb1] text-xs font-bold flex-shrink-0">
                  {row.profiles?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                </div>
                {/* Name */}
                <p className="flex-1 text-sm font-semibold text-[#1a1a1a] min-w-0 truncate">
                  {row.profiles?.full_name ?? '—'}
                </p>
                {/* Ce mois */}
                <div className="text-center min-w-[56px]">
                  <p className="text-xs font-black text-[#00bbb1]">+{row.points_current_month ?? 0}</p>
                  <p className="text-[9px] text-[#9ca3af] font-semibold">ce mois</p>
                </div>
                {/* Total */}
                <div className="text-center min-w-[52px]">
                  <p className="text-xs font-black text-[#1a1a1a]">{row.points_total ?? 0}</p>
                  <p className="text-[9px] text-[#9ca3af] font-semibold">total</p>
                </div>
                {/* Streak */}
                <div className="flex items-center gap-1 min-w-[36px] justify-end">
                  <span className="text-sm">{streak > 0 ? '🔥' : '·'}</span>
                  {streak > 0 && <span className="text-xs font-bold text-[#1a1a1a]">{streak}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── ApprovalSection (admin) ─────────────────────────────────────────────────

function ApprovalSection({ memberFilter, onApproved }) {
  const { tasks, loading, refetch } = usePendingApprovalTasks(memberFilter || null)
  const [actioning, setActioning]   = useState(null)

  if (loading) return null
  if (tasks.length === 0) return null

  async function handleApprove(task) {
    setActioning(`approve-${task.id}`)
    await approveTask(task.id, task)
    setActioning(null)
    refetch()
    onApproved?.()
  }

  async function handleReject(task) {
    setActioning(`reject-${task.id}`)
    await rejectTask(task.id, task)
    setActioning(null)
    refetch()
    onApproved?.()
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
        <span className="text-xs font-bold text-[#6b7280] uppercase tracking-wider">En attente d'approbation</span>
        <span className="text-[10px] font-bold bg-amber-50 text-amber-600 rounded-full px-2 py-0.5">
          {tasks.length}
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden divide-y divide-[#f3f4f6]">
        {tasks.map(task => {
          const hasPoints = task.priority === 'secondaire' && (task.points ?? 0) > 0
          const memberName = task.profiles?.full_name
          return (
            <div key={task.id} className="flex items-center gap-3 px-4 py-3">
              {/* Pending icon */}
              <div className="w-5 h-5 rounded-full border-2 border-amber-400 bg-amber-400 flex items-center justify-center flex-shrink-0">
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#1a1a1a] truncate">{task.title}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {memberName && (
                    <span className="text-[10px] font-semibold text-[#6b7280] bg-gray-100 rounded-full px-2 py-0.5">
                      {memberName}
                    </span>
                  )}
                  {hasPoints && (
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                      +{task.points} pts
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleApprove(task)}
                  disabled={!!actioning}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-60"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Approuver
                </button>
                <button
                  onClick={() => handleReject(task)}
                  disabled={!!actioning}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-500 text-xs font-bold hover:bg-red-100 active:scale-95 transition-all disabled:opacity-60"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Refuser
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── PointsStreakHeader (membre) ─────────────────────────────────────────────

function PointsStreakHeader({ userId, tasks }) {
  const { points } = useUserPoints(userId)

  const prioritaireAll   = tasks.filter(t => t.priority === 'prioritaire')
  const prioritaireDone  = prioritaireAll.filter(t => t.is_completed).length
  const prioritaireTotal = prioritaireAll.length
  const pct    = prioritaireTotal > 0 ? Math.round((prioritaireDone / prioritaireTotal) * 100) : 0
  const allOk  = prioritaireTotal > 0 && prioritaireDone === prioritaireTotal

  const streak  = points?.current_streak_days  ?? 0
  const monthly = points?.points_current_month ?? 0
  const total   = points?.points_total         ?? 0
  const pending = points?.points_pending       ?? 0

  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-gradient-to-br from-white to-[#f0fdfc] p-4 mb-6">
      <div className="flex items-center justify-between gap-4">
        {/* Points */}
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-0.5">Points total</p>
            <p className="text-2xl font-black text-[#1a1a1a] leading-none">{total}</p>
          </div>
          <div className="h-8 w-px bg-[#e5e7eb]" />
          <div>
            <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-0.5">Ce mois</p>
            <p className="text-2xl font-black text-[#00bbb1] leading-none">+{monthly}</p>
          </div>
          {pending > 0 && (
            <>
              <div className="h-8 w-px bg-[#e5e7eb]" />
              <div>
                <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wide mb-0.5">En attente</p>
                <p className="text-2xl font-black text-amber-500 leading-none animate-pulse">⏳ {pending}</p>
              </div>
            </>
          )}
        </div>

        {/* Streak */}
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-2xl leading-none">{streak > 0 ? '🔥' : '✨'}</span>
          <p className="text-sm font-black text-[#1a1a1a] leading-none mt-0.5">{streak}</p>
          <p className="text-[10px] font-semibold text-[#9ca3af]">jour{streak > 1 ? 's' : ''} streak</p>
        </div>
      </div>

      {/* Prioritaires progress */}
      {prioritaireTotal > 0 && (
        <div className="mt-3 pt-3 border-t border-[#e5e7eb]/70">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-[#6b7280]">Priorités du jour</p>
            <p className="text-xs font-bold" style={{ color: allOk ? '#10b981' : '#f59e0b' }}>
              {prioritaireDone}/{prioritaireTotal}
            </p>
          </div>
          <div className="w-full bg-[#f3f4f6] rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, backgroundColor: allOk ? '#10b981' : '#00bbb1' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── CompletedSection ────────────────────────────────────────────────────────

function CompletedSection({ tasks, isAdmin, showMember, currentUserId, onUpdate }) {
  const [expanded, setExpanded] = useState(true)

  const completed = [...tasks]
    .filter(t => t.is_completed)
    .sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0))

  if (completed.length === 0) return null

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

// ─── StatPill ────────────────────────────────────────────────────────────────

function StatPill({ value, label, color }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-5 py-3">
      <span className="text-2xl font-black" style={{ color }}>{value}</span>
      <span className="text-xs font-semibold text-[#9ca3af]">{label}</span>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Taches() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const isRespVente = profile?.role === 'resp_vente'
  const isAdminOrRespVente = isAdmin || isRespVente

  const [memberFilter, setMemberFilter] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  const taskFilters = isAdminOrRespVente
    ? { ...(memberFilter && { userId: memberFilter }) }
    : { userId: profile?.id }

  const { tasks, loading, refetch } = useTasks(taskFilters)
  const { members: allMembers } = useMembers()

  const pendingCount = tasks.filter(t => !t.is_completed).length
  const doneCount    = tasks.filter(t => t.is_completed).length
  const overdueCount = tasks.filter(t =>
    !t.is_completed && t.due_date && new Date(t.due_date + 'T23:59:59') < new Date()
  ).length

  // resp_vente ne voit que les setters/closers dans le filtre membre
  const filteredMembers = isRespVente
    ? allMembers.filter(m => m.role === 'closer' || m.role === 'setter')
    : allMembers.filter(m => m.role !== 'admin')
  const currentUserId   = profile?.id

  // Weekly points earned (secondaire tasks completed this week)
  const weekStart     = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weeklyPoints  = tasks
    .filter(t =>
      t.priority === 'secondaire' &&
      t.is_completed &&
      t.completed_at &&
      new Date(t.completed_at) >= weekStart
    )
    .reduce((sum, t) => sum + (t.points ?? 0), 0)

  // Admin / RespVente task section props
  const taskSectionProps = {
    tasks,
    onUpdate:   refetch,
    isAdmin:    isAdminOrRespVente,
    showMember: isAdminOrRespVente && !memberFilter,
    currentUserId,
    userId:     isAdminOrRespVente ? (memberFilter || null) : profile?.id,
  }

  // Member task section props (shared)
  const memberSectionProps = {
    onUpdate:      refetch,
    currentUserId,
    userId:        profile?.id,
  }

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Tâches</h1>
          <p className="text-sm text-[#9ca3af] mt-0.5">
            {isAdminOrRespVente ? 'Gérez les tâches de votre équipe' : 'Vos tâches du moment'}
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
          <StatPill value={pendingCount} label="À faire"    color="#00bbb1" />
          <StatPill value={doneCount}    label="Complétées" color="#10b981" />
          <StatPill value={overdueCount} label="En retard"  color={overdueCount > 0 ? '#ef4444' : '#9ca3af'} />
        </div>
      </Card>

      {/* Member filter (admin + resp_vente) */}
      {isAdminOrRespVente && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setMemberFilter('')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              memberFilter === ''
                ? 'bg-[#00bbb1] text-white shadow-sm'
                : 'bg-white border border-[#e5e7eb] text-[#6b7280] hover:border-[#00bbb1]/40'
            }`}
          >
            Tous
          </button>
          {filteredMembers.map(m => (
            <button
              key={m.id}
              onClick={() => setMemberFilter(m.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                memberFilter === m.id
                  ? 'bg-[#00bbb1] text-white shadow-sm'
                  : 'bg-white border border-[#e5e7eb] text-[#6b7280] hover:border-[#00bbb1]/40'
              }`}
            >
              {m.full_name.split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-6">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : isAdminOrRespVente ? (
        /* ── Admin / RespVente view ── */
        <div className="space-y-6">
          {isAdmin && <TeamPointsOverview />}
          <ApprovalSection memberFilter={memberFilter} onApproved={refetch} />
          <TaskSection {...taskSectionProps} priority="prioritaire" />
          <TaskSection {...taskSectionProps} priority="secondaire" />
          <CompletedSection
            tasks={tasks}
            isAdmin={isAdminOrRespVente}
            showMember={isAdminOrRespVente && !memberFilter}
            currentUserId={currentUserId}
            onUpdate={refetch}
          />
        </div>
      ) : (
        /* ── Member view ── */
        <div className="space-y-6">
          <PointsStreakHeader userId={profile?.id} tasks={tasks} />

          <MemberTaskSection
            {...memberSectionProps}
            tasks={tasks.filter(t => t.priority === 'prioritaire')}
            priority="prioritaire"
          />

          <MemberTaskSection
            {...memberSectionProps}
            tasks={tasks.filter(t => t.priority === 'secondaire')}
            priority="secondaire"
            weeklyPoints={weeklyPoints}
          />

          <CompletedSection
            tasks={tasks}
            isAdmin={false}
            showMember={false}
            currentUserId={currentUserId}
            onUpdate={refetch}
          />

          {/* Boutique link */}
          <div className="text-center pb-2">
            <Link
              to="/boutique"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#00bbb1] hover:text-[#009e95] transition-colors group"
            >
              <span className="text-base">🛍️</span>
              Boutique de récompenses
              <svg
                className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      )}

      <TaskModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        userId={isAdminOrRespVente ? (memberFilter || null) : profile?.id}
        onCreated={refetch}
        isAdmin={isAdmin}
        isRespVente={isRespVente}
      />
    </Layout>
  )
}
