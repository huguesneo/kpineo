import { useState, useRef, useEffect } from 'react'
import TaskItem from './TaskItem'
import TaskModal from './TaskModal'

// ─── Helpers ────────────────────────────────────────────────────────────────

function getFrequencyGroup(rule) {
  if (!rule) return 'other'
  if (rule.type === 'daily')   return 'daily'
  if (rule.type === 'weekly')  return 'weekly'
  if (rule.type === 'monthly') return 'monthly'
  return 'other'
}

const FREQ_ORDER = ['daily', 'weekly', 'monthly', 'other']

const FREQ_CONFIG = {
  daily:   { label: 'Quotidien',    icon: '☀️',  defaultOpen: true  },
  weekly:  { label: 'Hebdomadaire', icon: '📅',  defaultOpen: false },
  monthly: { label: 'Mensuel',      icon: '🗓️',  defaultOpen: false },
  other:   { label: 'Récurrent',    icon: '🔁',  defaultOpen: false },
}

const PRIORITY_CONFIG = {
  prioritaire: {
    label:       'Prioritaire',
    dot:         'bg-red-400',
    accent:      '#ef4444',
    accentLight: 'bg-red-50 text-red-600',
  },
  secondaire: {
    label:       'Secondaire',
    dot:         'bg-amber-400',
    accent:      '#f59e0b',
    accentLight: 'bg-amber-50 text-amber-600',
  },
}

// ─── FrequencyGroup ──────────────────────────────────────────────────────────

function FrequencyGroup({ label, icon, tasks, defaultOpen, onUpdate, currentUserId }) {
  const [open, setOpen] = useState(defaultOpen)
  if (tasks.length === 0) return null

  return (
    <div className="border-b border-[#f3f4f6] last:border-b-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-4 py-2.5 hover:bg-gray-50/80 transition-colors"
      >
        <span className="text-sm leading-none">{icon}</span>
        <span className="text-xs font-semibold text-[#6b7280] flex-1 text-left">{label}</span>
        <span className="text-[10px] font-bold text-[#9ca3af] bg-gray-100 rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
          {tasks.length}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-[#9ca3af] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="divide-y divide-[#f3f4f6]">
          {tasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              onUpdate={onUpdate}
              isAdmin={false}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── OnetimeList (progressive disclosure) ───────────────────────────────────

function OnetimeList({ tasks, onUpdate, currentUserId }) {
  const prevFirstIdRef = useRef(tasks[0]?.id)
  const [highlightId, setHighlightId] = useState(null)

  const firstId = tasks[0]?.id
  useEffect(() => {
    if (firstId && firstId !== prevFirstIdRef.current) {
      prevFirstIdRef.current = firstId
      setHighlightId(firstId)
      const t = setTimeout(() => setHighlightId(null), 800)
      return () => clearTimeout(t)
    }
  }, [firstId])

  return (
    <div className="divide-y divide-[#f3f4f6]">
      {tasks.slice(0, 3).map((task, i) => {
        const isLocked      = i > 0
        const isJustReveled = task.id === highlightId

        return (
          <div
            key={task.id}
            className={`transition-all duration-300 ${
              isLocked
                ? 'blur-[3px] pointer-events-none select-none opacity-50'
                : isJustReveled
                ? 'bg-emerald-50/60'
                : ''
            }`}
          >
            <TaskItem
              task={task}
              onUpdate={onUpdate}
              isAdmin={false}
              currentUserId={currentUserId}
            />
          </div>
        )
      })}

      {tasks.length > 3 && (
        <div className="px-4 py-2.5 text-center bg-gray-50/40">
          <p className="text-xs font-semibold text-[#9ca3af]">
            + {tasks.length - 3} tâche{tasks.length - 3 > 1 ? 's' : ''} en attente
          </p>
        </div>
      )}
    </div>
  )
}

// ─── MemberTaskSection ───────────────────────────────────────────────────────

export default function MemberTaskSection({
  tasks,
  priority,
  onUpdate,
  currentUserId,
  userId,
  weeklyPoints,
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const cfg = PRIORITY_CONFIG[priority]

  const pending   = tasks.filter(t => !t.is_completed)
  const completed = tasks.filter(t => t.is_completed)
  const total     = tasks.length
  const pct       = total > 0 ? Math.round((completed.length / total) * 100) : 0
  const allDone   = total > 0 && pending.length === 0

  // Split pending by type
  const recurring = pending.filter(t => t.task_type === 'recurrente')
  // Ponctuelles: separate active queue from those awaiting admin approval
  const allOneTime = pending
    .filter(t => t.task_type === 'ponctuelle')
    .sort((a, b) =>
      (a.priority_order ?? 0) - (b.priority_order ?? 0) ||
      new Date(a.created_at) - new Date(b.created_at)
    )
  const oneTime     = allOneTime.filter(t => !t.pending_approval)
  const pendingAppr = allOneTime.filter(t => t.pending_approval)

  // Group recurring by frequency
  const freqGroups = {}
  recurring.forEach(task => {
    const g = getFrequencyGroup(task.recurrence_rule)
    if (!freqGroups[g]) freqGroups[g] = []
    freqGroups[g].push(task)
  })

  const hasRecurring  = recurring.length > 0
  const hasOneTime    = oneTime.length > 0
  const hasPendingAppr = pendingAppr.length > 0

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2 flex-wrap">
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
          {priority === 'secondaire' && weeklyPoints != null && weeklyPoints > 0 && (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
              +{weeklyPoints} pts cette semaine
            </span>
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

      {/* Content card */}
      <div className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden">

        {/* ── Empty / All-done states ── */}
        {total === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-[#9ca3af]">Aucune tâche pour le moment.</p>
          </div>
        ) : allDone ? (
          <div className="px-4 py-6 text-center">
            <p className="text-sm font-semibold text-emerald-600">✓ Toutes complétées</p>
          </div>
        ) : (
          <>
            {/* ── Recurring sub-groups ── */}
            {hasRecurring && FREQ_ORDER.map(freq =>
              freqGroups[freq] ? (
                <FrequencyGroup
                  key={freq}
                  label={FREQ_CONFIG[freq].label}
                  icon={FREQ_CONFIG[freq].icon}
                  tasks={freqGroups[freq]}
                  defaultOpen={FREQ_CONFIG[freq].defaultOpen}
                  onUpdate={onUpdate}
                  currentUserId={currentUserId}
                />
              ) : null
            )}

            {/* ── Ponctuelles en attente d'approbation ── */}
            {hasPendingAppr && (
              <div className={`${hasRecurring ? 'border-t border-[#f3f4f6]' : ''}`}>
                {(hasRecurring || hasOneTime) && (
                  <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider px-4 pt-3 pb-1">
                    ⏳ En attente d'approbation
                  </p>
                )}
                <div className="divide-y divide-[#f3f4f6]">
                  {pendingAppr.map(task => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onUpdate={onUpdate}
                      isAdmin={false}
                      currentUserId={currentUserId}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Ponctuelles — progressive disclosure ── */}
            {hasOneTime ? (
              <div className={hasRecurring || hasPendingAppr ? 'border-t border-[#f3f4f6]' : ''}>
                {(hasRecurring || hasPendingAppr) && (
                  <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider px-4 pt-3 pb-1">
                    Ponctuelles
                  </p>
                )}
                <OnetimeList
                  tasks={oneTime}
                  onUpdate={onUpdate}
                  currentUserId={currentUserId}
                />
              </div>
            ) : !hasPendingAppr ? (
              /* All ponctuelles done/submitted — show clean state */
              <div className={`px-4 py-3 text-center ${hasRecurring ? 'border-t border-[#f3f4f6]' : ''}`}>
                <p className="text-xs font-semibold text-emerald-500">Tout est clean 🎯</p>
              </div>
            ) : null}
          </>
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
