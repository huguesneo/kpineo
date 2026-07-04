import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import Card from '../shared/Card'
import { SkeletonCard } from '../shared/Skeleton'
import { supabase } from '../../lib/supabase'
import {
  GHL_PIPELINE_CLOSER,
  fetchAllRows,
  isWonStage,
  getCloserField,
  ghlCloseCalendarDate,
  closeDateForDisplay,
} from '../../lib/ghlHelpers'

// Statuts « finaux » : un RDV passé devrait porter l'un de ceux-là.
const FINAL_STATUSES = new Set(['showed', 'attended', 'noshow', 'cancelled'])

function fmtDate(d) {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d)
  return format(date, 'd MMM yyyy', { locale: fr })
}

// ─── Hook : calcule les problèmes de tracking ─────────────────
function useDataHygiene() {
  const [state, setState] = useState({ loading: true, unstatused: [], noCloser: [], noDate: [] })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true }))
    const nowIso = new Date().toISOString()

    // RDV passés sans statut final
    const appts = await fetchAllRows((from, to) => supabase
      .from('ghl_appointments')
      .select('ghl_id, contact_name, start_time, status, calendar_id')
      .lt('start_time', nowIso)
      .order('start_time', { ascending: false })
      .range(from, to))
    const unstatused = appts.filter(a => !FINAL_STATUSES.has(String(a.status ?? '')))

    // Opportunités gagnées : sans closer / sans date de close
    const opps = await fetchAllRows((from, to) => supabase
      .from('ghl_opportunities')
      .select('ghl_id, contact_name, stage_name, raw, closed_at')
      .eq('pipeline_id', GHL_PIPELINE_CLOSER)
      .range(from, to))
    const won = opps.filter(isWonStage)

    const noCloser = won
      .filter(o => !getCloserField(o))
      .map(o => ({ ghlId: o.ghl_id, contactName: String(o.contact_name ?? '').trim() || '—', closeDate: closeDateForDisplay(o) }))

    // "Sans date" = aucune date exploitable (ni champ custom, ni closed_at,
    // ni lastStageChangeAt). Grâce au repli, ces cas sont désormais rares —
    // mais on les signale car ils restent invisibles dans les rapports.
    const noDate = won
      .filter(o => !ghlCloseCalendarDate(o.raw) && !o.closed_at && !o.raw?.lastStageChangeAt)
      .map(o => ({ ghlId: o.ghl_id, contactName: String(o.contact_name ?? '').trim() || '—', closer: getCloserField(o) || '—' }))

    setState({
      loading: false,
      unstatused: unstatused.map(a => ({
        ghlId: a.ghl_id, contactName: String(a.contact_name ?? '').trim() || '—',
        startTime: a.start_time, status: a.status || '(vide)',
      })),
      noCloser,
      noDate,
    })
  }, [])

  useEffect(() => { load() }, [load])
  return { ...state, refetch: load }
}

// ─── Ligne de section repliable ───────────────────────────────
function IssueSection({ title, description, count, color, children }) {
  const [open, setOpen] = useState(false)
  const clean = count === 0
  return (
    <Card className="p-0 overflow-hidden">
      <button
        onClick={() => !clean && setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-3 px-5 py-4 text-left ${clean ? 'cursor-default' : 'hover:bg-gray-50'}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ backgroundColor: clean ? '#10b98115' : `${color}15` }}>
            <span className="text-lg">{clean ? '✅' : '⚠️'}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#1a1a1a]">{title}</p>
            <p className="text-xs text-[#9ca3af] truncate">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-2xl font-black" style={{ color: clean ? '#10b981' : color }}>{count}</span>
          {!clean && (
            <svg className={`w-4 h-4 text-[#9ca3af] transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </button>
      {open && !clean && (
        <div className="border-t border-[#f0f0f0] max-h-80 overflow-y-auto divide-y divide-[#f5f5f5]">
          {children}
        </div>
      )}
    </Card>
  )
}

// ─── Panneau principal ────────────────────────────────────────
export default function DataHygienePanel() {
  const { loading, unstatused, noCloser, noDate, refetch } = useDataHygiene()

  if (loading) {
    return <div className="space-y-3">{[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}</div>
  }

  const totalIssues = unstatused.length + noCloser.length + noDate.length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-bold text-[#1a1a1a]">Hygiène des données de tracking</h2>
          <p className="text-xs text-[#9ca3af] mt-0.5">
            {totalIssues === 0
              ? 'Aucun problème détecté — tracking impeccable 🎯'
              : `${totalIssues} élément${totalIssues !== 1 ? 's' : ''} à corriger pour un tracking fiable`}
          </p>
        </div>
        <button
          onClick={refetch}
          className="text-xs font-semibold text-[#00bbb1] hover:text-[#009e95] px-3 py-1.5 rounded-lg border border-[#e5e7eb] hover:border-[#00bbb1]/40 transition-colors"
        >
          ↻ Rafraîchir
        </button>
      </div>

      <IssueSection
        title="RDV passés sans statut final"
        description="Ni Show, ni No-show, ni Annulé — faussent le taux de close. À statuer dans GHL."
        count={unstatused.length}
        color="#f59e0b"
      >
        {unstatused.map((a, i) => (
          <div key={a.ghlId || i} className="flex items-center justify-between gap-3 px-5 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#1a1a1a] truncate">{a.contactName}</p>
              <p className="text-xs text-[#9ca3af]">{fmtDate(a.startTime)}</p>
            </div>
            <span className="text-[10px] font-bold text-[#f59e0b] bg-[#f59e0b]/10 px-2 py-0.5 rounded-full flex-shrink-0">
              {a.status}
            </span>
          </div>
        ))}
      </IssueSection>

      <IssueSection
        title="Ventes gagnées sans closer"
        description="Non attribuées → n'apparaissent dans les stats d'aucun closer. À assigner dans « Équipe de vente »."
        count={noCloser.length}
        color="#ef4444"
      >
        {noCloser.map((s, i) => (
          <div key={s.ghlId || i} className="flex items-center justify-between gap-3 px-5 py-2.5">
            <p className="text-sm font-semibold text-[#1a1a1a] truncate">{s.contactName}</p>
            <span className="text-xs text-[#9ca3af] flex-shrink-0">closé le {fmtDate(s.closeDate)}</span>
          </div>
        ))}
      </IssueSection>

      <IssueSection
        title="Ventes gagnées sans date de close"
        description="Sans date, la vente ne tombe dans aucune période et disparaît des rapports. À dater dans GHL."
        count={noDate.length}
        color="#6366f1"
      >
        {noDate.map((s, i) => (
          <div key={s.ghlId || i} className="flex items-center justify-between gap-3 px-5 py-2.5">
            <p className="text-sm font-semibold text-[#1a1a1a] truncate">{s.contactName}</p>
            <span className="text-xs text-[#9ca3af] flex-shrink-0">closer : {s.closer}</span>
          </div>
        ))}
      </IssueSection>
    </div>
  )
}
