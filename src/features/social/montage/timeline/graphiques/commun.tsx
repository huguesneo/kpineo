// Copie de video-neo/labo/graphiques/commun.tsx, retouchée pour le hub par scripts/synchro-timeline.mjs : ne pas modifier à la main.
// Outils communs des graphiques : types des props (écrites par moteur/neo_moteur/graphiques.py), courbes
// d'animation (les mêmes que cartes.py), texte posé mot par mot aux positions mesurées par le moteur.
import React from "react";
import { famille } from "./polices";

export type Mot = { t: string; x: number; y: number; l: number; ligne: number; accent: boolean; sec: boolean };
export type Texte = { taille: number; lh: number; inter: number; x: number; y: number; l: number; h: number; lignes: number; mots: Mot[] };
export type Ombre = { decalage_y: number; flou: number; etalement: number; couleur: string; opacite: number };
export type Style = {
  fond: string; fond_opacite: number; bordure: string; bordure_opacite: number; bordure_px: number;
  texte: string; accent: string; plein: string; sur_plein: string; encre: string;
  bulle: string; bulle_opacite: number; bulle_bordure_opacite: number; bulle_bordure_px: number;
  piste_opacite: number; ombres: Ombre[]; ombre_bulle: Ombre; reflet_opacite: number; reflet_bulle_opacite: number;
  police: string; police_secondaire: string; flou?: number; saturation?: number;
};
export type PropsGraphique = {
  type: "courbe" | "comparaison" | "cycle" | "mythe_realite";
  n: number; fps: number; duree: number; k: number;
  x: number; y: number; w: number; h: number; arrondi: number;
  style: Style;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plan: any;
};
export type PropsDessin = { t: number; p: PropsGraphique };

// ------------------------------------------------------------------ courbes (cartes.py)
export const clamp = (u: number) => Math.max(0, Math.min(1, u));
export const phase = (t: number, debut: number, duree: number) => (duree > 0 ? clamp((t - debut) / duree) : t >= debut ? 1 : 0);
export const sortieDouce = (u: number) => 1 - Math.pow(1 - u, 3);
export const entreeDouce = (u: number) => u * u * u;
export const douce = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
export const mix = (a: number, b: number, u: number) => a + (b - a) * u;
export const rebond = (u: number, s = 1.70158) => {
  const v = u - 1;
  return v * v * ((s + 1) * v + s) + 1;
};

export const rgba = (hex: string, a = 1) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

export const ombreCss = (o: Ombre, k: number, extra = 1) =>
  `0 ${o.decalage_y * k * extra}px ${o.flou * k * extra}px ${o.etalement * k}px ${rgba(o.couleur, o.opacite)}`;

// ------------------------------------------------------------------ texte
type PropsTexte = {
  texte: Texte;
  s: Style;
  couleur?: string;
  couleurAccent?: string;
  // opacité et décalage de chaque mot (animation mot par mot) ; par défaut, tout visible
  mot?: (i: number, m: Mot) => { opacite?: number; dy?: number; couleur?: string };
  opacite?: number;
};

export const TexteMots: React.FC<PropsTexte> = ({ texte, s, couleur, couleurAccent, mot, opacite = 1 }) => {
  if (opacite <= 0.001) return null;
  return (
    <>
      {texte.mots.map((m, i) => {
        const e = mot ? mot(i, m) : {};
        const o = (e.opacite ?? 1) * opacite;
        if (o <= 0.001) return null;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: m.x,
              top: m.y + (e.dy ?? 0),
              height: texte.lh,
              lineHeight: `${texte.lh}px`,
              fontSize: texte.taille,
              letterSpacing: texte.inter,
              fontFamily: famille(m.sec ? s.police_secondaire : s.police),
              whiteSpace: "pre",
              color: e.couleur ?? (m.accent ? couleurAccent ?? s.accent : couleur ?? s.texte),
              opacity: o,
            }}
          >
            {m.t}
          </span>
        );
      })}
    </>
  );
};

// Texte centré dans une boîte (compteurs : la largeur change pendant le compte)
export const TexteCentre: React.FC<{
  texte: string; taille: number; lh: number; inter: number; police: string; couleur: string;
  cx: number; y: number; opacite?: number;
}> = ({ texte, taille, lh, inter, police, couleur, cx, y, opacite = 1 }) => (
  <div
    style={{
      position: "absolute", left: cx - 400, width: 800, top: y, height: lh, lineHeight: `${lh}px`, textAlign: "center",
      fontSize: taille, letterSpacing: inter, fontFamily: famille(police), color: couleur, whiteSpace: "pre", opacity: opacite,
    }}
  >
    {texte}
  </div>
);

// 15000 → « 15 000 » (espace fine insécable des milliers, comme cartes.milliers + typo_fr)
export const milliers = (v: number, decimales = 0) => {
  const fixe = v.toFixed(decimales);
  const [ent, dec] = fixe.split(".");
  const groupes = ent.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return dec ? `${groupes},${dec}` : groupes;
};
