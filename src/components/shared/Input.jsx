export default function Input({ label, error, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-semibold text-[#1a1a1a]">{label}</label>
      )}
      <input
        className={`w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white placeholder:text-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent transition-colors ${error ? 'border-red-400 focus:ring-red-400' : ''} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
