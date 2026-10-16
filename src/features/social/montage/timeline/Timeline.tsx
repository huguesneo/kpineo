// Copie de video-neo/labo/timeline/src/Timeline.tsx, retouchée pour le hub par scripts/synchro-timeline.mjs : ne pas modifier à la main.
// Pistes : vidéo (morceaux : rognage, coupe, suppression), zooms (plans : modèles déposés), cartes et graphiques
// (déplacer, étirer, déposer depuis la palette), sous-titres (un bloc lisible par groupe), sons (bibliothèque :
// déposer, déplacer), musique. Règle en haut : cliquer pour aller au temps.
import React, { useRef } from "react";
import type { Etat } from "./Montage";
import {
  FPS, blocsMusique, deplacerMusique, fondus, glisserContenu, reglerMusique, rognerMusique, segmentsMusique, type BlocMusique,
  deplacerCarte, deplacerSon, deplacerZoom, dureeTotale, estBase, etirerCarte, etirerZoom, formatTemps, morceaux, nomSon,
  brutRetire, plansAffiches, rognerPlage, type Probleme, type Recette,
} from "./logique";

export type Selection = { genre: "carte" | "sous_titre" | "son" | "plage" | "plan" | "musique"; index: number } | null;

type Props = {
  recette: Recette; etat: Etat | null; temps: number; pps: number; selection: Selection; problemes: Probleme[];
  graphiques: string[]; noms: Record<string, string>; dureeSource: number;
  allerA: (t: number) => void; choisir: (s: Selection) => void;
  // glisser : debut() note l'historique une fois, puis chaque mouvement remplace la recette (à partir de l'original)
  debutGlisser: () => Recette; pendantGlisser: (r: Recette) => void; finGlisser: () => void;
  deposer: (genre: "carte" | "son" | "musique" | "zoom", valeur: string, t: number) => void;
  hauteur?: number;   // hauteur donnée à la timeline (batch 4) : les pistes grandissent avec elle
  dureesChansons?: Record<string, number>;   // musique (batch 4b) : durée de chaque chanson (boucle, décalage)
  ondes?: Record<string, Onde>;              // forme d'onde de chaque chanson (outil.py onde)
};

export type Onde = { duree: number; pas: number; pics: number[] };

// Forme d'onde d'un bloc : un trait par tranche de 3 px, la chanson lue à partir du décalage (boucle comprise),
// et les fondus dessinés en triangles sombres (comme CapCut).
const OndeBloc: React.FC<{ b: BlocMusique; onde?: Onde; duree?: number; pps: number; h: number }> = ({ b, onde, duree, pps, h }) => {
  const w = Math.max(1, (b.fin - b.debut) * pps);
  const traits: string[] = [];
  if (onde && onde.pics.length) {
    const segs = segmentsMusique(b, duree ?? onde.duree);
    for (let px = 0; px < w; px += 3) {
      const t = b.debut + px / pps;
      const sg = segs.find((x) => t >= x.debut && t < x.debut + x.duree) || segs[segs.length - 1];
      const v = onde.pics[Math.min(onde.pics.length - 1, Math.floor((sg.depuis + t - sg.debut) / onde.pas))] || 0;
      const a = Math.max(1, v * (h - 6) / 2);
      traits.push(`M${px + 1} ${h / 2 - a}V${h / 2 + a}`);
    }
  }
  const [fi, fo] = fondus(b);
  return (
    <svg className="onde" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={traits.join("")} />
      {fi > 0 && <polygon className="fondu" points={`0,0 ${Math.min(w, fi * pps)},0 0,${h}`} />}
      {fo > 0 && <polygon className="fondu" points={`${w},0 ${Math.max(0, w - fo * pps)},0 ${w},${h}`} />}
    </svg>
  );
};

const GAUCHE = 132;
// Batch 4 : pistes plus hautes et lisibles ; quand la timeline est agrandie, elles grandissent (jusqu'à 1,8 fois)
const PISTES = [
  { cle: "video", nom: "Vidéo", h: 42, depot: "zoom" },
  { cle: "zooms", nom: "Zooms", h: 30, depot: "zoom" },
  { cle: "cartes", nom: "Cartes et graphiques", h: 58, depot: "carte" },
  { cle: "sous_titres", nom: "Sous-titres", h: 46, depot: "" },
  { cle: "sons", nom: "Sons", h: 32, depot: "son" },
  { cle: "musique", nom: "Musique", h: 30, depot: "musique" },
] as const;
// règle + pistes (+ leur bordure) + marge du bas
const REGLE = 24;
export const HAUTEUR_PISTES = REGLE + PISTES.reduce((s, p) => s + p.h + 1, 0) + 8;
const facteurPistes = (hauteur?: number) =>
  Math.max(1, Math.min(1.8, ((hauteur ?? HAUTEUR_PISTES) - REGLE - 8 - PISTES.length) / PISTES.reduce((s, p) => s + p.h, 0)));

// Ce qui est glissé depuis la palette → type du dataTransfer
export const TYPES_DEPOT = { carte: "text/neo-type", son: "text/neo-son", musique: "text/neo-musique", zoom: "text/neo-zoom" } as const;

export const Timeline: React.FC<Props> = (p) => {
  const zone = useRef<HTMLDivElement>(null);
  const total = Math.max(dureeTotale(p.recette), p.etat?.total || 0);
  const largeur = total * p.pps + 120;
  const x = (t: number) => t * p.pps;

  const tempsDe = (clientX: number) => {
    const z = zone.current!;
    return Math.max(0, (clientX - z.getBoundingClientRect().left + z.scrollLeft - GAUCHE) / p.pps);
  };

  // Glisser générique : f(original, dt) → nouvelle recette (avec l'index de l'objet glissé s'il change : zooms)
  const glisser = (e: React.PointerEvent, f: (orig: Recette, dt: number) => Recette | { recette: Recette; index: number }, choix?: Selection) => {
    e.stopPropagation();
    e.preventDefault();
    if (choix) p.choisir(choix);
    const x0 = e.clientX;
    const orig = p.debutGlisser();
    let bouge = false;
    const cible = e.currentTarget as HTMLElement;
    cible.setPointerCapture(e.pointerId);
    const mouvement = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) / p.pps;
      if (!bouge && Math.abs(ev.clientX - x0) < 3) return;
      bouge = true;
      const r = f(orig, Math.round(dt * FPS) / FPS);
      if ("index" in r && choix) { p.pendantGlisser(r.recette); p.choisir({ genre: choix.genre, index: r.index }); }
      else p.pendantGlisser(r as Recette);
    };
    const fin = () => {
      cible.removeEventListener("pointermove", mouvement);
      cible.removeEventListener("pointerup", fin);
      cible.removeEventListener("pointercancel", fin);
      p.finGlisser();
    };
    cible.addEventListener("pointermove", mouvement);
    cible.addEventListener("pointerup", fin);
    cible.addEventListener("pointercancel", fin);
  };

  const pb = (k: number) => {
    const l = p.problemes.filter((x) => x.carte === k && x.niveau !== "info");
    return l.some((x) => x.niveau === "erreur") ? "erreur" : l.length ? "avis" : null;
  };
  const choisi = (genre: NonNullable<Selection>["genre"], k: number) => (p.selection?.genre === genre && p.selection.index === k ? "choisi" : "");

  // Graduations : une par seconde, chiffre toutes les 5 s (ou 1 s si zoomé)
  const pas = p.pps >= 60 ? 1 : 5;
  const graduations = Array.from({ length: Math.ceil(total) + 1 }, (_, i) => i);
  const plansVus = plansAffiches(p.recette.plans, p.etat?.plans);
  const blocs = blocsMusique(p.recette);
  const z = (v?: number) => (v ?? 1).toFixed(2).replace(".", ",");
  const f = facteurPistes(p.hauteur);

  return (
    <div className="timeline" ref={zone}>
      <div className="tl-contenu" style={{ width: largeur + GAUCHE }}>
        <div className="tl-regle" style={{ marginLeft: GAUCHE }} onPointerDown={(e) => p.allerA(tempsDe(e.clientX))}>
          {graduations.map((s) => (
            <div key={s} className={`tl-grad ${s % pas === 0 ? "fort" : ""}`} style={{ left: x(s) }}>
              {s % pas === 0 && <span>{formatTemps(s).replace(/,00$/, "")}</span>}
            </div>
          ))}
        </div>
        {PISTES.map((piste) => {
          const genre = piste.depot ? (piste.depot as keyof typeof TYPES_DEPOT) : null;
          return (
            <div key={piste.cle} className={`tl-piste piste-${piste.cle}`} style={{ height: Math.round(piste.h * f) }}
              onDragOver={genre ? (e) => {
                if (e.dataTransfer.types.includes(TYPES_DEPOT[genre])) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
              } : undefined}
              onDrop={genre ? (e) => {
                e.preventDefault();
                const v = e.dataTransfer.getData(TYPES_DEPOT[genre]);
                if (v) p.deposer(genre, v, tempsDe(e.clientX));
              } : undefined}
              onPointerDown={() => p.choisir(null)}>
              <div className="tl-nom">{piste.nom}</div>
              <div className="tl-blocs" style={{ left: GAUCHE }}>
                {/* Morceaux : bords à tirer (comme CapCut) pour rogner ou récupérer du brut retiré ; une pastille « +2,2 s »
                    montre le brut récupérable (0,5 s ou plus) et le récupère d'un clic (15 oct. 2026 : « Coupé ! » de Brice) */}
                {piste.cle === "video" && morceaux(p.recette).map((m, k) => {
                  const brut = brutRetire(p.recette, k, p.dureeSource);
                  const s = (v: number) => v.toFixed(1).replace(".", ",");
                  const recuperer = (e: React.PointerEvent, cote: "debut" | "fin") => {
                    e.stopPropagation();
                    p.choisir({ genre: "plage", index: k });
                    const o = p.debutGlisser();
                    const pl = o.plages[k];
                    p.pendantGlisser(rognerPlage(o, k, cote, cote === "debut" ? pl.debut - brut.avant : pl.fin + brut.apres, p.dureeSource));
                    p.finGlisser();
                  };
                  return (
                    <div key={k} className={`bloc plage ${choisi("plage", k)}`}
                      style={{ left: x(m.sortie), width: Math.max(4, x(m.duree) - 2) }}
                      onPointerDown={(e) => { e.stopPropagation(); p.choisir({ genre: "plage", index: k }); }}
                      title={`Morceau ${k + 1} : ${m.debut.toFixed(2)} à ${m.fin.toFixed(2)} s de la source. Tirer un bord pour couper plus tôt ou récupérer du brut retiré (Suppr : le retirer)`}>
                      <div className={`poignee g plage-bord${brut.avant >= 0.5 ? " reserve" : ""}`} title={brut.avant > 0 ? `Tirer vers la gauche : ${s(brut.avant)} s de brut retiré à récupérer` : "Tirer vers la droite pour couper plus tard"}
                        onPointerDown={(e) => glisser(e, (o, dt) => rognerPlage(o, k, "debut", o.plages[k].debut + dt, p.dureeSource), { genre: "plage", index: k })} />
                      {brut.avant >= 0.5 && <button className="brut-retire g" onPointerDown={(e) => recuperer(e, "debut")}
                        title={`${s(brut.avant)} s de brut retiré avant ce morceau : cliquer pour tout récupérer, ou tirer le bord`}>◂ +{s(brut.avant)} s</button>}
                      <span>{k + 1} · {formatTemps(m.debut)} à {formatTemps(m.fin)}</span>
                      {brut.apres >= 0.5 && <button className="brut-retire d" onPointerDown={(e) => recuperer(e, "fin")}
                        title={`${s(brut.apres)} s de brut retiré après ce morceau : cliquer pour tout récupérer, ou tirer le bord`}>+{s(brut.apres)} s ▸</button>}
                      <div className={`poignee d plage-bord${brut.apres >= 0.5 ? " reserve" : ""}`} title={brut.apres > 0 ? `Tirer vers la droite : ${s(brut.apres)} s de brut retiré à récupérer` : "Tirer vers la gauche pour couper plus tôt"}
                        onPointerDown={(e) => glisser(e, (o, dt) => rognerPlage(o, k, "fin", o.plages[k].fin + dt, p.dureeSource), { genre: "plage", index: k })} />
                    </div>
                  );
                })}
                {piste.cle === "video" && (p.etat?.coupes || []).map((c, k) => <div key={`k${k}`} className="coupe" style={{ left: x(c) }} title="Coupe" />)}
                {/* Zooms (batch 3b) : chaque plan zoomé est un bloc (IA ou Hugues) ; le cadrage de base (1,0) n'en est pas un */}
                {piste.cle === "zooms" && p.recette.plans.map((pl, k) => {
                  if (estBase(pl)) return <div key={k} className="bloc plan base" style={{ left: x(pl.debut), width: Math.max(3, x(pl.fin - pl.debut) - 1) }} title="Cadrage de base (1,0) : aucun zoom" />;
                  const vu = plansVus[k];
                  const dezoome = vu && (vu.zoom_de !== pl.zoom_de || vu.zoom_a !== pl.zoom_a);
                  const glisse = pl.mouvement === "glisse" && pl.zoom_de !== pl.zoom_a;
                  const choix = { genre: "plan" as const, index: k };
                  return (
                    <div key={k} className={`bloc plan ${pl.modele ? "modele" : ""} ${pl.bloque ? "avis" : ""} ${choisi("plan", k)}`}
                      style={{ left: x(pl.debut), width: Math.max(3, x(pl.fin - pl.debut) - 1) }}
                      onPointerDown={(e) => glisser(e, (o, dt) => deplacerZoom(o, k, o.plans[k].debut + dt), choix)}
                      title={`Zoom ${z(pl.zoom_de)} → ${z(pl.zoom_a)} (${pl.mouvement === "glisse" ? "glisse" : "coupe"}) : glisser pour déplacer, poignées pour étirer, Suppr pour retirer${dezoome ? ` ; le moteur le dézoome pendant une carte (${z(vu.zoom_de)} → ${z(vu.zoom_a)})` : ""}`}>
                      <div className="poignee g" onPointerDown={(e) => glisser(e, (o, dt) => etirerZoom(o, k, "debut", o.plans[k].debut + dt), choix)} />
                      <span>{glisse ? `${z(pl.zoom_de)}→${z(pl.zoom_a)}` : z(pl.zoom_de)}{dezoome ? " ↓" : ""}</span>
                      <div className="poignee d" onPointerDown={(e) => glisser(e, (o, dt) => etirerZoom(o, k, "fin", o.plans[k].fin + dt), choix)} />
                    </div>
                  );
                })}
                {piste.cle === "cartes" && p.recette.cartes.map((c, k) => {
                  const t = c.type || "texte";
                  const etatPb = pb(k);
                  return (
                    <div key={`${c.id}-${k}`} className={`bloc carte ${p.graphiques.includes(t) ? "graphique" : ""} ${etatPb || ""} ${choisi("carte", k)}`}
                      style={{ left: x(c.debut), width: Math.max(10, x(c.duree) - 2) }}
                      onPointerDown={(e) => glisser(e, (o, dt) => deplacerCarte(o, k, o.cartes[k].debut + dt), { genre: "carte", index: k })}>
                      <span className="type">{p.noms[t] || t}{etatPb === "erreur" ? " ⚠" : ""}</span>
                      <span className="texte">{(c.lignes || []).join(" ") || (c.elements || []).map((e) => e.texte).join(", ")}</span>
                      {(c.elements || []).map((el, i) => el.a !== undefined && (
                        <div key={i} className="repere-element" style={{ left: x(el.a) }} title={`${el.texte} : ${el.a.toFixed(2)} s`} />
                      ))}
                      {/* durée libre (la règle de durée du type est un avertissement) */}
                      <div className="poignee d" onPointerDown={(e) => glisser(e, (o, dt) => etirerCarte(o, k, o.cartes[k].duree + dt, [0.8, 30]), { genre: "carte", index: k })} />
                    </div>
                  );
                })}
                {piste.cle === "sous_titres" && (p.etat?.sous_titres.groupes || []).map((g, k) => (
                  <div key={k} className={`bloc st ${choisi("sous_titre", k)}`}
                    style={{ left: x(g.debut), width: Math.max(4, x(g.fin - g.debut) - 1) }}
                    onPointerDown={(e) => { e.stopPropagation(); p.choisir({ genre: "sous_titre", index: k }); p.allerA(g.debut + 0.05); }}
                    title={g.affiche}>
                    <span>{g.affiche}</span>
                  </div>
                ))}
                {piste.cle === "sons" && (p.recette.sons || []).map((s, k) => (
                  <div key={k} className={`bloc son ${choisi("son", k)}`}
                    style={{ left: x(s.debut), width: Math.max(26, x(0.8)) }}
                    onPointerDown={(e) => glisser(e, (o, dt) => deplacerSon(o, k, o.sons![k].debut + dt), { genre: "son", index: k })}
                    title={`${s.fichier}${s.volume_db ? ` (${s.volume_db > 0 ? "+" : ""}${s.volume_db} dB)` : ""}`}>
                    <span>♪ {nomSon(s.fichier)}</span>
                  </div>
                ))}
                {/* Musique (batch 4b) : glisser = déplacer ; Alt + glisser = choisir la partie de la chanson ; bords =
                    rogner ; triangles des coins hauts = fondus. Avant, le bloc ne faisait que se choisir : rien ne le déplaçait. */}
                {piste.cle === "musique" && blocs.map((b, k) => {
                  const choix = { genre: "musique" as const, index: k };
                  const duree = p.dureesChansons?.[b.fichier];
                  const [fi, fo] = fondus(b);
                  return (
                    <div key={k} className={`bloc musique ${choisi("musique", k)}`}
                      style={{ left: x(b.debut), width: Math.max(20, x(b.fin - b.debut) - 1) }}
                      onPointerDown={(e) => (e.altKey
                        ? glisser(e, (o, dt) => glisserContenu(o, k, (blocsMusique(o)[k].decalage ?? 0) - dt, duree), choix)
                        : glisser(e, (o, dt) => deplacerMusique(o, k, blocsMusique(o)[k].debut + dt), choix))}
                      title={`${b.fichier} · ${b.volume_db ?? -23} dB sous la voix · début dans la chanson ${(b.decalage ?? 0).toFixed(1).replace(".", ",")} s · fondus ${fi} / ${fo} s\nGlisser : déplacer · Alt + glisser : choisir la partie de la chanson · bords : rogner · triangles : fondus`}>
                      <OndeBloc b={b} onde={p.ondes?.[b.fichier]} duree={duree} pps={p.pps} h={Math.round(30 * f) - 6} />
                      <div className="poignee g" onPointerDown={(e) => glisser(e, (o, dt) => rognerMusique(o, k, "debut", blocsMusique(o)[k].debut + dt), choix)} />
                      <span>♫ {nomSon(b.fichier)} · {b.volume_db ?? -23} dB</span>
                      <div className="fondu-poignee g" style={{ left: Math.min(x(fi), x(b.fin - b.debut) - 12) }} title={`Fondu d'entrée : ${fi} s (tirer)`}
                        onPointerDown={(e) => glisser(e, (o, dt) => reglerMusique(o, k, "fondu_entree", fondus(blocsMusique(o)[k])[0] + dt), choix)} />
                      <div className="fondu-poignee d" style={{ right: Math.min(x(fo), x(b.fin - b.debut) - 12) }} title={`Fondu de sortie : ${fo} s (tirer)`}
                        onPointerDown={(e) => glisser(e, (o, dt) => reglerMusique(o, k, "fondu_sortie", fondus(blocsMusique(o)[k])[1] - dt), choix)} />
                      <div className="poignee d" onPointerDown={(e) => glisser(e, (o, dt) => rognerMusique(o, k, "fin", blocsMusique(o)[k].fin + dt), choix)} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="tl-tete" style={{ left: GAUCHE + x(p.temps) }} />
      </div>
    </div>
  );
};
