export default function Card({ children, className = '', ...props }) {
  return (
    <div
      className={`bg-[#fcfcfd] rounded-xl shadow-sm border border-[#e5e7eb] ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
