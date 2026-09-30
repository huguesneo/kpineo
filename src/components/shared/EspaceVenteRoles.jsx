import { Link } from 'react-router-dom'

// ─── Rôles de vente en tête de Mon Espace ─────────────────────
// Une personne closer ET setter (rôle principal ou secondaire) voit les deux
// espaces et passe de l'un à l'autre ici.
const ESPACES = [
  { role: 'closer', label: 'Closer', to: '/closer', couleur: '#00bbb1' },
  { role: 'setter', label: 'Setter', to: '/setter', couleur: '#6366f1' },
]

export default function EspaceVenteRoles({ profile, actif }) {
  const roles = [profile?.role, ...(profile?.secondary_roles ?? [])]
  const espaces = ESPACES.filter(e => e.role === actif || roles.includes(e.role))

  return espaces.map(e => e.role === actif ? (
    <span
      key={e.role}
      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ color: e.couleur, backgroundColor: `${e.couleur}1a` }}
    >
      {e.label}
    </span>
  ) : (
    <Link
      key={e.role}
      to={e.to}
      className="text-[10px] font-bold text-[#6b7280] bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded-full transition-colors"
      title={`Voir mon espace ${e.label}`}
    >
      {e.label} →
    </Link>
  ))
}
