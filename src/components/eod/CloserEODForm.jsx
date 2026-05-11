import { useState, useCallback } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import Card from '../shared/Card'
import Button from '../shared/Button'
import { useCloserEOD, EOD_STATUSES, EOD_FEEDBACK_OPTIONS } from '../../hooks/useCloserEOD'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(iso) {
  if (!iso) return '—'
  try { return format(new Date(iso), 'HH:mm') } catch { return '—' }
}

function fmtDate(iso) {
  if (!iso) return ''
  try { return format(parseISO(iso), 'EEEE d MMMM yyyy', { locale: fr }) } catch { return iso }
}

function buildGHLNote(row, reportDate) {
  const dateLabel = fmtDate(reportDate)
  const statusLabel = EOD_STATUSES.find(s => s.value === row.status)?.label ?? '—'
  const feedbackLabel = EOD_FEEDBACK_OPTIONS.find(f => f.value === row.feedback)?.label ?? '—'
  const closedLabel = row.is_closed === true ? 'Oui ✅' : row.is_closed === false ? 'Non ❌' : '—'

  let note = `📋 EOD — ${dateLabel}\n\n`
  note += `👤 ${row.contact_name} (${fmtTime(row.start_time)})\n`
  note += `Statut : ${statusLabel}\n`
  note += `Closé : ${closedLabel}\n`
  if (row.feedback)      note += `Feedback : ${feedbackLabel}\n`
  if (row.action_plan)   note += `Plan de match : ${row.action_plan}\n`
  if (row.is_closed === false && row.objection_reason)
    note += `Objection : ${row.objection_reason}\n`

  return note.trim()
}

// ─── Select inline ────────────────────────────────────────────────────────────

function InlineSelect({ value, onChange, options, placeholder = '—', className = '' }) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className={`w-full px-2 py-1.5 text-xs border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#00bbb1] ${className}`}
    >
      <option value="">{placeholder}</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

// ─── Ligne du tableau ─────────────────────────────────────────────────────────

function EODRow({ row, index, onChange }) {
  const showObjection = row.is_closed === false || row.is_closed === 'false'

  return (
    <tr className="border-b border-[#f0f0f0] hover:bg-[#fafafa] transition-colors">
      {/* 1. Prospect */}
      <td className="px-3 py-2.5 min-w-[140px]">
        <p className="text-sm font-semibold text-[#1a1a1a] leading-tight">{row.contact_name || '—'}</p>
        <p className="text-[11px] text-[#9ca3af] mt-0.5">{fmtTime(row.start_time)}</p>
      </td>

      {/* 2. Statut */}
      <td className="px-2 py-2.5 min-w-[110px]">
        <InlineSelect
          value={row.status}
          onChange={v => onChange(index, { status: v })}
          options={EOD_STATUSES}
        />
      </td>

      {/* 3. Closé */}
      <td className="px-2 py-2.5 min-w-[90px]">
        <InlineSelect
          value={row.is_closed === true ? 'true' : row.is_closed === false ? 'false' : ''}
          onChange={v => onChange(index, { is_closed: v === 'true' ? true : v === 'false' ? false : null })}
          options={[
            { value: 'true',  label: 'Oui' },
            { value: 'false', label: 'Non' },
          ]}
        />
      </td>

      {/* 4. Feedback */}
      <td className="px-2 py-2.5 min-w-[150px]">
        <InlineSelect
          value={row.feedback}
          onChange={v => onChange(index, { feedback: v })}
          options={EOD_FEEDBACK_OPTIONS}
        />
      </td>

      {/* 5. Plan de match */}
      <td className="px-2 py-2.5 min-w-[200px]">
        <input
          type="text"
          value={row.action_plan}
          onChange={e => onChange(index, { action_plan: e.target.value })}
          placeholder="Ex: Rappel demain 10h avec le mari présent"
          className="w-full px-2 py-1.5 text-xs border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#00bbb1]"
        />
      </td>

      {/* 6. Raison d'objection (uniquement si pas closé) */}
      <td className="px-2 py-2.5 min-w-[180px]">
        {showObjection ? (
          <input
            type="text"
            value={row.objection_reason}
            onChange={e => onChange(index, { objection_reason: e.target.value })}
            placeholder="Ex: Prix, timing, conjoint absent…"
            className="w-full px-2 py-1.5 text-xs border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#00bbb1]"
          />
        ) : (
          <span className="text-[11px] text-[#d1d5db]">
            {row.is_closed === true ? 'N/A (closé)' : '—'}
          </span>
        )}
      </td>
    </tr>
  )
}

// ─── Ligne en lecture seule ───────────────────────────────────────────────────

function EODRowReadOnly({ row }) {
  const statusOpt  = EOD_STATUSES.find(s => s.value === row.status)
  const feedbackOpt = EOD_FEEDBACK_OPTIONS.find(f => f.value === row.feedback)

  const statusColors = {
    show:   { bg: '#10b98118', text: '#10b981' },
    noshow: { bg: '#f59e0b18', text: '#f59e0b' },
    annule: { bg: '#ef444418', text: '#ef4444' },
  }
  const sc = statusColors[row.status] ?? { bg: '#6b728018', text: '#6b7280' }

  return (
    <tr className="border-b border-[#f0f0f0]">
      <td className="px-3 py-2.5">
        <p className="text-sm font-semibold text-[#1a1a1a]">{row.contact_name || '—'}</p>
        <p className="text-[11px] text-[#9ca3af]">{fmtTime(row.start_time)}</p>
      </td>
      <td className="px-2 py-2.5">
        {row.status ? (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: sc.bg, color: sc.text }}>
            {statusOpt?.label ?? row.status}
          </span>
        ) : <span className="text-xs text-[#d1d5db]">—</span>}
      </td>
      <td className="px-2 py-2.5">
        <span className={`text-xs font-semibold ${row.is_closed === true ? 'text-[#10b981]' : row.is_closed === false ? 'text-[#ef4444]' : 'text-[#d1d5db]'}`}>
          {row.is_closed === true ? 'Oui' : row.is_closed === false ? 'Non' : '—'}
        </span>
      </td>
      <td className="px-2 py-2.5 text-xs text-[#6b7280]">
        {feedbackOpt?.label ?? (row.feedback || '—')}
      </td>
      <td className="px-2 py-2.5 text-xs text-[#1a1a1a]">{row.action_plan || '—'}</td>
      <td className="px-2 py-2.5 text-xs text-[#6b7280]">
        {row.is_closed === false ? (row.objection_reason || '—') : <span className="text-[#d1d5db]">N/A</span>}
      </td>
    </tr>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function CloserEODForm({ userId, ghlUserId = null, closerName = null, missedYesterday = false }) {
  const today     = format(new Date(), 'yyyy-MM-dd')
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')

  const [targetDate, setTargetDate] = useState(today)
  const [editing,    setEditing]    = useState(false)
  const [success,    setSuccess]    = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [ghlError,   setGhlError]   = useState(null)

  const {
    report, rows, notes, setNotes, loading, error,
    save, updateRow, refetch,
  } = useCloserEOD(userId, targetDate, ghlUserId, closerName)

  // Copie locale des lignes pour l'édition
  const [localRows,  setLocalRows]  = useState(null)
  const [localNotes, setLocalNotes] = useState('')

  function startEditing() {
    setLocalRows(rows.map(r => ({ ...r })))
    setLocalNotes(notes)
    setEditing(true)
    setSuccess(false)
    setGhlError(null)
  }

  function cancelEditing() {
    setLocalRows(null)
    setEditing(false)
  }

  function handleRowChange(index, changes) {
    setLocalRows(prev => prev.map((r, i) => i === index ? { ...r, ...changes } : r))
  }

  // Appel à la fonction edge pour mettre à jour GHL (statut + note contact)
  const updateGHL = useCallback(async (row, reportDate) => {
    if (!row.status || !row.ghl_appointment_id) return
    const note = buildGHLNote(row, reportDate)
    await supabase.functions.invoke('ghl-update-appointment', {
      body: {
        appointmentId: row.ghl_appointment_id,
        contactId:     row.contact_id || undefined,
        status:        row.status,
        note:          note || undefined,
      },
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setSuccess(false)
    setGhlError(null)
    setSubmitting(true)

    const finalRows  = localRows ?? rows
    const finalNotes = localNotes ?? notes

    const { error: saveErr } = await save(finalRows, finalNotes)
    if (saveErr) { setSubmitting(false); return }

    // Mettre à jour GHL pour chaque ligne qui a un statut
    const rowsWithStatus = finalRows.filter(r => r.status && r.ghl_appointment_id)
    const ghlResults = await Promise.allSettled(
      rowsWithStatus.map(r => updateGHL(r, targetDate))
    )
    const failed = ghlResults.filter(r => r.status === 'rejected')
    if (failed.length > 0) {
      setGhlError(`${failed.length} mise(s) à jour GHL échouée(s) — les données ont quand même été sauvegardées.`)
    }

    setSubmitting(false)
    setSuccess(true)
    setEditing(false)
    setLocalRows(null)
  }

  const isToday     = targetDate === today
  const isYesterday = targetDate === yesterday
  const dateLabel   = fmtDate(targetDate + 'T12:00:00')

  // Changer de date
  function goToDate(d) {
    setTargetDate(d)
    setEditing(false)
    setLocalRows(null)
    setSuccess(false)
    setGhlError(null)
  }

  if (loading) {
    return (
      <Card className="p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-100 rounded w-1/3" />
          <div className="h-24 bg-gray-100 rounded" />
        </div>
      </Card>
    )
  }

  const displayRows = editing ? (localRows ?? []) : rows

  return (
    <Card className="p-5">
      {/* ── En-tête ── */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-base">📋</span>
            <h2 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wide">Rapport End of Day</h2>
            {report && !editing && (
              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                Soumis
              </span>
            )}
          </div>
          <p className="text-xs text-[#9ca3af] capitalize ml-6">{dateLabel}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Navigation de date */}
          {missedYesterday && (
            <div className="flex gap-1">
              <button
                onClick={() => goToDate(yesterday)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  isYesterday
                    ? 'bg-amber-500 border-amber-500 text-white'
                    : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                }`}
              >
                Hier
                {!isYesterday && (
                  <span className="ml-1 bg-amber-500 text-white text-[10px] font-bold px-1 rounded-full">!</span>
                )}
              </button>
              <button
                onClick={() => goToDate(today)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  isToday
                    ? 'bg-[#00bbb1] border-[#00bbb1] text-white'
                    : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#00bbb1]/40'
                }`}
              >
                Aujourd'hui
              </button>
            </div>
          )}

          {/* Bouton Modifier */}
          {report && !editing && (
            <button
              onClick={startEditing}
              className="text-xs font-semibold text-[#00bbb1] hover:text-[#009e95] transition-colors"
            >
              Modifier
            </button>
          )}
        </div>
      </div>

      {/* ── Alerte rapport manquant ── */}
      {missedYesterday && isToday && !loading && (
        <div className="mb-4 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
          <span className="text-amber-500 text-sm">⚠️</span>
          <div className="flex-1">
            <p className="text-xs font-semibold text-amber-700">Rapport d'hier non soumis</p>
          </div>
          <button
            onClick={() => goToDate(yesterday)}
            className="text-xs font-semibold text-amber-600 hover:text-amber-700 underline"
          >
            Remplir →
          </button>
        </div>
      )}

      {/* ── Tableau ── */}
      {displayRows.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-[#9ca3af]">Aucun rendez-vous ce jour-là.</p>
          <p className="text-xs text-[#d1d5db] mt-1">(La synchronisation GHL s'effectue toutes les 30 min.)</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-5 px-5 mb-4">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="border-b border-[#e5e7eb]">
                {[
                  'Prospect',
                  'Statut',
                  'Closé',
                  'Feedback Préparation',
                  'Plan de match & suivi',
                  "Raison d'objection",
                ].map(h => (
                  <th key={h} className="px-2 pb-2 text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide first:px-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) =>
                editing ? (
                  <EODRow key={row.ghl_appointment_id || i} row={row} index={i} onChange={handleRowChange} />
                ) : (
                  <EODRowReadOnly key={row.ghl_appointment_id || i} row={row} />
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Notes supplémentaires ── */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-[#6b7280] mb-1.5">Notes supplémentaires</label>
        {editing ? (
          <textarea
            value={localNotes}
            onChange={e => setLocalNotes(e.target.value)}
            placeholder="Notes libres, observations de la journée…"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1] resize-none"
          />
        ) : (
          <div className={`px-3 py-2 rounded-lg border ${notes ? 'border-[#e5e7eb] bg-[#f9fafb]' : 'border-dashed border-[#e5e7eb]'}`}>
            <p className="text-sm text-[#1a1a1a] whitespace-pre-wrap leading-relaxed">
              {notes || <span className="text-[#d1d5db]">Aucune note</span>}
            </p>
          </div>
        )}
      </div>

      {/* ── Soumis à ── */}
      {report && !editing && (
        <p className="text-[11px] text-[#9ca3af] mb-3">
          Soumis à {format(new Date(report.submitted_at), 'HH:mm')}
        </p>
      )}

      {/* ── Erreurs ── */}
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {ghlError && <p className="text-xs text-amber-600 mb-3">⚠️ {ghlError}</p>}
      {success && !editing && (
        <p className="text-sm text-emerald-600 font-semibold mb-3">Rapport sauvegardé avec succès.</p>
      )}

      {/* ── Actions ── */}
      <div className="flex justify-end gap-3 pt-1">
        {editing ? (
          <>
            <Button type="button" variant="secondary" onClick={cancelEditing}>
              Annuler
            </Button>
            <Button loading={submitting} onClick={handleSubmit}>
              Sauvegarder
            </Button>
          </>
        ) : !report ? (
          <Button onClick={startEditing}>
            Remplir le rapport
          </Button>
        ) : null}
      </div>
    </Card>
  )
}
