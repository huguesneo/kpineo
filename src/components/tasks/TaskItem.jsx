import { useState } from 'react'
import { toggleTaskCompletion, deleteTask, stopRecurrence, formatRecurrenceLabel } from '../../hooks/useTasks'
import { format, isPast, isToday, isTomorrow } from 'date-fns'
import { fr } from 'date-fns/locale'

function dueDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  if (isToday(d))    return "Aujourd'hui"
  if (isTomorrow(d)) return 'Demain'
  return format(d, 'd MMM', { locale: fr })
}

export default function TaskItem({
  task,
  onUpdate,
  isAdmin,
  showMember     = false,
  currentUserId,
  showCompletedAt = false,
}) {
  // completed state (is_completed)
  const [optimistic, setOptimistic]   = useState(task.is_completed)
  // pending approval state
  const [isPending, setIsPending]     = useState(task.pending_approval ?? false)
  const [toggling, setToggling]       = useState(false)
  const [stopping, setStopping]       = useState(false)

  // Animation "+X pts"
  const [pointsAnimMounted,  setPointsAnimMounted]  = useState(false)
  const [pointsAnimVisible,  setPointsAnimVisible]  = useState(false)

  const canDelete   = isAdmin || (task.created_by === currentUserId)
  const creatorName = task.creator?.full_name

  async function handleToggle() {
    if (toggling) return
    setToggling(true)

    // ── Secondaire + non-admin : flux approbation ──────────────────────────
    if (!isAdmin && task.priority === 'secondaire') {
      if (!optimistic && !isPending) {
        // Cocher → en attente
        setIsPending(true)
        const { error } = await toggleTaskCompletion(task.id, true, task, false)
        if (error) setIsPending(false)
        else onUpdate?.()
      } else if (isPending) {
        // Décocher → annuler l'attente
        setIsPending(false)
        const { error } = await toggleTaskCompletion(task.id, false, { ...task, pending_approval: true }, false)
        if (error) setIsPending(true)
        else onUpdate?.()
      }
      setToggling(false)
      return
    }

    // ── Flux normal (prioritaire ou admin) ────────────────────────────────
    const next = !optimistic
    setOptimistic(next)

    // Animation points (secondaire avec points, admin qui approuve directement)
    if (next && task.priority === 'secondaire' && (task.points ?? 0) > 0) {
      setPointsAnimMounted(true)
      setTimeout(() => setPointsAnimVisible(true), 20)
      setTimeout(() => setPointsAnimVisible(false), 820)
      setTimeout(() => setPointsAnimMounted(false), 1200)
    }

    const { error } = await toggleTaskCompletion(task.id, next, next ? task : null, isAdmin)
    if (error) setOptimistic(!next)
    else onUpdate?.()
    setToggling(false)
  }

  async function handleDelete() {
    if (!confirm('Supprimer cette tâche ?')) return
    await deleteTask(task.id)
    onUpdate?.()
  }

  async function handleStopRecurrence() {
    if (!confirm('Arrêter la récurrence ? Cette tâche restera mais aucune nouvelle instance ne sera créée.')) return
    setStopping(true)
    await stopRecurrence(task.id)
    setStopping(false)
    onUpdate?.()
  }

  const isOverdue   = !optimistic && !isPending && task.due_date && isPast(new Date(task.due_date + 'T23:59:59'))
  const isRecurring = !!task.recurrence_rule
  const hasPoints   = task.priority === 'secondaire' && (task.points ?? 0) > 0

  // ── Checkbox appearance ────────────────────────────────────────────────────
  // Green   = completed
  // Amber   = pending approval
  // Default = unchecked
  const checkboxClass = optimistic
    ? 'bg-[#10b981] border-[#10b981]'
    : isPending
    ? 'bg-amber-400 border-amber-400'
    : 'border-[#d1d5db] hover:border-[#00bbb1] hover:scale-110'

  return (
    <div className={`group relative flex items-start gap-3 px-4 py-3 transition-all duration-150 ${
      optimistic ? 'bg-gray-50/50' : isPending ? 'bg-amber-50/30' : 'bg-white hover:bg-[#f8fffe]'
    }`}>

      {/* Animation "+X pts" */}
      {pointsAnimMounted && (
        <span
          className={`absolute left-4 text-[11px] font-bold text-emerald-500 pointer-events-none select-none z-10
            transition-all duration-300 ${
            pointsAnimVisible ? 'opacity-100 -translate-y-5' : 'opacity-0 -translate-y-1'
          }`}
        >
          +{task.points} pts
        </span>
      )}

      {/* Checkbox */}
      <button
        onClick={handleToggle}
        disabled={toggling}
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${checkboxClass} ${toggling ? 'opacity-60' : ''}`}
      >
        {optimistic && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {isPending && !optimistic && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <p className={`text-sm font-medium leading-snug flex-1 min-w-0 ${
            optimistic ? 'line-through text-[#9ca3af]' : 'text-[#1a1a1a]'
          }`}>
            {task.title}
          </p>

          {/* Badge points */}
          {hasPoints && !optimistic && !isPending && (
            <span className="flex-shrink-0 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
              +{task.points} pts
            </span>
          )}

          {/* Badge points en attente */}
          {hasPoints && isPending && (
            <span className="flex-shrink-0 text-[10px] font-bold text-amber-500 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 animate-pulse">
              ⏳ +{task.points} pts en attente
            </span>
          )}

          {showMember && task.profiles?.full_name && (
            <span className="text-[10px] font-semibold text-[#6b7280] bg-gray-100 rounded-full px-2 py-0.5 flex-shrink-0">
              {task.profiles.full_name}
            </span>
          )}
        </div>

        {task.description && !optimistic && (
          <p className="text-xs text-[#6b7280] mt-1 leading-relaxed">{task.description}</p>
        )}

        {/* En attente d'approbation label */}
        {isPending && (
          <p className="text-[10px] font-semibold text-amber-500 mt-1">
            En attente d'approbation admin
          </p>
        )}

        {/* Meta */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {showCompletedAt && task.completed_at && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              {format(new Date(task.completed_at), "d MMM 'à' HH:mm", { locale: fr })}
            </span>
          )}
          {showCompletedAt && (
            <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
              task.priority === 'prioritaire' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'
            }`}>
              {task.priority === 'prioritaire' ? 'Prioritaire' : 'Secondaire'}
            </span>
          )}
          {creatorName && (
            <span className="text-[10px] font-medium text-[#9ca3af]">
              Créée par {creatorName}
            </span>
          )}
          {isOverdue && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-500 bg-red-50 rounded-full px-2 py-0.5">
              <span className="w-1 h-1 rounded-full bg-red-500 inline-block" />
              En retard · {format(new Date(task.due_date + 'T00:00:00'), 'd MMM', { locale: fr })}
            </span>
          )}
          {task.due_date && !isOverdue && !optimistic && !showCompletedAt && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#9ca3af]">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {dueDateLabel(task.due_date)}
            </span>
          )}
          {isRecurring && !optimistic && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#00bbb1] bg-[#00bbb1]/8 rounded-full px-2 py-0.5">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {formatRecurrenceLabel(task.recurrence_rule)}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {isAdmin && isRecurring && (
          <button
            onClick={handleStopRecurrence}
            disabled={stopping}
            className="p-1.5 rounded-lg hover:bg-amber-50 text-[#d1d5db] hover:text-amber-500 transition-colors"
            title="Arrêter la récurrence"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </button>
        )}
        {canDelete && (
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg hover:bg-red-50 text-[#d1d5db] hover:text-red-400 transition-colors"
            title="Supprimer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
