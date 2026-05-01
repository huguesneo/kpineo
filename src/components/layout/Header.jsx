import { useAuth } from '../../context/AuthContext'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function Header({ title }) {
  const { profile } = useAuth()
  const today = format(new Date(), "EEEE d MMMM yyyy", { locale: fr })
  const todayCapitalized = today.charAt(0).toUpperCase() + today.slice(1)

  return (
    <header className="flex items-center justify-between mb-6">
      <div>
        {profile && (
          <p className="text-[#6b7280] text-sm mb-1">
            Bonjour, <span className="font-semibold text-[#1a1a1a]">{profile.full_name.split(' ')[0]}</span>
          </p>
        )}
        <h1 className="text-2xl font-bold text-[#1a1a1a]">{title}</h1>
        <p className="text-sm text-[#6b7280] mt-0.5">{todayCapitalized}</p>
      </div>
    </header>
  )
}
