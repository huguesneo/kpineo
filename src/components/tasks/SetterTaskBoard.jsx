import { useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  useSetterSharedTasks,
  completeSetterTask,
  uncompleteSetterTask,
  createSetterTask,
  deleteSetterTask,
} from '../../hooks/useSetterSharedTasks'

// ─── Process steps per task type ─────────────────────────────────────────────

const TASK_PROCESS = {
  no_show: {
    intro:  "Le client ne s'est pas présenté à son appel découverte. À rappeler aujourd'hui pour reprogrammer.",
    steps: [
      "Appeler le client dans les 2h suivantes",
      "Si pas de réponse → un texto est envoyé automatiquement",
      "Si toujours pas de réponse après 24h → 2e texto + courriel",
      "Reprogrammer un nouveau RDV avec le même closer si possible",
      'Si refus → déplacer dans pipeline "Perdu sans appel"',
    ],
  },
  annulation: {
    intro:  "Le client a annulé son RDV. À rappeler pour comprendre la raison et reprogrammer si possible.",
    steps: [
      "Appeler dans les 24h pour comprendre la raison",
      "Reprogrammer immédiatement si le client est ouvert",
      "Si timing pas bon → planifier un suivi dans 2-3 semaines",
      'Si refus catégorique → déplacer dans pipeline "Perdu sans appel"',
    ],
  },
  confirmation_rdv: {
    intro:  "RDV découverte à confirmer avec le client avant l'appel.",
    steps: [
      "Appeler le client et qualifier le client",
      "S'assurer que le client est dispo",
      "Envoyer nurturing",
      "Vérifier que le questionnaire est rempli",
    ],
  },
  nouveau_lead: {
    intro:  "Nouveau lead à appeler.",
    steps: [
      "Appeler le client et qualifier le client",
      "Prendre le rendez-vous découverte",
    ],
  },
}

// ─── Date block labels per task type ──────────────────────────────────────────

const DATE_BLOCK = {
  no_show:          { heading: '📅 RDV manqué',      dateLabel: 'Date' },
  annulation:       { heading: '📅 RDV annulé',      dateLabel: 'Date' },
  confirmation_rdv: { heading: '📅 RDV à confirmer', dateLabel: 'Date' },
  nouveau_lead:     { heading: '📥 Nouveau lead',    dateLabel: 'Opt-in' },
}

// ─── Column config ────────────────────────────────────────────────────────────

const COLUMNS = [
  {
    key:         'no_show',
    label:       'No-shows',
    sublabel:    'Clients à rappeler',
    icon:        '📞',
    dot:         'bg-red-400',
    color:       '#ef4444',
    badge:       'bg-red-50 text-red-600',
    headerBg:    'bg-red-50/60',
    border:      'border-red-100',
  },
  {
    key:         'annulation',
    label:       'Annulations',
    sublabel:    'Clients à rappeler',
    icon:        '🚫',
    dot:         'bg-orange-400',
    color:       '#f97316',
    badge:       'bg-orange-50 text-orange-600',
    headerBg:    'bg-orange-50/60',
    border:      'border-orange-100',
  },
  {
    key:         'confirmation_rdv',
    label:       'Confirmation RDV',
    sublabel:    'Rendez-vous à confirmer',
    icon:        '📅',
    dot:         'bg-blue-400',
    color:       '#3b82f6',
    badge:       'bg-blue-50 text-blue-600',
    headerBg:    'bg-blue-50/60',
    border:      'border-blue-100',
  },
  {
    key:         'nouveau_lead',
    label:       'Nouveaux leads',
    sublabel:    'Leads à contacter',
    icon:        '✨',
    dot:         'bg-emerald-400',
    color:       '#10b981',
    badge:       'bg-emerald-50 text-emerald-600',
    headerBg:    'bg-emerald-50/60',
    border:      'border-emerald-100',
  },
  {
    key:         'personnel',
    label:       'Mes tâches',
    sublabel:    'Tâches personnelles',
    icon:        '✏️',
    dot:         'bg-violet-400',
    color:       '#8b5cf6',
    badge:       'bg-violet-50 text-violet-600',
    headerBg:    'bg-violet-50/60',
    border:      'border-violet-100',
    isPersonal:  true,
  },
]

// ─── AddTaskModal ─────────────────────────────────────────────────────────────

function AddTaskModal({ columnKey, columnLabel, userId, onClose, onCreated }) {
  const [title, setTitle]       = useState('')
  const [description, setDesc]  = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    const { error: err } = await createSetterTask({
      type: columnKey,
      title,
      description,
      userId,
    })
    if (err) { setError(err.message); setSaving(false); return }
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 z-10">
        <h2 className="text-base font-bold text-[#1a1a1a] mb-1">Nouvelle tâche</h2>
        <p className="text-xs text-[#9ca3af] mb-4">{columnLabel}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#6b7280] mb-1.5">Titre *</label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Décrivez la tâche…"
              className="w-full px-3 py-2.5 rounded-xl border border-[#e5e7eb] text-sm text-[#1a1a1a] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#00bbb1]/30 focus:border-[#00bbb1]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#6b7280] mb-1.5">Note (optionnelle)</label>
            <textarea
              value={description}
              onChange={e => setDesc(e.target.value)}
              rows={2}
              placeholder="Informations supplémentaires…"
              className="w-full px-3 py-2.5 rounded-xl border border-[#e5e7eb] text-sm text-[#1a1a1a] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#00bbb1]/30 focus:border-[#00bbb1] resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[#e5e7eb] text-sm font-semibold text-[#6b7280] hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="flex-1 py-2.5 rounded-xl bg-[#00bbb1] text-white text-sm font-bold hover:bg-[#009e95] active:scale-95 transition-all disabled:opacity-50"
            >
              {saving ? 'Ajout…' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── SetterTaskCard ───────────────────────────────────────────────────────────

function SetterTaskCard({ task, currentUserId, isAdminOrRespVente, onUpdate }) {
  const [optimistic, setOptimistic]   = useState(task.is_completed)
  const [toggling, setToggling]       = useState(false)
  const [showProcess, setShowProcess] = useState(false)

  const canDelete       = isAdminOrRespVente || task.created_by === currentUserId
  const completedByName = task.completed_by_profile?.full_name
  const ownerName       = task.owner?.full_name
  const process         = TASK_PROCESS[task.type]
  const hasClientInfo   = task.client_name || task.client_phone || task.client_email

  async function handleToggle() {
    if (toggling) return
    setToggling(true)
    const next = !optimistic
    setOptimistic(next)
    const { error } = next
      ? await completeSetterTask(task.id, currentUserId)
      : await uncompleteSetterTask(task.id)
    if (error) setOptimistic(!next)
    else onUpdate()
    setToggling(false)
  }

  async function handleDelete() {
    if (!confirm('Supprimer cette tâche ?')) return
    await deleteSetterTask(task.id)
    onUpdate()
  }

  return (
    <div className={`group flex items-start gap-3 px-4 py-3.5 transition-colors ${
      optimistic ? 'bg-gray-50/60' : 'bg-white hover:bg-gray-50/40'
    }`}>
      {/* Checkbox */}
      <button
        onClick={handleToggle}
        disabled={toggling}
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
          optimistic
            ? 'bg-emerald-500 border-emerald-500'
            : 'border-[#d1d5db] hover:border-[#00bbb1] hover:scale-110'
        } ${toggling ? 'opacity-60' : ''}`}
      >
        {optimistic && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-snug ${
          optimistic ? 'line-through text-[#9ca3af]' : 'text-[#1a1a1a]'
        }`}>
          {task.title}
        </p>

        {/* GHL client info block */}
        {!optimistic && hasClientInfo && (
          <div className="mt-2 rounded-xl bg-gray-50 border border-[#f0f0f0] px-3 py-2.5 space-y-1.5">
            {/* Client */}
            <div>
              <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-0.5">👤 Client</p>
              {task.client_name && (
                <p className="text-xs font-semibold text-[#1a1a1a]">{task.client_name}</p>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                {task.client_phone && (
                  <a href={`tel:${task.client_phone}`} className="text-xs text-[#00bbb1] font-medium hover:underline">
                    {task.client_phone}
                  </a>
                )}
                {task.client_email && (
                  <a href={`mailto:${task.client_email}`} className="text-xs text-[#6b7280] hover:underline truncate">
                    {task.client_email}
                  </a>
                )}
              </div>
              {task.contact_url && (
                <a
                  href={task.contact_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#00bbb1] hover:underline mt-0.5"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Fiche GHL
                </a>
              )}
            </div>

            {/* Date / RDV info — label adapts to the task type */}
            {(task.appointment_date || task.closer_name) && (
              <div className="pt-1.5 border-t border-[#ececec]">
                <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-0.5">{DATE_BLOCK[task.type]?.heading ?? '📅 RDV'}</p>
                {task.appointment_date && (
                  <p className="text-xs text-[#6b7280]">{DATE_BLOCK[task.type]?.dateLabel ?? 'Date'} : {task.appointment_date}</p>
                )}
                {task.closer_name && (
                  <p className="text-xs text-[#6b7280]">Closer : {task.closer_name}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Description (manual tasks) */}
        {!optimistic && task.description && !hasClientInfo && (
          <p className="text-xs text-[#6b7280] mt-1 leading-relaxed">{task.description}</p>
        )}

        {/* Process toggle (GHL tasks only) */}
        {!optimistic && process && hasClientInfo && (
          <div className="mt-2">
            <button
              onClick={() => setShowProcess(p => !p)}
              className="flex items-center gap-1 text-[10px] font-bold text-[#6b7280] hover:text-[#1a1a1a] transition-colors uppercase tracking-wider"
            >
              <span>🎯 Processus</span>
              <svg
                className={`w-3 h-3 transition-transform ${showProcess ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showProcess && (
              <div className="mt-1.5 rounded-xl bg-amber-50/60 border border-amber-100 px-3 py-2.5 space-y-2">
                {process.intro && (
                  <p className="text-[11px] text-[#6b7280] italic leading-relaxed">{process.intro}</p>
                )}
                <ol className="space-y-1">
                  {process.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[10px] font-black text-amber-600 mt-0.5 flex-shrink-0 w-3">{i + 1}.</span>
                      <span className="text-[11px] text-[#4b5563] leading-snug">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {optimistic && completedByName && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              {completedByName}
              {task.completed_at && ` · ${format(new Date(task.completed_at), "d MMM 'à' HH:mm", { locale: fr })}`}
            </span>
          )}
          {isAdminOrRespVente && task.type === 'personnel' && ownerName && (
            <span className="text-[10px] font-medium text-[#9ca3af] bg-gray-100 rounded-full px-2 py-0.5">
              {ownerName}
            </span>
          )}
        </div>
      </div>

      {/* Delete button */}
      {canDelete && (
        <button
          onClick={handleDelete}
          className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 text-[#d1d5db] hover:text-red-400 transition-all flex-shrink-0 mt-0.5"
          title="Supprimer"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ─── SetterTaskColumn (accordion) ─────────────────────────────────────────────

function SetterTaskColumn({ col, tasks, currentUserId, isAdminOrRespVente, onUpdate }) {
  const [open, setOpen]         = useState(false)
  const [addOpen, setAddOpen]   = useState(false)
  const [showDone, setShowDone] = useState(false)

  const pending   = tasks.filter(t => !t.is_completed)
  const completed = tasks.filter(t => t.is_completed)
  const pendingCount = pending.length

  return (
    <>
      <div className="rounded-2xl border border-[#e5e7eb] overflow-hidden">
        {/* ── Accordion header ── */}
        <button
          onClick={() => setOpen(o => !o)}
          className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
            open ? col.headerBg : 'bg-white hover:bg-gray-50/60'
          }`}
        >
          <span className="text-base leading-none">{col.icon}</span>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-bold text-[#1a1a1a]">{col.label}</span>
            {!open && col.sublabel && (
              <span className="text-xs text-[#9ca3af] ml-2">{col.sublabel}</span>
            )}
          </div>

          {/* Count badge — shows pending count when closed, total when open */}
          {pendingCount > 0 && (
            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full flex-shrink-0 ${col.badge}`}>
              {pendingCount}
            </span>
          )}
          {pendingCount === 0 && tasks.length > 0 && (
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full flex-shrink-0 bg-emerald-50 text-emerald-600">
              ✓
            </span>
          )}

          {/* Chevron */}
          <svg
            className={`w-4 h-4 text-[#9ca3af] flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* ── Accordion body ── */}
        {open && (
          <div className={`border-t ${col.border}`}>
            {/* Pending tasks */}
            {pending.length === 0 ? (
              <div className="px-4 py-5 text-center">
                <p className="text-sm text-[#9ca3af]">Aucune tâche en attente</p>
              </div>
            ) : (
              <div className="divide-y divide-[#f3f4f6]">
                {pending.map(task => (
                  <SetterTaskCard
                    key={task.id}
                    task={task}
                    currentUserId={currentUserId}
                    isAdminOrRespVente={isAdminOrRespVente}
                    onUpdate={onUpdate}
                    columnColor={col.color}
                  />
                ))}
              </div>
            )}

            {/* Add button */}
            <div className={`px-4 py-2.5 border-t ${col.border}`}>
              <button
                onClick={() => setAddOpen(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#00bbb1] hover:text-[#009e95] transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Ajouter une tâche
              </button>
            </div>

            {/* Completed tasks (collapsible) */}
            {completed.length > 0 && (
              <div className={`border-t ${col.border}`}>
                <button
                  onClick={() => setShowDone(d => !d)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50/40 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider flex-1 text-left">
                    Complétées
                  </span>
                  <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-600 rounded-full px-2 py-0.5">
                    {completed.length}
                  </span>
                  <svg
                    className={`w-3 h-3 text-[#9ca3af] transition-transform ${showDone ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showDone && (
                  <div className="divide-y divide-[#f3f4f6] border-t border-[#f3f4f6]">
                    {completed.map(task => (
                      <SetterTaskCard
                        key={task.id}
                        task={task}
                        currentUserId={currentUserId}
                        isAdminOrRespVente={isAdminOrRespVente}
                        onUpdate={onUpdate}
                        columnColor={col.color}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {addOpen && (
        <AddTaskModal
          columnKey={col.key}
          columnLabel={col.label}
          userId={currentUserId}
          onClose={() => setAddOpen(false)}
          onCreated={onUpdate}
        />
      )}
    </>
  )
}

// ─── SetterTaskBoard ──────────────────────────────────────────────────────────

export default function SetterTaskBoard({ currentUserId, isAdminOrRespVente }) {
  const { tasks, loading, refetch } = useSetterSharedTasks(currentUserId, isAdminOrRespVente)

  const pendingTotal = tasks.filter(t => !t.is_completed).length

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="w-2 h-2 rounded-full bg-[#00bbb1] flex-shrink-0" />
        <span className="text-xs font-bold text-[#6b7280] uppercase tracking-wider">Tâches Setter — Équipe</span>
        {pendingTotal > 0 && (
          <span className="text-[10px] font-bold bg-[#00bbb1]/10 text-[#00bbb1] rounded-full px-2 py-0.5">
            {pendingTotal} en attente
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 rounded-2xl bg-[#f3f4f6] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {COLUMNS.map(col => (
            <SetterTaskColumn
              key={col.key}
              col={col}
              tasks={tasks.filter(t => t.type === col.key)}
              currentUserId={currentUserId}
              isAdminOrRespVente={isAdminOrRespVente}
              onUpdate={refetch}
            />
          ))}
        </div>
      )}
    </div>
  )
}
