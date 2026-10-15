import { Link } from 'react-router-dom'
import { TIMELINE_ENABLED } from '../../../lib/montageVideoAccess'
import { MESSAGE_TIMELINE_CLIENTE, estCliente, peutOuvrirTimeline } from '../../../lib/montageTimeline'

// « Ouvrir » : la timeline du montage (moi ou l'équipe). Une cliente : pas de bouton, une phrase.
// Rien du tout quand VITE_TIMELINE est éteint.
export default function BoutonTimeline({ job, enabled = TIMELINE_ENABLED, compact = false }) {
  if (!enabled || !job) return null
  if (estCliente(job)) {
    return <p className={`text-xs text-[#6b7280] ${compact ? 'mt-2' : ''} max-w-xs`}>{MESSAGE_TIMELINE_CLIENTE}</p>
  }
  if (!peutOuvrirTimeline(job)) return null
  return (
    <Link
      to={`/reseaux-sociaux/montage/${job.id}/timeline`}
      className={`inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold bg-[#1a1a1a] text-white hover:bg-[#333] transition-colors ${
        compact ? 'mt-2 px-3 py-1.5' : 'px-4 py-2'}`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6h16.5M3.75 12h10.5M3.75 18h16.5" />
      </svg>
      {compact ? 'Ouvrir' : 'Ouvrir la timeline'}
    </Link>
  )
}
