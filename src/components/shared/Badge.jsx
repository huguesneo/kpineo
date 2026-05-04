export default function Badge({ children, variant = 'default', className = '' }) {
  const variants = {
    default: 'bg-gray-100 text-gray-600',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    danger: 'bg-red-50 text-red-700',
    primary: 'bg-[#00bbb1]/10 text-[#00bbb1]',
    naturopathe:    'bg-purple-50 text-purple-700',
    closer:         'bg-blue-50 text-blue-700',
    setter:         'bg-orange-50 text-orange-700',
    service_client: 'bg-pink-50 text-pink-700',
    resp_vente:     'bg-indigo-50 text-indigo-700',
    admin:          'bg-[#00bbb1]/10 text-[#00bbb1]',
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${variants[variant] || variants.default} ${className}`}>
      {children}
    </span>
  )
}
