// Copie de video-neo/labo/graphiques/MytheRealite.tsx, retouchée pour le hub par scripts/synchro-timeline.mjs : ne pas modifier à la main.
// Mythe ou réalité : le mythe apparaît ; quand la réalité est dite, une croix se trace, un trait barre le mythe
// ligne par ligne et il s'estompe ; le panneau réalité se soulève, une coche se trace, ses mots arrivent un à un.
// 1 à 3 paires : chaque paire prend la même place, la suivante remplace la précédente quand son mythe est dit.
import React from "react";
import { clamp, douce, mix, phase, rebond, rgba, sortieDouce, TexteMots, type PropsDessin, type Texte } from "./commun";

type Panneau = {
  nom: "mythe" | "realite"; x: number; y: number; w: number; h: number;
  icone: { x: number; y: number; d: number }; etiquette: Texte; texte: Texte;
  barres: { x0: number; x1: number; y: number }[];
};

// Trait qui se dessine (longueur l, avancée u de 0 à 1)
const Trait: React.FC<{ d: string; l: number; u: number; couleur: string; epaisseur: number }> = ({ d, l, u, couleur, epaisseur }) =>
  u <= 0 ? null : (
    <path d={d} fill="none" stroke={couleur} strokeWidth={epaisseur} strokeLinecap="round" strokeLinejoin="round"
      strokeDasharray={l} strokeDashoffset={l * (1 - clamp(u))} />
  );

type Paire = { panneaux: Panneau[]; a: number[] };

export const MytheRealite: React.FC<PropsDessin> = ({ t, p }) => {
  const plan = p.plan;
  const paires: Paire[] = plan.paires || [{ panneaux: plan.panneaux, a: plan.a }];
  return (
    <>
      {plan.titre && <TexteMots texte={plan.titre} s={p.style} opacite={sortieDouce(phase(t, 0.1, 0.4))} />}
      {paires.map((pa, k) => {
        // la paire suivante prend la place : celle-ci sort (fondu, montée) juste avant que son mythe soit dit
        const fin = k + 1 < paires.length ? paires[k + 1].a[0] : null;
        const sortie = fin === null ? 0 : douce(phase(t, fin - 0.35, 0.35));
        if (sortie >= 0.999 || (k > 0 && t < pa.a[0] - 0.01)) return null;
        return (
          <div key={k} style={{ position: "absolute", left: 0, top: 0, width: p.w, height: p.h, opacity: 1 - sortie,
            transform: `translateY(${-24 * p.k * sortie}px)` }}>
            <UnePaire t={t} p={p} paire={pa} debut={k === 0 ? Math.min(pa.a[0], 0.3) : pa.a[0]} />
          </div>
        );
      })}
    </>
  );
};

const UnePaire: React.FC<PropsDessin & { paire: Paire; debut: number }> = ({ t, p, paire, debut }) => {
  const s = p.style, plan = p.plan;
  const [, a1]: number[] = paire.a;
  const [mythe, realite]: Panneau[] = paire.panneaux;
  const rp: number = plan.arrondi_panneau;
  // Mythe
  const uM = sortieDouce(phase(t, debut, 0.45));
  const tBarre = a1 - 0.05;
  const nb = mythe.barres.length;
  const estompe = douce(phase(t, tBarre + 0.3 * nb, 0.35));
  const croix = phase(t, tBarre, 0.3);
  // Réalité
  const tR = a1 + 0.2;
  const uR = phase(t, tR, 0.45);
  const leve = uR > 0 ? rebond(uR, 0.9) : 0;
  const coche = phase(t, tR + 0.3, 0.35);
  const ic = mythe.icone.d;
  return (
    <>
      {/* panneau mythe */}
      <div style={{ position: "absolute", left: 0, top: 0, opacity: uM * mix(1, 0.45, estompe), transform: `translateY(${24 * p.k * (1 - uM)}px)` }}>
        <div style={{
          position: "absolute", left: mythe.x, top: mythe.y, width: mythe.w, height: mythe.h, borderRadius: rp, boxSizing: "border-box",
          background: rgba(s.texte, 0.05), border: `${2 * p.k}px dashed ${rgba(s.texte, 0.18)}`,
        }} />
        <TexteMots texte={mythe.etiquette} s={s} opacite={0.62} />
        <TexteMots texte={mythe.texte} s={s} />
        <svg width={p.w} height={p.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          <circle cx={mythe.icone.x + ic / 2} cy={mythe.icone.y + ic / 2} r={ic / 2 - 2 * p.k} fill="none"
            stroke={rgba(s.texte, 0.55)} strokeWidth={3 * p.k} />
          {[0, 1].map((j) => {
            const c = ic * 0.22;
            const x0 = mythe.icone.x + ic / 2, y0 = mythe.icone.y + ic / 2;
            const d = j === 0 ? `M${x0 - c} ${y0 - c} L${x0 + c} ${y0 + c}` : `M${x0 + c} ${y0 - c} L${x0 - c} ${y0 + c}`;
            return <Trait key={j} d={d} l={c * 2.9} u={croix * 2 - j} couleur={s.texte} epaisseur={4 * p.k} />;
          })}
          {mythe.barres.map((b, k) => {
            const u = sortieDouce(phase(t, tBarre + 0.3 * k, 0.32));
            const l = b.x1 - b.x0;
            return <Trait key={k} d={`M${b.x0} ${b.y} L${b.x1} ${b.y}`} l={l} u={u} couleur={s.texte} epaisseur={7 * p.k} />;
          })}
        </svg>
      </div>
      {/* emplacement de la réalité, en attente */}
      <div style={{
        position: "absolute", left: realite.x, top: realite.y, width: realite.w, height: realite.h, borderRadius: rp,
        boxSizing: "border-box", border: `${2 * p.k}px dashed ${rgba(s.texte, 0.16)}`,
        opacity: uM * (1 - clamp(uR * 3)),
      }} />
      {uR <= 0 && (
        <>
          <TexteMots texte={realite.etiquette} s={s} couleur={s.accent} opacite={0.4 * uM} />
          <svg width={p.w} height={p.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: 0.4 * uM }}>
            <circle cx={realite.icone.x + ic / 2} cy={realite.icone.y + ic / 2} r={ic / 2 - 2 * p.k} fill="none" stroke={s.accent}
              strokeWidth={3 * p.k} strokeDasharray={`${5 * p.k} ${5 * p.k}`} />
          </svg>
        </>
      )}
      {/* panneau réalité */}
      {uR > 0 && (
        <div style={{
          position: "absolute", left: 0, top: 0, width: p.w, height: p.h, opacity: clamp(uR * 2.5),
          transform: `translateY(${40 * p.k * (1 - leve)}px) scale(${0.95 + 0.05 * leve})`,
          transformOrigin: `50% ${realite.y + realite.h / 2}px`,
        }}>
          <div style={{
            position: "absolute", left: realite.x, top: realite.y, width: realite.w, height: realite.h, borderRadius: rp,
            boxSizing: "border-box", background: rgba(s.bulle, s.bulle_opacite),
            border: `${2 * p.k}px solid ${rgba(s.plein, 0.55)}`,
            boxShadow: `0 ${30 * p.k}px ${50 * p.k}px ${-18 * p.k}px rgba(4,10,12,0.6), 0 0 ${40 * p.k}px ${rgba(s.plein, 0.22)}, inset 0 ${2 * p.k}px 0 ${rgba("#F5F2EC", s.reflet_bulle_opacite)}`,
          }} />
          <TexteMots texte={realite.etiquette} s={s} couleur={s.accent} />
          <svg width={p.w} height={p.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
            <circle cx={realite.icone.x + ic / 2} cy={realite.icone.y + ic / 2} r={(ic / 2) * clamp(rebond(phase(t, tR + 0.15, 0.3), 2))}
              fill={s.plein} />
            <Trait d={`M${realite.icone.x + ic * 0.29} ${realite.icone.y + ic * 0.52} L${realite.icone.x + ic * 0.44} ${realite.icone.y + ic * 0.67} L${realite.icone.x + ic * 0.72} ${realite.icone.y + ic * 0.36}`}
              l={ic * 0.62} u={coche} couleur={s.sur_plein} epaisseur={4.5 * p.k} />
          </svg>
          <TexteMots texte={realite.texte} s={s}
            mot={(i) => {
              const u = sortieDouce(phase(t, tR + 0.2 + 0.06 * i, 0.3));
              return { opacite: u, dy: 14 * p.k * (1 - u) };
            }} />
        </div>
      )}
    </>
  );
};
