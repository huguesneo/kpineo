import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import Card from '../shared/Card'
import Button from '../shared/Button'
import { useSetterEOD, DEFAULT_SETTER_EOD } from '../../hooks/useSetterEOD'

// ─── Field helpers ────────────────────────────────────────────────────────────

function NumField({ label, name, value, onChange, placeholder = '0', min = 0 }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#6b7280] mb-1">{label}</label>
      <input
        type="number"
        name={name}
        value={value}
        min={min}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent"
      />
    </div>
  )
}

function TextAreaField({ label, name, value, onChange, placeholder = '', rows = 3 }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#6b7280] mb-1">{label}</label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent resize-none"
      />
    </div>
  )
}

// ─── EOD History Item ─────────────────────────────────────────────────────────

export function SetterEODHistoryItem({ report }) {
  const [expanded, setExpanded] = useState(false)
  const d = report.data || {}
  const atteint = d.objectif_atteint

  const statsFields = [
    { key: 'appels_totaux',         label: 'Appels totaux' },
    { key: 'conversations',         label: 'Conversations' },
    { key: 'rdv_manuels',           label: 'RDV settés (manuels)' },
    { key: 'rdv_automatiques',      label: 'RDV automatiques' },
    { key: 'noshows_rebooks',       label: 'No-Shows récupérés' },
    { key: 'annulations_rebookees', label: 'Annulations rebookées' },
  ]

  return (
    <div className="border border-[#e5e7eb] rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-semibold text-[#1a1a1a]">
              {format(parseISO(report.report_date), 'EEEE d MMMM yyyy', { locale: fr })}
            </p>
            <p className="text-xs text-[#9ca3af] mt-0.5">
              Soumis à {format(new Date(report.submitted_at), 'HH:mm')}
            </p>
          </div>
          {atteint !== null && atteint !== undefined && (
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
              atteint ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
            }`}>
              {atteint ? 'Objectif atteint' : 'Objectif non atteint'}
            </span>
          )}
          {d.qualite_leads_note !== '' && d.qualite_leads_note != null && (
            <span className="text-[11px] font-bold text-[#6b7280] bg-gray-100 px-2 py-0.5 rounded-full">
              Leads {d.qualite_leads_note}/10
            </span>
          )}
        </div>
        <svg className={`w-4 h-4 text-[#6b7280] transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-3 bg-gray-50 border-t border-[#e5e7eb] space-y-4">

          {/* Stats grid */}
          <div>
            <p className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wide mb-2">Statistiques journalières</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {statsFields.map(({ key, label }) => (
                d[key] !== '' && d[key] != null ? (
                  <div key={key} className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2">
                    <p className="text-[10px] text-[#9ca3af] font-semibold">{label}</p>
                    <p className="text-lg font-bold text-[#1a1a1a]">{Number(d[key]).toLocaleString('fr-CA')}</p>
                  </div>
                ) : null
              ))}
            </div>
          </div>

          {/* Coaching insights */}
          {(d.objections_majeures || d.qualite_leads_note !== '' || d.qualite_leads_analyse) && (
            <div>
              <p className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wide mb-2">Insights de coaching</p>
              <div className="space-y-2">
                {d.objections_majeures && (
                  <div className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2">
                    <p className="text-[10px] text-[#9ca3af] font-semibold mb-0.5">Objections majeures</p>
                    <p className="text-sm text-[#1a1a1a] leading-relaxed whitespace-pre-wrap">{d.objections_majeures}</p>
                  </div>
                )}
                {d.qualite_leads_note !== '' && d.qualite_leads_note != null && (
                  <div className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2">
                    <p className="text-[10px] text-[#9ca3af] font-semibold mb-1">Qualité des leads</p>
                    <div className="flex items-center gap-3">
                      <p className="text-xl font-bold text-[#1a1a1a]">{d.qualite_leads_note}<span className="text-sm font-normal text-[#9ca3af]">/10</span></p>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${(Number(d.qualite_leads_note) / 10) * 100}%`,
                            backgroundColor: Number(d.qualite_leads_note) >= 8 ? '#10b981' : Number(d.qualite_leads_note) >= 5 ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      </div>
                    </div>
                    {d.qualite_leads_analyse && (
                      <p className="text-sm text-[#6b7280] mt-1.5 leading-relaxed whitespace-pre-wrap">{d.qualite_leads_analyse}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main form component ──────────────────────────────────────────────────────

export default function SetterEODForm({ userId }) {
  const { todayReport, loading, submitting, error, upsert } = useSetterEOD(userId)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(DEFAULT_SETTER_EOD)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (todayReport && !editing) {
      setForm({ ...DEFAULT_SETTER_EOD, ...todayReport.data })
    }
  }, [todayReport, editing])

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  function handleObjectif(val) {
    setForm(f => ({ ...f, objectif_atteint: val }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSuccess(false)
    const cleanedData = {
      ...form,
      appels_totaux:           form.appels_totaux === '' ? null : Number(form.appels_totaux),
      conversations:           form.conversations === '' ? null : Number(form.conversations),
      rdv_manuels:             form.rdv_manuels === '' ? null : Number(form.rdv_manuels),
      rdv_automatiques:        form.rdv_automatiques === '' ? null : Number(form.rdv_automatiques),
      noshows_rebooks:         form.noshows_rebooks === '' ? null : Number(form.noshows_rebooks),
      annulations_rebookees:   form.annulations_rebookees === '' ? null : Number(form.annulations_rebookees),
      qualite_leads_note:      form.qualite_leads_note === '' ? null : Number(form.qualite_leads_note),
    }
    const { error: err } = await upsert(cleanedData)
    if (!err) { setSuccess(true); setEditing(false) }
  }

  const todayLabel = format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })
  const qualiteNote = Number(form.qualite_leads_note)

  if (loading) {
    return (
      <Card className="p-5 mb-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-100 rounded w-1/3" />
          <div className="h-8 bg-gray-100 rounded" />
        </div>
      </Card>
    )
  }

  // ── Submitted state (read-only) ──────────────────────────────────────────
  if (todayReport && !editing) {
    const d = todayReport.data || {}
    const statsFields = [
      { key: 'appels_totaux',         label: 'Appels totaux' },
      { key: 'conversations',         label: 'Conversations' },
      { key: 'rdv_manuels',           label: 'RDV settés (manuels)' },
      { key: 'rdv_automatiques',      label: 'RDV automatiques' },
      { key: 'noshows_rebooks',       label: 'No-Shows récupérés' },
      { key: 'annulations_rebookees', label: 'Annulations rebookées' },
    ]

    return (
      <Card className="p-5 mb-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-base">📋</span>
              <h2 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wide">Rapport EOD — {todayLabel}</h2>
            </div>
            <p className="text-xs text-[#9ca3af]">Soumis à {format(new Date(todayReport.submitted_at), 'HH:mm')}</p>
          </div>
          <div className="flex items-center gap-2">
            {d.objectif_atteint !== null && d.objectif_atteint !== undefined && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                d.objectif_atteint ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
              }`}>
                {d.objectif_atteint ? '✓ Objectif atteint' : '✗ Objectif non atteint'}
              </span>
            )}
            <button
              onClick={() => setEditing(true)}
              className="text-xs font-semibold text-[#00bbb1] hover:text-[#009e95] transition-colors"
            >
              Modifier
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-4">
          <p className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wide mb-2">Statistiques journalières</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {statsFields.map(({ key, label }) => (
              <div key={key} className="bg-[#f5f5f7] rounded-xl px-3 py-2.5 text-center">
                <p className="text-[10px] text-[#9ca3af] font-semibold leading-tight mb-1">{label}</p>
                <p className="text-xl font-bold text-[#1a1a1a]">{d[key] ?? '—'}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Coaching */}
        {(d.objections_majeures || d.qualite_leads_note != null) && (
          <div className="pt-4 border-t border-[#f0f0f0] space-y-3">
            <p className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wide">Insights de coaching</p>
            {d.objections_majeures && (
              <div>
                <p className="text-xs font-semibold text-[#6b7280] mb-1">Objections majeures</p>
                <p className="text-sm text-[#1a1a1a] bg-[#f5f5f7] rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap">{d.objections_majeures}</p>
              </div>
            )}
            {d.qualite_leads_note != null && (
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <p className="text-xs font-semibold text-[#6b7280]">Qualité des leads</p>
                  <p className="text-sm font-bold text-[#1a1a1a]">{d.qualite_leads_note}<span className="text-xs font-normal text-[#9ca3af]">/10</span></p>
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${(Number(d.qualite_leads_note) / 10) * 100}%`,
                        backgroundColor: Number(d.qualite_leads_note) >= 8 ? '#10b981' : Number(d.qualite_leads_note) >= 5 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>
                </div>
                {d.qualite_leads_analyse && (
                  <p className="text-sm text-[#6b7280] bg-[#f5f5f7] rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap">{d.qualite_leads_analyse}</p>
                )}
              </div>
            )}
          </div>
        )}
      </Card>
    )
  }

  // ── Form (new or edit) ───────────────────────────────────────────────────
  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-base">📋</span>
        <div>
          <h2 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wide">
            {editing ? 'Modifier le rapport EOD' : 'Rapport End of Day'}
          </h2>
          <p className="text-xs text-[#9ca3af] capitalize">{todayLabel}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Section 1 : Statistiques */}
        <div>
          <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <span>📊</span> Statistiques journalières
          </p>

          {/* Objectif toggle */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-[#6b7280] mb-2">Objectif de la journée</p>
            <div className="flex gap-2">
              {[
                { val: true,  label: 'Atteint',     active: 'bg-emerald-500 text-white', inactive: 'bg-white border border-[#e5e7eb] text-[#6b7280] hover:border-emerald-300' },
                { val: false, label: 'Non atteint', active: 'bg-red-500 text-white',     inactive: 'bg-white border border-[#e5e7eb] text-[#6b7280] hover:border-red-300' },
              ].map(({ val, label, active, inactive }) => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => handleObjectif(val)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    form.objectif_atteint === val ? active : inactive
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <NumField label="Appels totaux faits"                   name="appels_totaux"          value={form.appels_totaux}          onChange={handleChange} />
            <NumField label="Conversations eues"                    name="conversations"          value={form.conversations}          onChange={handleChange} />
            <NumField label="RDV settés (manuels)"                  name="rdv_manuels"            value={form.rdv_manuels}            onChange={handleChange} />
            <NumField label="RDV automatiques (confirmés/qualifiés)" name="rdv_automatiques"       value={form.rdv_automatiques}       onChange={handleChange} />
            <NumField label="No-Shows récupérés (re-bookés)"        name="noshows_rebooks"        value={form.noshows_rebooks}        onChange={handleChange} />
            <NumField label="Annulations traitées & rebookées"       name="annulations_rebookees"  value={form.annulations_rebookees}  onChange={handleChange} />
          </div>
        </div>

        {/* Section 2 : Coaching */}
        <div className="pt-4 border-t border-[#f0f0f0]">
          <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <span>🧠</span> Insights de coaching
          </p>

          <div className="space-y-3">
            <TextAreaField
              label="Objections majeures — Quelles sont les raisons précises qui n'ont pas permis d'aller de l'avant avec un rendez-vous aujourd'hui ?"
              name="objections_majeures"
              value={form.objections_majeures}
              onChange={handleChange}
              placeholder="Ex : les leads étaient trop froids, manque d'urgence, objection prix récurrente…"
              rows={3}
            />

            <NumField
              label="Qualité des leads (note / 10)"
              name="qualite_leads_note"
              value={form.qualite_leads_note}
              onChange={handleChange}
              placeholder="Ex : 7"
              min={0}
            />

            {/* Analyse conditionnelle si note < 10 */}
            {form.qualite_leads_note !== '' && qualiteNote < 10 && (
              <TextAreaField
                label="Analyse de la qualité — Explique précisément pourquoi ce n'était pas optimal"
                name="qualite_leads_analyse"
                value={form.qualite_leads_analyse}
                onChange={handleChange}
                placeholder="Ex : leads trop froids, manque de motivation, mauvais ciblage…"
                rows={3}
              />
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {success && !editing && (
          <p className="text-sm text-emerald-600 font-semibold">Rapport sauvegardé avec succès.</p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          {editing && (
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              Annuler
            </Button>
          )}
          <Button type="submit" loading={submitting}>
            {editing ? 'Sauvegarder les modifications' : 'Soumettre le rapport'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
