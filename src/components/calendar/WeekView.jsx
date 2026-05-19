import { useRef, useEffect } from 'react'
import { format, isSameDay, isToday } from 'date-fns'
import { fr } from 'date-fns/locale'

// ─── Layout constants ─────────────────────────────────────────
export const HOUR_HEIGHT = 64   // px per hour
export const START_HOUR  = 7    // 7:00
export const END_HOUR    = 22   // 22:00 (10pm)
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT

// ─── Status → block color ─────────────────────────────────────
function getBlockStyle(status) {
  switch (status) {
    case 'showed':
    case 'attended':
      return { bg: '#10b981', border: '#059669', text: 'white' }
    case 'noshow':
      return { bg: '#f59e0b', border: '#d97706', text: 'white' }
    case 'cancelled':
      return { bg: '#9ca3af', border: '#6b7280', text: 'white' }
    case 'confirmed':
    case 'new':
    case 'pending':
    default:
      return { bg: '#00bbb1', border: '#009e95', text: 'white' }
  }
}

// ─── Position helpers ─────────────────────────────────────────
function apptTop(startTime) {
  const d = new Date(startTime)
  return ((d.getHours() + d.getMinutes() / 60) - START_HOUR) * HOUR_HEIGHT
}

function apptHeight(duration) {
  return Math.max((duration / 60) * HOUR_HEIGHT, HOUR_HEIGHT * 0.5)
}

// ─── Single appointment block ─────────────────────────────────
function ApptBlock({ appt, onClick }) {
  const duration = appt.raw?.duration ?? appt.raw?.durationMinutes ?? 60
  const top    = apptTop(appt.start_time)
  const height = apptHeight(duration)
  const style  = getBlockStyle(appt.status)
  const hasMeet = appt.meeting_url?.startsWith('http')
  const short   = height < 40

  // Keep block inside the grid
  const clampedTop = Math.max(0, Math.min(top, TOTAL_HEIGHT - 24))

  return (
    <button
      onClick={() => onClick?.(appt)}
      className="absolute left-0.5 right-0.5 rounded-lg text-left overflow-hidden transition-all hover:opacity-90 hover:shadow-md active:scale-[0.98]"
      style={{
        top:             clampedTop,
        height:          height,
        backgroundColor: style.bg,
        borderLeft:      `3px solid ${style.border}`,
        color:           style.text,
        zIndex:          10,
      }}
    >
      <div className={`${short ? 'px-1.5 py-0.5' : 'px-2 py-1.5'} h-full flex flex-col justify-start overflow-hidden`}>
        <p className="text-[10px] font-bold leading-tight truncate">{appt.contact_name || '—'}</p>
        {!short && (
          <p className="text-[9px] opacity-80 leading-tight mt-0.5 truncate">
            {format(new Date(appt.start_time), 'HH:mm')}
          </p>
        )}
        {!short && hasMeet && (
          <div className="mt-auto">
            <span className="text-[8px] opacity-90 font-bold bg-white/20 px-1 py-0.5 rounded">Meet</span>
          </div>
        )}
      </div>
    </button>
  )
}

// ─── Current time indicator ───────────────────────────────────
function NowLine() {
  const now = new Date()
  const top = ((now.getHours() + now.getMinutes() / 60) - START_HOUR) * HOUR_HEIGHT
  if (top < 0 || top > TOTAL_HEIGHT) return null
  return (
    <div className="absolute left-0 right-0 z-20 flex items-center" style={{ top }}>
      <div className="w-2 h-2 rounded-full bg-[#ef4444] -ml-1 flex-shrink-0" />
      <div className="flex-1 h-px bg-[#ef4444]" />
    </div>
  )
}

// ─── Blocked slot block ───────────────────────────────────────
function BlockedSlotBlock({ slot, onClick }) {
  const start       = new Date(slot.start_time)
  const end         = new Date(slot.end_time)
  const durationMin = (end - start) / 60000
  const top         = ((start.getHours() + start.getMinutes() / 60) - START_HOUR) * HOUR_HEIGHT
  const height      = Math.max((durationMin / 60) * HOUR_HEIGHT, 20)
  const clampedTop  = Math.max(0, Math.min(top, TOTAL_HEIGHT - 20))
  const short       = height < 30

  return (
    <button
      onClick={() => onClick?.(slot)}
      className="absolute left-0.5 right-0.5 rounded-lg text-left overflow-hidden transition-all hover:opacity-80 active:scale-[0.98]"
      style={{
        top:        clampedTop,
        height,
        background: 'repeating-linear-gradient(45deg, #e5e7eb 0px, #e5e7eb 3px, #f3f4f6 3px, #f3f4f6 8px)',
        borderLeft: '3px solid #9ca3af',
        zIndex:     5,
      }}
    >
      {!short && (
        <div className="px-1.5 py-0.5 flex items-center gap-1">
          <svg className="w-2.5 h-2.5 text-[#6b7280] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
          <p className="text-[10px] font-bold text-[#6b7280] truncate">{slot.title}</p>
        </div>
      )}
    </button>
  )
}

// ─── Day column ───────────────────────────────────────────────
function DayColumn({ date, appointments, blockedSlots, onApptClick, onBlockedSlotClick, isCurrentDay, showNow }) {
  const appts   = appointments.filter(a => isSameDay(new Date(a.start_time), date))
  const blocked = (blockedSlots ?? []).filter(s => isSameDay(new Date(s.start_time), date))

  return (
    <div className="flex-1 relative border-l border-[#e5e7eb] min-w-[90px]">
      {/* Hour grid lines */}
      {HOURS.map(h => (
        <div
          key={h}
          className="absolute left-0 right-0 border-t border-[#f0f0f0]"
          style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
        />
      ))}
      {/* Half-hour grid lines (lighter) */}
      {HOURS.map(h => (
        <div
          key={`${h}.5`}
          className="absolute left-0 right-0 border-t border-dashed border-[#f5f5f5]"
          style={{ top: (h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
        />
      ))}

      {/* Now line */}
      {showNow && isCurrentDay && <NowLine />}

      {/* Blocked slots (behind appointments) */}
      {blocked.map(s => (
        <BlockedSlotBlock key={s.id} slot={s} onClick={onBlockedSlotClick} />
      ))}

      {/* Appointment blocks */}
      {appts.map(a => (
        <ApptBlock key={a.id || a.ghl_id} appt={a} onClick={onApptClick} />
      ))}
    </div>
  )
}

// ─── Week View ────────────────────────────────────────────────
export default function WeekView({ days, appointments, blockedSlots = [], onApptClick, onBlockedSlotClick, selectedApptId }) {
  const scrollRef = useRef(null)

  // Scroll to 8am on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (8 - START_HOUR) * HOUR_HEIGHT
    }
  }, [])

  const today = new Date()

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Day headers */}
      <div className="flex flex-shrink-0 border-b border-[#e5e7eb] bg-white">
        {/* Time gutter spacer */}
        <div className="w-14 flex-shrink-0" />
        {days.map(day => {
          const current = isToday(day)
          return (
            <div
              key={day.toISOString()}
              className="flex-1 min-w-[90px] text-center py-2 border-l border-[#e5e7eb]"
            >
              <p className="text-[10px] font-semibold text-[#9ca3af] uppercase">
                {format(day, 'EEE', { locale: fr })}
              </p>
              <div className={`inline-flex items-center justify-center w-7 h-7 rounded-full mt-0.5 mx-auto text-sm font-bold ${
                current ? 'bg-[#00bbb1] text-white' : 'text-[#1a1a1a]'
              }`}>
                {format(day, 'd')}
              </div>
            </div>
          )
        })}
      </div>

      {/* Scrollable grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-auto">
        <div className="flex" style={{ height: TOTAL_HEIGHT }}>
          {/* Time column */}
          <div className="w-14 flex-shrink-0 relative">
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute right-2 text-[10px] font-semibold text-[#9ca3af] select-none"
                style={{ top: (h - START_HOUR) * HOUR_HEIGHT - 6 }}
              >
                {h < 10 ? `0${h}h` : `${h}h`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map(day => (
            <DayColumn
              key={day.toISOString()}
              date={day}
              appointments={appointments}
              blockedSlots={blockedSlots}
              onApptClick={onApptClick}
              onBlockedSlotClick={onBlockedSlotClick}
              isCurrentDay={isToday(day)}
              showNow={true}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
