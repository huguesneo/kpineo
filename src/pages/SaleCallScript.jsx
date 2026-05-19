import { useState, useEffect, useCallback } from 'react'
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

  // Pre-fill qual form from saved notes
  useEffect(() => {
    if (savedNote?.qualification) {
      setQual(prev => ({ ...prev, ...savedNote.qualification }))
    }
  }, [savedNote])

  const quizCompleted = isQuizCompleted(quiz)
  const contactName = appt?.contact_name || `${contact?.first_name ?? ''} ${contact?.last_name ?? ''}`.trim() || '—'
  const duration = appt?.raw?.duration ?? appt?.raw?.durationMinutes ?? 60

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
          <div className="space-y-4">
            {QUAL_FIELDS.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-semibold text-[#6b7280] mb-1.5">
                  {f.label}
                  {f.optional && <span className="text-[#9ca3af] font-normal ml-1">(optionnel)</span>}
                </label>
                {f.type === 'textarea' ? (
                  <textarea
                    value={qual[f.key]}
                    onChange={e => setQual(prev => ({ ...prev, [f.key]: e.target.value }))}
                    rows={f.key === 'note' ? 4 : 3}
                    className="w-full px-3 py-2.5 text-sm border border-[#e5e7eb] rounded-xl focus:outline-none focus:border-[#00bbb1] focus:ring-2 focus:ring-[#00bbb1]/10 resize-none transition-colors placeholder:text-[#d1d5db]"
                    placeholder="Réponse..."
                  />
                ) : (
                  <input
                    type="text"
                    value={qual[f.key]}
                    onChange={e => setQual(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border border-[#e5e7eb] rounded-xl focus:outline-none focus:border-[#00bbb1] focus:ring-2 focus:ring-[#00bbb1]/10 transition-colors placeholder:text-[#d1d5db]"
                    placeholder="Réponse..."
                  />
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* ── Section 4 : Actions ── */}
        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6">
          <h3 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wide mb-4">Actions</h3>

          {/* Save notes */}
          <button
            onClick={handleSaveNotes}
            disabled={noteSaving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.99]"
            style={{ background: 'linear-gradient(135deg, #00bbb1 0%, #009e94 100%)', color: 'white', opacity: noteSaving ? 0.7 : 1 }}
          >
            {noteSaving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Enregistrement…
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

          {/* Confirmation banner */}
          {noteSaved && (
            <div className="mt-3 flex items-center gap-2 px-4 py-3 bg-[#10b981]/10 border border-[#10b981]/30 rounded-xl">
              <svg className="w-4 h-4 text-[#10b981] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm font-semibold text-[#10b981]">Notes enregistrées et envoyées dans GHL ✓</p>
            </div>
          )}

          <div className="mt-4" />

          {/* Status buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleStatus('show')}
              disabled={statusSaving || apptStatus === 'showed' || apptStatus === 'attended'}
              className={`py-3 rounded-xl font-bold text-sm border transition-all disabled:opacity-50 ${
                apptStatus === 'showed' || apptStatus === 'attended'
                  ? 'bg-[#10b981] border-[#10b981] text-white'
                  : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#10b981] hover:text-[#10b981]'
              }`}
            >
              {statusSaving ? '…' : '✓ Show'}
            </button>
            <button
              onClick={() => handleStatus('noshow')}
              disabled={statusSaving || apptStatus === 'noshow'}
              className={`py-3 rounded-xl font-bold text-sm border transition-all disabled:opacity-50 ${
                apptStatus === 'noshow'
                  ? 'bg-[#f59e0b] border-[#f59e0b] text-white'
                  : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#f59e0b] hover:text-[#f59e0b]'
              }`}
            >
              {statusSaving ? '…' : '✗ No-Show'}
            </button>
          </div>

          <div className="mt-3">
            <button
              onClick={() => navigate('/calendrier')}
              className="w-full py-2.5 rounded-xl text-sm font-semibold border border-[#e5e7eb] text-[#6b7280] hover:bg-gray-50 transition-colors"
            >
              ← Retour au calendrier
            </button>
          </div>
        </div>

        {/* Bottom spacer for mobile */}
        <div className="h-8" />
      </div>
    </Layout>
  )
}
