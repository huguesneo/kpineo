import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  useGHLContactById,
  updateAppointmentStatus,
  getContactCustomField,
  BOOKING_FORM_FIELDS,
} from '../../hooks/useGHLContact'
import {
  useQuizResponseByEmail,
  getQuizField,
  isQuizCompleted,
  QUIZ_FIELDS,
} from '../../hooks/useQuizResponse'
import { saveStatusToEOD } from '../../hooks/useCloserEOD'

function fmtTime(iso) {
  if (!iso) return '—'
  try { return format(new Date(iso), 'HH:mm') } catch { return '—' }
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  try { return format(new Date(iso), "eeee d MMMM 'à' HH:mm", { locale: fr }) } catch { return '—' }
}

function getApptDuration(appt) {
  return appt?.raw?.duration ?? appt?.raw?.durationMinutes ?? 60
}

// ─── Status button colors ─────────────────────────────────────
const STATUS_BTNS = [
  { value: 'show',   label: 'Show',     activeClass: 'bg-[#10b981] border-[#10b981] text-white', inactiveClass: 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#10b981]/50' },
  { value: 'noshow', label: 'No-Show',  activeClass: 'bg-[#f59e0b] border-[#f59e0b] text-white', inactiveClass: 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#f59e0b]/50' },
  { value: 'annule', label: 'Annulé',   activeClass: 'bg-[#ef4444] border-[#ef4444] text-white', inactiveClass: 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#ef4444]/50' },
]

// ─── GHL status → UI status ───────────────────────────────────
function toUiStatus(ghlStatus) {
  if (ghlStatus === 'showed' || ghlStatus === 'attended') return 'show'
  if (ghlStatus === 'noshow') return 'noshow'
  if (ghlStatus === 'cancelled') return 'annule'
  return null
}

export default function AppointmentDrawer({ appt, onClose, onStatusUpdate, userId = null }) {
  const navigate  = useNavigate()
  const contactId = appt?.contact_id ?? null
  const { contact, loading: contactLoading } = useGHLContactById(contactId)

  const { quiz, loading: quizLoading } = useQuizResponseByEmail(contact?.email ?? null)

  const [uiStatus, setUiStatus]   = useState(() => toUiStatus(appt?.status))
  const [statusSaving, setStatusSaving] = useState(false)
  const [showQuiz, setShowQuiz]   = useState(false)

  // Sync local status state when appt changes (e.g. parent updates)
  useEffect(() => {
    setUiStatus(toUiStatus(appt?.status))
    setShowQuiz(false)
  }, [appt?.ghl_id, appt?.status])

  const quizCompleted = isQuizCompleted(quiz)

  // Réponses du formulaire de réservation (champs personnalisés GHL du contact)
  const bookingAnswers = BOOKING_FORM_FIELDS
    .map(f => ({ ...f, value: getContactCustomField(contact?.raw, `contact.${f.key}`, f.id) }))
    .filter(f => f.value && String(f.value).trim())

  const hasMeetLink   = appt?.meeting_url?.startsWith('http')
  const duration      = getApptDuration(appt)

  async function handleStatus(status) {
    if (statusSaving) return
    setUiStatus(status)
    setStatusSaving(true)
    const results = await Promise.allSettled([
      updateAppointmentStatus(appt.ghl_id, appt.contact_id, status),
      saveStatusToEOD(userId, appt, status),
    ])
    const ghlResult = results[0].status === 'fulfilled' ? (results[0].value ?? {}) : {}
    setStatusSaving(false)
    if (!ghlResult.error) {
      const ghlStatusMap = { show: 'showed', noshow: 'noshow', annule: 'cancelled' }
      onStatusUpdate?.(appt.ghl_id, ghlStatusMap[status] ?? status)
    }
  }

  async function handleJoinMeet() {
    // Open Google Meet in new tab
    window.open(appt.meeting_url, '_blank', 'noopener,noreferrer')

    // Auto-show if quiz is completed
    if (quizCompleted && uiStatus !== 'show') {
      await handleStatus('show')
    }

    // Navigate to sale call script
    navigate(`/sale-call-script/${appt.ghl_id}`)
  }

  if (!appt) return null

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-screen w-full max-w-[400px] z-50 bg-white shadow-2xl flex flex-col border-l border-[#e5e7eb] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb] flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getStatusDot(appt.status) }} />
            <h2 className="font-bold text-[#1a1a1a] text-sm truncate">{appt.contact_name || '—'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-[#9ca3af] transition-colors flex-shrink-0 ml-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Appointment info */}
          <div className="px-5 py-4 bg-[#f9fafb] border-b border-[#e5e7eb]">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#00bbb1]/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-[#00bbb1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1a1a1a] capitalize">{fmtDateTime(appt.start_time)}</p>
                <p className="text-xs text-[#6b7280] mt-0.5">{duration} minutes</p>
                <StatusBadge status={appt.status} />
              </div>
            </div>
          </div>

          {/* Contact info */}
          <div className="px-5 py-4 border-b border-[#e5e7eb]">
            <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wide mb-3">Informations client</p>
            {contactLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" />)}
              </div>
            ) : (
              <div className="space-y-2">
                <ContactRow icon="person" label={contact ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || appt.contact_name : appt.contact_name} />
                {contact?.email && <ContactRow icon="email" label={contact.email} href={`mailto:${contact.email}`} />}
                {contact?.phone && <ContactRow icon="phone" label={contact.phone} href={`tel:${contact.phone}`} />}
                {!contact && !contactLoading && (
                  <p className="text-xs text-[#9ca3af]">Contact non trouvé dans le cache GHL</p>
                )}
              </div>
            )}
          </div>

          {/* Quiz Métabolique badge */}
          <div className="px-5 py-4 border-b border-[#e5e7eb]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(contactLoading || quizLoading) ? (
                  <svg className="w-3 h-3 animate-spin text-[#9ca3af]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <div className={`w-2 h-2 rounded-full ${quizCompleted ? 'bg-[#10b981]' : 'bg-[#9ca3af]'}`} />
                )}
                <p className={`text-xs font-semibold ${quizCompleted ? 'text-[#10b981]' : 'text-[#9ca3af]'}`}>
                  {(contactLoading || quizLoading) ? 'Chargement quiz…' : quizCompleted ? 'Quiz complété' : 'Quiz non complété'}
                </p>
              </div>
              {quizCompleted && (
                <button
                  onClick={() => setShowQuiz(v => !v)}
                  className="text-xs font-semibold text-[#00bbb1] hover:underline"
                >
                  {showQuiz ? 'Masquer' : 'Voir le quiz'}
                </button>
              )}
            </div>

            {showQuiz && quizCompleted && quiz && (
              <div className="mt-3 space-y-2">
                {QUIZ_FIELDS.map(f => {
                  const val = getQuizField(quiz, f.key)
                  if (!val) return null
                  return (
                    <div key={f.key} className="bg-[#f9fafb] rounded-lg px-3 py-2">
                      <p className="text-[10px] font-semibold text-[#6b7280] mb-0.5">{f.label}</p>
                      <p className="text-xs text-[#1a1a1a] font-medium">{val}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Réponses du formulaire de réservation (si remplies) */}
          {bookingAnswers.length > 0 && (
            <div className="px-5 py-4 border-b border-[#e5e7eb]">
              <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wide mb-3">Formulaire de réservation</p>
              <div className="space-y-2">
                {bookingAnswers.map(f => (
                  <div key={f.key} className="bg-[#f9fafb] rounded-lg px-3 py-2">
                    <p className="text-[10px] font-semibold text-[#6b7280] mb-0.5">{f.label}</p>
                    <p className="text-xs text-[#1a1a1a] font-medium whitespace-pre-wrap">{f.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions principales */}
          <div className="px-5 py-4 border-b border-[#e5e7eb] space-y-2">
            {/* Formulaire d'appel — accessible sans Meet */}
            <button
              onClick={() => navigate(`/sale-call-script/${appt.ghl_id}`)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm border-2 border-[#00bbb1] text-[#00bbb1] hover:bg-[#00bbb1]/5 transition-all active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Formulaire d'appel
            </button>

            {/* Google Meet */}
            {hasMeetLink && (
              <>
                <button
                  onClick={handleJoinMeet}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #00bbb1 0%, #009e94 100%)' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Rejoindre Google Meet
                </button>
                {quizCompleted && (
                  <p className="text-[10px] text-center text-[#10b981] font-semibold">
                    Quiz complété → statut passera automatiquement à Show
                  </p>
                )}
              </>
            )}
          </div>

          {/* Status buttons */}
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wide mb-3">Statut du rendez-vous</p>
            <div className="grid grid-cols-3 gap-2">
              {STATUS_BTNS.map(btn => (
                <button
                  key={btn.value}
                  onClick={() => handleStatus(btn.value)}
                  disabled={statusSaving}
                  className={`py-2.5 rounded-xl text-sm font-bold border transition-all disabled:opacity-60 ${
                    uiStatus === btn.value ? btn.activeClass : btn.inactiveClass
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
            {statusSaving && (
              <p className="text-xs text-center text-[#9ca3af] mt-2">Mise à jour en cours…</p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Sub-components ───────────────────────────────────────────

function getStatusDot(status) {
  if (status === 'showed' || status === 'attended') return '#10b981'
  if (status === 'noshow') return '#f59e0b'
  if (status === 'cancelled') return '#ef4444'
  return '#00bbb1'
}

function StatusBadge({ status }) {
  const map = {
    confirmed: { label: 'Confirmé',  bg: '#00bbb118', text: '#00bbb1' },
    showed:    { label: 'Show',      bg: '#10b98118', text: '#10b981' },
    attended:  { label: 'Show',      bg: '#10b98118', text: '#10b981' },
    noshow:    { label: 'No-Show',   bg: '#f59e0b18', text: '#f59e0b' },
    cancelled: { label: 'Annulé',    bg: '#ef444418', text: '#ef4444' },
    new:       { label: 'Nouveau',   bg: '#6b728018', text: '#6b7280' },
    pending:   { label: 'En attente',bg: '#6b728018', text: '#6b7280' },
  }
  const s = map[status] ?? { label: status ?? '—', bg: '#6b728018', text: '#6b7280' }
  return (
    <span
      className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1.5"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  )
}

function ContactRow({ icon, label, href }) {
  const content = (
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 flex-shrink-0 text-[#9ca3af]">
        {icon === 'person' && (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
          </svg>
        )}
        {icon === 'email' && (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        )}
        {icon === 'phone' && (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
          </svg>
        )}
      </div>
      <span className={`text-xs font-medium text-[#1a1a1a] truncate ${href ? 'hover:text-[#00bbb1]' : ''}`}>{label || '—'}</span>
    </div>
  )

  if (href) {
    return <a href={href} className="block">{content}</a>
  }
  return <div>{content}</div>
}
