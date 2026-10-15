// Copie de video-neo/labo/graphiques/Comparaison.tsx, retouchée pour le hub par scripts/synchro-timeline.mjs : ne pas modifier à la main.
// Comparaison, avec des chiffres dits : 2 à 4 barres qui poussent quand on en parle (léger rebond), chiffre en gros qui
// monte avec la barre, barre « forte » en couleur de marque avec sa lueur et un reflet qui la parcourt une fois.
// Sans chiffre dit : avant/après en 2 colonnes (jamais de barre sans valeur), une flèche se trace entre les deux.
import React from "react";
import { clamp, milliers, mix, phase, rebond, rgba, sortieDouce, TexteCentre, TexteMots, type PropsDessin, type Texte } from "./commun";

type Barre = {
  cx: number; w: number; h: number; fort: boolean; libelle: Texte; a: number;
  valeur: null | { valeur: number; unite: string; texte: Texte; decimales: number };
};

type Colonne = { x: number; y: number; w: number; h: number; texte: Texte; etiquette: Texte | null; a: number };

const AvantApres: React.FC<PropsDessin> = ({ t, p }) => {
  const s = p.style, plan = p.plan;
  const [avant, apres]: Colonne[] = plan.colonnes;
  const r: number = plan.arrondi_colonne;
  const f = plan.fleche as { x: number; y: number; l: number };
  const uA = phase(t, Math.min(avant.a, 0.35), 0.45);
  const uB = phase(t, apres.a, 0.45);
  const leve = uB > 0 ? rebond(uB, 1.0) : 0;
  const estompe = sortieDouce(phase(t, apres.a + 0.2, 0.5));
  const trait = sortieDouce(phase(t, apres.a - 0.3, 0.35));
  const pointe = 0.32 * f.l;
  return (
    <>
      <TexteMots texte={plan.titre} s={s} opacite={sortieDouce(phase(t, 0.1, 0.4))} />
      {/* avant : posée d'abord, puis estompée quand l'après est dit */}
      <div style={{ position: "absolute", left: 0, top: 0, opacity: sortieDouce(uA) * mix(1, 0.55, estompe),
        transform: `translateY(${26 * p.k * (1 - sortieDouce(uA))}px)` }}>
        <div style={{
          position: "absolute", left: avant.x, top: avant.y, width: avant.w, height: avant.h, borderRadius: r, boxSizing: "border-box",
          background: rgba(s.texte, 0.06), border: `${2 * p.k}px dashed ${rgba(s.texte, 0.22)}`,
        }} />
        {avant.etiquette && <TexteMots texte={avant.etiquette} s={s} opacite={0.65} />}
        <TexteMots texte={avant.texte} s={s} />
      </div>
      {/* flèche : se trace juste avant l'après */}
      <svg width={p.w} height={p.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {trait > 0 && (
          <path d={`M${f.x} ${f.y} L${f.x + f.l * trait} ${f.y}`} stroke={s.plein} strokeWidth={8 * p.k} strokeLinecap="round" fill="none" />
        )}
        {trait > 0.85 && (
          <path d={`M${f.x + f.l - pointe} ${f.y - pointe} L${f.x + f.l} ${f.y} L${f.x + f.l - pointe} ${f.y + pointe}`}
            stroke={s.plein} strokeWidth={8 * p.k} strokeLinecap="round" strokeLinejoin="round" fill="none"
            opacity={clamp((trait - 0.85) / 0.15)} />
        )}
      </svg>
      {/* emplacement de l'après, en attente */}
      <div style={{
        position: "absolute", left: apres.x, top: apres.y, width: apres.w, height: apres.h, borderRadius: r, boxSizing: "border-box",
        border: `${2 * p.k}px dashed ${rgba(s.texte, 0.16)}`, opacity: sortieDouce(uA) * (1 - clamp(uB * 3)),
      }} />
      {uB > 0 && (
        <div style={{
          position: "absolute", left: 0, top: 0, width: p.w, height: p.h, opacity: clamp(uB * 2.5),
          transform: `translateY(${34 * p.k * (1 - leve)}px) scale(${0.94 + 0.06 * leve})`,
          transformOrigin: `${apres.x + apres.w / 2}px ${apres.y + apres.h / 2}px`,
        }}>
          <div style={{
            position: "absolute", left: apres.x, top: apres.y, width: apres.w, height: apres.h, borderRadius: r, boxSizing: "border-box",
            background: rgba(s.bulle, s.bulle_opacite), border: `${2.5 * p.k}px solid ${rgba(s.plein, 0.7)}`,
            boxShadow: `0 ${30 * p.k}px ${50 * p.k}px ${-18 * p.k}px rgba(4,10,12,0.6), 0 0 ${44 * p.k}px ${rgba(s.plein, 0.28)}, inset 0 ${2 * p.k}px 0 ${rgba("#F5F2EC", s.reflet_bulle_opacite)}`,
          }} />
          {apres.etiquette && <TexteMots texte={apres.etiquette} s={s} couleur={s.accent} />}
          <TexteMots texte={apres.texte} s={s} couleur={s.accent}
            mot={(i) => {
              const u = sortieDouce(phase(t, apres.a + 0.1 + 0.06 * i, 0.3));
              return { opacite: u, dy: 12 * p.k * (1 - u) };
            }} />
        </div>
      )}
    </>
  );
};

export const Comparaison: React.FC<PropsDessin> = ({ t, p }) => {
  if (p.plan.mode === "avant_apres") return <AvantApres t={t} p={p} />;
  const s = p.style, plan = p.plan;
  const barres: Barre[] = plan.barres;
  const base: number = plan.base;
  const r: number = plan.arrondi_barre;
  const ligne = sortieDouce(phase(t, 0.15, 0.45));
  return (
    <>
      <TexteMots texte={plan.titre} s={s} opacite={sortieDouce(phase(t, 0.1, 0.4))} />
      {/* ligne de base */}
      <div style={{
        position: "absolute", left: plan.ligne[0], top: base - 1.5 * p.k, height: 3 * p.k, borderRadius: 2 * p.k,
        width: (plan.ligne[1] - plan.ligne[0]) * ligne, background: rgba(s.texte, s.piste_opacite * 1.8),
      }} />
      {barres.map((b, k) => {
        const u = phase(t, b.a, b.fort ? 0.75 : 0.55);
        const croissance = u > 0 ? rebond(u, b.fort ? 1.1 : 0.6) : 0;
        const hb = Math.max(0, b.h * croissance);
        const fond = b.fort ? s.plein : rgba(s.bulle, s.bulle_opacite);
        const reflet = b.fort ? phase(t, b.a + 0.75, 0.7) : 0;
        const allume = sortieDouce(phase(t, b.a, 0.3));
        return (
          <React.Fragment key={k}>
            {/* colonne fantôme : l'échelle de la barre, avant qu'elle pousse */}
            <div style={{
              position: "absolute", left: b.cx - b.w / 2, top: base - plan.hmax, width: b.w, height: plan.hmax,
              borderRadius: `${r}px ${r}px ${4 * p.k}px ${4 * p.k}px`, boxSizing: "border-box",
              border: `${2 * p.k}px dashed ${rgba(s.texte, s.piste_opacite * 1.3 * ligne)}`, borderBottom: "none",
            }} />
            {hb > 0.5 && (
              <div style={{
                position: "absolute", left: b.cx - b.w / 2, top: base - hb, width: b.w, height: hb,
                borderRadius: `${Math.min(r, hb / 2)}px ${Math.min(r, hb / 2)}px ${4 * p.k}px ${4 * p.k}px`, background: fond,
                overflow: "hidden", boxSizing: "border-box",
                border: b.fort ? "none" : `${s.bulle_bordure_px * p.k}px solid ${rgba(s.texte, s.bulle_bordure_opacite)}`,
                boxShadow: b.fort
                  ? `0 ${26 * p.k}px ${56 * p.k}px ${-14 * p.k}px ${rgba(s.plein, 0.55)}, inset 0 ${2 * p.k}px 0 rgba(255,255,255,0.28)`
                  : `0 ${22 * p.k}px ${40 * p.k}px ${-14 * p.k}px rgba(4,10,12,0.55), inset 0 ${2 * p.k}px 0 ${rgba("#F5F2EC", s.reflet_bulle_opacite)}`,
              }}>
                {reflet > 0 && reflet < 1 && (
                  <div style={{
                    position: "absolute", left: 0, right: 0, height: 0.5 * hb, top: mix(hb, -0.5 * hb, reflet),
                    background: "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.34) 50%, rgba(255,255,255,0) 100%)",
                  }} />
                )}
              </div>
            )}
            {b.valeur && u > 0 && (
              <TexteCentre
                texte={milliers(b.valeur.valeur * clamp(sortieDouce(u)), b.valeur.decimales) + b.valeur.unite}
                taille={b.valeur.texte.taille} lh={b.valeur.texte.lh} inter={b.valeur.texte.inter} police={s.police}
                couleur={b.fort ? s.accent : s.texte} cx={b.cx} y={b.valeur.texte.y + (b.h - hb)} opacite={clamp(u * 4)} />
            )}
            <TexteMots texte={b.libelle} s={s} opacite={sortieDouce(phase(t, 0.25, 0.4)) * (0.4 + 0.6 * allume)}
              couleur={b.fort && allume > 0.5 ? s.accent : s.texte} />
          </React.Fragment>
        );
      })}
    </>
  );
};
