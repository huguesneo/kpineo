import { fr } from 'date-fns/locale'
import { format } from 'date-fns'

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

export default function MonthNavigator({ month, year, onChange, className = '' }) {
  const now = new Date()
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()

  function prev() {
    if (month === 1) onChange(12, year - 1)
    else onChange(month - 1, year)
  }

  function next() {
    if (isCurrentMonth) return
    if (month === 12) onChange(1, year + 1)
    else onChange(month + 1, year)
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        onClick={prev}
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#6b7280] transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <span className="text-sm font-semibold text-[#1a1a1a] min-w-[110px] text-center">
        {MONTHS_FR[month - 1]} {year}
      </span>

      <button
        onClick={next}
        disabled={isCurrentMonth}
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#6b7280] transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {!isCurrentMonth && (
        <button
          onClick={() => onChange(now.getMonth() + 1, now.getFullYear())}
          className="ml-1 text-[10px] font-semibold text-[#00bbb1] hover:text-[#009e95] transition-colors"
        >
          Aujourd'hui
        </button>
      )}
    </div>
  )
}
