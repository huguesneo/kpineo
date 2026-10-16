import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const MARGE = 8          // espace autour de l'élément éclairé
const LARGEUR_BULLE = 360

// Premier élément visible qui correspond au sélecteur (data-tour="…")
function trouver(selecteur) {
  if (!selecteur) return null
  const els = [...document.querySelectorAll(selecteur)]
  return els.find(el => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }) ?? null
}

const attendre = ms => new Promise(r => setTimeout(r, ms))

// Attend que l'élément apparaisse (fiche qui s'ouvre, liste qui charge)
async function attendreElement(selecteur, delaiMax = 2500) {
  const fin = Date.now() + delaiMax
  while (Date.now() < fin) {
    const el = trouver(selecteur)
    if (el) return el
    await attendre(100)
  }
  return null
}

// Visite guidée sur l'écran réel : le reste de l'écran s'assombrit, un projecteur
// se déplace d'un élément à l'autre et une bulle explique. Chaque étape :
//   { cible: '[data-tour="…"]' | null, titre, texte, avant?: async () => {} }
// Une cible absente (liste vide, écran de téléphone) : la bulle s'affiche au centre.
export default function VisiteGuidee({ etapes, ouverte, onFermer, onTerminer }) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState(null)
  const [pret, setPret] = useState(false)
  const [taille, setTaille] = useState({ w: window.innerWidth, h: window.innerHeight })
  const bulle = useRef(null)
  const [hBulle, setHBulle] = useState(180)
  const cibleRef = useRef(null)

  const etape = etapes[index]
  // Étapes lues par référence : une liste recréée (temps réel) ne relance pas l'étape
  const etapesRef = useRef(etapes)
  useEffect(() => { etapesRef.current = etapes }, [etapes])

  // Préparer l'étape : action éventuelle (ouvrir la fiche…), trouver la cible, la centrer
  useEffect(() => {
    const e = etapesRef.current[index]
    if (!ouverte || !e) return undefined
    let annule = false
    setPret(false)
    ;(async () => {
      try { await e.avant?.() } catch { /* l'étape reste lisible au centre */ }
      const el = e.cible ? await attendreElement(e.cible) : null
      if (annule) return
      cibleRef.current = el
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        await attendre(420)
      }
      if (annule) return
      setRect(el ? el.getBoundingClientRect() : null)
      setPret(true)
    })()
    return () => { annule = true }
  }, [ouverte, index])

  // Suivre l'élément si la page défile ou change de taille
  useEffect(() => {
    if (!ouverte) return undefined
    const maj = () => {
      setTaille({ w: window.innerWidth, h: window.innerHeight })
      if (cibleRef.current) setRect(cibleRef.current.getBoundingClientRect())
    }
    window.addEventListener('resize', maj)
    window.addEventListener('scroll', maj, true)
    return () => { window.removeEventListener('resize', maj); window.removeEventListener('scroll', maj, true) }
  }, [ouverte])

  useLayoutEffect(() => {
    if (bulle.current) setHBulle(bulle.current.offsetHeight)
  }, [index, pret, rect])

  const suivant = useCallback(() => {
    if (index < etapes.length - 1) setIndex(i => i + 1)
    else { setIndex(0); onTerminer?.() }
  }, [index, etapes.length, onTerminer])
  const precedent = useCallback(() => setIndex(i => Math.max(0, i - 1)), [])
  const fermer = useCallback(() => { setIndex(0); onFermer?.() }, [onFermer])

  useEffect(() => {
    if (!ouverte) return undefined
    const touche = e => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); suivant() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); precedent() }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer() }
    }
    window.addEventListener('keydown', touche, true)
    return () => window.removeEventListener('keydown', touche, true)
  }, [ouverte, suivant, precedent, fermer])

  if (!ouverte || !etape) return null

  // Projecteur (élément éclairé) et position de la bulle (sous, sinon au-dessus, sinon au centre)
  const projecteur = rect && pret ? {
    top: rect.top - MARGE, left: rect.left - MARGE,
    width: rect.width + MARGE * 2, height: rect.height + MARGE * 2,
  } : null
  const largeur = Math.min(LARGEUR_BULLE, taille.w - 32)
  let pos
  if (!projecteur) {
    pos = { top: Math.max(16, (taille.h - hBulle) / 2), left: (taille.w - largeur) / 2 }
  } else {
    const dessous = projecteur.top + projecteur.height + 14
    const dessus = projecteur.top - 14 - hBulle
    const top = dessous + hBulle < taille.h - 12 ? dessous : dessus > 12 ? dessus : Math.max(12, taille.h - hBulle - 12)
    const left = Math.min(Math.max(16, projecteur.left + projecteur.width / 2 - largeur / 2), taille.w - largeur - 16)
    pos = { top, left }
  }
  const dernier = index === etapes.length - 1

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Démo de la mise à jour">
      {/* Assombrissement : par le projecteur (ombre géante) ou plein écran sans cible */}
      {projecteur ? (
        <div className="fixed rounded-xl pointer-events-none transition-all duration-300 ease-out ring-2 ring-[#00bbb1]"
          style={{ ...projecteur, boxShadow: '0 0 0 9999px rgba(15,23,42,0.62)' }} />
      ) : (
        <div className="fixed inset-0 bg-[rgba(15,23,42,0.62)] transition-opacity duration-300" />
      )}
      {/* Bloque les clics sur l'écran pendant la démo */}
      <div className="fixed inset-0" onClick={e => e.stopPropagation()} />

      <div ref={bulle}
        className="fixed bg-white rounded-2xl shadow-2xl p-5 transition-all duration-300 ease-out"
        style={{ top: pos.top, left: pos.left, width: largeur, opacity: pret ? 1 : 0 }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#00bbb1]">
            {etape.chapitre ?? 'Nouveauté'} · {index + 1}/{etapes.length}
          </span>
          <button onClick={fermer} className="text-xs font-semibold text-[#9ca3af] hover:text-[#1a1a1a]">Passer</button>
        </div>
        <h3 className="text-[16px] font-black text-[#1a1a1a] mb-1.5">{etape.titre}</h3>
        <div className="text-sm text-[#4b5563] leading-relaxed space-y-1.5">
          {(Array.isArray(etape.texte) ? etape.texte : [etape.texte]).map((t, i) => <p key={i}>{t}</p>)}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex-1 h-1 bg-[#f3f4f6] rounded-full overflow-hidden">
            <div className="h-full bg-[#00bbb1] transition-all duration-300" style={{ width: `${((index + 1) / etapes.length) * 100}%` }} />
          </div>
          {index > 0 && (
            <button onClick={precedent} className="px-3 py-2 text-xs font-bold text-[#6b7280] rounded-lg hover:bg-[#f3f4f6]">Précédent</button>
          )}
          <button onClick={suivant} className="px-4 py-2 text-xs font-bold text-white bg-[#00bbb1] rounded-lg hover:bg-[#009e95]">
            {dernier ? 'Terminer' : 'Suivant'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Pop-up d'annonce : « Mise à jour importante · Voir la démo / Plus tard »
export function AnnonceMiseAJour({ ouverte, titre, points, onVoir, onPlusTard }) {
  if (!ouverte) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={titre}>
      <div className="absolute inset-0 bg-[rgba(15,23,42,0.62)]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#00bbb1] mb-1">🎉 Mise à jour importante</p>
        <h2 className="text-xl font-black text-[#1a1a1a] mb-3">{titre}</h2>
        <ul className="text-sm text-[#4b5563] space-y-1.5 mb-5">
          {points.map(p => <li key={p} className="flex gap-2"><span className="text-[#00bbb1]">✓</span><span>{p}</span></li>)}
        </ul>
        <div className="flex gap-2">
          <button onClick={onVoir} className="flex-1 h-11 rounded-xl bg-[#00bbb1] text-white text-sm font-bold hover:bg-[#009e95]">
            Voir la démo (2 min)
          </button>
          <button onClick={onPlusTard} className="h-11 px-4 rounded-xl border border-[#e5e7eb] text-sm font-semibold text-[#6b7280] hover:bg-[#f9fafb]">
            Plus tard
          </button>
        </div>
      </div>
    </div>
  )
}
