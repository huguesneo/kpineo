import Layout from '../components/layout/Layout'
import NaturoSelfView from '../components/performance/NaturoSelfView'
import { useNaturoPerformance } from '../hooks/useNaturoPerformance'

export default function MaPerformance() {
  const { rows, loading, naturoKey, submitContribution, getProofUrl } = useNaturoPerformance()
  return (
    <Layout>
      <NaturoSelfView
        rows={rows}
        loading={loading}
        naturoKey={naturoKey}
        submitContribution={submitContribution}
        getProofUrl={getProofUrl}
      />
    </Layout>
  )
}
