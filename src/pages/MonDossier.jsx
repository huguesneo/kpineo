import { useState } from 'react'
import Layout from '../components/layout/Layout'
import Card from '../components/shared/Card'
import Badge from '../components/shared/Badge'
import Button from '../components/shared/Button'
import KPIModal from '../components/kpis/KPIModal'
import { SkeletonCard } from '../components/shared/Skeleton'
import { useAuth } from '../context/AuthContext'
import { useKPIEntries, useEODReports, KPI_TYPE_LABELS } from '../hooks/useKPIs'
import { SetterEODHistoryItem } from '../components/eod/SetterEODForm'
import { useCareerPlan } from '../hooks/useCareerPlan'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

const TABS = ['Mes KPIs', 'Plan de carrière']

const ROLE_LABELS = {
  naturopathe:    'Naturopathe',
  closer:         'Closer',
  setter:         'Setter',
  service_client: 'Service clients & gestion',
  resp_vente:     'Resp. équipe de vente',
}

// ─── EOD Item ────────────────────────────────────────────────────────────────

function GenericEODItem({ report }) {
  const [expanded, setExpanded] = useState(false)
  const dataKeys = Object.keys(report.data || {})

  return (
    <div className="border border-[#e5e7eb] rounded-lg overflow-hidden">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left">
        <div>
          <p className="text-sm font-semibold text-[#1a1a1a]">Rapport du {format(parseISO(report.report_date), 'd MMMM yyyy', { locale: fr })}</p>
          <p className="text-xs text-[#6b7280]">Soumis à {format(new Date(report.submitted_at), 'HH:mm')}</p>
        </div>
        <svg className={`w-4 h-4 text-[#6b7280] transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="px-4 py-3 bg-gray-50 border-t border-[#e5e7eb]">
          {dataKeys.length === 0 ? <p className="text-sm text-[#6b7280]">Aucune donnée.</p> : (
            <div className="flex flex-wrap gap-4">
              {dataKeys.map(k => (
                <div key={k} className="text-sm">
                  <span className="text-[#6b7280] font-semibold">{k} : </span>
                  <span className="font-bold text-[#1a1a1a]">{String(report.data[k])}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EODItem({ report }) {
  if (report.role === 'setter') return <SetterEODHistoryItem report={report} />
  return <GenericEODItem report={report} />
}

// ─── KPIs Tab ─────────────────────────────────────────────────────────────────

function KPIsTab({ userId, userRole }) {
  const [kpiModalOpen, setKpiModalOpen] = useState(false)
  const { entries, loading: kpiLoading, refetch: refetchKPIs } = useKPIEntries({ userId })
  const { reports, loading: eodLoading } = useEODReports({ userId })

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-[#1a1a1a]">Mes entrées KPI</h3>
          <Button size="sm" onClick={() => setKpiModalOpen(true)}>+ Ajouter</Button>
        </div>
        <KPIModal
          isOpen={kpiModalOpen}
          onClose={() => setKpiModalOpen(false)}
          userId={userId}
          userRole={userRole}
          onCreated={refetchKPIs}
        />
        {kpiLoading ? <SkeletonCard /> : entries.length === 0 ? (
          <Card className="p-5"><p className="text-sm text-[#6b7280]">Aucune entrée KPI.</p></Card>
        ) : (
          <div className="space-y-2">
            {entries.map(entry => (
              <div key={entry.id} className="flex items-center justify-between px-4 py-3 bg-white rounded-lg border border-[#e5e7eb]">
                <div>
                  <p className="text-sm font-semibold text-[#1a1a1a]">{KPI_TYPE_LABELS[entry.kpi_type] || entry.kpi_type}</p>
                  <p className="text-xs text-[#6b7280]">{format(parseISO(entry.entry_date), 'd MMM yyyy', { locale: fr })}</p>
                  {entry.notes && <p className="text-xs text-[#6b7280]">{entry.notes}</p>}
                </div>
                <p className="text-lg font-bold text-[#1a1a1a]">{Number(entry.value).toLocaleString('fr-CA')}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-bold text-[#1a1a1a] mb-3">Mes rapports End of Day</h3>
        {eodLoading ? <SkeletonCard /> : reports.length === 0 ? (
          <Card className="p-5"><p className="text-sm text-[#6b7280]">Aucun rapport soumis.</p></Card>
        ) : (
          <div className="space-y-2">
            {reports.map(r => <EODItem key={r.id} report={r} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Plan de carrière (lecture seule) ────────────────────────────────────────

function CareerPlanTab({ profile }) {
  const { plans, loading } = useCareerPlan(profile.id)
  const currentYear = new Date().getFullYear()

  const baseSalary  = profile.base_salary  ?? null
  const annualBonus = profile.annual_bonus  ?? null

  function fmtCAD(val) {
    return Number(val).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
  }

  return (
    <div className="space-y-5">

      {/* Boni annuel cible */}
      <Card className="p-5">
        <div className="flex items-start gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            <span className="text-lg">🏆</span>
          </div>
          <div>
            <h3 className="font-bold text-sm text-[#1a1a1a]">Boni annuel cible</h3>
            <p className="text-xs text-[#9ca3af]">Divisé en 4 trimestres · paiement proportionnel à l'atteinte (min 80 %)</p>
          </div>
        </div>
        {annualBonus ? (
          <>
            <p className="text-3xl font-black text-[#1a1a1a] mt-3">{fmtCAD(annualBonus)}</p>
            <p className="text-xs text-[#6b7280] mt-1">
              Par trimestre (à 100 %) : {fmtCAD(Number(annualBonus) / 4)}
              {' · '}Ex. à 112 % : {fmtCAD(Math.round(Number(annualBonus) / 4 * 1.12))}
            </p>
          </>
        ) : (
          <p className="text-sm text-[#9ca3af] mt-2">Non défini pour le moment.</p>
        )}
      </Card>

      {/* Salaire de base */}
      <Card className="p-5">
        <div className="flex items-start gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-[#00bbb1]/10 flex items-center justify-center flex-shrink-0">
            <span className="text-lg">💼</span>
          </div>
          <div>
            <h3 className="font-bold text-sm text-[#1a1a1a]">Salaire de base annuel</h3>
            <p className="text-xs text-[#9ca3af]">Rémunération fixe annuelle</p>
          </div>
        </div>
        {baseSalary ? (
          <p className="text-3xl font-black text-[#1a1a1a] mt-3">{fmtCAD(baseSalary)}</p>
        ) : (
          <p className="text-sm text-[#9ca3af] mt-2">Non défini pour le moment.</p>
        )}
      </Card>

      {/* Plan de carrière par année */}
      <Card className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
            <span className="text-lg">🚀</span>
          </div>
          <div>
            <h3 className="font-bold text-sm text-[#1a1a1a]">Progression salariale</h3>
            <p className="text-xs text-[#9ca3af]">Progression salariale prévue année par année</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <p className="text-sm text-[#9ca3af] py-2">Aucun plan défini pour le moment.</p>
        ) : (
          <div className="space-y-2">
            {plans.map(plan => (
              <div
                key={plan.id}
                className={`px-4 py-3 rounded-xl border transition-all ${
                  plan.year === currentYear
                    ? 'border-[#00bbb1]/40 bg-[#00bbb1]/5'
                    : plan.year < currentYear
                    ? 'border-[#e5e7eb] bg-gray-50 opacity-70'
                    : 'border-[#e5e7eb] bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm text-[#1a1a1a]">{plan.year}</p>
                      {plan.year === currentYear && (
                        <span className="text-[10px] font-semibold text-[#00bbb1] bg-[#00bbb1]/10 px-2 py-0.5 rounded-full">
                          Année en cours
                        </span>
                      )}
                      {plan.year > currentYear && (
                        <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                          À venir
                        </span>
                      )}
                    </div>
                    {plan.notes && (
                      <div className="mt-1.5 flex items-start gap-1.5">
                        <svg className="w-3 h-3 text-[#00bbb1] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                        <p className="text-xs text-[#6b7280] leading-relaxed">{plan.notes}</p>
                      </div>
                    )}
                  </div>
                  <p className="font-black text-[#1a1a1a] text-sm flex-shrink-0">
                    {fmtCAD(plan.planned_salary)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function MonDossier() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState(0)

  if (!profile) return null

  return (
    <Layout>
      {/* En-tête profil */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-2xl bg-[#00bbb1]/10 flex items-center justify-center text-[#00bbb1] font-bold text-xl">
          {profile.full_name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">{profile.full_name}</h1>
          <Badge variant={profile.role}>{ROLE_LABELS[profile.role] || profile.role}</Badge>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-[#e5e7eb] mb-6">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              activeTab === i
                ? 'border-[#00bbb1] text-[#00bbb1]'
                : 'border-transparent text-[#6b7280] hover:text-[#1a1a1a]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 0 && <KPIsTab userId={profile.id} userRole={profile.role} />}
      {activeTab === 1 && <CareerPlanTab profile={profile} />}
    </Layout>
  )
}
