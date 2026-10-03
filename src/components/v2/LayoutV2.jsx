import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from '../layout/Sidebar'
import OTNotifications from '../notifications/OTNotifications'
import { useAuth } from '../../context/AuthContext'

const NEO_LOGO = 'https://assets.cdn.filesafe.space/YG2spvWJqnD75L3V95UJ/media/6941c9327109a899ec69b43c.png'

// Gabarit des écrans v2. Grand écran : identique à Layout (menu latéral fixe).
// Téléphone et tablette (< 1024 px) : barre du haut (logo, initiale, ☰) et menu
// latéral existant en tiroir ; le contenu prend toute la largeur (maquette 01 mobile).
// Layout.jsx n'est pas modifié : le reste de l'app garde son affichage.
export default function LayoutV2({ children }) {
  const { profile } = useAuth()
  const location = useLocation()
  const [menuOuvert, setMenuOuvert] = useState(false)

  // Fermer le tiroir après une navigation
  useEffect(() => { setMenuOuvert(false) }, [location.pathname])

  // Bloquer le défilement derrière le tiroir ouvert
  useEffect(() => {
    if (!menuOuvert) return undefined
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [menuOuvert])

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Grand écran : menu latéral fixe, comme partout dans l'app */}
      <div className="hidden lg:block"><Sidebar /></div>

      {/* Téléphone / tablette : barre du haut */}
      <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-[#e5e7eb] px-4 py-2.5 flex items-center justify-between gap-3">
        <button
          onClick={() => setMenuOuvert(true)}
          aria-label="Ouvrir le menu"
          className="w-11 h-11 -ml-2 flex items-center justify-center rounded-lg text-[#1a1a1a] hover:bg-gray-100"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <img src={NEO_LOGO} alt="NEO Performance" className="h-8 object-contain" />
        <div className="w-9 h-9 rounded-full bg-[#00bbb1]/10 flex items-center justify-center text-[#00bbb1] font-bold text-sm flex-shrink-0">
          {(profile?.full_name ?? '?').charAt(0).toUpperCase()}
        </div>
      </header>

      {/* Tiroir : le menu latéral existant, par-dessus le contenu */}
      {menuOuvert && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOuvert(false)} />
          <Sidebar />
          <button
            onClick={() => setMenuOuvert(false)}
            aria-label="Fermer le menu"
            className="absolute top-3 left-[252px] w-10 h-10 flex items-center justify-center rounded-full bg-white text-[#1a1a1a] shadow"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <main className="lg:ml-60 min-h-screen">
        <div className="px-4 py-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
      <OTNotifications />
    </div>
  )
}
