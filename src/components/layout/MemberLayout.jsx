import { useAuth } from '../../context/AuthContext'

const NEO_LOGO = 'https://assets.cdn.filesafe.space/YG2spvWJqnD75L3V95UJ/media/6941c9327109a899ec69b43c.png'

export default function MemberLayout({ children }) {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Header simplifié */}
      <header className="bg-white border-b border-[#e5e7eb] px-6 py-3 flex items-center justify-between sticky top-0 z-40">
        <img src={NEO_LOGO} alt="NEO Performance" className="h-9 object-contain" />
        <div className="flex items-center gap-4">
          {profile && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#00bbb1]/10 flex items-center justify-center text-[#00bbb1] font-bold text-sm">
                {profile.full_name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-[#1a1a1a]">{profile.full_name}</span>
            </div>
          )}
          <button
            onClick={signOut}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-[#6b7280] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            Déconnexion
          </button>
        </div>
      </header>

      <main className="p-6 max-w-4xl mx-auto">
        {children}
      </main>
    </div>
  )
}
