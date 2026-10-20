import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import Card from '../shared/Card'
import { SkeletonCard } from '../shared/Skeleton'
import { supabase } from '../../lib/supabase'
import { telechargerCsv, jourFichier } from '../../lib/exportCsv'
import { lienFicheGHL } from '../../lib/v2/salesConfig'
import { PIPELINE_CLOSER_VENTE } from '../../lib/commissions/config'
import {
  fetchAllRows,
  getGHLField,
  fetchCloserOpps,
  isWonStage,
  isSaleInScope,
  getCloserField,
  ghlCloseCalendarDate,
  closeDateForDisplay,
} from '../../lib/ghlHelpers'

// Statuts « finaux » : un RDV passé devrait porter l'un de ceux-là.
const FINAL_STATUSES = new Set(['showed', 'attended', 'noshow', 'cancelled'])
const FIELD_SETTER_NOM = 'II5NrZGZrIScYItkxCi8' // setter__nom sur l'opportunité

const isoJour = d => (d ? (d instanceof Date ? d : new Date(d)).toISOString() : null)

function fmtDate(d) {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d)
  return format(date, 'd MMM yyyy', { locale: fr })
}

// ─── Hook : calcule les problèmes de tracking ─────────────────
// Chaque ligne garde tout le détail utile à l'export CSV.
function useDataHygiene() {
  const [state, setState] = useState({ loading: true, unstatused: [], noCloser: [], noDate: [] })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true }))
    const nowIso = new Date().toISOString()

    const [{ data: profils }, appts, opps] = await Promise.all([
      supabase.from('profiles').select('full_name, ghl_user_id').not('ghl_user_id', 'is', null),
      // RDV passés sans statut final
      fetchAllRows((from, to) => supabase
        .from('ghl_appointments')
        .select('ghl_id, contact_id, contact_name, start_time, status, calendar_id, assigned_user_id, titre:raw->>title, cree_le:raw->>dateAdded')
        .lt('start_time', nowIso)
        .order('start_time', { ascending: false })
        .range(from, to)),
      // Opportunités gagnées : sans closer / sans date de close
      fetchCloserOpps('ghl_id, contact_id, contact_name, stage_name, status, monetary_value, source, created_at_ghl, raw, closed_at'),
    ])
    const nomUser = Object.fromEntries((profils ?? []).map(p => [p.ghl_user_id, p.full_name]))
    const won = opps.filter(o => isWonStage(o) && isSaleInScope(o))

    const vente = o => ({
      ghlId: o.ghl_id,
      contactId: o.contact_id,
      contactName: String(o.contact_name ?? '').trim() || '—',
      closeDate: closeDateForDisplay(o),
      closer: getCloserField(o) || null,
      setter: String(getGHLField(o.raw, FIELD_SETTER_NOM) ?? '').trim() || null,
      pipeline: o.pipeline_id === PIPELINE_CLOSER_VENTE ? '🎯 Vente' : 'Rencontre découverte (ancien)',
      etape: o.stage_name,
      statut: o.status,
      valeur: Number(o.monetary_value ?? 0),
      source: o.source,
      assigne: nomUser[o.raw?.assignedTo] ?? o.raw?.assignedTo ?? null,
      champDateClose: ghlCloseCalendarDate(o.raw),
      fermeLe: o.closed_at,
      changementEtape: o.raw?.lastStageChangeAt ?? null,
      creeLe: o.created_at_ghl,
    })

    setState({
      loading: false,
      unstatused: appts.filter(a => !FINAL_STATUSES.has(String(a.status ?? ''))).map(a => ({
        ghlId: a.ghl_id, contactId: a.contact_id, contactName: String(a.contact_name ?? '').trim() || '—',
        startTime: a.start_time, status: a.status || '(vide)', titre: a.titre, calendrier: a.calendar_id,
        assigne: nomUser[a.assigned_user_id] ?? a.assigned_user_id ?? null, creeLe: a.cree_le,
      })),
      noCloser: won.filter(o => !getCloserField(o)).map(vente),
      // "Sans date" = aucune date exploitable (ni champ custom, ni closed_at,
      // ni lastStageChangeAt). Grâce au repli, ces cas sont désormais rares —
      // mais on les signale car ils restent invisibles dans les rapports.
      noDate: won.filter(o => !ghlCloseCalendarDate(o.raw) && !o.closed_at && !o.raw?.lastStageChangeAt).map(vente),
    })
  }, [])

  useEffect(() => { load() }, [load])
  return { ...state, refetch: load }
}

// Colonnes des exports CSV
const lien = { cle: l => (l.contactId ? lienFicheGHL(l.contactId) : null), titre: 'Fiche GHL' }
const COLONNES_RDV = [
  { cle: 'contactName', titre: 'Contact' }, { cle: 'contactId', titre: 'ID contact' },
  { cle: l => isoJour(l.startTime), titre: 'Début du RDV' }, { cle: 'status', titre: 'Statut' },
  { cle: 'titre', titre: 'Titre du RDV' }, { cle: 'assigne', titre: 'Assigné à' },
  { cle: 'calendrier', titre: 'ID calendrier' }, { cle: 'creeLe', titre: 'RDV créé le' },
  { cle: 'ghlId', titre: 'ID RDV' }, lien,
]
const COLONNES_VENTE = [
  { cle: 'contactName', titre: 'Contact' }, { cle: 'contactId', titre: 'ID contact' },
  { cle: 'pipeline', titre: 'Pipeline' }, { cle: 'etape', titre: 'Étape' }, { cle: 'statut', titre: 'Statut' },
  { cle: 'valeur', titre: 'Valeur' }, { cle: 'closer', titre: 'Champ closeur' }, { cle: 'setter', titre: 'Champ setter__nom' },
  { cle: 'assigne', titre: 'Assigné à' }, { cle: 'source', titre: 'Source' },
  { cle: l => isoJour(l.closeDate), titre: 'Date de close retenue' }, { cle: 'champDateClose', titre: 'Champ date de close' },
  { cle: 'fermeLe', titre: 'closed_at' }, { cle: 'changementEtape', titre: 'Dernier changement d’étape' },
  { cle: 'creeLe', titre: 'Carte créée le' }, { cle: 'ghlId', titre: 'ID opportunité' }, lien,
]

// ─── Ligne de section repliable ───────────────────────────────
// Ouverte, la section montre toutes les lignes ; « Exporter » télécharge le CSV complet.
function IssueSection({ title, description, count, color, onExport, children }) {
  const [open, setOpen] = useState(false)
  const clean = count === 0
  return (
    <Card className="p-0 overflow-hidden">
      <div className={`flex items-center gap-2 pr-3 ${clean ? '' : 'hover:bg-gray-50'}`}>
        <button
          onClick={() => !clean && setOpen(o => !o)}
          aria-expanded={open}
          className={`flex-1 min-w-0 flex items-center justify-between gap-3 px-5 py-4 text-left ${clean ? 'cursor-default' : ''}`}
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
        {!clean && (
          <button onClick={onExport} title="Télécharger toutes les lignes avec leur détail (CSV, s'ouvre dans Excel)"
            className="flex-shrink-0 text-xs font-semibold text-[#00bbb1] hover:text-[#009e95] px-3 py-1.5 rounded-lg border border-[#e5e7eb] hover:border-[#00bbb1]/40">
            ⬇ Exporter CSV
          </button>
        )}
      </div>
      {open && !clean && (
        <div className="border-t border-[#f0f0f0] divide-y divide-[#f5f5f5]">
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
        onExport={() => telechargerCsv(`rdv-sans-statut-final-${jourFichier()}`, unstatused, COLONNES_RDV)}
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
        onExport={() => telechargerCsv(`ventes-gagnees-sans-closer-${jourFichier()}`, noCloser, COLONNES_VENTE)}
      >
        {noCloser.map((s, i) => (
          <div key={s.ghlId || i} className="flex items-center justify-between gap-3 px-5 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#1a1a1a] truncate">{s.contactName}</p>
              <p className="text-xs text-[#9ca3af] truncate">{[s.pipeline, s.setter && `setter : ${s.setter}`, s.valeur > 0 && `${s.valeur.toLocaleString('fr-CA')} $`].filter(Boolean).join(' · ')}</p>
            </div>
            <span className="text-xs text-[#9ca3af] flex-shrink-0">closé le {fmtDate(s.closeDate)}</span>
          </div>
        ))}
      </IssueSection>

      <IssueSection
        title="Ventes gagnées sans date de close"
        description="Sans date, la vente ne tombe dans aucune période et disparaît des rapports. À dater dans GHL."
        count={noDate.length}
        color="#6366f1"
        onExport={() => telechargerCsv(`ventes-gagnees-sans-date-${jourFichier()}`, noDate, COLONNES_VENTE)}
      >
        {noDate.map((s, i) => (
          <div key={s.ghlId || i} className="flex items-center justify-between gap-3 px-5 py-2.5">
            <p className="text-sm font-semibold text-[#1a1a1a] truncate">{s.contactName}</p>
            <span className="text-xs text-[#9ca3af] flex-shrink-0">closer : {s.closer ?? '—'}</span>
          </div>
        ))}
      </IssueSection>
    </div>
  )
}
