export function SkeletonLine({ className = '' }) {
  return <div className={`skeleton h-4 w-full ${className}`} />
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`bg-[#fcfcfd] rounded-xl shadow-sm border border-[#e5e7eb] p-5 ${className}`}>
      <div className="space-y-3">
        <SkeletonLine className="w-1/3" />
        <SkeletonLine className="w-2/3" />
        <SkeletonLine className="w-1/2" />
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center p-4 bg-white rounded-lg border border-[#e5e7eb]">
          <SkeletonLine className="w-8 h-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <SkeletonLine className="w-1/3" />
            <SkeletonLine className="w-1/4" />
          </div>
          <SkeletonLine className="w-16" />
        </div>
      ))}
    </div>
  )
}
