// Copie de video-neo/labo/timeline/src/Montage.tsx, retouchée pour le hub par scripts/synchro-timeline.mjs : ne pas modifier à la main.
// Composition du Player : vidéo et voix de la source (proxy non zoomé, zooms appliqués en direct), sons, musique,
// sous-titres et cartes. Graphiques : dessinés en direct par les composants de labo/graphiques. Cartes
// Python : PNG du moteur (cache) ; carte chiffre avec photo : animée (photo de l'équipe, compteur qui défile).
import React from "react";
import { AbsoluteFill, Html5Audio, Html5Video, Img, Sequence, useCurrentFrame } from "remotion";
import { Graphique } from "./graphiques/Graphique";
import type { PropsGraphique } from "./graphiques/commun";
import calqueFacebook from "./reperes/facebook.png";
import calqueInstagram from "./reperes/instagram.png";
import { FPS, ZONES_INTERFACE, boiteCarte, db, gainMusique, parleA, pistesAudio, cadrage, img, morceauxLecture, planA, plansAffiches, type Cadre as CadreSource, type Plan, type Recette, type Reseau } from "./logique";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Glyphe = { sx: number; l: number; t: number; r: number; b: number };
export type Compteur = {
  fond: string; sprite: string; glyphes: Record<string, Glyphe>; valeur: number; droite: number; base_y: number;
  case: number; blanc: number; nb: number; px3: number; debut_compte: number; duree_compte: number; h: number;
};
export type InfoCarte = {
  index: number; type: string; texte: string; erreur: string | null; haut?: number; w?: number; h?: number; x?: number;
  cx?: number; manuelle?: boolean; ajustement?: number; png?: string; props?: PropsGraphique; compteur?: Compteur;
  verre?: { flou: number; saturation: number; arrondi: number };
};
export type Etat = {
  total: number; morceaux: any[]; coupes: number[]; cartes: InfoCarte[]; plans: Plan[];
  sous_titres: { groupes: { texte: string; affiche: string; source: number; debut: number; fin: number; cles: string[]; largeur?: number }[]; ecrits: boolean; hauteur: number; taille?: number; mots_cles: string[] };
  visage: [number, number, number][]; regles: { marge_menton: number; bas_texte: number; bas_secondaire: number; hauteur: number };
  problemes: { message: string; carte: number | null; niveau: "erreur" | "avis" | "info" }[];
  duree_source?: number | null; erreur_outil?: string;
};
export type PropsMontage = {
  recette: Recette; etat: Etat | null; mode: "direct" | "apercu"; reperes: Reperes;
  versions: { apercu: number | null; base: number | null; voix: number | null };
  selection: number | null;
  proxies: Record<string, string>;   // source → adresse du proxy (vidéo en direct)
  niveaux?: Record<string, number>;  // niveau (LUFS) de chaque chanson, mesuré comme au rendu (16 oct. 2026)
  durees?: Record<string, number>;   // durée de chaque chanson (blocs de musique, batch 4b)
  // Hub : chemin du stockage privé → lien signé (undefined tant qu'il n'est pas prêt) ; son → lien signé ; aperçu rendu
  lien: (chemin?: string) => string | undefined; lienSon: (fichier: string) => string | undefined; apercu: string | null;
  versionLiens?: number;
  // Vidéo : même lien tant qu'elle marche (un nouveau src la recharge) ; echecVideo quand elle échoue (lien expiré)
  lienVideo: (chemin?: string) => string | undefined; echecVideo: (chemin?: string) => void;
};
const Liens = React.createContext<(chemin?: string) => string | undefined>(() => undefined);
export type Reperes = "aucun" | "visage" | Reseau;
export const NOMS_REPERES: Record<Reperes, string> = { aucun: "Sans repère", visage: "Visage", instagram: "Instagram", facebook: "Facebook" };
const CALQUES: Record<Reseau, string> = { instagram: calqueInstagram, facebook: calqueFacebook };

// Repères Instagram et Facebook (batch 3b) : calque transparent 1080 × 1920 au look de l'app, mesuré sur les
// captures de Hugues (reperes/fabriquer.py). Pointillés : bords de la vidéo rognés par l'app (invisibles au téléphone).
const RepereReseau: React.FC<{ reseau: Reseau }> = ({ reseau }) => {
  const [g, d] = ZONES_INTERFACE[reseau].visible;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <Img src={CALQUES[reseau]} style={{ position: "absolute", inset: 0, width: 1080, height: 1920 }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: g, background: "rgba(10,20,22,0.45)", borderRight: "3px dashed rgba(232,161,60,0.8)" }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: d, right: 0, background: "rgba(10,20,22,0.45)", borderLeft: "3px dashed rgba(232,161,60,0.8)" }} />
    </AbsoluteFill>
  );
};

const clamp = (u: number) => Math.max(0, Math.min(1, u));
const ease = (u: number) => 1 - Math.pow(1 - clamp(u), 3);

// Entrée et sortie des cartes Python (cartes.py : 0,35 s, montée de 60 px, 97 → 100 % ; sortie en fondu 0,25 s)
const entreeSortie = (t: number, duree: number) => {
  let a = 1, dy = 0, sc = 1;
  if (t < 0.35) { const e = ease(t / 0.35); a = e; dy = 60 * (1 - e); sc = 0.97 + 0.03 * e; }
  else if (t > duree - 0.25) { const u = clamp((t - (duree - 0.25)) / 0.25); a = 1 - u * u * u; }
  return { a, dy, sc };
};

// Verre dépoli (style verre ou « transparence ») : la vidéo floutée derrière la carte, par le navigateur.
// L'opacité est sur le calque flouté lui-même (une opacité sur un parent couperait le flou).
const Flou: React.FC<{ x: number; y: number; w: number; h: number; verre: NonNullable<InfoCarte["verre"]>; opacite: number }> = ({ x, y, w, h, verre, opacite }) => (
  <div style={{
    position: "absolute", left: x, top: y, width: w, height: h, borderRadius: verre.arrondi, opacity: opacite,
    backdropFilter: `blur(${verre.flou}px) saturate(${verre.saturation})`,
  }} />
);

const CartePng: React.FC<{ src: string; duree: number; info: InfoCarte }> = ({ src, duree, info }) => {
  const t = useCurrentFrame() / FPS;
  const { a, dy, sc } = entreeSortie(t, duree);
  const bas = (info.haut ?? 0) + (info.h ?? 0);
  return (
    <AbsoluteFill style={{ transform: `translateY(${dy}px) scale(${sc})`, transformOrigin: `${info.cx ?? 540}px ${bas}px` }}>
      {info.verre && info.haut !== undefined && <Flou x={info.x!} y={info.haut} w={info.w!} h={info.h!} verre={info.verre} opacite={a} />}
      <Img src={src} style={{ position: "absolute", inset: 0, width: 1080, height: 1920, opacity: a }} />
    </AbsoluteFill>
  );
};

// Carte chiffre avec photo, animée : la carte sans le chiffre (photo de l'équipe, lignes), puis le compteur
// (ease-out 0,8 s) dessiné avec les glyphes du moteur, placés comme CarteChiffre.image().
const milliers = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const CarteChiffreDirect: React.FC<{ info: InfoCarte; duree: number }> = ({ info, duree }) => {
  const t = useCurrentFrame() / FPS;
  const c = info.compteur!;
  const lien = React.useContext(Liens);
  if (!lien(c.sprite) || !lien(c.fond)) return null;
  const { a, dy, sc } = entreeSortie(t, duree);
  const v = Math.round(c.valeur * ease((t - c.debut_compte) / c.duree_compte));
  const chiffres: React.ReactNode[] = [];
  let x = c.droite, rang = 0;
  for (const ch of milliers(v).split("").reverse()) {
    if (ch === " ") { x -= c.blanc; continue; }
    rang += 1;
    const g = c.glyphes[ch];
    const gauche = rang === c.nb && c.nb > 1 ? x - c.px3 - g.r + g.l : x - c.case + (c.case - (g.r - g.l)) / 2;
    chiffres.push(
      <div key={chiffres.length} style={{ position: "absolute", left: gauche, top: c.base_y + g.t, width: g.r - g.l, height: g.b - g.t, overflow: "hidden" }}>
        <Img src={lien(c.sprite)!} style={{ position: "absolute", left: -g.sx, top: 0, maxWidth: "none" }} />
      </div>,
    );
    x -= c.case;
  }
  const bas = (info.haut ?? 0) + (info.h ?? 0);
  return (
    <AbsoluteFill style={{ transform: `translateY(${dy}px) scale(${sc})`, transformOrigin: `${info.cx ?? 540}px ${bas}px` }}>
      {info.verre && info.haut !== undefined && <Flou x={info.x!} y={info.haut} w={info.w!} h={info.h!} verre={info.verre} opacite={a} />}
      <div style={{ position: "absolute", inset: 0, opacity: a }}>
        <Img src={lien(c.fond)!} style={{ position: "absolute", inset: 0, width: 1080, height: 1920 }} />
        {chiffres}
      </div>
    </AbsoluteFill>
  );
};

// Place ou taille changée à la main (batch 4) : la carte suit tout de suite, déplacée et mise à l'échelle depuis le
// dernier placement vérifié par le moteur (coin haut gauche du corps), en attendant la nouvelle vérification.
const Decalage: React.FC<{ info: InfoCarte; boite: ReturnType<typeof boiteCarte>; children: React.ReactNode }> = ({ info, boite, children }) => {
  if (!boite || info.x === undefined || info.haut === undefined || !info.w) return <>{children}</>;
  const s = boite.w / info.w, dx = boite.x - info.x, dy = boite.y - info.haut;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(s - 1) < 0.002) return <>{children}</>;
  return (
    <AbsoluteFill style={{ transform: `translate(${dx}px, ${dy}px) scale(${s})`, transformOrigin: `${info.x}px ${info.haut}px` }}>
      {children}
    </AbsoluteFill>
  );
};

const Refusee: React.FC<{ texte: string; message: string }> = ({ texte, message }) => (
  <div style={{
    position: "absolute", left: 120, right: 120, top: 860, padding: 40, borderRadius: 40, border: "6px dashed #FF6B5B",
    background: "rgba(10,20,22,0.82)", color: "#F5F2EC", fontFamily: "Satoshi, sans-serif", fontSize: 40, lineHeight: 1.25,
  }}>
    <div style={{ color: "#FF6B5B", fontWeight: 700, marginBottom: 12 }}>Carte impossible à dessiner</div>
    <div style={{ fontWeight: 700 }}>{texte}</div>
    <div style={{ fontSize: 32, opacity: 0.85, marginTop: 10 }}>{message}</div>
  </div>
);

class GardeGraphique extends React.Component<{ texte: string; children: React.ReactNode }, { erreur: string | null }> {
  state = { erreur: null as string | null };
  static getDerivedStateFromError(e: Error) { return { erreur: e.message }; }
  render() { return this.state.erreur ? <Refusee texte={this.props.texte} message={this.state.erreur} /> : this.props.children; }
}

const SousTitres: React.FC<{ etat: Etat; recette: Recette }> = ({ etat, recette }) => {
  const t = useCurrentFrame() / FPS;
  if (recette.sous_titres?.actifs === false) return null;
  if (recette.cartes.some((c) => t >= c.debut && t < c.debut + c.duree)) return null; // jamais pendant une carte
  const g = etat.sous_titres.groupes.find((x) => t >= x.debut && t < Math.max(x.fin, x.debut + 0.5));
  if (!g) return null;
  const cles = new Set(g.cles.map((m) => m.toLowerCase()));
  return (
    <div style={{
      position: "absolute", left: 60, right: 60, top: etat.sous_titres.hauteur - 50, textAlign: "center",
      fontFamily: "Montserrat NEO, sans-serif", fontWeight: 800, fontSize: 66, letterSpacing: -1.3, color: "#FFFFFF",
      textShadow: "0 4px 18px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.6)", whiteSpace: "nowrap",
    }}>
      {g.affiche.split(" ").map((m, i) => (
        <span key={i} style={{ color: cles.has(m.toLowerCase()) ? "#00BBB1" : undefined }}>{(i ? " " : "") + m}</span>
      ))}
    </div>
  );
};

const RepereVisage: React.FC<{ etat: Etat; recette: Recette; selection: number | null }> = ({ etat, recette, selection }) => {
  const t = useCurrentFrame() / FPS;
  const v = etat.visage.reduce<[number, number, number] | null>((acc, x) => (x[0] <= t + 1e-6 ? x : acc), null);
  const r = etat.regles;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {v && (
        <>
          <div style={{ position: "absolute", left: 0, right: 0, top: v[1], height: v[2] - v[1], background: "rgba(255,107,91,0.18)", borderTop: "4px solid rgba(255,107,91,0.8)", borderBottom: "4px solid rgba(255,107,91,0.8)" }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: v[2] + r.marge_menton, borderTop: "4px dashed #FF6B5B" }} />
          <div style={{ position: "absolute", left: 20, top: v[2] + r.marge_menton + 8, color: "#FF6B5B", fontSize: 30, fontFamily: "Satoshi, sans-serif", fontWeight: 700 }}>menton + {r.marge_menton} px</div>
        </>
      )}
      <div style={{ position: "absolute", left: 0, right: 0, top: r.bas_texte * r.hauteur, borderTop: "3px dashed rgba(0,187,177,0.9)" }} />
      <div style={{ position: "absolute", left: 20, top: r.bas_texte * r.hauteur + 6, color: "#00BBB1", fontSize: 28, fontFamily: "Satoshi, sans-serif", fontWeight: 700 }}>65 % (bas du texte)</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: r.bas_secondaire * r.hauteur, borderTop: "3px dotted rgba(0,187,177,0.7)" }} />
      {etat.cartes.map((c, k) => {
        const rc = recette.cartes[k];
        const b = rc ? boiteCarte(rc, c) : null;
        if (!rc || !b || t < rc.debut || t >= rc.debut + rc.duree) return null;
        return <div key={k} style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, border: `4px solid ${k === selection ? "#F5F2EC" : "rgba(245,242,236,0.5)"}`, borderRadius: 12 }} />;
      })}
    </AbsoluteFill>
  );
};

// Vidéo en direct (batch 3b) : part toujours de la SOURCE non zoomée (proxy léger du brut, même étalonnage que le
// moteur), morceau par morceau, et applique elle-même le zoom de chaque plan avec le cadrage du moteur (cadrage() =
// zoompan d'image.construire). Jamais de zoom posé sur un aperçu déjà rendu : une coupe ou un rognage est suivi tout
// de suite. Le zoom est une transformation GPU calculée à chaque image (30 i/s, sans bord noir).
const Cadre: React.FC<{ plans: Plan[]; cadre: CadreSource; debut: number; children: React.ReactNode }> = ({ plans, cadre, debut, children }) => {
  const t = debut + useCurrentFrame() / FPS;
  const c = cadrage(planA(plans, t), t, cadre);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ transformOrigin: "0 0", willChange: "transform",
        transform: `scale(${c.z}) translate(${-c.x * 1080}px, ${-c.y * 1920}px)` }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Média illisible (lien expiré, réseau) : signalé, jamais d'erreur levée (Remotion ferait planter le lecteur en noir).
const mediaIllisible = (quoi: string) => (e: Error) => console.warn(`Timeline : ${quoi} illisible`, e.message);

// Vidéo qui échoue : onErreur(source) laisse le hub lui redonner un lien ; le lecteur reprend au même moment.
const VideoSource: React.FC<{ recette: Recette; plans: Plan[]; proxies: Record<string, string>; onErreur?: (source: string) => void }> = ({ recette, plans, proxies, onErreur }) => (
  <>
    {morceauxLecture(recette).map((m, k) => {
      const src = proxies[m.source];
      const cadre = recette.sources?.[m.source]?.cadre || {};
      const n = Math.max(1, img(m.sortie + m.duree) - img(m.sortie));
      return (
        <Sequence key={`${k}-${m.source}-${img(m.debut)}`} from={img(m.sortie)} durationInFrames={n} premountFor={FPS}>
          <Cadre plans={plans} cadre={cadre as CadreSource} debut={img(m.sortie) / FPS}>
            {src ? <Html5Video src={src} trimBefore={img(m.debut)} style={{ width: 1080, height: 1920, objectFit: "cover" }} acceptableTimeShiftInSeconds={0.25}
              onError={(e) => { mediaIllisible(`vidéo ${m.source}`)(e); onErreur?.(m.source); }} />
              : <AbsoluteFill style={{ display: "grid", placeItems: "center", color: "#9FB0AE", fontSize: 40, fontFamily: "Satoshi, sans-serif" }}>Préparation de la vidéo source…</AbsoluteFill>}
          </Cadre>
        </Sequence>
      );
    })}
  </>
);

export const Montage: React.FC<PropsMontage> = ({ recette, etat, mode, reperes, selection, proxies, durees, niveaux, lien, lienSon, apercu, lienVideo, echecVideo }) => {
  if (mode === "apercu") {
    return apercu ? <Html5Video src={apercu} /> : <AbsoluteFill style={{ background: "#0A1416" }} />;
  }
  const plans = plansAffiches(recette.plans, etat?.plans); // dézooms du moteur compris, si l'état est à jour
  const parle = (t: number) => parleA(etat?.sous_titres.groupes || [], t);
  const pistes = pistesAudio(recette, durees);
  const liens = Object.fromEntries(Object.entries(proxies).map(([k, v]) => [k, lienVideo(v)]).filter(([, v]) => v)) as Record<string, string>;
  return (
    <Liens.Provider value={lien}><AbsoluteFill style={{ background: "#0A1416" }}>
      <VideoSource recette={recette} plans={plans} proxies={liens} onErreur={(s) => echecVideo(proxies[s])} />
      {/* Chaque son occupe une balise audio le temps de son fichier seulement (pistesAudio, 19 oct. 2026). */}
      {pistes.sons.map(({ k, de, n }) => { const s = recette.sons![k]; return !lienSon(s.fichier) ? null : (
        <Sequence key={`s${k}`} from={de} durationInFrames={n} layout="none">
          <Html5Audio src={lienSon(s.fichier)!} volume={() => Math.min(1, 0.35 * db(s.volume_db ?? 0))}
            onError={mediaIllisible(s.fichier)} />
        </Sequence>
      ); })}
      {/* Musique (batch 4b) : chaque bloc joue la chanson à partir de son décalage (puis en boucle depuis le début,
          comme -stream_loop du moteur), à son volume sous la voix, avec ses fondus linéaires (afade) et la baisse de
          4 dB quand la voix parle : gainMusique, même calcul que le rendu. Un Html5Audio par morceau de chanson joué. */}
      {pistes.musique.map(({ k, j, bloc: b, depuis, de, n }) => !lienSon(b.fichier) ? null : (
        <Sequence key={`m${k}-${j}-${b.fichier}`} from={de} durationInFrames={n} layout="none">
          <Html5Audio src={lienSon(b.fichier)!} trimBefore={img(depuis)}
            volume={(f) => {
              const t = (de + f) / FPS;
              return gainMusique(b, t, niveaux?.[b.fichier], parle(t));
            }} onError={mediaIllisible(b.fichier)} />
        </Sequence>
      ))}
      {etat && <SousTitres etat={etat} recette={recette} />}
      {recette.cartes.map((c, k) => {
        const brut = etat?.cartes[k];
        const info = brut && brut.type === (c.type || "texte") ? brut : undefined; // état du moteur pas encore à jour
        const n = Math.max(1, img(c.duree));
        return (
          <Sequence key={`c${k}-${c.id}`} from={img(c.debut)} durationInFrames={n}>
            {info && <Decalage info={info} boite={boiteCarte(c, info)}>{info.props ? (
              <GardeGraphique texte={info.texte || c.type || "graphique"}><Graphique {...info.props} duree={c.duree} n={n} apercuFlou /></GardeGraphique>
            ) : info.compteur ? (
              <CarteChiffreDirect info={info} duree={c.duree} />
            ) : info.png ? (
              lien(info.png) ? <CartePng src={lien(info.png)!} duree={c.duree} info={info} /> : null
            ) : info.erreur ? (
              <Refusee texte={info.texte || c.type || "carte"} message={info.erreur} />
            ) : null}</Decalage>}
          </Sequence>
        );
      })}
      {reperes === "visage" && etat && <RepereVisage etat={etat} recette={recette} selection={selection} />}
      {(reperes === "instagram" || reperes === "facebook") && <RepereReseau reseau={reperes} />}
    </AbsoluteFill></Liens.Provider>
  );
};
