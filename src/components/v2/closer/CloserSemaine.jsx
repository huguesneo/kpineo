import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../../../lib/supabase'
import { useCloserAppointments } from '../../../hooks/useCloserData'
import WeekView from '../../calendar/WeekView'
import AppointmentDrawer from '../../calendar/AppointmentDrawer'
import BlockSlotModal from '../../calendar/BlockSlotModal'
import { SkeletonCard } from '../../shared/Skeleton'
import Button from '../../shared/Button'

// Onglet « Semaine » : WeekView, AppointmentDrawer et BlockSlotModal existants.
// Créer un blocage suit la même logique que CloserCalendar (Supabase puis GHL) ;
// modifier ou supprimer un blocage existant se fait dans le calendrier complet.
export default function CloserSemaine({ profile }) {
  const navigate = useNavigate()
  const [courant, setCourant] = useState(new Date())
  const debut = startOfWeek(courant, { weekStartsOn: 1 })
  const fin = endOfWeek(courant, { weekStartsOn: 1 })
  const jours = Array.from({ length: 7 }, (_, i) => addDays(debut, i))

  const { appointments, loading, refetch } = useCloserAppointments(
    profile?.full_name ?? null, format(debut, 'yyyy-MM-dd'), format(fin, 'yyyy-MM-dd'), profile?.ghl_user_id ?? null,
  )
  const [rdvs, setRdvs] = useState([])
  useEffect(() => { setRdvs(appointments ?? []) }, [appointments])

  const [bloques, setBloques] = useState([])
  const [selection, setSelection] = useState(null)
  const [modalBlocage, setModalBlocage] = useState(false)
  const [info, setInfo] = useState(null)

  const cleSemaine = format(debut, 'yyyy-MM-dd')
  const chargerBloques = useCallback(async () => {
    if (!profile?.id) return
    const d = new Date(cleSemaine + 'T00:00:00')
    const { data } = await supabase
      .from('blocked_slots')
      .select('*')
      .eq('user_id', profile.id)
      .gte('start_time', format(addDays(d, -1), "yyyy-MM-dd'T'00:00:00"))
      .lte('start_time', format(addDays(d, 8), "yyyy-MM-dd'T'23:59:59"))
    setBloques(data ?? [])
  }, [profile?.id, cleSemaine])
  useEffect(() => { chargerBloques() }, [chargerBloques])

  function majStatut(ghlId, statut) {
    setRdvs(prev => prev.map(a => a.ghl_id === ghlId ? { ...a, status: statut } : a))
    setSelection(prev => prev?.ghl_id === ghlId ? { ...prev, status: statut } : prev)
  }

  async function enregistrerBlocage({ title, recType, until, occurrences }) {
    if (!profile?.id) return
    const groupe = recType !== 'none' ? crypto.randomUUID() : null
    let echecs = 0
    let nonSupporte = false
    for (const occ of occurrences) {
      const { data: ligne, error } = await supabase.from('blocked_slots').insert({
        user_id: profile.id, title, start_time: occ.start_time, end_time: occ.end_time,
        recurrence_type: recType, recurrence_group_id: groupe, recurrence_until: until ?? null,
      }).select().single()
      if (error) { console.error('blocked_slots insert error:', error); continue }
      const { data: res } = await supabase.functions.invoke('ghl-block-slot', {
        body: { userId: profile.id, startTime: occ.start_time, endTime: occ.end_time, title },
      })
      if (res?.ghlEventId) await supabase.from('blocked_slots').update({ ghl_event_id: res.ghlEventId }).eq('id', ligne.id)
      else if (res?.error === 'not_event_calendar') nonSupporte = true
      else echecs++
    }
    setInfo(nonSupporte
      ? 'Le créneau est bloqué dans l’app. Ce type de calendrier ne se synchronise pas avec GHL : bloque-le aussi dans GHL au besoin.'
      : echecs > 0 ? `${echecs} créneau(x) non synchronisé(s) dans GHL.` : null)
    setModalBlocage(false)
    chargerBloques()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCourant(d => subWeeks(d, 1))} aria-label="Semaine précédente">‹</Button>
          <Button variant="secondary" size="sm" onClick={() => setCourant(new Date())}>Aujourd'hui</Button>
          <Button variant="secondary" size="sm" onClick={() => setCourant(d => addWeeks(d, 1))} aria-label="Semaine suivante">›</Button>
          <span className="text-sm font-semibold text-[#1a1a1a] ml-2">
            {format(debut, 'd MMM', { locale: fr })} → {format(fin, 'd MMM yyyy', { locale: fr })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setModalBlocage(true)}>Bloquer un créneau</Button>
          <Link to="/calendrier" className="text-xs font-semibold text-[#6b7280] hover:text-[#1a1a1a]">Calendrier complet</Link>
        </div>
      </div>

      {info && <p className="text-xs text-[#b45309] bg-[#fffbeb] border border-[#fde68a] rounded-lg px-3 py-2">{info}</p>}

      <div className="rounded-xl border border-[#e5e7eb] bg-white overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{[0, 1, 2].map(i => <SkeletonCard key={i} />)}</div>
        ) : (
          <WeekView
            days={jours}
            appointments={rdvs}
            blockedSlots={bloques}
            onApptClick={setSelection}
            onBlockedSlotClick={() => navigate('/calendrier')}
            selectedApptId={selection?.ghl_id}
          />
        )}
      </div>

      {selection && (
        <AppointmentDrawer
          appt={selection}
          onClose={() => { setSelection(null); refetch() }}
          onStatusUpdate={majStatut}
          userId={profile?.id ?? null}
        />
      )}
      {modalBlocage && (
        <BlockSlotModal initialSlot={null} onSave={enregistrerBlocage} onClose={() => setModalBlocage(false)} />
      )}
    </div>
  )
}
