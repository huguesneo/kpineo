import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import { useSettingTaches } from '../../../hooks/v2/useSettingTaches'
import { ESPACE_VENTE_V2 } from '../../../lib/v2/featureFlag'

const ICONES = { rappel_du: '⏰', inactif_2j: '⌛', no_show: '👻', annulation: '🔴' }

// Pop-up dans la plateforme quand une tâche du Setting v2 arrive à échéance et
// que le setter est connecté. Clic = ouvre la fiche du lead (Mon espace).
// Une tâche n'est annoncée qu'une fois (notifie_le).
export default function TachesNotifications() {
  const { profile, hasSetterRole } = useAuth()
  const actif = ESPACE_VENTE_V2 && !!profile?.id && (hasSetterRole || profile?.role === 'admin' || profile?.role === 'resp_vente')
  const { dues, marquerNotifiee } = useSettingTaches(profile?.id, { enabled: actif })
  const [affichees, setAffichees] = useState([])
  const deja = useRef(new Set())
  const navigate = useNavigate()

  useEffect(() => {
    // Seulement les tâches à soi (pas celles d'équipe) et pas déjà annoncées
    const nouvelles = dues.filter(t => !t.notifie_le && t.user_id === profile?.id && !deja.current.has(t.id))
    if (!nouvelles.length) return
    nouvelles.forEach(t => { deja.current.add(t.id); marquerNotifiee(t.id) })
    setAffichees(a => [...a, ...nouvelles].slice(-4))
  }, [dues, profile?.id, marquerNotifiee])

  if (!affichees.length) return null
  const retirer = id => setAffichees(a => a.filter(t => t.id !== id))

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[340px] max-w-[calc(100vw-2rem)]" aria-live="polite">
      {affichees.map(t => (
        <div key={t.id} className="bg-white border border-[#e5e7eb] shadow-xl rounded-xl p-3 flex gap-3 items-start">
          <span className="text-xl" aria-hidden="true">{ICONES[t.type]}</span>
          <button className="flex-1 text-left min-w-0" onClick={() => { retirer(t.id); navigate(`/mon-espace-v2?fiche=${encodeURIComponent(t.contact_id)}`) }}>
            <p className="text-sm font-bold text-[#1a1a1a]">{t.titre}</p>
            {t.detail && <p className="text-xs text-[#6b7280] truncate">{t.detail}</p>}
            <p className="text-xs font-semibold text-[#00bbb1] mt-1">Ouvrir la fiche →</p>
          </button>
          <button onClick={() => retirer(t.id)} aria-label="Fermer" className="text-[#9ca3af] hover:text-[#1a1a1a] text-lg leading-none">×</button>
        </div>
      ))}
    </div>
  )
}
