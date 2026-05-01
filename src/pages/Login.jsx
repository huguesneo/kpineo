import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NEO_LOGO = 'https://assets.cdn.filesafe.space/YG2spvWJqnD75L3V95UJ/media/6941c9327109a899ec69b43c.png'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await signIn(email, password)
    setLoading(false)
    if (err) {
      setError('Email ou mot de passe incorrect.')
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-[#e5e7eb] w-full max-w-md p-10">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img src={NEO_LOGO} alt="NEO Performance" className="h-14 object-contain" />
        </div>

        <h1 className="text-2xl font-bold text-center text-[#1a1a1a] mb-1">NEO Admin</h1>
        <p className="text-sm text-center text-[#6b7280] mb-8">Connectez-vous à votre espace admin</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-[#1a1a1a]">Adresse email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="vous@exemple.com"
              className="w-full px-4 py-3 text-sm border border-[#e5e7eb] rounded-xl bg-white placeholder:text-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-[#1a1a1a]">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-4 py-3 text-sm border border-[#e5e7eb] rounded-xl bg-white placeholder:text-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent transition-colors"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-sm text-red-600 font-semibold">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#00bbb1] hover:bg-[#009e95] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Connexion...
              </>
            ) : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
