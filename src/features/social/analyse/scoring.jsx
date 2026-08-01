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

// Ordre = poids du score composite, tel que défini dans l'edge function
// social-compute-scores. Le poids et l'explication vivent ici parce qu'ils sont
// affichés à l'écran : un index qu'on ne peut pas expliquer ne sert à rien.
export const PI_KEYS = [
  {
    key: 'pi_share', label: 'Partages', weight: 0.30, ratioKey: 'share_rate',
    help: 'Le signal le plus fort : partager, c\'est mettre sa propre crédibilité en jeu. C\'est aussi ce qui pousse une publication au-delà de tes abonnés.',
  },
  {
    key: 'pi_save', label: 'Sauvegardes', weight: 0.20, ratioKey: 'save_rate',
    help: 'On sauvegarde ce qu\'on compte relire ou appliquer. C\'est le marqueur d\'un contenu utile plutôt que simplement agréable.',
  },
  {
    key: 'pi_reach', label: 'Portée', weight: 0.20, ratioKey: 'er_reach',
    help: 'Les interactions rapportées au nombre de personnes atteintes. Rapporté à la portée et non aux abonnés : sinon une publication vue par 500 personnes et une autre vue par 50 000 ne seraient pas comparables.',
  },
  {
    key: 'pi_follow', label: 'Abonnements', weight: 0.20, ratioKey: 'follow_rate',
    help: 'Combien de personnes se sont abonnées après avoir vu cette publication. C\'est ce qui distingue un contenu qui plaît d\'un contenu qui recrute.',
  },
  {
    key: 'pi_watch', label: 'Rétention', weight: 0.10, ratioKey: 'watch_through',
    help: 'La part de la vidéo réellement regardée. Poids volontairement faible : elle n\'existe que pour les vidéos, et une vidéo courte est mécaniquement avantagée.',
  },
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

export function LateMeasureBadge() {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700"
      title="Relevé pris plus de 30 jours après la publication : la valeur est cumulée depuis, donc plus haute qu'une mesure faite dans la fenêtre. Le score est un ordre de grandeur."
    >
      tardif
    </span>
  )
}

export function ScoreCell({ score, lateMeasure = false }) {
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
      {lateMeasure && <LateMeasureBadge />}
    </span>
  )
}

export function piColor(v) {
  return v >= 1.2 ? '#10b981' : v <= 0.8 ? '#ef4444' : '#9ca3af'
}

// PI : 1,00 = performance typique. NULL = non mesuré (≠ zéro) → barre barrée.
export function PiBar({ value, label, width = 'w-9' }) {
  const v = num(value)
  if (v == null) {
    return (
      <span className={`relative block ${width} h-2 rounded-full bg-[#f0f0f2]`} title={`${label} : non mesuré`}>
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[#c7c7cc]" />
      </span>
    )
  }
  return (
    <span className={`block ${width} h-2 rounded-full bg-[#f0f0f2] overflow-hidden`} title={`${label} : ${v.toFixed(2)}×`}>
      <span
        className="block h-full rounded-full"
        style={{ width: `${Math.max(4, Math.min(100, (v / 2) * 100))}%`, backgroundColor: piColor(v) }}
      />
    </span>
  )
}

/** Les cinq barres compactes. Cliquables : cinq barres muettes n'apprennent
 *  rien à personne, l'explication doit être à un clic. */
export function PiBars({ score, onExplain }) {
  if (!score) return <span className="text-[#d1d5db] text-xs">—</span>
  const bars = (
    <span className="inline-flex items-center gap-1">
      {PI_KEYS.map(k => <PiBar key={k.key} value={score[k.key]} label={k.label} />)}
    </span>
  )
  if (!onExplain) return bars
  return (
    <button
      onClick={e => { e.stopPropagation(); onExplain() }}
      title="Que veulent dire ces barres ?"
      className="inline-flex items-center rounded-md px-1 py-1 hover:bg-[#f3f4f6] transition-colors"
    >
      {bars}
    </button>
  )
}
