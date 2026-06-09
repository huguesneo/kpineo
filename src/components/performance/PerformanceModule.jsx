import { useState } from 'react'
import { usePerformanceData } from '../../hooks/usePerformanceData'
import Button from '../shared/Button'
import { SkeletonCard } from '../shared/Skeleton'
import MonthlyTab from './tabs/MonthlyTab'
import AnnualTab from './tabs/AnnualTab'
import REERTab from './tabs/REERTab'
import ScenarioTab from './tabs/ScenarioTab'
import ParamsModal from './components/ParamsModal'

const TABS = [
  { key: 'monthly', label: 'Mensuel' },
  { key: 'annual', label: 'Annuel' },
  { key: 'reer', label: 'REER' },
  { key: 'scenario', label: 'Scénario' },
]

export default function PerformanceModule() {
  const data = usePerformanceData()
  const [tab, setTab] = useState('monthly')
  const [paramsOpen, setParamsOpen] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-[#0a1628]">Performance &amp; REER</h1>
          <p className="text-sm text-[#6b7280]">Profits NEO, REER conditionnels et projections.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setParamsOpen(true)}>
          Modifier les paramètres fixes
        </Button>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 mb-6 border-b border-[#e5e7eb]">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-[#00bbb1] text-[#00bbb1]'
                : 'border-transparent text-[#6b7280] hover:text-[#1a1a1a]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {data.loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : data.error ? (
        <div className="rounded-xl bg-red-50 text-red-700 p-4 text-sm font-semibold">
          Erreur de chargement : {data.error}
        </div>
      ) : (
        <>
          {tab === 'monthly' && <MonthlyTab data={data} />}
          {tab === 'annual' && <AnnualTab data={data} />}
          {tab === 'reer' && <REERTab data={data} />}
          {tab === 'scenario' && <ScenarioTab data={data} />}
        </>
      )}

      <ParamsModal
        isOpen={paramsOpen}
        onClose={() => setParamsOpen(false)}
        params={data.params}
        onSave={data.saveParams}
      />
    </div>
  )
}
