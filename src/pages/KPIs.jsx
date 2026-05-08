import { useState } from 'react'
import Layout from '../components/layout/Layout'
import Header from '../components/layout/Header'
import Card from '../components/shared/Card'
import Badge from '../components/shared/Badge'
import Button from '../components/shared/Button'
import KPIModal from '../components/kpis/KPIModal'
import Modal from '../components/shared/Modal'
import Input from '../components/shared/Input'
import { SkeletonTable } from '../components/shared/Skeleton'
import { useKPIEntries, useClinicKPIEntries, useEODReports, getPeriodDates, KPI_TYPE_LABELS } from '../hooks/useKPIs'
import { useClinicObjectives, createObjective, deleteObjective, CLINIC_OBJECTIVE_TYPES } from '../hooks/useObjectives'
import { useMembers } from '../hooks/useMembers'
import { useAuth } from '../context/AuthContext'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

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
            {dataKeys.length === 0 ? <p className="text-sm text-[#6b7280]">Aucune donnée.</p> : (
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

function AddClinicObjectiveModal({ isOpen, onClose, defaultType, onCreated }) {
  const [form, setForm] = useState({ type: defaultType, target_value: '', period_start: '', period_end: '' })
  const [loading, setLoading] = useState(false)
  const isAnnual = defaultType === 'clinic_revenue_annual'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.target_value || !form.period_start || !form.period_end) return
    setLoading(true)
    await createObjective({ ...form, type: defaultType, target_value: Number(form.target_value), scope: 'clinic', user_id: null })
    setLoading(false)
    setForm({ type: defaultType, target_value: '', period_start: '', period_end: '' })
    onCreated?.(); onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isAnnual ? 'Ajouter objectif annuel' : 'Ajouter objectif mensuel'}>
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
          <Button type="submit" loading={loading}>Créer</Button>
        </div>
      </form>
    </Modal>
  )
}

function ClinicObjectivesList({ objectives, isAdmin, onDelete, label, emptyText }) {
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
              <div className="flex items-center gap-3">
                <p className="font-bold text-sm text-[#1a1a1a]">
                  {Number(o.target_value).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
                </p>
                {isAdmin && (
                  <button onClick={() => onDelete(o.id)} className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
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
            <div className="w-2 h-2 rounded-full bg-[#8b5cf6]" />
            <h3 className="font-bold text-sm text-[#1a1a1a]">Objectifs annuels</h3>
          </div>
          {isAdmin && <Button size="sm" onClick={() => setAddAnnual(true)}>+ Ajouter</Button>}
        </div>
        <ClinicObjectivesList
          objectives={annualObjs}
          isAdmin={isAdmin}
          onDelete={handleDelete}
          emptyText="Aucun objectif annuel défini."
        />
        <AddClinicObjectiveModal
          isOpen={addAnnual}
          onClose={() => setAddAnnual(false)}
          defaultType="clinic_revenue_annual"
          onCreated={refetch}
        />
      </Card>
    </div>
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
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e5e7eb]">
                    <th className="text-left py-2 px-2 text-xs font-semibold text-[#6b7280] uppercase">Membre</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-[#6b7280] uppercase">Date</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-[#6b7280] uppercase">Type</th>
                    <th className="text-right py-2 px-2 text-xs font-semibold text-[#6b7280] uppercase">Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => (
                    <tr key={e.id} className="border-b border-[#f5f5f7] hover:bg-gray-50">
                      <td className="py-2.5 px-2 text-sm font-semibold text-[#1a1a1a]">{e.profiles?.full_name || '—'}</td>
                      <td className="py-2.5 px-2 text-sm text-[#6b7280]">{format(parseISO(e.entry_date), 'd MMM yyyy', { locale: fr })}</td>
                      <td className="py-2.5 px-2 text-sm text-[#6b7280]">{KPI_TYPE_LABELS[e.kpi_type] || e.kpi_type}</td>
                      <td className="py-2.5 px-2 text-right font-bold text-[#1a1a1a]">{Number(e.value).toLocaleString('fr-CA')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
