import { Link } from 'react-router-dom'
import Layout from '../../../components/layout/Layout'
import Header from '../../../components/layout/Header'
import Card from '../../../components/shared/Card'

// Étape 1, la vidéo : le dépôt (upload Drive, Google Picker) arrive en phase 2.
export default function MontageNouvelle() {
  return (
    <Layout>
      <Link to="/reseaux-sociaux/montage" className="inline-flex items-center gap-1 text-sm font-semibold text-[#6b7280] hover:text-[#1a1a1a] mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Retour aux montages
      </Link>
      <Header title="Nouvelle vidéo" />
      <Card className="p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#00bbb1]">Étape 1</p>
        <h2 className="text-lg font-bold text-[#1a1a1a] mt-1">La vidéo</h2>
        <div className="mt-6 rounded-xl border-2 border-dashed border-[#e5e7eb] py-16 text-center">
          <p className="text-base font-semibold text-[#1a1a1a]">Le dépôt de la vidéo arrive bientôt.</p>
          <p className="text-sm text-[#6b7280] mt-1">Tu pourras glisser une vidéo ici ou la choisir dans Google Drive.</p>
        </div>
      </Card>
    </Layout>
  )
}
