import { useState, useEffect } from 'react'
import Layout from '../components/layout/Layout'
import Header from '../components/layout/Header'
import Card from '../components/shared/Card'
import Badge from '../components/shared/Badge'
import Button from '../components/shared/Button'
import KPIModal from '../components/kpis/KPIModal'
import Modal from '../components/shared/Modal'
import Input from '../components/shared/Input'
import { SkeletonTable } from '../components/shared/Skeleton'
import { useKPIEntries, useClinicKPIEntries, useEODReports, getPeriodDates, KPI_TYPE_LABELS, deleteKPIEntry, parseKPIValue } from '../hooks/useKPIs'
import { useClinicObjectives, createObjective, deleteObjective, updateObjective, CLINIC_OBJECTIVE_TYPES } from '../hooks/useObjectives'
import { useMembers } from '../hooks/useMembers'
import { useAuth } from '../context/AuthContext'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { EOD_STATUSES, EOD_FEEDBACK_OPTIONS } from '../hooks/useCloserEOD'

function CloserEODExpandedContent({ data }) {
  const rows  = data?.rows  ?? []
  const notes = data?.notes ?? ''
  const statusColors = { show: { bg: '#10b98118', text: '#10b981' }, noshow: { bg: '#f59e0b18', text: '#f59e0b' }, annule: { bg: '#ef444418', text: '#ef4444' } }

  if (rows.length === 0 && !notes) return <p className="text-sm text-[#6b7280]">Aucune donnée.</p>

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[580px] text-left">
            <thead>
              <tr className="border-b border-[#e5e7eb]">
                {['Prospect', 'Statut', 'Closé', 'Feedback', 'Plan de match', 'Objection'].map(h => (
                  <th key={h} className="px-2 pb-1.5 text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide first:px-0">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const sc = statusColors[row.status] ?? { bg: '#6b728018', text: '#6b7280' }
                const statusLabel   = EOD_STATUSES.find(s => s.value === row.status)?.label ?? row.status
                const feedbackLabel = EOD_FEEDBACK_OPTIONS.find(f => f.value === row.feedback)?.label ?? (row.feedback || '—')
                const fmtTime = iso => { try { return iso ? format(new Date(iso), 'HH:mm') : '—' } catch { return '—' } }
                return (
                  <tr key={row.ghl_appointment_id || i} className="border-b border-[#f0f0f0]">
                    <td className="py-2 pr-2 text-sm font-semibold text-[#1a1a1a]">
                      {row.contact_name || '—'}
                      <span className="block text-[11px] text-[#9ca3af] font-normal">{fmtTime(row.start_time)}</span>
                    </td>
                    <td className="px-2 py-2">
                      {row.status ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: sc.bg, color: sc.text }}>{statusLabel}</span> : <span className="text-xs text-[#d1d5db]">—</span>}
                    </td>
                    <td className="px-2 py-2 text-xs font-semibold" style={{ color: row.is_closed === true ? '#10b981' : row.is_closed === false ? '#ef4444' : '#d1d5db' }}>
                      {row.is_closed === true ? 'Oui' : row.is_closed === false ? 'Non' : '—'}
                    </td>
                    <td className="px-2 py-2 text-xs text-[#6b7280]">{feedbackLabel}</td>
                    <td className="px-2 py-2 text-xs text-[#1a1a1a]">{row.action_plan || '—'}</td>
                    <td className="px-2 py-2 text-xs text-[#6b7280]">{row.is_closed === false ? (row.objection_reason || '—') : <span className="text-[#d1d5db]">N/A</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {notes && (
        <div>
          <p className="text-[11px] font-semibold text-[#9ca3af] mb-1">Notes</p>
          <p className="text-sm text-[#1a1a1a] whitespace-pre-wrap">{notes}</p>
        </div>
      )}
    </div>
  )
}

function EODReportRow({ report }) {
  const [expanded, setExpanded] = useState(false)
  const dataKeys = Object.keys(report.data || {})
  return (
    <>
      <tr className="border-b border-[#f5f5f7] hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <td className="py-3 px-3 text-sm font-semibold text-[#1a1a1a]">{format(parseISO(report.report_date), 'd MMM yyyy', { locale: fr })}</td>
        <td className="py-3 px-3 text-sm text-[#6b7280]">{report.profiles?.full_name}</td>
        <td className="py-3 px-3"><Badge variant={report.role}>{report.role}</Badge></td>
        <td className="py-3 px-3 text-sm text-[#6b7280]">{format(new Date(report.submitted_at), 'HH:mm')}</td>
        <td className="py-3 px-3 text-right"><svg className={`w-4 h-4 text-[#6b7280] inline transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></td>
      </tr>
      {expanded && (
        <tr className="border-b border-[#e5e7eb] bg-gray-50">
          <td colSpan={5} className="px-4 py-3">
            {report.role === 'closer' ? (
              <CloserEODExpandedContent data={report.data} />
            ) : dataKeys.length === 0 ? (
              <p className="text-sm text-[#6b7280]">Aucune donnée.</p>
            ) : (
              <div className="flex flex-wrap gap-4">
                {dataKeys.map(k => <div key={k} className="text-sm"><span className="text-[#6b7280] font-semibold">{k} : </span><span className="font-bold text-[#1a1a1a]">{String(report.data[k])}</span></div>)}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function AddClinicObjectiveModal({ isOpen, onClose, defaultType, onCreated, editObjective }) {
  const isEdit = !!editObjective
  const isAnnual = defaultType === 'clinic_revenue_annual'
  const [form, setForm] = useState({ target_value: '', period_start: '', period_end: '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen && editObjective) {
      setForm({
        target_value: String(editObjective.target_value),
        period_start: editObjective.period_start,
        period_end: editObjective.period_end,
      })
    } else if (!isOpen) {
      setForm({ target_value: '', period_start: '', period_end: '' })
    }
  }, [isOpen, editObjective])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.target_value || !form.period_start || !form.period_end) return
    setLoading(true)
    if (isEdit) {
      await updateObjective(editObjective.id, form)
    } else {
      await createObjective({ type: defaultType, target_value: Number(form.target_value), period_start: form.period_start, period_end: form.period_end, scope: 'clinic', user_id: null })
    }
    setLoading(false)
    onCreated?.(); onClose()
  }

  const title = isEdit
    ? (isAnnual ? 'Modifier objectif annuel' : 'Modifier objectif mensuel')
    : (isAnnual ? 'Ajouter objectif annuel' : 'Ajouter objectif mensuel')

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={isAnnual ? 'Objectif annuel ($)' : 'Objectif mensuel ($)'}
          type="number" min="0"
          value={form.target_value}
          onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))}
          placeholder={isAnnual ? 'Ex: 600000' : 'Ex: 50000'}
        />
        <Input label="Début de période" type="date" value={form.period_start} onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))} />
        <Input label="Fin de période" type="date" value={form.period_end} onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>{isEdit ? 'Enregistrer' : 'Créer'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function ClinicObjectivesList({ objectives, isAdmin, onDelete, onEdit, emptyText }) {
  return (
    <div>
      {objectives.length === 0 ? (
        <p className="text-xs text-[#6b7280] py-1">{emptyText}</p>
      ) : (
        <div className="space-y-1.5">
          {objectives.map(o => (
            <div key={o.id} className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-xl border border-[#e5e7eb]">
              <div>
                <p className="text-xs text-[#6b7280]">
                  {format(parseISO(o.period_start), 'd MMM', { locale: fr })} → {format(parseISO(o.period_end), 'd MMM yyyy', { locale: fr })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-sm text-[#1a1a1a]">
                  {Number(o.target_value).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
                </p>
                {isAdmin && (
                  <>
                    <button onClick={() => onEdit(o)} className="p-1 text-gray-300 hover:text-[#00bbb1] transition-colors" title="Modifier">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H7v-3a2 2 0 01.586-1.414z" /></svg>
                    </button>
                    <button onClick={() => onDelete(o.id)} className="p-1 text-gray-300 hover:text-red-500 transition-colors" title="Supprimer">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ClinicObjectivesPanel({ isAdmin }) {
  const { objectives, refetch } = useClinicObjectives()
  const [addMonthly, setAddMonthly] = useState(false)
  const [addAnnual, setAddAnnual] = useState(false)
  const [editObj, setEditObj] = useState(null)

  const monthlyObjs = objectives.filter(o => o.type === 'clinic_revenue')
  const annualObjs = objectives.filter(o => o.type === 'clinic_revenue_annual')

  async function handleDelete(id) {
    await deleteObjective(id)
    refetch()
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      {/* Mensuel */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#00bbb1]" />
            <h3 className="font-bold text-sm text-[#1a1a1a]">Objectifs mensuels</h3>
          </div>
          {isAdmin && <Button size="sm" onClick={() => setAddMonthly(true)}>+ Ajouter</Button>}
        </div>
        <ClinicObjectivesList
          objectives={monthlyObjs}
          isAdmin={isAdmin}
          onDelete={handleDelete}
          onEdit={setEditObj}
          emptyText="Aucun objectif mensuel défini."
        />
        <AddClinicObjectiveModal
          isOpen={addMonthly}
          onClose={() => setAddMonthly(false)}
          defaultType="clinic_revenue"
          onCreated={refetch}
        />
      </Card>

      {/* Annuel */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#6366f1]" />
            <h3 className="font-bold text-sm text-[#1a1a1a]">Objectifs annuels</h3>
          </div>
          {isAdmin && <Button size="sm" onClick={() => setAddAnnual(true)}>+ Ajouter</Button>}
        </div>
        <ClinicObjectivesList
          objectives={annualObjs}
          isAdmin={isAdmin}
          onDelete={handleDelete}
          onEdit={setEditObj}
          emptyText="Aucun objectif annuel défini."
        />
        <AddClinicObjectiveModal
          isOpen={addAnnual}
          onClose={() => setAddAnnual(false)}
          defaultType="clinic_revenue_annual"
          onCreated={refetch}
        />
      </Card>

      {/* Modal d'édition partagée */}
      {editObj && (
        <AddClinicObjectiveModal
          isOpen={!!editObj}
          onClose={() => setEditObj(null)}
          defaultType={editObj.type}
          editObjective={editObj}
          onCreated={() => { refetch(); setEditObj(null) }}
        />
      )}
    </div>
  )
}

function KPIEntriesTable({ entries, isAdmin, onDeleted }) {
  const [confirmId, setConfirmId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  async function handleDelete(id) {
    setDeletingId(id)
    await deleteKPIEntry(id)
    setDeletingId(null)
    setConfirmId(null)
    onDeleted?.()
  }

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-[#e5e7eb]">
          <th className="text-left py-2 px-2 text-xs font-semibold text-[#6b7280] uppercase">Membre</th>
          <th className="text-left py-2 px-2 text-xs font-semibold text-[#6b7280] uppercase">Date</th>
          <th className="text-left py-2 px-2 text-xs font-semibold text-[#6b7280] uppercase">Type</th>
          <th className="text-right py-2 px-2 text-xs font-semibold text-[#6b7280] uppercase">Valeur</th>
          {isAdmin && <th className="w-8" />}
        </tr>
      </thead>
      <tbody>
        {entries.map(e => (
          <tr key={e.id} className="border-b border-[#f5f5f7] hover:bg-gray-50">
            <td className="py-2.5 px-2 text-sm font-semibold text-[#1a1a1a]">{e.profiles?.full_name || '—'}</td>
            <td className="py-2.5 px-2 text-sm text-[#6b7280]">{format(parseISO(e.entry_date), 'd MMM yyyy', { locale: fr })}</td>
            <td className="py-2.5 px-2 text-sm text-[#6b7280]">{KPI_TYPE_LABELS[e.kpi_type] || e.kpi_type}</td>
            <td className="py-2.5 px-2 text-right font-bold text-[#1a1a1a]">
              {parseKPIValue(e).displayValue}
            </td>
            {isAdmin && (
              <td className="py-2.5 px-2 text-right">
                {confirmId === e.id ? (
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => handleDelete(e.id)}
                      disabled={deletingId === e.id}
                      className="text-xs text-red-500 font-semibold hover:text-red-700 disabled:opacity-50"
                    >
                      {deletingId === e.id ? '…' : 'Oui'}
                    </button>
                    <span className="text-[#d1d5db]">/</span>
                    <button onClick={() => setConfirmId(null)} className="text-xs text-[#6b7280] hover:text-[#1a1a1a]">Non</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmId(e.id)}
                    className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                    title="Supprimer cette entrée"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function KPIs() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const isRespVente = profile?.role === 'resp_vente'
  const isAdminOrRespVente = isAdmin || isRespVente

  const [period, setPeriod] = useState('mois')
  const [memberFilter, setMemberFilter] = useState(isAdminOrRespVente ? '' : profile?.id || '')
  const [kpiModalOpen, setKpiModalOpen] = useState(false)

  const { from, to } = getPeriodDates(period)

  const individualFilters = {
    scope: 'individual',
    dateFrom: from, dateTo: to,
    ...(memberFilter && { userId: memberFilter }),
  }
  if (!isAdminOrRespVente) individualFilters.userId = profile?.id

  const { entries, loading: kpiLoading, refetch: refetchEntries } = useKPIEntries(individualFilters)
  const { entries: clinicEntries, loading: clinicLoading, refetch: refetchClinic } = useClinicKPIEntries({ dateFrom: from, dateTo: to })
  const { reports, loading: eodLoading } = useEODReports({
    dateFrom: from, dateTo: to,
    ...(isAdminOrRespVente ? (memberFilter ? { userId: memberFilter } : {}) : { userId: profile?.id }),
  })
  const { members: allMembers } = useMembers()
  const members = isRespVente
    ? allMembers.filter(m => m.role === 'closer' || m.role === 'setter')
    : allMembers
  const selectedMember = members.find(m => m.id === memberFilter)

  const periods = [
    { value: 'semaine', label: 'Cette semaine' },
    { value: 'mois', label: 'Ce mois' },
    { value: 'trimestre', label: 'Ce trimestre' },
  ]

  function handleKPICreated() { refetchEntries(); refetchClinic() }

  return (
    <Layout>
      <Header title="KPIs" />

      {/* Objectifs clinique — admin uniquement */}
      {!isRespVente && <ClinicObjectivesPanel isAdmin={isAdmin} />}

      {/* Filtres */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <div className="flex gap-2">
          {periods.map(p => (
            <button key={p.value} onClick={() => setPeriod(p.value)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${period === p.value ? 'bg-[#00bbb1] text-white' : 'bg-white text-[#6b7280] border border-[#e5e7eb] hover:bg-gray-50'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {isAdminOrRespVente && (
          <select value={memberFilter} onChange={e => setMemberFilter(e.target.value)} className="px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]">
            <option value="">Tous les membres</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        )}
        <div className="ml-auto">
          <Button onClick={() => setKpiModalOpen(true)}>+ Ajouter un KPI</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne principale */}
        <div className="lg:col-span-2 space-y-6">
          {/* KPIs individuels */}
          <Card className="p-6">
            <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">Données d'activité</h2>
            {kpiLoading ? <SkeletonTable rows={5} /> : entries.length === 0 ? (
              <p className="text-sm text-[#6b7280]">Aucune entrée pour cette période.</p>
            ) : (
              <KPIEntriesTable entries={entries} isAdmin={isAdmin} onDeleted={refetchEntries} />
            )}
          </Card>

          {/* KPIs clinique */}
          <Card className="p-6">
            <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">
              <span className="inline-flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00bbb1] inline-block" />
                Revenu Clinique
              </span>
            </h2>
            {clinicLoading ? <SkeletonTable rows={3} /> : clinicEntries.length === 0 ? (
              <p className="text-sm text-[#6b7280]">Aucune entrée clinique pour cette période.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e5e7eb]">
                    <th className="text-left py-2 px-2 text-xs font-semibold text-[#6b7280] uppercase">Date</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-[#6b7280] uppercase">Type</th>
                    <th className="text-right py-2 px-2 text-xs font-semibold text-[#6b7280] uppercase">Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  {clinicEntries.map(e => (
                    <tr key={e.id} className="border-b border-[#f5f5f7] hover:bg-gray-50">
                      <td className="py-2.5 px-2 text-sm text-[#6b7280]">{format(parseISO(e.entry_date), 'd MMM yyyy', { locale: fr })}</td>
                      <td className="py-2.5 px-2 text-sm text-[#00bbb1] font-semibold">{KPI_TYPE_LABELS[e.kpi_type] || e.kpi_type}</td>
                      <td className="py-2.5 px-2 text-right font-bold text-[#1a1a1a]">{Number(e.value).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        {/* Colonne EOD */}
        <div>
          <Card className="p-6">
            <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">Rapports EOD</h2>
            {eodLoading ? <SkeletonTable rows={4} /> : reports.length === 0 ? (
              <p className="text-sm text-[#6b7280]">Aucun rapport disponible.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e5e7eb]">
                    <th className="text-left py-2 px-2 text-xs font-semibold text-[#6b7280] uppercase">Date</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-[#6b7280] uppercase">Membre</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-[#6b7280] uppercase">Rôle</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-[#6b7280] uppercase">Heure</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {reports.map(r => <EODReportRow key={r.id} report={r} />)}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>

      <KPIModal
        isOpen={kpiModalOpen}
        onClose={() => setKpiModalOpen(false)}
        userId={isAdmin ? (memberFilter || null) : profile?.id}
        userRole={isAdmin ? (selectedMember?.role || null) : profile?.role}
        allowClinic={isAdmin}
        allowMemberSelect={isAdmin}
        onCreated={handleKPICreated}
      />
    </Layout>
  )
}
