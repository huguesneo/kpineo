import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

// ── Redemption notifications helper ─────────────────────────
// Listens for new redemptions (admin) or status updates (member)

function playDing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9)
    ;[880, 1108].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12)
      osc.connect(gain)
      osc.start(ctx.currentTime + i * 0.12)
      osc.stop(ctx.currentTime + i * 0.12 + 0.5)
    })
  } catch {}
}

function fmtDayDate(d) {
  try { return format(parseISO(d), 'EEEE d MMMM', { locale: fr }) } catch { return d }
}

// ── Toast individuel ─────────────────────────────────────────
function Toast({ icon, title, subtitle, actionLabel, onAction, onDismiss, delay = 0, autoCloseSecs = null }) {
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(100)
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    const showAt = delay + 50
    const t1 = setTimeout(() => setVisible(true), showAt)

    let t2 = null
    let raf = null
    if (autoCloseSecs) {
      const totalMs = autoCloseSecs * 1000
      const startAt = showAt + 200 // commence après apparition
      let startTime = null

      function tick(now) {
        if (!startTime) startTime = now
        const elapsed = now - startTime
        const pct = Math.max(0, 100 - (elapsed / totalMs) * 100)
        setProgress(pct)
        if (pct > 0) {
          raf = requestAnimationFrame(tick)
        }
      }

      t2 = setTimeout(() => {
        raf = requestAnimationFrame(tick)
        // Fermeture au bout du temps
        setTimeout(() => {
          cancelAnimationFrame(raf)
          setVisible(false)
          setTimeout(() => onDismissRef.current?.(), 300)
        }, totalMs)
      }, startAt)
    }

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      if (raf) cancelAnimationFrame(raf)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function close() {
    setVisible(false)
    setTimeout(onDismiss, 280)
  }

  function act() {
    setVisible(false)
    setTimeout(onAction, 280)
  }

  return (
    <div className={`transition-all duration-300 ease-out ${
      visible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-4 opacity-0 scale-95'
    }`}>
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-[#e5e7eb] w-[320px] overflow-hidden">
        <div className="flex gap-3 p-4">
          <div className="flex-shrink-0">{icon}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[#1a1a1a] leading-tight">{title}</p>
            <p className="text-xs text-[#6b7280] mt-0.5 leading-relaxed">{subtitle}</p>
            {actionLabel && onAction && (
              <button onClick={act}
                className="mt-2.5 text-xs font-bold text-white bg-[#00bbb1] hover:bg-[#009e95] active:scale-95 px-3.5 py-1.5 rounded-xl transition-all">
                {actionLabel}
              </button>
            )}
          </div>
          <button onClick={close}
            className="flex-shrink-0 self-start p-1 rounded-lg text-[#c4c9d4] hover:text-[#6b7280] hover:bg-gray-100 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {autoCloseSecs && (
          <div className="h-0.5 bg-gray-100">
            <div
              className="h-full bg-[#00bbb1] transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Composant principal ──────────────────────────────────────
export default function OTNotifications() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isAdmin = profile?.role === 'admin'
  const onDashboard = location.pathname === '/dashboard'
  const dingFired = useRef(false)

  // ── Admin states ──
  const [pendingRecs, setPendingRecs]         = useState([])
  const [pendingChanges, setPendingChanges]   = useState([])
  const [pendingAdjs, setPendingAdjs]         = useState([])
  const [otDismissed, setOtDismissed]         = useState(new Set())
  const [changeDismissed, setChangeDismissed] = useState(new Set())
  const [adjDismissed, setAdjDismissed]       = useState(new Set())

  // ── Member states ──
  const [approvedRecs, setApprovedRecs]       = useState([])
  const [reviewedChanges, setReviewedChanges] = useState([])
  const [reviewedAdjs, setReviewedAdjs]       = useState([])

  // ── Boutique states ──
  const [redemptionToasts, setRedemptionToasts]   = useState([])   // admin: new pending
  const [redeemDismissed, setRedeemDismissed]     = useState(new Set())
  const [memberRedeemToasts, setMemberRedeemToasts] = useState([]) // member: status changed

  // ─────────────────────────────────────────────────────────────
  // Admin : OT en attente
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return

    async function fetchWithNames(ids) {
      const { data: profs } = await supabase
        .from('profiles').select('id, full_name').in('id', ids)
      return Object.fromEntries((profs ?? []).map(p => [p.id, p.full_name]))
    }

    async function load() {
      const { data, error } = await supabase
        .from('overtime_records').select('*').eq('is_approved', false)
        .order('created_at', { ascending: false })
      if (error) { console.error('[OTNotif] ot load error', error); return }
      const records = data ?? []
      if (!records.length) return
      const nameMap = await fetchWithNames(records.map(r => r.user_id))
      const enriched = records.map(r => ({ ...r, memberName: nameMap[r.user_id] ?? 'Membre' }))
      setPendingRecs(enriched)
      if (!dingFired.current) { dingFired.current = true; playDing() }
    }
    load()

    const channel = supabase.channel('ot-admin-notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'overtime_records' },
        async (payload) => {
          const rec = payload.new
          const { data: prof } = await supabase
            .from('profiles').select('full_name').eq('id', rec.user_id).single()
          const enriched = { ...rec, memberName: prof?.full_name ?? 'Membre' }
          setPendingRecs(prev => [enriched, ...prev.filter(r => r.id !== enriched.id)])
          playDing()
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'overtime_records' },
        (payload) => {
          if (payload.new.is_approved) setPendingRecs(prev => prev.filter(r => r.id !== payload.new.id))
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'overtime_records' },
        (payload) => { setPendingRecs(prev => prev.filter(r => r.id !== payload.old?.id)) }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [isAdmin])

  // ─────────────────────────────────────────────────────────────
  // Admin : pending_changes en attente
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return

    async function load() {
      const { data } = await supabase
        .from('pending_changes')
        .select('*, profiles(full_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (!data?.length) return
      setPendingChanges(data)
      if (!dingFired.current) { dingFired.current = true; playDing() }
    }
    load()

    const channel = supabase.channel('changes-admin-notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pending_changes' },
        async (payload) => {
          const rec = payload.new
          const { data: prof } = await supabase
            .from('profiles').select('full_name').eq('id', rec.user_id).single()
          const enriched = { ...rec, profiles: { full_name: prof?.full_name ?? 'Membre' } }
          setPendingChanges(prev => [enriched, ...prev.filter(r => r.id !== enriched.id)])
          playDing()
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pending_changes' },
        (payload) => {
          if (payload.new.status !== 'pending')
            setPendingChanges(prev => prev.filter(r => r.id !== payload.new.id))
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pending_changes' },
        (payload) => { setPendingChanges(prev => prev.filter(r => r.id !== payload.old?.id)) }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [isAdmin])

  // ─────────────────────────────────────────────────────────────
  // Membre : OT approuvés non vus
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isAdmin || !profile?.id) return

    function getSeenIds() {
      return new Set(JSON.parse(localStorage.getItem('ot_approved_seen') ?? '[]'))
    }

    async function load() {
      const { data } = await supabase
        .from('overtime_records').select('*')
        .eq('user_id', profile.id).eq('is_approved', true)
      const seen = getSeenIds()
      const unseen = (data ?? []).filter(r => !seen.has(r.id))
      setApprovedRecs(unseen)
      if (unseen.length > 0 && !dingFired.current) {
        dingFired.current = true; playDing()
      }
    }
    load()

    const channel = supabase.channel(`ot-member-notifs-${profile.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'overtime_records',
        filter: `user_id=eq.${profile.id}`,
      }, (payload) => {
        if (payload.new.is_approved) {
          const seen = getSeenIds()
          if (!seen.has(payload.new.id)) {
            setApprovedRecs(prev => [payload.new, ...prev]); playDing()
          }
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [isAdmin, profile?.id])

  // ─────────────────────────────────────────────────────────────
  // Membre : changements reviewés non vus
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isAdmin || !profile?.id) return

    function getSeenChangeIds() {
      return new Set(JSON.parse(localStorage.getItem('pending_change_seen') ?? '[]'))
    }

    async function load() {
      const { data } = await supabase
        .from('pending_changes').select('*')
        .eq('user_id', profile.id)
        .in('status', ['approved', 'rejected'])
        .order('reviewed_at', { ascending: false })
        .limit(10)
      const seen = getSeenChangeIds()
      const unseen = (data ?? []).filter(c => !seen.has(c.id))
      setReviewedChanges(unseen)
      if (unseen.length > 0 && !dingFired.current) {
        dingFired.current = true; playDing()
      }
    }
    load()

    const channel = supabase.channel(`changes-member-notifs-${profile.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'pending_changes',
        filter: `user_id=eq.${profile.id}`,
      }, (payload) => {
        const status = payload.new.status
        if (status === 'approved' || status === 'rejected') {
          const seen = getSeenChangeIds()
          if (!seen.has(payload.new.id)) {
            setReviewedChanges(prev => [payload.new, ...prev]); playDing()
          }
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [isAdmin, profile?.id])

  // ─────────────────────────────────────────────────────────────
  // Admin : ajustements journaliers en attente
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return

    async function load() {
      const { data } = await supabase
        .from('schedule_adjustments')
        .select('*, profiles(full_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (!data?.length) return
      setPendingAdjs(data)
      if (!dingFired.current) { dingFired.current = true; playDing() }
    }
    load()

    const channel = supabase.channel('adj-admin-notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'schedule_adjustments' },
        async (payload) => {
          if (payload.new.status !== 'pending') return
          const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', payload.new.user_id).single()
          const enriched = { ...payload.new, profiles: { full_name: prof?.full_name ?? 'Membre' } }
          setPendingAdjs(prev => [enriched, ...prev.filter(r => r.id !== enriched.id)])
          playDing()
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'schedule_adjustments' },
        (payload) => {
          if (payload.new.status !== 'pending') setPendingAdjs(prev => prev.filter(r => r.id !== payload.new.id))
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'schedule_adjustments' },
        (payload) => { setPendingAdjs(prev => prev.filter(r => r.id !== payload.old?.id)) }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [isAdmin])

  // ─────────────────────────────────────────────────────────────
  // Membre : ajustements reviewés non vus
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isAdmin || !profile?.id) return

    function getSeenAdjIds() {
      return new Set(JSON.parse(localStorage.getItem('adj_seen') ?? '[]'))
    }

    async function load() {
      const { data } = await supabase
        .from('schedule_adjustments').select('*')
        .eq('user_id', profile.id)
        .in('status', ['approved', 'rejected'])
        .order('reviewed_at', { ascending: false })
        .limit(10)
      const seen = getSeenAdjIds()
      const unseen = (data ?? []).filter(a => !seen.has(a.id))
      setReviewedAdjs(unseen)
      if (unseen.length > 0 && !dingFired.current) { dingFired.current = true; playDing() }
    }
    load()

    const channel = supabase.channel(`adj-member-notifs-${profile.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'schedule_adjustments',
        filter: `user_id=eq.${profile.id}`,
      }, (payload) => {
        const status = payload.new.status
        if (status === 'approved' || status === 'rejected') {
          const seen = getSeenAdjIds()
          if (!seen.has(payload.new.id)) {
            setReviewedAdjs(prev => [payload.new, ...prev]); playDing()
          }
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [isAdmin, profile?.id])

  // ─────────────────────────────────────────────────────────────
  // Admin : nouvelles demandes d'échange boutique
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return
    const channel = supabase.channel('redemptions-admin-notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'redemptions' },
        async (payload) => {
          const rec = payload.new
          const { data: prof } = await supabase
            .from('profiles').select('full_name').eq('id', rec.user_id).single()
          const { data: reward } = await supabase
            .from('rewards_catalog').select('title').eq('id', rec.reward_id).single()
          const enriched = { ...rec, memberName: prof?.full_name ?? 'Membre', rewardTitle: reward?.title ?? 'Récompense' }
          setRedemptionToasts(prev => [enriched, ...prev.filter(r => r.id !== enriched.id)])
          playDing()
        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [isAdmin])

  // ─────────────────────────────────────────────────────────────
  // Membre : changements de statut de ses échanges
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isAdmin || !profile?.id) return
    const channel = supabase.channel(`redemptions-member-notifs-${profile.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'redemptions',
        filter: `user_id=eq.${profile.id}`,
      }, async (payload) => {
        const rec = payload.new
        if (rec.status === 'available' || rec.status === 'cancelled') {
          const { data: reward } = await supabase
            .from('rewards_catalog').select('title').eq('id', rec.reward_id).single()
          const enriched = { ...rec, rewardTitle: reward?.title ?? 'Récompense' }
          setMemberRedeemToasts(prev => [enriched, ...prev.filter(r => r.id !== enriched.id)])
          playDing()
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [isAdmin, profile?.id])

  // ── Handlers ──
  function adminOtDismiss(id) {
    setOtDismissed(prev => new Set([...prev, id]))
  }
  function adminOtView(id) {
    const rec = pendingRecs.find(r => r.id === id)
    setOtDismissed(prev => new Set([...prev, id]))
    navigate('/horaires', { state: { expandMemberId: rec?.user_id } })
  }
  function adminChangeDismiss(id) {
    setChangeDismissed(prev => new Set([...prev, id]))
  }
  function adminChangeView(id) {
    const rec = pendingChanges.find(r => r.id === id)
    setChangeDismissed(prev => new Set([...prev, id]))
    navigate('/horaires', { state: { expandMemberId: rec?.user_id } })
  }
  function memberOtDismiss(id) {
    const seen = JSON.parse(localStorage.getItem('ot_approved_seen') ?? '[]')
    localStorage.setItem('ot_approved_seen', JSON.stringify([...seen, id]))
    setApprovedRecs(prev => prev.filter(r => r.id !== id))
  }
  function memberChangeDismiss(id) {
    const seen = JSON.parse(localStorage.getItem('pending_change_seen') ?? '[]')
    localStorage.setItem('pending_change_seen', JSON.stringify([...seen, id]))
    setReviewedChanges(prev => prev.filter(c => c.id !== id))
  }
  function adjDismissAdmin(id) {
    setAdjDismissed(prev => new Set([...prev, id]))
  }
  function adjViewAdmin(id) {
    const rec = pendingAdjs.find(r => r.id === id)
    setAdjDismissed(prev => new Set([...prev, id]))
    navigate('/horaires', { state: { expandMemberId: rec?.user_id } })
  }
  function redeemDismiss(id) {
    setRedeemDismissed(prev => new Set([...prev, id]))
  }
  function memberRedeemDismiss(id) {
    setMemberRedeemToasts(prev => prev.filter(r => r.id !== id))
  }
  function memberAdjDismiss(id) {
    const seen = JSON.parse(localStorage.getItem('adj_seen') ?? '[]')
    localStorage.setItem('adj_seen', JSON.stringify([...seen, id]))
    setReviewedAdjs(prev => prev.filter(a => a.id !== id))
  }

  // ── Toasts à afficher ──
  const visibleOt      = (isAdmin && onDashboard) ? pendingRecs.filter(r => !otDismissed.has(r.id)) : []
  const visibleChanges = (isAdmin && onDashboard) ? pendingChanges.filter(r => !changeDismissed.has(r.id)) : []
  const visibleAdjs    = (isAdmin && onDashboard) ? pendingAdjs.filter(r => !adjDismissed.has(r.id)) : []
  const visibleRedeems = isAdmin ? redemptionToasts.filter(r => !redeemDismissed.has(r.id)).slice(0, 2) : []
  const memberOtToasts       = !isAdmin ? approvedRecs.slice(0, 2) : []
  const memberChangeToasts   = !isAdmin ? reviewedChanges.slice(0, 2) : []
  const memberAdjToasts      = !isAdmin ? reviewedAdjs.slice(0, 2) : []
  const memberRedeemVisible  = !isAdmin ? memberRedeemToasts.slice(0, 2) : []

  // Combine admin toasts (max 4 total)
  const allAdminToasts = [
    ...visibleOt.slice(0, 2).map(r => ({ ...r, _kind: 'ot' })),
    ...visibleChanges.slice(0, 2).map(r => ({ ...r, _kind: 'change' })),
    ...visibleAdjs.slice(0, 2).map(r => ({ ...r, _kind: 'adj' })),
    ...visibleRedeems.map(r => ({ ...r, _kind: 'redeem' })),
  ].slice(0, 4)

  const hasAny = allAdminToasts.length || memberOtToasts.length || memberChangeToasts.length || memberAdjToasts.length || memberRedeemVisible.length
  if (!hasAny) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse gap-3 items-end pointer-events-none">

      {/* Admin : OT en attente */}
      {allAdminToasts.map((r, i) => {
        if (r._kind === 'ot') {
          const name = r.memberName ?? 'Un membre'
          return (
            <div key={`ot-${r.id}`} className="pointer-events-auto">
              <Toast
                delay={i * 80}
                icon={
                  <div className="w-10 h-10 rounded-full bg-[#00bbb1]/10 flex items-center justify-center text-sm font-bold text-[#00bbb1]">
                    {name.charAt(0).toUpperCase()}
                  </div>
                }
                title={name}
                subtitle={
                  <>
                    Demande d'approbation · <strong>{Number(r.extra_hours)}h</strong>
                    <br />
                    <span className="capitalize">{fmtDayDate(r.week_start)}</span>
                  </>
                }
                actionLabel="Voir"
                onAction={() => adminOtView(r.id)}
                onDismiss={() => adminOtDismiss(r.id)}
              />
            </div>
          )
        }

        // _kind === 'change'
        if (r._kind === 'change') {
          const name = r.profiles?.full_name ?? 'Un membre'
          const isAbsence = r.entity_type === 'absence'
          const isModify  = r.action === 'modify'
          return (
            <div key={`change-${r.id}`} className="pointer-events-auto">
              <Toast
                delay={i * 80}
                icon={
                  <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-sm font-bold text-amber-600">
                    {name.charAt(0).toUpperCase()}
                  </div>
                }
                title={name}
                subtitle={
                  <>
                    Demande de {isModify ? 'modification' : 'suppression'}
                    {' · '}{isAbsence ? 'Absence' : 'Horaire'}
                  </>
                }
                actionLabel="Voir"
                onAction={() => adminChangeView(r.id)}
                onDismiss={() => adminChangeDismiss(r.id)}
              />
            </div>
          )
        }

        if (r._kind === 'adj') {
          const name = r.profiles?.full_name ?? 'Un membre'
          const delta = Number(r.adjusted_hours) - Number(r.normal_hours)
          const isExtra = delta > 0
          return (
            <div key={`adj-${r.id}`} className="pointer-events-auto">
              <Toast
                delay={i * 80}
                icon={
                  <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-sm font-bold text-amber-600">
                    {name.charAt(0).toUpperCase()}
                  </div>
                }
                title={name}
                subtitle={
                  <>
                    Ajustement {isExtra ? 'heures sup.' : 'départ anticipé'} · {' '}
                    <strong>{isExtra ? '+' : ''}{delta}h</strong>
                    <br />
                    <span className="capitalize">{fmtDayDate(r.date)}</span>
                  </>
                }
                actionLabel="Voir"
                onAction={() => adjViewAdmin(r.id)}
                onDismiss={() => adjDismissAdmin(r.id)}
              />
            </div>
          )
        }

        // _kind === 'redeem'
        const name = r.memberName ?? 'Un membre'
        return (
          <div key={`redeem-${r.id}`} className="pointer-events-auto">
            <Toast
              delay={i * 80}
              icon={<div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-lg">🛍️</div>}
              title={name}
              subtitle={<>Veut échanger <strong>{r.points_spent} pts</strong> contre<br />{r.rewardTitle}</>}
              actionLabel="Voir"
              onAction={() => { redeemDismiss(r.id); navigate('/boutique-echanges') }}
              onDismiss={() => redeemDismiss(r.id)}
            />
          </div>
        )
      })}

      {/* Membre : OT approuvés */}
      {memberOtToasts.map((r, i) => (
        <div key={`mot-${r.id}`} className="pointer-events-auto">
          <Toast
            delay={i * 300}
            autoCloseSecs={5}
            icon={<div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-xl">✅</div>}
            title="Heures approuvées"
            subtitle={
              <>
                Tes <strong>{Number(r.extra_hours)}h</strong> supplémentaires du{' '}
                <span className="capitalize">{fmtDayDate(r.week_start)}</span> ont été approuvées.
              </>
            }
            onAction={null}
            onDismiss={() => memberOtDismiss(r.id)}
          />
        </div>
      ))}

      {/* Membre : échanges boutique validés / refusés */}
      {memberRedeemVisible.map((r, i) => {
        const isAvailable = r.status === 'available'
        return (
          <div key={`mredeem-${r.id}`} className="pointer-events-auto">
            <Toast
              delay={i * 300}
              autoCloseSecs={6}
              icon={
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
                  isAvailable ? 'bg-emerald-50' : 'bg-red-50'
                }`}>
                  {isAvailable ? '🎁' : '❌'}
                </div>
              }
              title={isAvailable ? 'Récompense disponible !' : 'Demande refusée'}
              subtitle={
                <>
                  {isAvailable
                    ? <>Votre récompense <strong>{r.rewardTitle}</strong> est prête à utiliser.</>
                    : <>Votre demande pour <strong>{r.rewardTitle}</strong> a été refusée.</>
                  }
                </>
              }
              actionLabel={isAvailable ? 'Voir' : null}
              onAction={isAvailable ? () => { memberRedeemDismiss(r.id); navigate('/boutique/mes-echanges') } : null}
              onDismiss={() => memberRedeemDismiss(r.id)}
            />
          </div>
        )
      })}

      {/* Membre : ajustements reviewés */}
      {memberAdjToasts.map((a, i) => {
        const isApproved = a.status === 'approved'
        const delta = Number(a.adjusted_hours) - Number(a.normal_hours)
        const isExtra = delta > 0
        return (
          <div key={`madj-${a.id}`} className="pointer-events-auto">
            <Toast
              delay={i * 300}
              autoCloseSecs={5}
              icon={
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
                  isApproved ? 'bg-emerald-50' : 'bg-red-50'
                }`}>
                  {isApproved ? '✅' : '❌'}
                </div>
              }
              title={isApproved ? 'Ajustement approuvé' : 'Ajustement refusé'}
              subtitle={
                <>
                  Ton {isExtra ? 'heure supplémentaire' : 'départ anticipé'} du{' '}
                  <span className="capitalize">{fmtDayDate(a.date)}</span>{' '}
                  a été <strong>{isApproved ? 'approuvé' : 'refusé'}</strong>.
                </>
              }
              onAction={null}
              onDismiss={() => memberAdjDismiss(a.id)}
            />
          </div>
        )
      })}

      {/* Membre : changements reviewés */}
      {memberChangeToasts.map((c, i) => {
        const isApproved = c.status === 'approved'
        const isAbsence = c.entity_type === 'absence'
        const isModify = c.action === 'modify'
        return (
          <div key={`mchange-${c.id}`} className="pointer-events-auto">
            <Toast
              delay={i * 300}
              autoCloseSecs={5}
              icon={
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
                  isApproved ? 'bg-emerald-50' : 'bg-red-50'
                }`}>
                  {isApproved ? '✅' : '❌'}
                </div>
              }
              title={isApproved ? 'Demande approuvée' : 'Demande refusée'}
              subtitle={
                <>
                  Ta demande de {isModify ? 'modification' : 'suppression'} d'{isAbsence ? 'absence' : 'horaire'}{' '}
                  a été <strong>{isApproved ? 'approuvée' : 'refusée'}</strong>.
                </>
              }
              onAction={null}
              onDismiss={() => memberChangeDismiss(c.id)}
            />
          </div>
        )
      })}

    </div>
  )
}
