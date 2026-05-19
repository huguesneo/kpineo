import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/layout/Layout'
import { useGHLContactById, addContactNoteGHL } from '../hooks/useGHLContact'
import {
  useQuizResponseByEmail,
  getQuizField,
  isQuizCompleted,
  QUIZ_FIELDS,
} from '../hooks/useQuizResponse'
import { useSaleCallNote } from '../hooks/useSaleCallNotes'

// ─── Helpers ──────────────────────────────────────────────────
function fmtTime(iso) {
  if (!iso) return '—'
  try { return format(new Date(iso), 'HH:mm') } catch { return '—' }
}
function fmtDate(iso) {
  if (!iso) return '—'
  try { return format(new Date(iso), 'd MMMM yyyy', { locale: fr }) } catch { return '—' }
}

// ─── Auto-growing textarea ────────────────────────────────────
function AutoGrowTextarea({ value, onChange, onBlur, placeholder, className, extraStyle = {} }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = el.scrollHeight + 'px'
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
      className={className}
      style={{ overflow: 'hidden', resize: 'none', minHeight: '2.75rem', ...extraStyle }}
    />
  )
}

// ─── Form field definitions ───────────────────────────────────
const QUAL_FIELDS = [
  { key: 'reference',    label: 'Référence client',                                 type: 'input'    },
  { key: 'source',       label: "D'où provient-il ? Comment a-t-il entendu parler de nous ?", type: 'input' },
  { key: 'objectif',     label: 'Objectif principal : Quel est ton objectif principal en ce moment ?', type: 'input' },
  { key: 'pourquoi',     label: 'Pourquoi cet objectif est-il si important pour toi en ce moment ?', type: 'textarea' },
  { key: 'depuis',       label: "Depuis combien de temps cherches-tu à atteindre cet objectif ?",     type: 'input' },
  { key: 'deja_essaye',  label: "Qu'as-tu déjà essayé jusqu'à maintenant ?",         type: 'textarea' },
  { key: 'problematique',label: 'Problématique actuelle : Quelle est ta plus grande difficulté ou frustration ?', type: 'textarea' },
  { key: 'solution',     label: 'Solution idéale : Si tu pouvais avoir la solution parfaite, à quoi ressemblerait-elle ?', type: 'textarea' },
  { key: 'note',         label: 'Note supplémentaire',                               type: 'textarea', optional: true },
]

// ─── Status badge ─────────────────────────────────────────────
function ApptStatusBadge({ status }) {
  const map = {
    confirmed: { label: 'Confirmé',   bg: '#00bbb118', text: '#00bbb1' },
    showed:    { label: 'Show',        bg: '#10b98118', text: '#10b981' },
    attended:  { label: 'Show',        bg: '#10b98118', text: '#10b981' },
    noshow:    { label: 'No-Show',     bg: '#f59e0b18', text: '#f59e0b' },
    cancelled: { label: 'Annulé',      bg: '#ef444418', text: '#ef4444' },
  }
  const s = map[status] ?? { label: status ?? '—', bg: '#6b728018', text: '#6b7280' }
  return (
    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: s.bg, color: s.text }}>
      {s.label}
    </span>
  )
}

// ─── Section wrapper ──────────────────────────────────────────
function Section({ title, icon, bg = false, children }) {
  return (
    <div className={`rounded-2xl border border-[#e5e7eb] overflow-hidden ${bg ? 'bg-[#f9fafb]' : 'bg-white'}`}>
      <div className={`px-6 py-4 border-b border-[#e5e7eb] ${bg ? 'bg-[#f5f5f7]' : 'bg-white'}`}>
        <div className="flex items-center gap-2">
          {icon && <span className="text-base">{icon}</span>}
          <h3 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wide">{title}</h3>
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

// ─── Info row ─────────────────────────────────────────────────
function InfoRow({ label, value }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-[#f0f0f0] last:border-0">
      <span className="text-xs font-semibold text-[#9ca3af] w-28 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm font-medium text-[#1a1a1a] flex-1">{value || <span className="text-[#9ca3af]">—</span>}</span>
    </div>
  )
}

// ─── Quiz row ─────────────────────────────────────────────────
function QuizRow({ label, value }) {
  return (
    <div className="py-3 border-b border-[#f0f0f0] last:border-0">
      <p className="text-xs font-semibold text-[#6b7280] mb-1">{label}</p>
      <p className="text-sm text-[#1a1a1a] font-medium">
        {value ? (
          <span className="flex items-start gap-1.5">
            <span className="text-[#00bbb1] font-bold mt-0.5">→</span>
            <span>{value}</span>
          </span>
        ) : (
          <span className="text-[#9ca3af] italic">Non renseigné</span>
        )}
      </p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────
export default function SaleCallScript() {
  const { appointmentGhlId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  // Load appointment from Supabase (fast)
  const [appt, setAppt]           = useState(null)
  const [apptLoading, setApptLoading] = useState(true)
  const [apptStatus, setApptStatus]   = useState(null)

  const loadAppt = useCallback(async () => {
    if (!appointmentGhlId) return
    setApptLoading(true)
    const { data } = await supabase
      .from('ghl_appointments')
      .select('*')
      .eq('ghl_id', appointmentGhlId)
      .maybeSingle()
    if (data) {
      setAppt(data)
      setApptStatus(data.status)
    }
    setApptLoading(false)
  }, [appointmentGhlId])

  useEffect(() => { loadAppt() }, [loadAppt])

  // Load contact via hook (for email, name, phone)
  const contactId = appt?.contact_id ?? null
  const { contact, loading: contactLoading } = useGHLContactById(contactId)

  // Load quiz responses from Supabase (sent by Make.com)
  const contactEmail = contact?.email ?? null
  const { quiz, loading: quizLoading } = useQuizResponseByEmail(contactEmail)

  // Sale call notes (from Supabase)
  const { note: savedNote, saving: noteSaving, save: saveNote } = useSaleCallNote(appointmentGhlId)

  // Qualification form state
  const [qual, setQual] = useState(() =>
    Object.fromEntries(QUAL_FIELDS.map(f => [f.key, '']))
  )

  // Status state
  const [statusSaving, setStatusSaving] = useState(false)
  const [noteSaved, setNoteSaved]       = useState(false)
  const [autoSaved,  setAutoSaved]      = useState(false)

  // Progress
  const filledCount = QUAL_FIELDS.filter(f => qual[f.key]?.trim()).length
  const totalCount  = QUAL_FIELDS.length

  // Pre-fill qual form from saved notes
  useEffect(() => {
    if (savedNote?.qualification) {
      setQual(prev => ({ ...prev, ...savedNote.qualification }))
    }
  }, [savedNote])

  const quizCompleted = isQuizCompleted(quiz)
  const contactName = appt?.contact_name || `${contact?.first_name ?? ''} ${contact?.last_name ?? ''}`.trim() || '—'
  const duration = appt?.raw?.duration ?? appt?.raw?.durationMinutes ?? 60

  // Raccourci Cmd/Ctrl+S pour sauvegarder
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSaveNotes()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qual, profile, contact, appt])

  // ── Format note for GHL ──
  function formatNoteForGHL() {
    const dateStr = appt?.start_time ? fmtDate(appt.start_time) : format(new Date(), 'd MMMM yyyy', { locale: fr })
    const lines = [`--- Sale Call ${dateStr} ---`]
    QUAL_FIELDS.forEach(f => {
      const val = qual[f.key]?.trim()
      if (val) {
        const shortLabel = f.label.split(':')[0].trim()
        lines.push(`${shortLabel} : ${val}`)
      }
    })
    return lines.join('\n')
  }

  // ── Auto-save on blur (silent) ──
  async function handleAutoSave() {
    if (!QUAL_FIELDS.some(f => qual[f.key]?.trim())) return
    await saveNote({
      userId:        profile?.id,
      contactId:     contact?.ghl_id ?? appt?.contact_id,
      contactName,
      qualification: qual,
    })
    setAutoSaved(true)
    setTimeout(() => setAutoSaved(false), 2000)
  }

  // ── Save notes ──
  async function handleSaveNotes() {
    const { error } = await saveNote({
      userId:      profile?.id,
      contactId:   contact?.ghl_id ?? appt?.contact_id,
      contactName,
      qualification: qual,
    })
    if (!error) {
      // Also push to GHL as a contact note
      const contactId = contact?.ghl_id ?? appt?.contact_id
      if (contactId) {
        await addContactNoteGHL(contactId, formatNoteForGHL())
      }
      setNoteSaved(true)
      setTimeout(() => setNoteSaved(false), 3000)
    }
  }

  // ── Update appointment status ──
  async function handleStatus(uiStatus) {
    if (!appt?.ghl_id || statusSaving) return
    setStatusSaving(true)

    // Save notes alongside status if any are filled
    const hasNotes = QUAL_FIELDS.some(f => qual[f.key]?.trim())
    const note = hasNotes ? formatNoteForGHL() : undefined

    const { error } = await supabase.functions.invoke('ghl-update-appointment', {
      body: {
        appointmentId: appt.ghl_id,
        contactId:     appt.contact_id ?? undefined,
        status:        uiStatus,
        note,
      },
    })

    if (!error) {
      const statusMap = { show: 'showed', noshow: 'noshow', annule: 'cancelled' }
      setApptStatus(statusMap[uiStatus] ?? uiStatus)
      // Save notes to Supabase too
      if (hasNotes) {
        await saveNote({
          userId:      profile?.id,
          contactId:   contact?.ghl_id ?? appt?.contact_id,
          contactName,
          qualification: qual,
        })
      }
    }

    setStatusSaving(false)
  }

  if (apptLoading) {
    return (
      <Layout>
        <div className="space-y-4 animate-pulse">
          <div className="h-16 bg-gray-100 rounded-2xl" />
          <div className="h-48 bg-gray-100 rounded-2xl" />
          <div className="h-64 bg-gray-100 rounded-2xl" />
        </div>
      </Layout>
    )
  }

  if (!appt) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <p className="text-[#6b7280] font-semibold">Rendez-vous introuvable</p>
          <button onClick={() => navigate('/calendrier')} className="text-sm text-[#00bbb1] font-semibold hover:underline">
            ← Retour au calendrier
          </button>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-30 -mx-8 px-8 py-3 bg-white border-b border-[#e5e7eb] mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/calendrier')}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#6b7280] hover:text-[#1a1a1a] transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Calendrier
          </button>
          <div className="w-px h-4 bg-[#e5e7eb]" />
          <div className="min-w-0">
            <p className="font-bold text-[#1a1a1a] text-sm truncate">{contactName}</p>
            <p className="text-xs text-[#6b7280]">
              {fmtDate(appt.start_time)} à {fmtTime(appt.start_time)} · {duration} min
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ApptStatusBadge status={apptStatus} />
        </div>
      </div>

      <div className="space-y-5 max-w-3xl">

        {/* ── Section 1 : Client info ── */}
        <Section title="Informations client" icon="👤" bg>
          <div className="divide-y divide-[#f0f0f0]">
            <InfoRow label="Nom"       value={contactName} />
            <InfoRow label="Email"     value={contact?.email} />
            <InfoRow label="Téléphone" value={contact?.phone} />
          </div>
        </Section>

        {/* ── Section 2 : Quiz Métabolique ── */}
        <Section title="Quiz Métabolique" icon="🧬" bg>
          {(contactLoading || (contactEmail && quizLoading)) ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-3.5 h-3.5 animate-spin text-[#00bbb1]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-xs text-[#9ca3af]">Chargement du quiz…</span>
              </div>
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : quizCompleted ? (
            <div className="divide-y divide-[#f0f0f0]">
              {QUIZ_FIELDS.map(f => (
                <QuizRow
                  key={f.key}
                  label={f.label}
                  value={getQuizField(quiz, f.key)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-[#9ca3af]">Quiz non complété par le client</p>
          )}
        </Section>

        {/* ── Section 3 : Qualification ── */}
        <Section title="Qualification" icon="📋">
          {/* Barre de progression */}
          <div className="flex items-center gap-3 mb-6 pb-5 border-b border-[#f0f0f0]">
            <div className="flex-1 bg-gray-100 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${totalCount > 0 ? (filledCount / totalCount) * 100 : 0}%`,
                  background: filledCount === totalCount ? '#10b981' : '#00bbb1',
                }}
              />
            </div>
            <span className="text-xs font-bold flex-shrink-0" style={{ color: filledCount === totalCount ? '#10b981' : '#00bbb1' }}>
              {filledCount}/{totalCount}
            </span>
            {autoSaved && (
              <span className="text-[10px] font-semibold text-[#10b981] flex-shrink-0 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Sauvegardé
              </span>
            )}
          </div>

          <div className="space-y-5">
            {QUAL_FIELDS.map((f, i) => {
              const isFilled = Boolean(qual[f.key]?.trim())
              return (
                <div key={f.key} className="group">
                  <div className="flex items-start gap-3 mb-2">
                    <span
                      className="flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center mt-0.5 transition-colors"
                      style={{
                        backgroundColor: isFilled ? '#00bbb1' : '#f3f4f6',
                        color:           isFilled ? '#fff'    : '#9ca3af',
                      }}
                    >
                      {isFilled ? '✓' : i + 1}
                    </span>
                    <label className="text-xs font-semibold text-[#4b5563] leading-relaxed">
                      {f.label}
                      {f.optional && <span className="text-[#9ca3af] font-normal ml-1">(optionnel)</span>}
                    </label>
                  </div>
                  <div className="ml-8">
                    <AutoGrowTextarea
                      value={qual[f.key]}
                      onChange={e => setQual(prev => ({ ...prev, [f.key]: e.target.value }))}
                      onBlur={handleAutoSave}
                      placeholder="Votre réponse…"
                      className="w-full px-3 py-2.5 text-sm border border-[#e5e7eb] rounded-xl focus:outline-none focus:border-[#00bbb1] focus:ring-2 focus:ring-[#00bbb1]/10 transition-colors placeholder:text-[#d1d5db]"
                      extraStyle={isFilled ? { borderColor: '#00bbb130' } : {}}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Section>

        {/* ── Section 4 : Actions ── */}
        <div className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">

          {/* Bouton principal sauvegarde */}
          <button
            onClick={handleSaveNotes}
            disabled={noteSaving}
            className="w-full flex items-center justify-center gap-2.5 py-4 font-bold text-sm transition-all active:scale-[0.99] disabled:opacity-70"
            style={{
              background: noteSaved
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #00bbb1 0%, #009e94 100%)',
              color: 'white',
            }}
          >
            {noteSaving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Enregistrement…
              </>
            ) : noteSaved ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Notes enregistrées
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Enregistrer les notes
              </>
            )}
          </button>

          <div className="p-5 space-y-2.5">
            {/* Statut RDV */}
            <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-3">Statut du rendez-vous</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  status: 'show',
                  label: 'Show',
                  active: apptStatus === 'showed' || apptStatus === 'attended',
                  activeStyle: { background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'transparent', color: 'white' },
                  hoverClass: 'hover:border-[#10b981]/60 hover:text-[#10b981]',
                  icon: (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ),
                },
                {
                  status: 'noshow',
                  label: 'No-Show',
                  active: apptStatus === 'noshow',
                  activeStyle: { background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', border: 'transparent', color: 'white' },
                  hoverClass: 'hover:border-[#f59e0b]/60 hover:text-[#f59e0b]',
                  icon: (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ),
                },
                {
                  status: 'annule',
                  label: 'Annulé',
                  active: apptStatus === 'cancelled',
                  activeStyle: { background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', border: 'transparent', color: 'white' },
                  hoverClass: 'hover:border-[#ef4444]/60 hover:text-[#ef4444]',
                  icon: (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  ),
                },
              ].map(({ status, label, active, activeStyle, hoverClass, icon }) => (
                <button
                  key={status}
                  onClick={() => handleStatus(status)}
                  disabled={statusSaving || active}
                  className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-bold border transition-all disabled:cursor-default ${
                    active ? '' : `bg-white border-[#e5e7eb] text-[#6b7280] ${hoverClass}`
                  }`}
                  style={active ? activeStyle : {}}
                >
                  {statusSaving ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : icon}
                  {label}
                </button>
              ))}
            </div>

            {/* Retour */}
            <button
              onClick={() => navigate('/calendrier')}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb] hover:border-[#d1d5db] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Retour au calendrier
            </button>
          </div>
        </div>

        {/* Bottom spacer for mobile */}
        <div className="h-8" />
      </div>
    </Layout>
  )
}
