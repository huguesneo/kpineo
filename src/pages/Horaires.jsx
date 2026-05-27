import { useState, useMemo, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import ScheduleManager from '../components/schedule/ScheduleManager'
import PayPeriodHistoryModal from '../components/schedule/PayPeriodHistoryModal'
import { useAuth } from '../context/AuthContext'
import { useMembers, updateMember } from '../hooks/useMembers'
import { useScheduleAlerts } from '../hooks/useSchedule'
import { usePayPeriodConfig, getCurrentPayPeriod, updatePayPeriodConfig } from '../hooks/usePayPeriod'
import { useHolidays, createHoliday, deleteHoliday } from '../hooks/useHolidays'
import { format, parseISO, isAfter, isBefore, startOfDay } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function Horaires() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  if (!isAdmin) return (
    <Layout>
      <MemberHoraires profile={profile} />
    </Layout>
  )

  return (
    <Layout>
      <AdminHoraires />
    </Layout>
  )
}

// ── Member view ────────────────────────────────────────────────

function MemberHoraires({ profile }) {
  const { config: payConfig } = usePayPeriodConfig()
  const [showHistory, setShowHistory] = useState(false)

  if (!profile?.id) return null

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#1a1a1a]">Mon Horaire</h1>
        {payConfig && (
          <button
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#1a1a1a] bg-white border border-[#e5e7eb] hover:bg-gray-50 rounded-xl shadow-sm transition-colors"
          >
            <svg className="w-4 h-4 text-[#6b7280]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Historique
          </button>
        )}
      </div>

      <ScheduleManager
        userId={profile.id}
        isAdmin={false}
        weeklyTarget={Number(profile.weekly_target_hours ?? 40)}
        punchMode={profile.punch_mode ?? false}
      />

      {showHistory && payConfig && (
        <PayPeriodHistoryModal
          member={profile}
          payConfig={payConfig}
          onClose={() => setShowHistory(false)}
          isAdmin={false}
        />
      )}
    </div>
  )
}

// ── Admin view ─────────────────────────────────────────────────

function AdminHoraires() {
  const year = new Date().getFullYear()
  const today = startOfDay(new Date())
  const location = useLocation()
  const { profile } = useAuth()
  const { members: allMembers, loading, refetch: refetchMembers } = useMembers()
  const members = useMemo(() => allMembers.filter(m => m.role !== 'admin'), [allMembers])
  const memberIds = useMemo(() => members.map(m => m.id), [members])
  const { alerts } = useScheduleAlerts(memberIds, year)

  const { config: payConfig, loading: payLoading, refetch: refetchPayConfig } = usePayPeriodConfig()
  const [editingPayPeriod, setEditingPayPeriod] = useState(false)
  const [newRefDate, setNewRefDate] = useState('')
  const [payPeriodSaving, setPayPeriodSaving] = useState(false)
  const payPeriod = payConfig ? getCurrentPayPeriod(payConfig.reference_pay_date, payConfig.period_length_days) : null

  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [historyMember, setHistoryMember] = useState(null)

  const [editingTargetId, setEditingTargetId] = useState(null)
  const [targetInput, setTargetInput] = useState('')
  const [targetSaving, setTargetSaving] = useState(false)

  // ── Holidays ──
  const { holidays, refetch: refetchHolidays } = useHolidays(year)
  const [showHolidayPanel, setShowHolidayPanel] = useState(false)
  const [newHolidayDate, setNewHolidayDate] = useState('')
  const [newHolidayName, setNewHolidayName] = useState('')
  const [holidaySaving, setHolidaySaving] = useState(false)
  const [deletingHolidayId, setDeletingHolidayId] = useState(null)

  const upcomingHolidays = useMemo(() =>
    holidays.filter(h => !isBefore(parseISO(h.date), today)).slice(0, 3),
    [holidays, today]
  )

  const selectedMember = members.find(m => m.id === selectedId) ?? null

  useEffect(() => {
    const targetId = location.state?.expandMemberId
    if (targetId) { setSelectedId(targetId); return }
  }, [location.state?.expandMemberId])

  useEffect(() => {
    if (loading || selectedId) return
    const firstPending = members.find(m => {
      const a = alerts[m.id]
      return (a?.pendingChanges ?? 0) > 0 || (a?.pendingOT ?? 0) > 0 || (a?.pendingAdj ?? 0) > 0
    })
    setSelectedId(firstPending?.id ?? members[0]?.id ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, members.length, Object.keys(alerts).join(',')])

  async function handleSavePayPeriod() {
    if (!newRefDate || !payConfig) return
    setPayPeriodSaving(true)
    await updatePayPeriodConfig(payConfig.id, newRefDate, profile?.id)
    await refetchPayConfig()
    setPayPeriodSaving(false)
    setEditingPayPeriod(false)
    setNewRefDate('')
  }

  async function handleSaveTarget(memberId) {
    if (!targetInput) return
    setTargetSaving(true)
    await updateMember(memberId, { weekly_target_hours: Number(targetInput) })
    await refetchMembers()
    setTargetSaving(false)
    setEditingTargetId(null)
  }

  async function handleTogglePunchMode(memberId, currentPunchMode) {
    await updateMember(memberId, { punch_mode: !currentPunchMode })
    await refetchMembers()
  }

  async function handleAddHoliday() {
    if (!newHolidayDate || !newHolidayName.trim()) return
    setHolidaySaving(true)
    await createHoliday({ date: newHolidayDate, name: newHolidayName.trim(), created_by: profile?.id })
    await refetchHolidays()
    setHolidaySaving(false)
    setNewHolidayDate('')
    setNewHolidayName('')
  }

  async function handleDeleteHoliday(id) {
    setDeletingHolidayId(id)
    await deleteHoliday(id)
    await refetchHolidays()
    setDeletingHolidayId(null)
  }

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return members
    const q = search.toLowerCase()
    return members.filter(m =>
      m.full_name?.toLowerCase().includes(q) || m.role?.toLowerCase().includes(q)
    )
  }, [members, search])

  const sortedMembers = useMemo(() => [...filteredMembers].sort((a, b) => {
    const aA = alerts[a.id], bA = alerts[b.id]
    const aP = (aA?.pendingChanges ?? 0) + (aA?.pendingOT ?? 0) + (aA?.pendingAdj ?? 0) + (aA?.pendingOverrides ?? 0)
    const bP = (bA?.pendingChanges ?? 0) + (bA?.pendingOT ?? 0) + (bA?.pendingAdj ?? 0) + (bA?.pendingOverrides ?? 0)
    if (bP !== aP) return bP - aP
    return (a.full_name ?? '').localeCompare(b.full_name ?? '')
  }), [filteredMembers, alerts])

  const totalPending = useMemo(() =>
    Object.values(alerts).reduce((s, a) => s + (a.pendingChanges ?? 0) + (a.pendingOT ?? 0) + (a.pendingAdj ?? 0) + (a.pendingOverrides ?? 0), 0),
    [alerts]
  )

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Horaires</h1>
          {payPeriod && !payLoading && (
            <p className="text-sm text-[#6b7280] mt-1">
              Période actuelle :&nbsp;
              <span className="font-semibold text-[#1a1a1a]">
                {format(parseISO(payPeriod.start), 'd MMM', { locale: fr })}–{format(parseISO(payPeriod.end), 'd MMM yyyy', { locale: fr })}
              </span>
              {totalPending > 0 && (
                <span className="ml-3 inline-flex items-center gap-1 text-amber-700 font-semibold text-xs bg-amber-50 px-2 py-0.5 rounded-full">
                  ⏳ {totalPending} en attente
                </span>
              )}
            </p>
          )}
        </div>

        <div className="flex items-start gap-3 flex-wrap">
          {/* Holiday button */}
          <button
            onClick={() => setShowHolidayPanel(v => !v)}
            className={`flex items-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-xl border shadow-sm transition-colors ${
              showHolidayPanel
                ? 'bg-purple-50 border-purple-200 text-purple-800'
                : upcomingHolidays.length > 0
                  ? 'bg-purple-50 border-purple-200 text-purple-800'
                  : 'bg-white border-[#e5e7eb] text-[#1a1a1a] hover:bg-gray-50'
            }`}
          >
            🎉
            <span>Congés fériés</span>
            {upcomingHolidays.length > 0 && !showHolidayPanel && (
              <span className="text-[10px] font-bold bg-purple-200 text-purple-900 px-1.5 py-0.5 rounded-full">
                {upcomingHolidays.length}
              </span>
            )}
          </button>

          {/* Pay period config */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 shadow-sm min-w-52">
            {!editingPayPeriod ? (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide">Période de paie</p>
                  {payConfig && (
                    <p className="text-sm font-semibold text-[#1a1a1a] mt-0.5">
                      Réf. {format(parseISO(payConfig.reference_pay_date), 'd MMM yyyy', { locale: fr })}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => { setEditingPayPeriod(true); setNewRefDate(payConfig?.reference_pay_date ?? '') }}
                  className="text-sm font-semibold text-[#00bbb1] hover:underline flex-shrink-0"
                >
                  Modifier
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide">Nouvelle date de réf. (jeudi)</p>
                <input type="date" value={newRefDate} onChange={e => setNewRefDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
                <div className="flex gap-2">
                  <button onClick={() => { setEditingPayPeriod(false); setNewRefDate('') }}
                    className="flex-1 px-2 py-1.5 text-xs font-semibold text-[#6b7280] bg-gray-100 hover:bg-gray-200 rounded-lg">
                    Annuler
                  </button>
                  <button onClick={handleSavePayPeriod} disabled={payPeriodSaving || !newRefDate}
                    className="flex-1 px-2 py-1.5 text-xs font-semibold text-white bg-[#00bbb1] hover:bg-[#009e95] rounded-lg disabled:opacity-50">
                    {payPeriodSaving ? '…' : 'OK'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Holiday panel ─────────────────────────────────────── */}
      {showHolidayPanel && (
        <div className="mb-5 bg-white border border-purple-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-purple-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-[#1a1a1a] text-sm">Congés fériés {year}</h3>
              <p className="text-xs text-[#6b7280] mt-0.5">Visibles par tous les membres dans leur horaire</p>
            </div>
          </div>

          <div className="p-5">
            {/* Add form */}
            <div className="flex items-end gap-3 mb-4">
              <div>
                <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Date</label>
                <input type="date" value={newHolidayDate} onChange={e => setNewHolidayDate(e.target.value)}
                  className="px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold text-[#6b7280] mb-1 block">Nom du congé</label>
                <input type="text" value={newHolidayName} onChange={e => setNewHolidayName(e.target.value)}
                  placeholder="Ex: Fête nationale, Noël…"
                  onKeyDown={e => { if (e.key === 'Enter') handleAddHoliday() }}
                  className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
              </div>
              <button
                onClick={handleAddHoliday}
                disabled={holidaySaving || !newHolidayDate || !newHolidayName.trim()}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#00bbb1] hover:bg-[#009e95] rounded-lg disabled:opacity-50 flex-shrink-0"
              >
                {holidaySaving ? '…' : '+ Ajouter'}
              </button>
            </div>

            {/* Holiday list */}
            {holidays.length === 0 ? (
              <p className="text-sm text-[#9ca3af] text-center py-3">Aucun congé férié pour {year}.</p>
            ) : (
              <div className="space-y-1.5">
                {holidays.map(h => {
                  const isPast = isBefore(parseISO(h.date), today)
                  return (
                    <div key={h.id}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${
                        isPast ? 'border-[#f3f4f6] bg-gray-50 opacity-60' : 'border-purple-100 bg-purple-50/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm">{isPast ? '📅' : '🎉'}</span>
                        <div>
                          <p className="text-sm font-semibold text-[#1a1a1a]">{h.name}</p>
                          <p className="text-xs text-[#9ca3af] capitalize">
                            {format(parseISO(h.date), 'EEEE d MMMM yyyy', { locale: fr })}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteHoliday(h.id)}
                        disabled={deletingHolidayId === h.id}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-[#9ca3af] hover:text-red-500 transition-colors disabled:opacity-50"
                      >
                        {deletingHolidayId === h.id ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Two-column layout ──────────────────────────────────── */}
      <div className="flex gap-5 items-start">

        {/* ── Left: member list ─────────────────────────────────── */}
        <div className="w-72 xl:w-80 flex-shrink-0 bg-white rounded-2xl border border-[#e5e7eb] shadow-sm overflow-hidden">
          <div className="p-3 border-b border-[#f3f4f6]">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]" />
            </div>
          </div>

          {loading ? (
            <div className="p-3 space-y-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : sortedMembers.length === 0 ? (
            <p className="text-sm text-[#6b7280] p-4">{search ? 'Aucun résultat.' : 'Aucun membre actif.'}</p>
          ) : (
            <div className="divide-y divide-[#f9fafb]">
              {sortedMembers.map(m => {
                const alert = alerts[m.id]
                const pendingCount = (alert?.pendingChanges ?? 0) + (alert?.pendingOT ?? 0) + (alert?.pendingAdj ?? 0) + (alert?.pendingOverrides ?? 0)
                const isSelected = selectedId === m.id
                const wt = Number(m.weekly_target_hours ?? 40)

                return (
                  <button key={m.id} onClick={() => setSelectedId(m.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? 'bg-[#00bbb1]/8 border-l-2 border-[#00bbb1]'
                        : 'hover:bg-gray-50 border-l-2 border-transparent'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      pendingCount > 0 ? 'bg-amber-50 text-amber-600'
                      : isSelected ? 'bg-[#00bbb1]/15 text-[#00bbb1]' : 'bg-[#f3f4f6] text-[#6b7280]'
                    }`}>
                      {m.full_name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-[#1a1a1a] truncate">{m.full_name}</p>
                      <p className="text-xs text-[#9ca3af] capitalize">
                        {m.role} · {m.punch_mode ? <span className="text-orange-500 font-semibold">Punch</span> : `${wt}h/sem`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {pendingCount > 0 && (
                        <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingCount}</span>
                      )}
                      {alert?.hasExcess && <span className="text-[10px]">⚠️</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Right: detail panel ───────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {!selectedMember ? (
            <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-12 text-center">
              <div className="w-16 h-16 bg-[#f3f4f6] rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-[#9ca3af]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-[#6b7280] font-medium">Sélectionnez un membre</p>
              <p className="text-sm text-[#9ca3af] mt-1">pour voir et gérer son horaire</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Member header */}
              <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm px-5 py-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-[#00bbb1]/15 text-[#00bbb1] flex items-center justify-center text-lg font-bold flex-shrink-0">
                      {selectedMember.full_name?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="font-bold text-[#1a1a1a] text-base">{selectedMember.full_name}</h2>
                      <p className="text-sm text-[#9ca3af] capitalize">{selectedMember.role}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Punch mode toggle */}
                    <button
                      onClick={() => handleTogglePunchMode(selectedMember.id, selectedMember.punch_mode)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors ${
                        selectedMember.punch_mode
                          ? 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100'
                          : 'bg-[#f3f4f6] border-[#e5e7eb] text-[#6b7280] hover:bg-[#e9eaec]'
                      }`}
                    >
                      ⏱ {selectedMember.punch_mode ? 'Punch actif' : 'Activer punch'}
                    </button>

                    {/* Target hours editor — masqué en mode punch */}
                    {!selectedMember.punch_mode && (editingTargetId === selectedMember.id ? (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-[#f3f4f6] rounded-lg px-2 py-1">
                          <input type="number" min="1" max="80" step="0.5" value={targetInput}
                            onChange={e => setTargetInput(e.target.value)} autoFocus
                            className="w-14 bg-transparent text-sm font-bold text-[#1a1a1a] focus:outline-none text-center" />
                          <span className="text-xs text-[#6b7280]">h/sem</span>
                        </div>
                        <button onClick={() => setEditingTargetId(null)}
                          className="text-xs text-[#6b7280] hover:text-[#1a1a1a] px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg">
                          Annuler
                        </button>
                        <button onClick={() => handleSaveTarget(selectedMember.id)} disabled={targetSaving || !targetInput}
                          className="text-xs font-semibold text-white bg-[#00bbb1] hover:bg-[#009e95] px-2 py-1 rounded-lg disabled:opacity-50">
                          {targetSaving ? '…' : 'OK'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingTargetId(selectedMember.id); setTargetInput(String(selectedMember.weekly_target_hours ?? 40)) }}
                        className="flex items-center gap-1.5 bg-[#f3f4f6] hover:bg-[#e9eaec] rounded-lg px-3 py-1.5 transition-colors group"
                      >
                        <span className="text-sm font-bold text-[#1a1a1a]">{Number(selectedMember.weekly_target_hours ?? 40)}h/sem</span>
                        <svg className="w-3.5 h-3.5 text-[#9ca3af] group-hover:text-[#00bbb1] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    ))}

                    {/* History button */}
                    <button
                      onClick={() => setHistoryMember(selectedMember)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#1a1a1a] bg-[#f3f4f6] hover:bg-[#e9eaec] rounded-xl transition-colors"
                    >
                      <svg className="w-4 h-4 text-[#6b7280]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Historique
                    </button>
                  </div>
                </div>

                {/* Alert banner */}
                {(() => {
                  const alert = alerts[selectedMember.id]
                  const items = []
                  if ((alert?.pendingChanges ?? 0) > 0) items.push(`${alert.pendingChanges} demande${alert.pendingChanges > 1 ? 's' : ''} de modification`)
                  if ((alert?.pendingAdj ?? 0) > 0) items.push(`${alert.pendingAdj} ajustement${alert.pendingAdj > 1 ? 's' : ''} journalier${alert.pendingAdj > 1 ? 's' : ''} en attente`)
                  if ((alert?.pendingOverrides ?? 0) > 0) items.push(`${alert.pendingOverrides} ajustement${alert.pendingOverrides > 1 ? 's' : ''} d'horaire en attente`)
                  if ((alert?.pendingOT ?? 0) > 0) items.push(`${alert.pendingOT} heure${alert.pendingOT > 1 ? 's' : ''} supp. à approuver`)
                  if (alert?.hasExcess) items.push('dépassement d\'absences')
                  if (items.length === 0) return null
                  return (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                      <span className="text-amber-500 text-sm">⏳</span>
                      <p className="text-xs font-semibold text-amber-800">
                        Actions requises : {items.join(' · ')}
                      </p>
                    </div>
                  )
                })()}
              </div>

              {/* Schedule manager */}
              <ScheduleManager
                userId={selectedMember.id}
                isAdmin={true}
                weeklyTarget={Number(selectedMember.weekly_target_hours ?? 40)}
                punchMode={selectedMember.punch_mode ?? false}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── History modal ──────────────────────────────────────── */}
      {historyMember && payConfig && (
        <PayPeriodHistoryModal
          member={historyMember}
          payConfig={payConfig}
          onClose={() => setHistoryMember(null)}
          isAdmin={true}
        />
      )}
    </div>
  )
}
