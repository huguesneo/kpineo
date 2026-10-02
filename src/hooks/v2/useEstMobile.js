import { useEffect, useState } from 'react'

// Vrai sous `largeurMax` pixels (téléphone par défaut), suivi en direct
export function useEstMobile(largeurMax = 639) {
  const requete = `(max-width: ${largeurMax}px)`
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(requete).matches : false)
  useEffect(() => {
    if (!window.matchMedia) return undefined
    const mq = window.matchMedia(requete)
    const surChangement = e => setMobile(e.matches)
    setMobile(mq.matches)
    mq.addEventListener('change', surChangement)
    return () => mq.removeEventListener('change', surChangement)
  }, [requete])
  return mobile
}
