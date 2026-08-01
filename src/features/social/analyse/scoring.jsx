// Affichage du score composite et des index de performance.
// Extrait de ReseauxSociaux.jsx pour être partagé entre le tableau des
// publications et le panneau de détail. La logique de calcul, elle, reste dans
// l'edge function social-compute-scores — ici on ne fait que rendre.

export const VERDICT_META = {
  surperforme:   { label: 'Surperforme',   color: '#10b981', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  normal:        { label: 'Normal',        color: '#6b7280', text: 'text-[#6b7280]',   bg: 'bg-gray-100' },
  sous_performe: { label: 'Sous-performe', color: '#ef4444', text: 'text-red-600',     bg: 'bg-red-50' },
  // « Insuffisant » n'est pas un échec : pas assez d'historique pour conclure.
  insuffisant:   { label: 'Insuffisant',   color: '#9ca3af', text: 'text-[#9ca3af]',   bg: 'bg-transparent' },
}

// Ordre = poids du score composite (partages 0,30 · sauvegardes 0,20 ·
// portée 0,20 · abonnements 0,20 · rétention 0,10)
export const PI_KEYS = [
  { key: 'pi_share',  label: 'Partages' },
  { key: 'pi_save',   label: 'Sauvegardes' },
  { key: 'pi_reach',  label: 'Portée' },
  { key: 'pi_follow', label: 'Abonnements' },
  { key: 'pi_watch',  label: 'Rétention' },
]

export const RATIO_KEYS = [
  { key: 'er_reach',      label: 'Engagement / portée' },
  { key: 'save_rate',     label: 'Taux de sauvegarde' },
  { key: 'share_rate',    label: 'Taux de partage' },
  { key: 'follow_rate',   label: 'Taux d\'abonnement' },
  { key: 'profile_ctr',   label: 'Clics vers le profil' },
  { key: 'watch_through', label: 'Rétention vidéo' },
]

export const num = v => (v == null || v === '' ? null : Number(v))

export function ScoreCell({ score }) {
  if (!score) return <span className="text-xs text-[#9ca3af]">en attente de relevé</span>

  const value = num(score.score)
  const verdict = score.verdict ?? 'insuffisant'
  const meta = VERDICT_META[verdict] ?? VERDICT_META.insuffisant

  if (verdict === 'insuffisant' || value == null) {
    return (
      <span
        className="text-xs text-[#9ca3af]"
        title={`Baseline de ${score.baseline_n ?? 0} publications — il en faut 8 pour conclure.`}
      >
        insuffisant
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black ${meta.bg} ${meta.text}`}
        title={meta.label}
      >
        {Math.round(value)}
      </span>
      {score.window_tag === 'd28' && (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#eef2ff] text-[#4f46e5]"
          title="Aucun relevé à J+7 pour cette publication — score mesuré sur la fenêtre J+28."
        >
          J+28
        </span>
      )}
    </span>
  )
}

// PI : 1,00 = performance typique. NULL = non mesuré (≠ zéro) → barre barrée.
function PiBar({ value, label }) {
  const v = num(value)
  if (v == null) {
    return (
      <span className="relative block w-9 h-2 rounded-full bg-[#f0f0f2]" title={`${label} : non mesuré`}>
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[#c7c7cc]" />
      </span>
    )
  }
  const color = v >= 1.2 ? '#10b981' : v <= 0.8 ? '#ef4444' : '#9ca3af'
  return (
    <span className="block w-9 h-2 rounded-full bg-[#f0f0f2] overflow-hidden" title={`${label} : ${v.toFixed(2)}×`}>
      <span
        className="block h-full rounded-full"
        style={{ width: `${Math.max(4, Math.min(100, (v / 2) * 100))}%`, backgroundColor: color }}
      />
    </span>
  )
}

export function PiBars({ score }) {
  if (!score) return <span className="text-[#d1d5db] text-xs">—</span>
  return (
    <span className="inline-flex items-center gap-1">
      {PI_KEYS.map(k => <PiBar key={k.key} value={score[k.key]} label={k.label} />)}
    </span>
  )
}
