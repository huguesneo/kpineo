import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { usePendingTasksCount, usePendingApprovalCount } from '../../hooks/useTasks'
import { useTotalHoraireAlertCount } from '../../hooks/useSchedule'
import { usePendingRedemptionsCount } from '../../hooks/useRewards'
import { useUnassignedSales } from '../../hooks/useCloserData'
import { useCloserEODMissedBadge } from '../../hooks/useCloserEOD'
import { useNaturoPerfAccess } from '../../hooks/useNaturoPerformance'

const NEO_LOGO = 'https://assets.cdn.filesafe.space/YG2spvWJqnD75L3V95UJ/media/6941c9327109a899ec69b43c.png'

function NavGroup({ icon, label, badge, children, matchPaths = [] }) {
  const location = useLocation()
  const isAnyChildActive = matchPaths.some(p => location.pathname === p || location.pathname.startsWith(p + '/'))
  const [open, setOpen] = useState(isAnyChildActive)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors w-full text-left ${
          isAnyChildActive
            ? 'bg-[#00bbb1]/10 text-[#00bbb1]'
            : 'text-[#6b7280] hover:bg-gray-100 hover:text-[#1a1a1a]'
        }`}
      >
        <span className="w-5 h-5 flex-shrink-0">{icon}</span>
        <span className="flex-1">{label}</span>
        {badge != null && badge > 0 && (
          <span className="bg-[#00bbb1] text-white text-xs font-semibold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
            {badge}
          </span>
        )}
        <svg className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-[#e5e7eb] pl-3">
          {children}
        </div>
      )}
    </div>
  )
}

function NavItem({ to, icon, label, badge }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
          isActive
            ? 'bg-[#00bbb1]/10 text-[#00bbb1]'
            : 'text-[#6b7280] hover:bg-gray-100 hover:text-[#1a1a1a]'
        }`
      }
    >
      <span className="w-5 h-5 flex-shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="bg-[#00bbb1] text-white text-xs font-semibold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
          {badge}
        </span>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const { signOut, user, profile, isAdmin, isRespVente, hasCloserRole, hasSetterRole } = useAuth()
  const isHugues = user?.email === 'hugues@neoperformance.ca'
  const naturoPerfAccess = useNaturoPerfAccess()
  const isAdminOrRespVente = isAdmin || isRespVente
  const isPrimaryCloserOrSetter = profile?.role === 'closer' || profile?.role === 'setter'
  const monEspaceTo = profile?.role === 'closer' ? '/closer' : profile?.role === 'setter' ? '/setter' : '/mon-dossier'
  const { count } = usePendingTasksCount(isAdminOrRespVente ? null : profile?.id)
  const { count: approvalCount } = usePendingApprovalCount()
  const horaireAlertCount = useTotalHoraireAlertCount()
  const { count: boutiqueCount } = usePendingRedemptionsCount(isAdmin ? null : profile?.id)
  const baseTachesBadge = isAdminOrRespVente ? (approvalCount > 0 ? approvalCount : count) : count
  const eodMissed = useCloserEODMissedBadge(
    !isAdminOrRespVente && hasCloserRole ? profile?.id : null,
    !isAdminOrRespVente && hasCloserRole ? profile?.ghl_user_id : null,
    !isAdminOrRespVente && hasCloserRole ? profile?.full_name : null,
  )
  const tachesBadge = baseTachesBadge + eodMissed

  // Badge "Équipe de vente" : ventes sans closer pour le mois courant (admin only)
  const _now = new Date()
  const _start = isAdminOrRespVente ? `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-01` : null
  const _end   = isAdminOrRespVente ? `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(new Date(_now.getFullYear(), _now.getMonth() + 1, 0).getDate()).padStart(2, '0')}` : null
  const { sales: unassignedSales } = useUnassignedSales(_start, _end)
  const equipeVenteBadge = isAdminOrRespVente ? unassignedSales.length : 0

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-white border-r border-[#e5e7eb] flex flex-col z-40">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-[#e5e7eb]">
        <img src={NEO_LOGO} alt="NEO Performance" className="h-10 object-contain" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <NavItem
          to="/dashboard"
          label="Dashboard"
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          }
        />
        {isAdminOrRespVente && (
          <NavItem
            to="/membres"
            label="Membres"
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            }
          />
        )}
        <NavItem
          to="/taches"
          label="Tâches"
          badge={tachesBadge}
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        {isAdminOrRespVente && (
          <NavGroup
            label="Équipe de vente"
            badge={equipeVenteBadge}
            matchPaths={['/closer-admin', '/setter-admin']}
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
            }
          >
            <NavItem
              to="/closer-admin"
              label="Dashboard Closer"
              icon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <NavItem
              to="/setter-admin"
              label="Dashboard Setter"
              icon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              }
            />
          </NavGroup>
        )}
        {isAdmin && (
          <NavItem
            to="/naturopathe"
            label="Naturopathe"
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
          />
        )}
        {isAdminOrRespVente && (
          <NavItem
            to="/meta-ads"
            label="Ads"
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.25V18a2.25 2.25 0 002.25 2.25h13.5A2.25 2.25 0 0021 18V8.25m-18 0V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6v2.25m-18 0h18M5.25 6h.008v.008H5.25V6zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM7.5 6h.008v.008H7.5V6zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm1.875 0h.008v.008H9.75V6zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            }
          />
        )}
        {isAdminOrRespVente && (
          <NavItem
            to="/kpis"
            label="KPIs"
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            }
          />
        )}
        {isHugues && (
          <NavItem
            to="/performance"
            label="Performance & REER"
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
              </svg>
            }
          />
        )}
        {!isPrimaryCloserOrSetter && (
          <NavItem
            to="/horaires"
            label="Horaires"
            badge={isAdminOrRespVente ? horaireAlertCount : null}
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
              </svg>
            }
          />
        )}
        {/* Closer — rôle secondaire seulement */}
        {!isAdmin && (profile?.secondary_roles ?? []).includes('closer') && (
          <NavItem
            to="/closer"
            label="Closer"
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
            }
          />
        )}
        {/* Setter — rôle secondaire seulement */}
        {!isAdmin && (profile?.secondary_roles ?? []).includes('setter') && (
          <NavItem
            to="/setter"
            label="Setter"
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
          />
        )}
        {/* Calendrier — closer (primaire ou secondaire) */}
        {!isAdmin && hasCloserRole && (
          <NavItem
            to="/calendrier"
            label="Calendrier"
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            }
          />
        )}
        {/* Centre de Vente — closer, setter et resp_vente */}
        {!isAdmin && (hasCloserRole || hasSetterRole || isRespVente) && (
          <NavItem
            to="/centre-vente"
            label="Centre de vente"
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
              </svg>
            }
          />
        )}
        {/* Mon Espace — membre (incluant resp_vente) */}
        {!isAdmin && (
          <NavItem
            to={monEspaceTo}
            label="Mon Espace"
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            }
          />
        )}
        {/* Performance & REER — naturo dont l'accès est activé par l'admin */}
        {!isAdmin && naturoPerfAccess && (
          <NavItem
            to="/ma-performance"
            label="Performance & REER"
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
              </svg>
            }
          />
        )}
        {/* Boutique — membre (sauf closer/setter primaire) */}
        {!isAdmin && !isPrimaryCloserOrSetter && (
          <NavItem
            to="/boutique"
            label="Boutique"
            badge={boutiqueCount}
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            }
          />
        )}
        {/* Boutique — admin seulement */}
        {isAdmin && (
          <>
            <NavItem
              to="/boutique-catalogue"
              label="Catalogue"
              icon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              }
            />
            <NavItem
              to="/boutique-echanges"
              label="Échanges"
              badge={boutiqueCount}
              icon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                </svg>
              }
            />
          </>
        )}
        <NavItem
          to="/parametres"
          label="Paramètres"
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
      </nav>

      {/* Déconnexion */}
      <div className="px-3 py-4 border-t border-[#e5e7eb]">
        <button
          onClick={signOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-[#6b7280] hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
          Déconnexion
        </button>
      </div>
    </aside>
  )
}
