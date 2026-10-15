// Copie de video-neo/labo/graphiques/Graphique.tsx, retouchée pour le hub par scripts/synchro-timeline.mjs : ne pas modifier à la main.
// Carte d'un graphique : corps (fond, bordure, ombre « aura », reflet), entrée et sortie communes aux 4 types.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Comparaison } from "./Comparaison";
import { Courbe } from "./Courbe";
import { Cycle } from "./Cycle";
import { MytheRealite } from "./MytheRealite";
import { chargerPolices } from "./polices";
import { entreeDouce, ombreCss, phase, rgba, sortieDouce, type PropsGraphique } from "./commun";

chargerPolices();

const SORTIE = 0.25; // fondu de sortie, comme les cartes Python

// apercuFlou : timeline du labo seulement. La vidéo est floutée derrière la carte par le navigateur (backdrop-filter) ;
// au rendu, le moteur floute la vidéo sous la carte lui-même (cartes.cuire_verre), le .mov reste transparent.
export const Graphique: React.FC<PropsGraphique & { apercuFlou?: boolean }> = (p) => {
  const t = useCurrentFrame() / p.fps;
  const s = p.style;
  const e = sortieDouce(phase(t, 0, 0.4));
  let opacite = e;
  if (t > p.duree - SORTIE) opacite *= 1 - entreeDouce(phase(t, p.duree - SORTIE, SORTIE));
  const echelle = 0.97 + 0.03 * e;
  const Dessin = { courbe: Courbe, comparaison: Comparaison, cycle: Cycle, mythe_realite: MytheRealite }[p.type];
  const ombres = s.ombres.map((o) => ombreCss(o, p.k)).concat([`inset 0 2px 0 ${rgba("#F5F2EC", s.reflet_opacite)}`]);
  const transform = `translateY(${60 * (1 - e)}px) scale(${echelle})`;
  return (
    <AbsoluteFill>
      {p.apercuFlou && s.flou ? (
        // calque flouté à part : une opacité sur un parent couperait le flou
        <div style={{
          position: "absolute", left: p.x, top: p.y, width: p.w, height: p.h, borderRadius: p.arrondi, opacity: opacite,
          transform, transformOrigin: "50% 100%", backdropFilter: `blur(${s.flou * p.k}px) saturate(${s.saturation ?? 1})`,
        }} />
      ) : null}
      <div
        style={{
          position: "absolute", left: p.x, top: p.y, width: p.w, height: p.h, opacity: opacite,
          transform, transformOrigin: "50% 100%",
        }}
      >
        <div
          style={{
            position: "absolute", inset: 0, borderRadius: p.arrondi, boxSizing: "border-box",
            background: rgba(s.fond, s.fond_opacite),
            border: `${s.bordure_px * p.k}px solid ${rgba(s.bordure, s.bordure_opacite)}`,
            boxShadow: ombres.join(", "),
          }}
        />
        <Dessin t={t} p={p} />
      </div>
    </AbsoluteFill>
  );
};
