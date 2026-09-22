import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/layout/Layout'
import SegmentMode from '../../components/v2/SegmentMode'
import SetterJournee from './SetterJournee'
import { useAuth } from '../../context/AuthContext'
import { useSetterFiles } from '../../hooks/v2/useSetterFiles'
import { totalFiles } from '../../lib/v2/setterFiles'

const CLE_MODE = 'neo.espace.mode'

function lireMode() {
  try { return localStorage.getItem(CLE_MODE) } catch { return null }
}
function ecrireMode(m) {
  try { localStorage.setItem(CLE_MODE, m) } catch { /* navigation privée */ }
}

// Modes accessibles selon le rôle principal et les rôles secondaires
export function modesDuProfil(profile) {
  const roles = [profile?.role, ...(profile?.secondary_roles ?? [])]
  const modes = []
  if (roles.includes('setter')) modes.push('sette')
  if (roles.includes('closer')) modes.push('close')
  return modes
}

// « Mon espace » v2 : un seul rôle → la vue directe ; deux rôles → commutateur
// « Je sette / Je close », dernier choix mémorisé (localStorage neo.espace.mode).
export default function MonEspace() {
  const { profile } = useAuth()
  const modes = modesDuProfil(profile)
  const peutSetter = modes.includes('sette')

  const [modeChoisi, setModeChoisi] = useState(() => lireMode())
  const mode = modes.includes(modeChoisi) ? modeChoisi : modes[0] ?? null
  const changerMode = useCallback(m => { setModeChoisi(m); ecrireMode(m) }, [])

  // Files setter chargées ici : elles alimentent l'écran et le compteur du commutateur
  const setterFiles = useSetterFiles({ enabled: peutSetter })
  const [compteurSetter, setCompteurSetter] = useState(null)
  const compteurs = { sette: compteurSetter ?? totalFiles(setterFiles.files) }

  if (!profile) return null

  const segment = modes.length > 1
    ? <SegmentMode mode={mode} onChange={changerMode} compteurs={compteurs} />
    : null

  const ancienneVue = mode === 'close' ? '/closer' : '/setter'

  return (
    <Layout>
      {mode === 'sette' && (
        <SetterJournee profile={profile} droite={segment} setterFiles={setterFiles} onCompteur={setCompteurSetter} />
      )}
      {mode == null && (
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 text-sm text-[#6b7280]">
          Ton profil n'a ni le rôle setter ni le rôle closeur. Cet espace sert aux membres de l'équipe de vente.
        </div>
      )}

      <p className="mt-10 text-center text-xs text-[#9ca3af]">
        <Link to={ancienneVue} className="text-[#9ca3af] hover:text-[#6b7280] underline underline-offset-2">Ancienne vue</Link>
      </p>
    </Layout>
  )
}
