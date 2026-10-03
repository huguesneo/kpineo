import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { isAgentEnLigne } from '../../../lib/montageVideo'

export function dateFr(iso) {
  return format(new Date(iso), "d MMM yyyy 'à' HH'h'mm", { locale: fr })
}

export function depuis(iso, maintenant) {
  const s = Math.max(0, Math.round((maintenant - new Date(iso).getTime()) / 1000))
  if (s < 60) return `il y a ${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 48) return `il y a ${h} h`
  return `le ${dateFr(iso)}`
}

// Mac de montage en ligne ou hors ligne (heartbeat de video_agent_status).
export default function PastilleMac({ status, loading, error, maintenant, compacte = false }) {
  if (loading) {
    return <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 text-sm font-semibold text-[#6b7280]">Vérification du Mac...</span>
  }
  const enLigne = !error && isAgentEnLigne(status?.dernier_signal, maintenant)
  const detail = error
    ? 'État du Mac impossible à lire'
    : status?.dernier_signal
      ? `Dernier signal ${depuis(status.dernier_signal, maintenant)}`
      : 'Aucun signal reçu'
  return (
    <span
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
        enLigne ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
      }`}
      title={detail}
      data-en-ligne={enLigne ? 'oui' : 'non'}
    >
      <span className={`w-2.5 h-2.5 rounded-full ${enLigne ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
      {enLigne ? 'Mac en ligne' : 'Mac hors ligne'}
      {!compacte && <span className="font-normal opacity-80">· {detail}</span>}
    </span>
  )
}
