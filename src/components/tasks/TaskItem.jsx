import { useState } from 'react'
import { toggleTaskCompletion, deleteTask } from '../../hooks/useTasks'
import { format, isPast } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function TaskItem({ task, onUpdate, isAdmin, showMember = false }) {
  const [optimistic, setOptimistic] = useState(task.is_completed)
  const [toggling, setToggling] = useState(false)
  const [justDone, setJustDone] = useState(false)

  async function handleToggle() {
    if (toggling) return
    const next = !optimistic
    setOptimistic(next)
    setToggling(true)
    if (next) { setJustDone(true); setTimeout(() => setJustDone(false), 500) }
    const { error } = await toggleTaskCompletion(task.id, next)
    if (error) setOptimistic(!next)
    else onUpdate?.()
    setToggling(false)
  }

  async function handleDelete() {
    if (!confirm('Supprimer cette tâche ?')) return
    await deleteTask(task.id)
    onUpdate?.()
  }

  const isOverdue = !optimistic && task.due_date && isPast(new Date(task.due_date + 'T23:59:59'))

  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border transition-all duration-200 ${
      optimistic
        ? 'bg-gray-50/60 border-gray-100'
        : 'bg-white border-[#e5e7eb] hover:border-[#00bbb1]/40 hover:shadow-sm'
    } ${justDone ? 'scale-[1.005]' : ''}`}>

      {/* Checkbox */}
      <button
        onClick={handleToggle}
        disabled={toggling}
        className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150 ${
          optimistic
            ? 'bg-[#10b981] border-[#10b981]'
            : 'border-gray-300 hover:border-[#00bbb1] hover:scale-110 active:scale-90'
        } ${toggling ? 'opacity-50' : ''}`}
      >
        {optimistic && (
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Contenu */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm font-semibold leading-snug ${optimistic ? 'line-through text-gray-400' : 'text-[#1a1a1a]'}`}>
            {task.title}
          </p>
          {showMember && task.profiles?.full_name && (
            <span className="text-[10px] font-semibold text-[#6b7280] bg-gray-100 rounded-full px-2 py-0.5">
              {task.profiles.full_name}
            </span>
          )}
        </div>
        {task.description && !optimistic && (
          <p className="text-xs text-[#6b7280] mt-0.5 leading-relaxed">{task.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {isOverdue && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-50 rounded-full px-2 py-0.5">
              ⚠ En retard · {format(new Date(task.due_date + 'T00:00:00'), 'd MMM', { locale: fr })}
            </span>
          )}
          {task.due_date && !isOverdue && !optimistic && (
            <span className="text-xs text-[#6b7280]">
              📅 {format(new Date(task.due_date + 'T00:00:00'), 'd MMM yyyy', { locale: fr })}
            </span>
          )}
          {optimistic && task.completed_at && (
            <span className="text-[10px] text-gray-300 font-semibold">
              ✓ {format(new Date(task.completed_at), 'd MMM', { locale: fr })}
            </span>
          )}
        </div>
      </div>

      {isAdmin && (
        <button
          onClick={handleDelete}
          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-200 hover:text-red-400 transition-colors flex-shrink-0"
          title="Supprimer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  )
}
