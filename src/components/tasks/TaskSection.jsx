import { useState } from 'react'
import TaskItem from './TaskItem'
import TaskModal from './TaskModal'
import Button from '../shared/Button'

const CONFIG = {
  prioritaire: {
    label: 'Prioritaire',
    dot: 'bg-red-400',
    accent: '#ef4444',
    accentLight: 'bg-red-50 text-red-600',
    emptyText: 'Aucune tâche prioritaire pour le moment.',
  },
  secondaire: {
    label: 'Secondaire',
    dot: 'bg-amber-400',
    accent: '#f59e0b',
    accentLight: 'bg-amber-50 text-amber-600',
    emptyText: 'Aucune tâche secondaire pour le moment.',
  },
}

export default function TaskSection({ tasks, priority, userId, onUpdate, isAdmin, showMember = false, currentUserId }) {
  const [modalOpen, setModalOpen] = useState(false)

  const cfg = CONFIG[priority]
  const all = tasks.filter(t => t.priority === priority)
  const pending = all.filter(t => !t.is_completed)
  const completed = all.filter(t => t.is_completed)
  const total = all.length
  const pct = total > 0 ? Math.round((completed.length / total) * 100) : 0
  const allDone = total > 0 && pending.length === 0

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${allDone ? 'bg-emerald-400' : cfg.dot}`} />
          <span className="text-xs font-bold text-[#6b7280] uppercase tracking-wider">{cfg.label}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            allDone ? 'bg-emerald-50 text-emerald-600' : cfg.accentLight
          }`}>
            {completed.length}/{total}
          </span>
          {total > 0 && (
            <div className="w-16 h-1 bg-[#f3f4f6] rounded-full overflow-hidden ml-1">
              <div
                className="h-1 rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: allDone ? '#10b981' : cfg.accent }}
              />
            </div>
          )}
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="text-xs font-semibold text-[#00bbb1] hover:text-[#009e95] flex items-center gap-1 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Ajouter
        </button>
      </div>

      {/* Task list — pending only */}
      <div className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden">
        {pending.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-[#9ca3af]">
              {allDone && total > 0 ? '✓ Toutes complétées' : cfg.emptyText}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#f3f4f6]">
            {pending.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                onUpdate={onUpdate}
                isAdmin={isAdmin}
                showMember={showMember}
                currentUserId={currentUserId}
              />
            ))}
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
