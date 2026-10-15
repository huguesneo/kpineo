// Copie de video-neo/labo/graphiques/Cycle.tsx, retouchée pour le hub par scripts/synchro-timeline.mjs : ne pas modifier à la main.
// Cycle : chaque étape s'allume quand elle est dite (anneau sur l'étape active), le trait cyan court d'une étape
// à la suivante (arrivée sur la voix), une flèche marque le sens ; puis la boucle se ferme, une lueur tourne
// autour du cercle et le texte du centre apparaît.
import React from "react";
import { clamp, douce, phase, rebond, rgba, sortieDouce, TexteMots, type PropsDessin, type Texte } from "./commun";

type Noeud = { x: number; y: number; w: number; h: number; ang: number; point: number; arrondi: number; texte: Texte; a: number };

const rad = (d: number) => (d * Math.PI) / 180;

const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  // arc dans le sens horaire de a0 à a1 (degrés, a1 > a0), coupé en morceaux de 170° au plus
  const morceaux: string[] = [];
  let a = a0;
  const pt = (d: number) => `${(cx + r * Math.cos(rad(d))).toFixed(2)} ${(cy + r * Math.sin(rad(d))).toFixed(2)}`;
  morceaux.push(`M${pt(a)}`);
  while (a1 - a > 0.01) {
    const b = Math.min(a1, a + 170);
    morceaux.push(`A${r} ${r} 0 0 1 ${pt(b)}`);
    a = b;
  }
  return morceaux.join(" ");
};

export const Cycle: React.FC<PropsDessin> = ({ t, p }) => {
  const s = p.style, plan = p.plan;
  const noeuds: Noeud[] = plan.noeuds;
  const { cx, cy, r } = plan as { cx: number; cy: number; r: number };
  const n = noeuds.length;
  const angles = noeuds.map((nd) => nd.ang).concat([noeuds[0].ang + 360]);
  // Avancée du trait : segment k va de l'étape k à l'étape k+1 (la dernière revient au départ)
  const fins = noeuds.slice(1).map((nd) => nd.a).concat([plan.boucle + 0.8]);
  let courant = angles[0];
  const faits: number[] = [];
  for (let k = 0; k < n; k++) {
    const fin = fins[k];
    const debut = k < n - 1 ? Math.max(noeuds[k].a + 0.15, fin - 0.6) : plan.boucle;
    const u = douce(phase(t, debut, fin - debut));
    if (u <= 0) break;
    courant = angles[k] + (angles[k + 1] - angles[k]) * u;
    if (u >= 1) faits.push(k);
  }
  const boucle = faits.length === n;
  const tBoucle = plan.boucle + 0.8;
  const actif = noeuds.reduce((acc, nd, k) => (t >= nd.a ? k : acc), -1);
  const piste = sortieDouce(phase(t, 0.1, 0.5));
  // Lueur qui tourne une fois la boucle fermée (un tour en 2,6 s)
  const comete = boucle ? angles[0] + ((t - tBoucle) / 2.6) * 360 : null;
  return (
    <>
      {plan.titre && <TexteMots texte={plan.titre} s={s} opacite={sortieDouce(phase(t, 0.1, 0.4))} />}
      <svg width={p.w} height={p.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={rgba(s.texte, s.piste_opacite * 1.4 * piste)} strokeWidth={plan.trait} />
        {courant > angles[0] + 0.2 && (
          <path d={arc(cx, cy, r, angles[0], courant)} fill="none" stroke={s.plein} strokeWidth={plan.trait} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 ${9 * p.k}px ${rgba(s.plein, 0.6)})` }} />
        )}
        {/* flèches du sens, au milieu de chaque segment fait */}
        {faits.map((k) => {
          const m = (angles[k] + angles[k + 1]) / 2;
          const x = cx + r * Math.cos(rad(m)), y = cy + r * Math.sin(rad(m));
          const fin = k < n - 1 ? fins[k] : tBoucle;
          const u = rebond(phase(t, fin, 0.3), 2);
          const l = 15 * p.k * clamp(u) * (u > 1 ? u : 1);
          return (
            <g key={k} transform={`translate(${x} ${y}) rotate(${m + 90})`}>
              <circle r={l * 1.25} fill={s.fond} />
              <path d={`M${-l * 0.6} ${-l * 0.55} L${l * 0.35} 0 L${-l * 0.6} ${l * 0.55}`} fill="none" stroke={s.plein}
                strokeWidth={5 * p.k} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
        {comete !== null &&
          [0, 1, 2, 3, 4, 5, 6, 7].map((j) => {
            const a = comete - j * 4.5;
            return (
              <circle key={j} cx={cx + r * Math.cos(rad(a))} cy={cy + r * Math.sin(rad(a))} r={plan.trait * (0.95 - j * 0.08)}
                fill={j === 0 ? s.texte : s.plein} opacity={(1 - j / 8) * clamp((t - tBoucle) * 3)} />
            );
          })}
      </svg>
      {plan.centre && (
        <TexteMots texte={plan.centre} s={s} opacite={sortieDouce(phase(t, tBoucle + 0.1, 0.45))}
          mot={() => ({ dy: 16 * p.k * (1 - sortieDouce(phase(t, tBoucle + 0.1, 0.45))) })} />
      )}
      {noeuds.map((nd, k) => {
        const u = phase(t, nd.a, 0.35);
        const pop = u > 0 ? rebond(u, 1.8) : 0;
        const allume = sortieDouce(u);
        const anneau = k === actif && !boucle ? allume : boucle && k === actif ? 1 - sortieDouce(phase(t, tBoucle, 0.4)) : 0;
        const echelle = 0.94 + 0.06 * (u > 0 ? pop : 0);
        const entree = sortieDouce(phase(t, 0.12 + 0.08 * k, 0.4));
        return (
          <div key={k} style={{
            position: "absolute", left: nd.x, top: nd.y, width: nd.w, height: nd.h, borderRadius: nd.arrondi,
            background: rgba(s.bulle, s.bulle_opacite), boxSizing: "border-box",
            border: `${s.bulle_bordure_px * p.k}px solid ${rgba(s.texte, s.bulle_bordure_opacite)}`,
            boxShadow: [
              `0 ${16 * p.k}px ${30 * p.k}px ${-10 * p.k}px rgba(4,10,12,0.55)`,
              ...(anneau > 0.01 ? [`0 0 0 ${4 * p.k}px ${rgba(s.plein, 0.75 * anneau)}`, `0 0 ${30 * p.k}px ${rgba(s.plein, 0.35 * anneau)}`] : []),
            ].join(", "),
            opacity: entree * (0.42 + 0.58 * allume), transform: `scale(${echelle})`,
          }}>
            <div style={{
              position: "absolute", left: nd.texte.x - nd.x - nd.point - 14 * p.k, top: nd.texte.y - nd.y + nd.texte.h / 2 - nd.point / 2,
              width: nd.point, height: nd.point, borderRadius: "50%",
              background: allume > 0.5 ? s.plein : rgba(s.texte, 0.4),
              boxShadow: allume > 0.5 ? `0 0 ${18 * p.k}px ${rgba(s.plein, 0.7)}` : "none",
            }} />
            <div style={{ position: "absolute", left: -nd.x, top: -nd.y }}>
              <TexteMots texte={nd.texte} s={s} />
            </div>
          </div>
        );
      })}
    </>
  );
};
