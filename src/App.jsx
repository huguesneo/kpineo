import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Membres from './pages/Membres'
import MembreDossier from './pages/MembreDossier'
import Taches from './pages/Taches'
import KPIs from './pages/KPIs'
import Parametres from './pages/Parametres'
import Horaires from './pages/Horaires'
import Boutique from './pages/Boutique'
import MesEchanges from './pages/MesEchanges'
import BoutiqueCatalogue from './pages/BoutiqueCatalogue'
import BoutiqueEchanges from './pages/BoutiqueEchanges'
import MonDossier from './pages/MonDossier'
import Setter from './pages/Setter'
import Closer from './pages/Closer'
import CloserAdmin from './pages/CloserAdmin'
import EquipeVente from './pages/EquipeVente'
import EquipeNaturo from './pages/EquipeNaturo'
import SaleCallScript from './pages/SaleCallScript'
import CloserCalendar from './pages/CloserCalendar'

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <svg className="animate-spin h-8 w-8 text-[#00bbb1]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm font-semibold text-[#6b7280]">Chargement...</p>
      </div>
    </div>
  )
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  return user ? children : <Navigate to="/login" replace />
}

function AdminRoute({ children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (profile && profile.role !== 'admin') return <Navigate to="/dashboard" replace />
  return children
}

function SalesManagerRoute({ children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (profile && profile.role !== 'admin' && profile.role !== 'resp_vente') return <Navigate to="/dashboard" replace />
  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  return user ? <Navigate to="/dashboard" replace /> : children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login"           element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/dashboard"       element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/membres"         element={<PrivateRoute><Membres /></PrivateRoute>} />
      <Route path="/membres/:id"     element={<SalesManagerRoute><MembreDossier /></SalesManagerRoute>} />
      <Route path="/taches"          element={<PrivateRoute><Taches /></PrivateRoute>} />
      <Route path="/kpis"            element={<PrivateRoute><KPIs /></PrivateRoute>} />
      <Route path="/horaires"        element={<PrivateRoute><Horaires /></PrivateRoute>} />
      <Route path="/parametres"      element={<PrivateRoute><Parametres /></PrivateRoute>} />

      {/* Boutique — membres */}
      <Route path="/boutique"              element={<PrivateRoute><Boutique /></PrivateRoute>} />
      <Route path="/boutique/mes-echanges" element={<PrivateRoute><MesEchanges /></PrivateRoute>} />

      {/* Boutique — admin */}
      <Route path="/boutique-catalogue" element={<AdminRoute><BoutiqueCatalogue /></AdminRoute>} />
      <Route path="/boutique-echanges"  element={<AdminRoute><BoutiqueEchanges /></AdminRoute>} />

      <Route path="/mon-dossier" element={<PrivateRoute><MonDossier /></PrivateRoute>} />
      <Route path="/setter"     element={<PrivateRoute><Setter /></PrivateRoute>} />
      <Route path="/closer"     element={<PrivateRoute><Closer /></PrivateRoute>} />
      <Route path="/calendrier" element={<PrivateRoute><CloserCalendar /></PrivateRoute>} />
      <Route path="/sale-call-script/:appointmentGhlId" element={<PrivateRoute><SaleCallScript /></PrivateRoute>} />

      {/* Admin + resp_vente — équipe de vente & naturopathe */}
      <Route path="/closer-admin" element={<SalesManagerRoute><CloserAdmin /></SalesManagerRoute>} />
      <Route path="/equipe-vente" element={<SalesManagerRoute><EquipeVente /></SalesManagerRoute>} />
      <Route path="/naturopathe"  element={<AdminRoute><EquipeNaturo /></AdminRoute>} />

      <Route path="*"            element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
