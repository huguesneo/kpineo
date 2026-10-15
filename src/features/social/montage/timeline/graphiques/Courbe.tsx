// Copie de video-neo/labo/graphiques/Courbe.tsx, retouchée pour le hub par scripts/synchro-timeline.mjs : ne pas modifier à la main.
// Courbe : la ligne se dessine de gauche à droite et atteint chaque point au moment où il est dit (« temps »).
// Aire dégradée sous la ligne, tête lumineuse qui avance, points qui « poppent », libellés qui s'allument,
// compteurs (valeurs dites) ou étiquette qualitative au point final, halo qui pulse une fois à l'arrivée.
import React from "react";
import { clamp, douce, milliers, phase, rebond, rgba, sortieDouce, TexteCentre, TexteMots, type PropsDessin, type Texte } from "./commun";

type Bulle = { x: number; y: number; w: number; h: number; texte: Texte };

// Position de la tête (indice flottant dans le tracé) à l'instant t
const tete = (t: number, temps: number[], jalons: number[]) => {
  if (t < temps[0]) return { i: jalons[0], arrivee: -1 };
  for (let k = 0; k < temps.length - 1; k++) {
    const fin = temps[k + 1];
    const debut = Math.max(temps[k] + 0.1, fin - 1.6); // ligne posée sur la voix : arrive au point quand il est dit
    if (t < fin) return { i: jalons[k] + (jalons[k + 1] - jalons[k]) * douce(phase(t, debut, fin - debut)), arrivee: k };
  }
  return { i: jalons[jalons.length - 1], arrivee: temps.length - 1 };
};

export const Courbe: React.FC<PropsDessin> = ({ t, p }) => {
  const s = p.style, plan = p.plan;
  const trace: [number, number][] = plan.trace;
  const temps: number[] = plan.temps, jalons: number[] = plan.jalons;
  const { i: ti, arrivee } = tete(t, temps, jalons);
  const k0 = Math.floor(ti), f = ti - k0;
  const pts = trace.slice(0, k0 + 1);
  if (k0 + 1 < trace.length && f > 0) {
    const [ax, ay] = trace[k0], [bx, by] = trace[k0 + 1];
    pts.push([ax + (bx - ax) * f, ay + (by - ay) * f]);
  }
  const [hx, hy] = pts[pts.length - 1];
  const dessine = t >= temps[0];
  const d = pts.map(([x, y], j) => `${j ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const aire = `${d} L${hx.toFixed(1)} ${plan.bas_graphe} L${pts[0][0].toFixed(1)} ${plan.bas_graphe} Z`;
  const grille = sortieDouce(phase(t, 0.15, 0.4));
  const n = temps.length;
  const fini = t >= temps[n - 1];
  const halo = fini ? phase(t, temps[n - 1], 0.9) : 0;
  const finX = trace[jalons[n - 1]][0], finY = trace[jalons[n - 1]][1];
  return (
    <>
      <TexteMots texte={plan.titre} s={s} opacite={sortieDouce(phase(t, 0.1, 0.4))} />
      <svg width={p.w} height={p.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id="aire" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={s.plein} stopOpacity={0.45} />
            <stop offset="1" stopColor={s.plein} stopOpacity={0} />
          </linearGradient>
        </defs>
        {(plan.grille as number[]).map((y, j) => (
          <line key={j} x1={plan.gx[0]} x2={plan.gx[0] + (plan.gx[1] - plan.gx[0]) * grille} y1={y} y2={y}
            stroke={rgba(s.texte, s.piste_opacite * (j === 2 ? 1.8 : 1))} strokeWidth={2 * p.k} strokeLinecap="round" />
        ))}
        {dessine && pts.length > 1 && <path d={aire} fill="url(#aire)" />}
        {dessine && pts.length > 1 && (
          <path d={d} fill="none" stroke={s.plein} strokeWidth={plan.trait} strokeLinecap="round" strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 ${16 * p.k}px ${rgba(s.plein, 0.7)})` }} />
        )}
        {/* points atteints */}
        {jalons.map((j, k) => {
          const u = arrivee >= k ? rebond(phase(t, temps[k], 0.3), 2.2) : 0;
          if (u <= 0.001) return null;
          const [x, y] = trace[j];
          const r = plan.point * clamp(u) * (u > 1 ? u : 1);
          return <circle key={k} cx={x} cy={y} r={r} fill={s.fond} stroke={s.plein} strokeWidth={plan.trait * 0.62} />;
        })}
        {/* halo du point final, une pulsation */}
        {halo > 0 && halo < 1 && (
          <circle cx={finX} cy={finY} r={plan.point * (1 + 2.6 * sortieDouce(halo))} fill="none" stroke={s.plein}
            strokeWidth={4 * p.k} opacity={0.7 * (1 - halo)} />
        )}
        {/* tête lumineuse pendant le tracé */}
        {dessine && !fini && (
          <>
            <circle cx={hx} cy={hy} r={plan.point * 1.9} fill={rgba(s.plein, 0.22)} />
            <circle cx={hx} cy={hy} r={plan.point * 0.75} fill={s.texte} />
          </>
        )}
      </svg>
      {/* libellés sous l'axe : allumés quand la ligne atteint leur point */}
      {(plan.libelles as Texte[]).map((lib, k) => {
        const on = arrivee >= k ? sortieDouce(phase(t, temps[k], 0.3)) : 0;
        return (
          <TexteMots key={k} texte={lib} s={s} opacite={sortieDouce(phase(t, 0.2, 0.4)) * (0.42 + 0.58 * on)}
            couleur={k === n - 1 && on > 0.5 ? s.accent : s.texte} />
        );
      })}
      {/* bulles : compteurs des valeurs dites, ou étiquette finale */}
      {(plan.bulles as Bulle[]).map((b, k) => {
        const idx = plan.valeurs ? k : n - 1;
        const debut = temps[idx] + (plan.valeurs ? 0 : 0.25);
        if (t < debut) return null;
        const u = rebond(phase(t, debut, 0.35), 1.6);
        const finale = idx === n - 1;
        const fond = finale ? s.plein : rgba(s.bulle, s.bulle_opacite);
        const couleur = finale ? s.sur_plein : s.texte;
        let texte = b.texte.mots.map((m) => m.t).join(" ");
        if (plan.valeurs) {
          const v: number = plan.valeurs_brutes[k];
          const c = sortieDouce(phase(t, debut, 0.7));
          texte = milliers(v * c, plan.decimales[k]) + (plan.unite ? ` ${plan.unite}` : "");
        }
        return (
          <div key={k} style={{
            position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: b.h / 2,
            background: fond, transform: `scale(${clamp(u) * (u > 1 ? u : 1)})`, transformOrigin: "50% 100%",
            opacity: clamp(u * 3), boxShadow: `0 ${18 * p.k}px ${36 * p.k}px ${-10 * p.k}px rgba(4,10,12,0.55)`,
          }}>
            <TexteCentre texte={texte} taille={b.texte.taille} lh={b.texte.lh} inter={b.texte.inter} police={s.police}
              couleur={couleur} cx={b.w / 2} y={b.texte.y - b.y} />
          </div>
        );
      })}
    </>
  );
};
