import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import LayoutV2 from '../../components/v2/LayoutV2'
import SegmentMode from '../../components/v2/SegmentMode'
import SetterJournee from './SetterJournee'
import CloseurAgenda from './CloseurAgenda'
import AppointmentStatusPopup from '../../components/closer/AppointmentStatusPopup'
import { useAuth } from '../../context/AuthContext'
import { useSetterFiles } from '../../hooks/v2/useSetterFiles'
import { useCloserAgenda } from '../../hooks/v2/useCloserAgenda'
import { totalFiles } from '../../lib/v2/setterFiles'

const CLE_MODE = 'neo.espace.mode'

function lireMode() {
  try { return localStorage.getItem(CLE_MODE) } catch { return null }
}
function ecrireMode(m) {
  try { localStorage.setItem(CLE_MODE, m) } catch { /* navigation privée */ }
}

// Modes accessibles selon le rôle principal et les rôles secondaires.
// Admin et resp_vente supervisent l'équipe : ils ont les deux modes.
export function modesDuProfil(profile) {
  const roles = [profile?.role, ...(profile?.secondary_roles ?? [])]
  const superviseur = roles.includes('admin') || roles.includes('resp_vente')
  const modes = []
  if (superviseur || roles.includes('setter')) modes.push('sette')
  if (superviseur || roles.includes('closer')) modes.push('close')
  return modes
}

// « Mon espace » v2 : un seul rôle → la vue directe ; deux rôles → commutateur
// « Je sette / Je close », dernier choix mémorisé (localStorage neo.espace.mode).
export default function MonEspace() {
  const { profile } = useAuth()
  const modes = modesDuProfil(profile)
  const peutSetter = modes.includes('sette')
  const peutCloser = modes.includes('close')

  const [modeChoisi, setModeChoisi] = useState(() => lireMode())
  const mode = modes.includes(modeChoisi) ? modeChoisi : modes[0] ?? null
  const changerMode = useCallback(m => { setModeChoisi(m); ecrireMode(m) }, [])

  // Files setter chargées ici : elles alimentent l'écran et le compteur du commutateur
  const setterFiles = useSetterFiles({ enabled: peutSetter })
  const [compteurSetter, setCompteurSetter] = useState(null)
  // Agenda closeur chargé ici aussi : compteur « à statuer » du commutateur
  const agenda = useCloserAgenda(profile, { enabled: peutCloser })
  const compteurs = {
    // En mode setter, l'écran tient compte des actions en cours (Pas de réponse, Booké)
    sette: (mode === 'sette' ? compteurSetter : null) ?? totalFiles(setterFiles.files),
    close: agenda.aStatuerCount,
  }

  if (!profile) return null

  const segment = modes.length > 1
    ? <SegmentMode mode={mode} onChange={changerMode} compteurs={compteurs} />
    : null

  const ancienneVue = mode === 'close' ? '/closer' : '/setter'

  return (
    <LayoutV2>
      {mode === 'sette' && (
        <SetterJournee profile={profile} droite={segment} setterFiles={setterFiles} onCompteur={setCompteurSetter} />
      )}
      {mode === 'close' && (
        <CloseurAgenda profile={profile} droite={segment} agenda={agenda} />
      )}
      {/* Pop-up de statut existant : reste monté en mode closeur */}
      {mode === 'close' && profile.id && (
        <AppointmentStatusPopup
          userId={profile.id}
          ghlUserId={profile.ghl_user_id ?? null}
          closerName={profile.full_name ?? null}
        />
      )}
      {mode == null && (
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 text-sm text-[#6b7280]">
          Ton profil n'a ni le rôle setter ni le rôle closeur. Cet espace sert aux membres de l'équipe de vente.
        </div>
      )}

      <p className="mt-10 text-center text-xs text-[#9ca3af] flex items-center justify-center gap-4">
        <Link to="/scoreboard" className="text-[#9ca3af] hover:text-[#6b7280] underline underline-offset-2">Scoreboard d'équipe</Link>
        <Link to={ancienneVue} className="text-[#9ca3af] hover:text-[#6b7280] underline underline-offset-2">Ancienne vue</Link>
      </p>
    </LayoutV2>
  )
}
