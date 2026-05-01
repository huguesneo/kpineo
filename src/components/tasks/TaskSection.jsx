import { useState } from 'react'
import TaskItem from './TaskItem'
import TaskModal from './TaskModal'
import Button from '../shared/Button'

const CONFIG = {
  prioritaire: {
    label: 'Prioritaire',
    icon: '🔴',
    borderColor: 'border-[#ef4444]',
    barColor: '#ef4444',
    headerBg: 'bg-red-50/70',
    textColor: 'text-[#ef4444]',
    emptyText: 'Aucune tâche prioritaire.',
  },
  secondaire: {
    label: 'Secondaire',
    icon: '🟡',
    borderColor: 'border-[#f59e0b]',
    barColor: '#f59e0b',
    headerBg: 'bg-amber-50/70',
    textColor: 'text-[#f59e0b]',
    emptyText: 'Aucune tâche secondaire.',
  },
}

function MemberMotivation({ pending, total, completed }) {
  if (total === 0) return null
  const pct = Math.round((completed / total) * 100)
  if (completed === total) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl">
        <span className="text-base">🎯</span>
        <p className="text-sm font-semibold text-emerald-700">Toutes les priorités complétées — excellent travail !</p>
      </div>
    )
  }
  if (pending === 1) return (
    <p className="text-xs font-semibold text-[#6b7280] px-1">💪 Plus qu'une priorité — tu y es presque !</p>
  )
  if (pct >= 50) return (
    <p className="text-xs font-semibold text-[#6b7280] px-1">🔥 {pct}% des priorités complétées, continue !</p>
  )
  return null
}

export default function TaskSection({ tasks, priority, userId, onUpdate, isAdmin, showMember = false }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

  const cfg = CONFIG[priority]
  const all = tasks.filter(t => t.priority === priority)
  const pending = all.filter(t => !t.is_completed)
  const completed = all.filter(t => t.is_completed)
  const total = all.length
  const pct = total > 0 ? Math.round((completed.length / total) * 100) : 0
  const allDone = total > 0 && pending.length === 0

  return (
    <div className={`rounded-2xl border border-[#e5e7eb] border-l-4 ${cfg.borderColor} overflow-hidden`}>

      {/* Header */}
      <div className={`${cfg.headerBg} px-4 pt-3 pb-2`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span>{cfg.icon}</span>
            <h3 className={`font-bold text-sm uppercase tracking-wide ${cfg.textColor}`}>{cfg.label}</h3>
            <span className="text-xs text-[#6b7280] font-semibold bg-white/80 rounded-full px-2 py-0.5">
              {completed.length}/{total}
            </span>
          </div>
          {isAdmin && (
            <Button size="sm" variant="secondary" onClick={() => setModalOpen(true)}>+ Ajouter</Button>
          )}
        </div>

        {total > 0 && (
          <div className="w-full bg-white/60 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: allDone ? '#10b981' : cfg.barColor }}
            />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="bg-white px-4 py-3 space-y-2">
        {!isAdmin && priority === 'prioritaire' && (
          <MemberMotivation pending={pending.length} total={total} completed={completed.length} />
        )}

        {pending.length === 0 && completed.length === 0 && (
          <p className="text-sm text-[#6b7280] py-1">{cfg.emptyText}</p>
        )}

        {pending.map(task => (
          <TaskItem key={task.id} task={task} onUpdate={onUpdate} isAdmin={isAdmin} showMember={showMember} />
        ))}

        {completed.length > 0 && (
          <div>
            <button
              onClick={() => setShowCompleted(s => !s)}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#6b7280] hover:text-[#1a1a1a] transition-colors py-1.5 mt-1"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${showCompleted ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {completed.length} complétée{completed.length > 1 ? 's' : ''}
            </button>
            {showCompleted && (
              <div className="space-y-1.5">
                {completed.map(task => (
                  <TaskItem key={task.id} task={task} onUpdate={onUpdate} isAdmin={isAdmin} showMember={showMember} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <TaskModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        userId={userId}
        defaultPriority={priority}
        onCreated={onUpdate}
      />
    </div>
  )
}
