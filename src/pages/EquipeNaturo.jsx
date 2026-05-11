import Layout from '../components/layout/Layout'
import Header from '../components/layout/Header'
import Card from '../components/shared/Card'

export default function EquipeNaturo() {
  return (
    <Layout>
      <Header title="Naturopathes" />
      <Card className="p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#10b981]/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-[#10b981]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h2 className="text-base font-bold text-[#1a1a1a] mb-2">Section en développement</h2>
        <p className="text-sm text-[#6b7280] max-w-sm mx-auto">
          Le suivi des performances de l'équipe naturopathe sera configuré prochainement.
        </p>
      </Card>
    </Layout>
  )
}
