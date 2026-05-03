import { useState, useMemo, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import ScheduleManager from '../components/schedule/ScheduleManager'
import { useAuth } from '../context/AuthContext'
import { useMembers } from '../hooks/useMembers'
import { useScheduleAlerts } from '../hooks/useSchedule'

export default function Horaires() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  if (!isAdmin) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto py-8 px-4">
          <h1 className="text-2xl font-bold text-[#1a1a1a] mb-6">Mon Horaire</h1>
          {profile?.id && <ScheduleManager userId={profile.id} isAdmin={false} />}
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <AdminHoraires />
    </Layout>
  )
}

function AdminHoraires() {
  const year = new Date().getFullYear()
  const location = useLocation()
  const { members: allMembers, loading } = useMembers()
  const members = useMemo(() => allMembers.filter(m => m.role !== 'admin'), [allMembers])
  const memberIds = useMemo(() => members.map(m => m.id), [members])
  const { alerts } = useScheduleAlerts(memberIds, year)
  const [expanded, setExpanded] = useState({})
  const scrollRefs = useRef({})

  // Auto-ouvre et scroll vers le membre passé depuis le popup "Voir"
  useEffect(() => {
    const targetId = location.state?.expandMemberId
    if (!targetId || loading) return
    setExpanded(prev => ({ ...prev, [targetId]: true }))
    setTimeout(() => {
      scrollRefs.current[targetId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 150)
  }, [location.state?.expandMemberId, loading])

  // Auto-ouvre les membres ayant des changements ou OT en attente
  useEffect(() => {
    if (loading || Object.keys(alerts).length === 0) return
    const toExpand = {}
    for (const [uid, a] of Object.entries(alerts)) {
      if ((a.pendingChanges ?? 0) > 0 || (a.pendingOT ?? 0) > 0) toExpand[uid] = true
    }
    if (Object.keys(toExpand).length > 0) {
      setExpanded(prev => ({ ...prev, ...toExpand }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(alerts).join(','), loading])

  function toggle(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-[#1a1a1a] mb-6">Horaires</h1>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-white rounded-2xl border border-[#e5e7eb] animate-pulse" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <p className="text-sm text-[#6b7280]">Aucun membre actif.</p>
      ) : (
        <div className="space-y-3">
          {members.map(m => {
            const alert = alerts[m.id]
            const pendingOT = alert?.pendingOT ?? 0
            const pendingChanges = alert?.pendingChanges ?? 0
            const badge = pendingOT + pendingChanges + (alert?.hasExcess ? 1 : 0)
            const hasPendingAction = pendingOT > 0 || pendingChanges > 0
            const open = expanded[m.id] ?? false

            return (
              <div key={m.id} ref={el => { scrollRefs.current[m.id] = el }}
                className={`bg-white rounded-2xl border overflow-hidden shadow-sm transition-colors ${
                  hasPendingAction ? 'border-amber-300' : 'border-[#e5e7eb]'
                }`}>
                <button
                  onClick={() => toggle(m.id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      hasPendingAction ? 'bg-amber-50 text-amber-600' : 'bg-[#00bbb1]/10 text-[#00bbb1]'
                    }`}>
                      {m.full_name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-[#1a1a1a] text-sm">{m.full_name}</p>
                      <p className="text-xs text-[#9ca3af] capitalize">{m.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {pendingChanges > 0 && (
                      <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        ⏳ {pendingChanges}
                      </span>
                    )}
                    {pendingOT > 0 && (
                      <span className="bg-[#00bbb1] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        +{pendingOT} h
                      </span>
                    )}
                    {alert?.hasExcess && (
                      <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">⚠️</span>
                    )}
                    <svg
                      className={`w-4 h-4 text-[#9ca3af] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {open && (
                  <div className="px-5 pb-5 pt-1 border-t border-[#f3f4f6]">
                    <ScheduleManager userId={m.id} isAdmin={true} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
