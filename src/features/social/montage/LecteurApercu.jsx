import { useEffect, useRef } from 'react'
import { statutMontage, STATUTS_EN_TRAITEMENT } from '../../../lib/montageVideo'
import { cadreFormat } from '../../../lib/montageVariantes'

// Cadre au ratio du montage (9:16, 4:5 ou 1:1) : un aperçu de variante 4:5
// n'est pas posé dans un cadre 9:16.
function Cadre({ format, children }) {
  const cadre = cadreFormat(format)
  return (
    <div data-format={cadre.label} className={`mx-auto w-full ${cadre.classe} rounded-xl overflow-hidden bg-[#111827] flex items-center justify-center`}>
      {children}
    </div>
  )
}

// Aucune version prête : statut, étape et progression du montage.
export function EtatProgression({ job, enLigne }) {
  const statut = statutMontage(job?.statut)
  const progression = job?.progression ?? 0
  const enTraitement = STATUTS_EN_TRAITEMENT.includes(job?.statut)
  return (
    <Cadre format={job?.format}>
      <div className="w-full px-6 text-center text-white" data-etat="progression">
        <p className="text-sm font-semibold">{statut.label}</p>
        {job?.statut === 'erreur' ? (
          <p className="text-xs text-red-300 mt-2">Le montage n'a pas pu être fait. Le détail est dans le fil à droite.</p>
        ) : (
          <>
            <p className="text-xs text-white/70 mt-1">
              {enTraitement ? (job?.etape || 'Préparation') : enLigne ? "En attente de l'agent" : 'En attente du retour du Mac'}
            </p>
            <div className="mt-4 h-2 rounded-full bg-white/15 overflow-hidden">
              <div className="h-full bg-[#00bbb1] transition-all" style={{ width: `${enTraitement ? progression : 0}%` }} />
            </div>
            <p className="text-xs text-white/70 mt-2 tabular-nums">{enTraitement ? `${progression} %` : 'Aucune version pour l\'instant'}</p>
          </>
        )}
      </div>
    </Cadre>
  )
}

// Lecteur de l'aperçu, au format du montage (URL signée). Quand l'URL est renouvelée pour la
// même version, la lecture reprend où elle en était. `saut` ({ secondes, tour }) :
// chaque clic sur une ligne de sous-titres place la lecture à ce moment (aussi
// sur la version suivante, pour revoir la ligne corrigée).
export default function LecteurApercu({ numero, url, erreur, onErreurChargement, saut, format }) {
  const video = useRef(null)
  const position = useRef({ numero: null, t: 0, enPause: true })

  useEffect(() => {
    if (!saut) return
    const v = video.current
    // Vidéo pas encore chargée : le moment sera appliqué à son chargement.
    if (!v || v.readyState < 1) { position.current = { numero, t: saut.secondes, enPause: true }; return }
    v.currentTime = saut.secondes
  }, [saut, numero])

  function memoriser() {
    const v = video.current
    if (v) position.current = { numero, t: v.currentTime, enPause: v.paused }
  }

  function reprendre() {
    const v = video.current
    const p = position.current
    if (!v || p.numero !== numero || !p.t) return
    v.currentTime = p.t
    if (!p.enPause) v.play().catch(() => {})
  }

  if (erreur) {
    return (
      <Cadre format={format}>
        <div className="px-6 text-center">
          <p className="text-sm text-red-300">{erreur}</p>
          <button type="button" onClick={onErreurChargement} className="mt-3 text-sm font-semibold text-[#00bbb1] hover:underline">Réessayer</button>
        </div>
      </Cadre>
    )
  }
  if (!url) {
    return <Cadre format={format}><p className="text-sm text-white/70">Chargement de l'aperçu v{numero}...</p></Cadre>
  }
  return (
    <Cadre format={format}>
      <video
        key={numero}
        ref={video}
        src={url}
        controls
        playsInline
        preload="metadata"
        className="w-full h-full object-contain bg-black"
        onTimeUpdate={memoriser}
        onPause={memoriser}
        onLoadedMetadata={reprendre}
        onError={onErreurChargement}
        aria-label={`Aperçu de la version ${numero}`}
      />
    </Cadre>
  )
}
