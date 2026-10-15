// Copie de video-neo/labo/timeline/src/App.tsx, retouchée pour le hub par scripts/synchro-timeline.mjs : ne pas modifier à la main.
// Timeline du labo : montage du moteur recette, édité comme dans CapCut. Le moteur reste la référence :
// chaque modification est revérifiée par lui (place sous le menton, 34 px, rendu possible), « Appliquer » rend l'aperçu.
// Hugues décide (batch 3) : les règles de rythme et de goût sont des avertissements jaunes, jamais bloquants ; seules
// les limites techniques sont en rouge. Le brouillon est sauvé à chaque geste.
import { Player, type PlayerRef } from "@remotion/player";
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Source } from "./source";
import { Inspecteur, type InfosModeles } from "./Inspecteur";
import { Montage, NOMS_REPERES, type Etat, type PropsMontage, type Reperes } from "./Montage";
import { TYPES_DEPOT, Timeline, type Onde, type Selection } from "./Timeline";
import {
  FPS, Historique, SON_PAR_TYPE, ZOOMS, ajouterCarte, avertissementsInterface, ajouterSon, basculerHauteurTimeline, boiteCarte,
  bornerHauteurTimeline, copie, couperPlage, dureeTotale, ecrireHauteurTimeline, formatTemps, fusionner, gardeFous, img,
  lireHauteurTimeline, nomSon, placerCarte, poserMusique, poserZoom, reglerTaille, supprimerCarte, supprimerPlage, blocsMusique,
  couperMusique, musiqueA, supprimerMusique,
  supprimerZoom, type Carte, type Recette,
} from "./logique";

type SonBib = { fichier: string; categorie: string; duree: number; usage?: string };
type Modeles = {
  types: Record<string, string>; graphiques: string[]; modeles: Record<string, Carte>; styles: string[];
  sons: SonBib[]; durees: Record<string, [number, number]>; elements: Record<string, [number, number]>;
  transparences: string[]; transparence_defaut?: string; volume_son: [number, number]; erreur_outil?: string;
};
type Versions = PropsMontage["versions"];
type Travail = { type: string; etat: "en_cours" | "fini" | "erreur"; journal: string[]; debut: number; fin: number | null; resultat: any } | null; // eslint-disable-line @typescript-eslint/no-explicit-any


// Préférences d'affichage gardées dans le navigateur (jamais bloquant si le stockage est refusé)
const stockage = (): Storage | null => { try { return window.localStorage; } catch { return null; } };
const lirePref = (cle: string, defaut: boolean) => { try { const v = stockage()?.getItem(cle); return v === null || v === undefined ? defaut : v === "1"; } catch { return defaut; } };
const ecrirePref = (cle: string, v: boolean) => { try { stockage()?.setItem(cle, v ? "1" : "0"); } catch { /* rien */ } };

// Poignées de la carte choisie, posées sur le lecteur (batch 4) : glisser pour la déplacer, tirer le coin pour la
// réduire ou l'agrandir. Visible seulement en direct, quand la carte est à l'écran.
const PoigneesCarte: React.FC<{
  recette: Recette; etat: Etat | null; k: number; temps: number; echelle: number;
  debut: () => Recette; pendant: (r: Recette) => void; fin: () => void;
}> = ({ recette, etat, k, temps, echelle, debut, pendant, fin }) => {
  const c = recette.cartes[k];
  const info = etat?.cartes[k];
  const b = c ? boiteCarte(c, info) : null;
  if (!c || !b || !info || temps < c.debut || temps >= c.debut + c.duree) return null;
  const tirer = (e: React.PointerEvent, coin: boolean) => {
    e.stopPropagation();
    e.preventDefault();
    const cible = e.currentTarget as HTMLElement;
    cible.setPointerCapture(e.pointerId);
    const x0 = e.clientX, y0 = e.clientY;
    const t0 = c.place?.taille ?? info.ajustement ?? 1;
    const manuelle = c.place?.x !== undefined || c.place?.y !== undefined;
    let orig: Recette | null = null;
    const bouger = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / echelle, dy = (ev.clientY - y0) / echelle;
      if (!orig && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return;
      orig ||= debut();
      if (!coin) { pendant(placerCarte(orig, k, b.x + b.w / 2 + dx, b.y + dy, b.w, b.h)); return; }
      // coin bas droit : la largeur suit la souris, le coin haut gauche reste en place si la place est manuelle
      const r = reglerTaille(orig, k, (t0 * Math.max(40, b.w + dx)) / b.w);
      const w = (b.w * r.cartes[k].place!.taille!) / t0;
      pendant(manuelle ? placerCarte(r, k, b.x + w / 2, b.y, w, (b.h * w) / b.w) : r);
    };
    const lacher = () => {
      cible.removeEventListener("pointermove", bouger);
      cible.removeEventListener("pointerup", lacher);
      cible.removeEventListener("pointercancel", lacher);
      if (orig) fin();
    };
    cible.addEventListener("pointermove", bouger);
    cible.addEventListener("pointerup", lacher);
    cible.addEventListener("pointercancel", lacher);
  };
  return (
    <div className="poignee-carte" style={{ left: b.x * echelle, top: b.y * echelle, width: b.w * echelle, height: b.h * echelle }}
      onPointerDown={(e) => tirer(e, false)} title="Glisser pour déplacer la carte (la position devient manuelle)">
      <div className="coin" onPointerDown={(e) => tirer(e, true)} title="Tirer pour réduire ou agrandir" />
    </div>
  );
};

const NOMS_CATEGORIES: Record<string, string> = {
  transitions: "Transitions", texte: "Texte", impacts: "Impacts", interface: "Interface", ambiance: "Ambiance",
  humain: "Humain", "argent-resultat": "Argent et résultat",
};

// Hub : « source » remplace le serveur local du labo ; « extra » ajoute les boutons du hub (retour, Terminer).
export const App: React.FC<{ source: Source; extra?: (o: { brouillon: boolean; enCours: boolean }) => React.ReactNode }> = ({ source, extra }) => {
  const [recette, setRecette] = useState<Recette | null>(null);
  const [etat, setEtat] = useState<Etat | null>(null);
  const [modeles, setModeles] = useState<Modeles | null>(null);
  const [versions, setVersions] = useState<Versions>({ apercu: null, base: null, voix: null });
  const [proxies, setProxies] = useState<Record<string, string>>({});
  const [selection, setSelection] = useState<Selection>(null);
  const [temps, setTemps] = useState(0);
  const [pps, setPps] = useState(56);
  const [mode, setMode] = useState<"direct" | "apercu">("direct");
  const [reperes, setReperes] = useState<Reperes>("aucun");
  const [verif, setVerif] = useState(false);
  const [travail, setTravail] = useState<Travail>(null);
  const [ia, setIa] = useState(false);
  const [demande, setDemande] = useState("");
  const [plagesRendues, setPlagesRendues] = useState("");
  const [brouillon, setBrouillon] = useState(false);
  const [tiroir, setTiroir] = useState(false);   // garde-fous en tiroir (batch 4)
  const [ecoute, setEcoute] = useState<string | null>(null);
  const [, rafraichir] = useState(0);
  const versionLiens = useSyncExternalStore(source.abonner, source.version);   // liens signés renouvelés
  // Batch 4 : timeline plus haute (38 % de l'écran par défaut), hauteur mémorisée ; palette et inspecteur repliables
  const [hTimeline, setHTimeline] = useState(() => lireHauteurTimeline(stockage(), window.innerHeight));
  const [palette, setPalette] = useState(() => lirePref("neo-timeline-palette", true));
  const [inspecteur, setInspecteur] = useState(() => lirePref("neo-timeline-inspecteur", true));
  useEffect(() => ecrireHauteurTimeline(stockage(), hTimeline), [hTimeline]);
  useEffect(() => ecrirePref("neo-timeline-palette", palette), [palette]);
  useEffect(() => ecrirePref("neo-timeline-inspecteur", inspecteur), [inspecteur]);
  useEffect(() => {
    const f = () => setHTimeline((h) => bornerHauteurTimeline(h, window.innerHeight));
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  // Lecteur 9:16 aussi grand que sa zone le permet (mesurée : elle grandit quand on replie une colonne)
  const zoneLecteur = useRef<HTMLDivElement>(null);
  const [hLecteur, setHLecteur] = useState(400);
  useEffect(() => {
    const z = zoneLecteur.current;
    if (!z) return;
    const o = new ResizeObserver(() => {
      const h = z.clientHeight - 44, w = z.clientWidth - 8;
      setHLecteur(Math.max(200, Math.floor(Math.min(h, (w * 16) / 9))));
    });
    o.observe(z);
    return () => o.disconnect();
  }, [Boolean(recette && modeles)]); // eslint-disable-line react-hooks/exhaustive-deps
  const separateur = (e: React.PointerEvent) => {
    e.preventDefault();
    const cible = e.currentTarget as HTMLElement;
    cible.setPointerCapture(e.pointerId);
    const y0 = e.clientY, h0 = hTimeline;
    const bouger = (ev: PointerEvent) => setHTimeline(bornerHauteurTimeline(h0 - (ev.clientY - y0), window.innerHeight));
    const lacher = () => { cible.removeEventListener("pointermove", bouger); cible.removeEventListener("pointerup", lacher); };
    cible.addEventListener("pointermove", bouger);
    cible.addEventListener("pointerup", lacher);
  };
  // Musique (batch 4b) : durée de chaque chanson (bibliothèque) et forme d'onde (outil.py onde, mise en cache)
  const [ondes, setOndes] = useState<Record<string, Onde>>({});
  const dureesChansons = useMemo(() => Object.fromEntries((modeles?.sons || []).map((s) => [s.fichier, s.duree])), [modeles]);
  const fichiersMusique = recette ? [...new Set(blocsMusique(recette).map((b) => b.fichier))].sort().join("|") : "";
  useEffect(() => {
    for (const f of fichiersMusique.split("|").filter(Boolean)) {
      if (ondes[f]) continue;
      source.onde(f).then((o) => {
        if (o && Array.isArray(o.pics)) setOndes((x) => ({ ...x, [f]: o }));
      });
    }
  }, [fichiersMusique]); // eslint-disable-line react-hooks/exhaustive-deps
  const hist = useRef(new Historique());
  const derniere = useRef({ cle: "", t: 0 });
  const player = useRef<PlayerRef>(null);
  const demandeVerif = useRef(0);
  const sauvee = useRef("");          // recette telle que sauvée (montage ou brouillon) : rien à resauver
  const audio = useRef<HTMLAudioElement | null>(null);

  // ---------------------------------------------------------------- chargement
  const charger = useCallback(async (garderHistorique: boolean) => {
    const m = await source.montage();
    if (garderHistorique && recette) hist.current.noter(recette);
    sauvee.current = JSON.stringify(m.recette);
    setRecette(m.recette);
    setVersions(m.medias);
    setBrouillon(Boolean(m.brouillon));
    setProxies(m.proxies || {});
    setPlagesRendues(JSON.stringify(m.plages_rendues || m.recette.plages));
  }, [recette]);

  useEffect(() => {
    charger(false);
    source.modeles().then(setModeles);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Proxy de la source (vidéo en direct) : fait une fois par le serveur, en arrière-plan (15 à 30 s la 1re fois)
  const sources = JSON.stringify(Object.keys(recette?.sources || {}));
  useEffect(() => {
    const manque = (JSON.parse(sources) as string[]).some((k) => !proxies[k]);
    if (!recette || !manque) return;
    const minuterie = setInterval(async () => {
      const p = await source.proxies();
      if (Object.keys(p.proxies || {}).length) setProxies(p.proxies);
      if (!p.en_cours) clearInterval(minuterie);
    }, 2000);
    return () => clearInterval(minuterie);
  }, [sources, proxies, Boolean(recette)]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- vérification par le moteur (en direct)
  useEffect(() => {
    if (!recette) return;
    const id = ++demandeVerif.current;
    setVerif(true);
    const minuterie = setTimeout(async () => {
      const e = await source.verifier(recette);
      if (id !== demandeVerif.current) return;
      setVerif(false);
      if (!e.erreur_outil) setEtat(e);
      else setEtat((avant) => (avant ? { ...avant, erreur_outil: e.erreur_outil } : null));
    }, 350);
    return () => clearTimeout(minuterie);
  }, [recette]);

  // ---------------------------------------------------------------- brouillon sauvé à chaque geste
  useEffect(() => {
    if (!recette) return;
    const s = JSON.stringify(recette);
    if (s === sauvee.current) return;
    const minuterie = setTimeout(async () => {
      await source.sauver(recette);
      sauvee.current = s;
      setBrouillon(true);
    }, 250);
    return () => clearTimeout(minuterie);
  }, [recette]);

  const revenir = useCallback(async () => {
    if (!recette || !confirm("Jeter le brouillon et revenir au dernier aperçu rendu ? (⌘Z le reprend ensuite)")) return;
    await source.jeter();
    await charger(true);
    setSelection(null);
  }, [recette, charger]);

  // ---------------------------------------------------------------- modifications et historique
  const modifier = useCallback((r: Recette, cle = "") => {
    if (!recette) return;
    const maintenant = Date.now();
    if (!cle || cle !== derniere.current.cle || maintenant - derniere.current.t > 1500) hist.current.noter(recette);
    derniere.current = { cle, t: maintenant };
    setRecette(r);
  }, [recette]);

  const annuler = useCallback(() => {
    if (!recette) return;
    const r = hist.current.annuler(recette);
    if (r) { setRecette(r); derniere.current = { cle: "", t: 0 }; }
  }, [recette]);
  const retablir = useCallback(() => {
    if (!recette) return;
    const r = hist.current.retablir(recette);
    if (r) { setRecette(r); derniere.current = { cle: "", t: 0 }; }
  }, [recette]);

  const supprimer = useCallback(() => {
    if (!recette || !selection) return;
    const k = selection.index;
    if (selection.genre === "carte") modifier(supprimerCarte(recette, k));
    else if (selection.genre === "son") { const r = copie(recette); r.sons!.splice(k, 1); modifier(r); }
    else if (selection.genre === "plage") modifier(supprimerPlage(recette, k, etat?.sous_titres.groupes || []));
    else if (selection.genre === "plan") modifier(supprimerZoom(recette, k));
    else if (selection.genre === "musique") modifier(supprimerMusique(recette, k));
    else return;
    setSelection(null);
  }, [recette, selection, modifier, etat]);

  const couper = useCallback(() => {
    if (!recette) return;
    if (selection?.genre === "musique") {   // piste Musique choisie : C coupe le bloc sous la tête de lecture (batch 4b)
      const k = musiqueA(recette, temps);
      const m = couperMusique(recette, k >= 0 ? k : selection.index, temps);
      if (m) { modifier(m.recette); setSelection({ genre: "musique", index: m.index }); }
      return;
    }
    const c = couperPlage(recette, temps);
    if (!c) return;
    modifier(c.recette);
    setSelection({ genre: "plage", index: c.index });
  }, [recette, temps, modifier, selection]);

  const deposer = useCallback((genre: "carte" | "son" | "musique" | "zoom", valeur: string, t: number) => {
    if (!recette || !modeles) return;
    if (genre === "carte") {
      const modele = modeles.modeles[valeur];
      if (!modele) return;
      const { recette: r, index } = ajouterCarte(recette, modele, t);
      const son = SON_PAR_TYPE[valeur];
      const existe = modeles.sons.some((s) => s.fichier === son);
      modifier(existe ? ajouterSon(r, son, r.cartes[index].debut) : r);
      setSelection({ genre: "carte", index });
    } else if (genre === "son") {
      const r = ajouterSon(recette, valeur, Math.min(t, dureeTotale(recette) - 0.1));
      modifier(r);
      setSelection({ genre: "son", index: r.sons!.findIndex((s) => s.fichier === valeur && Math.abs(s.debut - Math.round(t * FPS) / FPS) < 0.02) });
    } else if (genre === "musique") {
      const duree = modeles.sons.find((s) => s.fichier === valeur)?.duree;
      const m = poserMusique(recette, valeur, t < 0.5 ? 0 : t, duree || undefined);
      if (m.index < 0) return;   // aucune place libre à cet endroit
      modifier(m.recette);
      setSelection({ genre: "musique", index: m.index });
    } else {
      const m = ZOOMS.find((z) => z.cle === valeur);
      if (!m) return;
      const { recette: r, index } = poserZoom(recette, t, m);
      modifier(r);
      setSelection({ genre: "plan", index });
    }
  }, [recette, modeles, modifier]);

  // Écoute d'un son ou d'une musique de la bibliothèque (un à la fois ; recliquer arrête)
  const ecouter = useCallback((fichier: string) => {
    audio.current?.pause();
    if (ecoute === fichier) { setEcoute(null); return; }
    const u = source.lienSon(fichier);
    if (!u) return;
    const a = new Audio(u);
    a.volume = 0.6;
    a.onended = () => setEcoute(null);
    a.play();
    audio.current = a;
    setEcoute(fichier);
  }, [ecoute]);

  // ---------------------------------------------------------------- lecture
  const allerA = useCallback((t: number) => {
    player.current?.seekTo(img(t));
    setTemps(t);
  }, []);
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const f = (e: { detail: { frame: number } }) => setTemps(e.detail.frame / FPS);
    p.addEventListener("frameupdate", f);
    return () => p.removeEventListener("frameupdate", f);
  });

  // ---------------------------------------------------------------- travaux (Appliquer, IA)
  const suivre = useCallback(async (apres: (t: NonNullable<Travail>) => Promise<void>) => {
    for (;;) {
      await new Promise((ok) => setTimeout(ok, 1000));
      const { travail: t } = await source.travail();
      setTravail(t);
      if (t && t.etat !== "en_cours") { await apres(t); return; }
    }
  }, []);

  const appliquer = useCallback(async () => {
    if (!recette) return;
    const r = await source.appliquer(recette);
    if (r.refus) return alert(r.refus);
    sauvee.current = JSON.stringify(recette);
    setBrouillon(false);
    setTravail(r.travail);
    suivre(async (t) => {
      if (t.etat === "fini") {
        const m = await source.montage();
        setVersions(m.medias);
        setPlagesRendues(JSON.stringify(m.plages_rendues || m.recette.plages));
      }
    });
  }, [recette, suivre]);

  const demanderIA = useCallback(async () => {
    if (!recette) return;
    const r = await source.ia(recette, demande);
    if (r.refus) return alert(r.refus);
    setIa(false);
    setTravail(r.travail);
    suivre(async (t) => { if (t.etat === "fini") await charger(true); });
  }, [recette, demande, suivre, charger, source]);

  // ---------------------------------------------------------------- clavier
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement;
      const saisie = ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        if (saisie) return; // l'annulation du champ reste celle du navigateur
        e.preventDefault();
        if (e.shiftKey) retablir(); else annuler();
        rafraichir((x) => x + 1);
      } else if (!saisie && (e.key === "Backspace" || e.key === "Delete")) {
        e.preventDefault();
        supprimer();
      } else if (!saisie && e.key === " ") {
        e.preventDefault();
        player.current?.toggle();
      } else if (!saisie && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        couper();
      } else if (!saisie && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === "t") {
        e.preventDefault();   // grand lecteur / grande timeline
        setHTimeline((h) => basculerHauteurTimeline(h, window.innerHeight));
      }
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [annuler, retablir, supprimer, couper]);

  const problemes = useMemo(() => (recette ? fusionner(
    [...gardeFous(recette), ...(etat ? avertissementsInterface(recette, etat.cartes, etat.sous_titres) : [])], etat?.problemes || []) : []), [recette, etat]);
  const total = recette ? Math.max(1 / FPS, dureeTotale(recette)) : 1;
  const inputProps = useMemo<PropsMontage>(() => ({
    recette: recette || ({ plages: [], plans: [], cartes: [], sous_titres: {} } as Recette), etat, mode, reperes, versions,
    selection: selection?.genre === "carte" ? selection.index : null, proxies, durees: dureesChansons,
    lien: source.lien, lienSon: source.lienSon, apercu: source.lienApercu(), versionLiens,
  }), [recette, etat, mode, reperes, versions, selection, proxies, dureesChansons, source, versionLiens]);
  const parCategorie = useMemo(() => {
    const g: Record<string, SonBib[]> = {};
    for (const s of modeles?.sons || []) if (s.categorie !== "musique") (g[s.categorie] ||= []).push(s);
    return g;
  }, [modeles]);

  if (!recette || !modeles) return <div className="chargement">Chargement du montage…</div>;
  const noms = modeles.types;
  const plagesChangees = JSON.stringify(recette.plages) !== plagesRendues;
  const enCours = travail?.etat === "en_cours";
  const erreurs = problemes.filter((p) => p.niveau === "erreur");
  const avis = problemes.filter((p) => p.niveau === "avis");
  const infos = problemes.filter((p) => p.niveau === "info");
  const musiques = modeles.sons.filter((s) => s.categorie === "musique");
  const infosModeles: InfosModeles = {
    elements: modeles.elements || {}, transparences: modeles.transparences || ["aucune"],
    musiques: musiques.map((s) => s.fichier), volumeSon: modeles.volume_son || [-20, 10],
    transparenceDefaut: modeles.transparence_defaut || "aucune",
    dureesChansons,
  };
  const glisserDepuis = (genre: keyof typeof TYPES_DEPOT, valeur: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData(TYPES_DEPOT[genre], valeur);
    e.dataTransfer.effectAllowed = "copy";
  };
  const largeurLecteur = Math.round((hLecteur * 9) / 16);
  const ligneProbleme = (p: (typeof problemes)[number], i: number) => (
    <li key={i} className={p.niveau} onClick={() => {
      if (p.carte !== null && p.carte >= 0 && recette.cartes[p.carte]) {
        setSelection({ genre: "carte", index: p.carte });
        allerA(recette.cartes[p.carte].debut + 0.5);
      }
    }}>{p.message}</li>
  );

  return (
    <div className="app" style={{ gridTemplateRows: `48px minmax(0, 1fr) 6px ${hTimeline}px`, gridTemplateColumns: `${palette ? 210 : 34}px minmax(0, 1fr)` }}>
      <header>
        <div className="marque"><b>NEO</b> Timeline <span>{source.titre} · {recette.cartes.length} cartes · {formatTemps(total)}{brouillon ? " · brouillon sauvé" : ""}</span></div>
        <div className="actions">
          <button className={`puce-garde ${verif ? "verif" : erreurs.length ? "ko" : avis.length ? "jaune" : "ok"} ${tiroir ? "actif" : ""}`}
            onClick={() => setTiroir((x) => !x)} title="Garde-fous du moteur (tiroir)">
            Garde-fous · {verif ? "vérification…" : erreurs.length ? `${erreurs.length} à corriger` : avis.length ? `${avis.length} avertissement${avis.length > 1 ? "s" : ""}` : "tout est bon"}
          </button>
          {extra?.({ brouillon, enCours })}
          <button onClick={annuler} disabled={!hist.current.passe.length} title="⌘Z">↶ Annuler</button>
          <button onClick={retablir} disabled={!hist.current.futur.length} title="⌘⇧Z">↷ Rétablir</button>
          {brouillon && <button onClick={revenir} disabled={enCours} title="Jeter le brouillon">Revenir au dernier aperçu</button>}
          <button onClick={() => setIa(true)} disabled={enCours}>Demander à l'IA</button>
          <button className="principal" onClick={appliquer} disabled={enCours} title="Les avertissements jaunes ne bloquent jamais">{enCours && travail?.type === "appliquer" ? "Rendu en cours…" : "Appliquer"}</button>
        </div>
      </header>

      {!palette ? (
        <aside className="palette repliee"><button className="deplier" onClick={() => setPalette(true)} title="Ouvrir la palette">▸ Palette</button></aside>
      ) : (
      <aside className="palette">
        <div className="tete-colonne"><b>Palette</b><button className="petit" onClick={() => setPalette(false)} title="Replier la palette (le lecteur s'agrandit)">◂</button></div>
        <h4>Cartes</h4>
        {Object.entries(noms).filter(([t]) => !modeles.graphiques.includes(t)).map(([t, n]) => (
          <div key={t} className="type-palette" draggable onDragStart={glisserDepuis("carte", t)}
            onDoubleClick={() => deposer("carte", t, temps)} title="Glisser sur la piste « Cartes et graphiques » (ou double-clic : à la tête de lecture)">{n}</div>
        ))}
        <h4>Graphiques</h4>
        {Object.entries(noms).filter(([t]) => modeles.graphiques.includes(t)).map(([t, n]) => (
          <div key={t} className="type-palette graphique" draggable onDragStart={glisserDepuis("carte", t)}
            onDoubleClick={() => deposer("carte", t, temps)} title="Glisser sur la piste « Cartes et graphiques »">{n}</div>
        ))}
        <p className="aide">Le texte d'exemple est à remplacer par ce qui est dit dans la vidéo.</p>
        <h4>Zooms</h4>
        {ZOOMS.map((z) => (
          <div key={z.cle} className="type-palette zoom" draggable onDragStart={glisserDepuis("zoom", z.cle)}
            onDoubleClick={() => deposer("zoom", z.cle, temps)} title={`${z.aide}, ${z.duree} s. Glisser sur la piste Vidéo ou Zooms (double-clic : à la tête de lecture)`}>
            {z.nom}<small>{z.aide}</small>
          </div>
        ))}
        <h4>Sons</h4>
        {Object.entries(parCategorie).map(([cat, liste]) => (
          <details key={cat} className="categorie-sons">
            <summary>{NOMS_CATEGORIES[cat] || cat} <small>{liste.length}</small></summary>
            {liste.map((s) => (
              <div key={s.fichier} className="son-palette" draggable onDragStart={glisserDepuis("son", s.fichier)} title={`${s.fichier}${s.usage ? ` · ${s.usage}` : ""} · glisser sur la piste Sons`}>
                <button className={`ecoute ${ecoute === s.fichier ? "actif" : ""}`} onClick={() => ecouter(s.fichier)}>{ecoute === s.fichier ? "■" : "▶"}</button>
                <span>{nomSon(s.fichier)}</span><small>{s.duree.toFixed(1).replace(".", ",")} s</small>
              </div>
            ))}
          </details>
        ))}
        <details className="categorie-sons">
          <summary>Musique <small>{musiques.length}</small></summary>
          {musiques.map((s) => (
            <div key={s.fichier} className="son-palette" draggable onDragStart={glisserDepuis("musique", s.fichier)} title={`${s.fichier} · glisser sur la piste Musique`}>
              <button className={`ecoute ${ecoute === s.fichier ? "actif" : ""}`} onClick={() => ecouter(s.fichier)}>{ecoute === s.fichier ? "■" : "▶"}</button>
              <span>{s.fichier.split("/").slice(1, -1).join(" · ")} · {nomSon(s.fichier).slice(0, 26)}</span>
            </div>
          ))}
        </details>
        <p className="aide">Sons et musiques : bibliothèque Pixabay (copie du dossier Sons dans le stockage privé, jamais écrite).</p>
      </aside>
      )}

      <main className="scene" style={{ gridTemplateColumns: `minmax(0, 1fr) ${inspecteur ? 340 : 34}px` }}>
        <div className="lecteur" ref={zoneLecteur}>
          <div className="cadre-lecteur" style={{ width: largeurLecteur, height: hLecteur }}>
            <Player ref={player} component={Montage} inputProps={inputProps} durationInFrames={Math.max(1, img(total))}
              compositionWidth={1080} compositionHeight={1920} fps={FPS} controls clickToPlay={false}
              style={{ width: largeurLecteur, height: hLecteur, borderRadius: 14, overflow: "hidden", background: "#000" }} acknowledgeRemotionLicense />
            {mode === "direct" && selection?.genre === "carte" && (
              <PoigneesCarte recette={recette} etat={etat} k={selection.index} temps={temps} echelle={largeurLecteur / 1080}
                debut={() => { hist.current.noter(recette); derniere.current = { cle: "", t: 0 }; return recette; }}
                pendant={(r) => setRecette(r)} fin={() => rafraichir((x) => x + 1)} />
            )}
          </div>
          <div className="options-lecteur" style={{ width: Math.max(largeurLecteur, 420) }}>
            <div className="bascule">
              <button className={mode === "direct" ? "actif" : ""} onClick={() => setMode("direct")}>En direct</button>
              <button className={mode === "apercu" ? "actif" : ""} onClick={() => setMode("apercu")}>Dernier aperçu</button>
            </div>
            <div className="bascule" title="Repères : ligne du menton (Visage) ou interface de l'app par-dessus la vidéo, au pixel près">
              {(["aucun", "visage", "instagram", "facebook"] as Reperes[]).map((x) => (
                <button key={x} className={reperes === x ? "actif" : ""} onClick={() => setReperes(x)}>{NOMS_REPERES[x]}</button>
              ))}
            </div>
          </div>
          {mode === "apercu" && plagesChangees && <div className="bandeau" style={{ width: Math.max(largeurLecteur, 420) }}>Ce dernier aperçu date d'avant tes coupes : « En direct » les montre déjà, « Appliquer » refait l'aperçu.</div>}
        </div>
        {!inspecteur ? (
          <div className="colonne-droite repliee"><button className="deplier" onClick={() => setInspecteur(true)} title="Ouvrir l'inspecteur">◂ Inspecteur</button></div>
        ) : (
        <div className="colonne-droite">
          <div className="tete-colonne"><b>Inspecteur</b><button className="petit" onClick={() => setInspecteur(false)} title="Replier l'inspecteur (le lecteur s'agrandit)">▸</button></div>
          {etat?.erreur_outil && <div className="alerte erreur">Moteur : {etat.erreur_outil}</div>}
          {erreurs.length > 0 && !tiroir && <div className="alerte erreur" onClick={() => setTiroir(true)} style={{ cursor: "pointer" }}>{erreurs.length} limite{erreurs.length > 1 ? "s" : ""} technique{erreurs.length > 1 ? "s" : ""} à corriger : ouvrir les garde-fous</div>}
          {travail && (
            <div className={`travail ${travail.etat}`}>
              <b>{travail.type === "ia" ? "Demande à l'IA" : "Rendu de l'aperçu"} : {travail.etat === "en_cours" ? "en cours" : travail.etat === "fini" ? "fini" : "erreur"}</b>
              {travail.etat === "en_cours" && <small>{travail.journal.filter((l) => !l.includes("⚠")).slice(-1)[0] || "démarrage…"}</small>}
              {travail.etat === "fini" && travail.resultat?.controles && (
                <small>{travail.resultat.controles.son.lufs} LUFS · {travail.resultat.temps} s · {travail.resultat.controles.points.length ? travail.resultat.controles.points.join(" ; ") : "aucun point aux contrôles"}{travail.resultat.avertissements?.length ? ` · ${travail.resultat.avertissements.length} avertissement(s)` : ""}</small>
              )}
              {travail.etat === "fini" && travail.resultat?.reponse && <small className="reponse-agent">{travail.resultat.reponse}</small>}
              {travail.etat === "erreur" && <pre>{travail.resultat?.erreur}</pre>}
            </div>
          )}
          <Inspecteur recette={recette} etat={etat} selection={selection} noms={noms} styles={modeles.styles}
            graphiques={modeles.graphiques} problemes={problemes} infos={infosModeles} temps={temps}
            modifier={modifier} supprimer={supprimer} couper={couper} ecouter={ecouter} choisir={setSelection} />
        </div>
        )}
      </main>

      <div className="separateur" onPointerDown={separateur} onDoubleClick={() => setHTimeline((h) => basculerHauteurTimeline(h, window.innerHeight))}
        title="Glisser pour changer la hauteur de la timeline (mémorisée). Double-clic ou T : grand lecteur / grande timeline" />

      <footer>
        <div className="barre-timeline">
          <span className="gauche-barre">
            <b>{formatTemps(temps)}</b>
            <button className="petit" onClick={couper} title="Couper le morceau à la tête de lecture (C)">✂ Couper</button>
            {selection?.genre === "plage" && recette.plages.length > 1 && <button className="petit" onClick={supprimer} title="Suppr">Supprimer le morceau</button>}
          </span>
          <span className="droite-barre">
            <button className="petit" onClick={() => setHTimeline((h) => basculerHauteurTimeline(h, window.innerHeight))} title="Grand lecteur / grande timeline (T)">⇕ Lecteur / timeline</button>
            <label>Zoom <input type="range" min={8} max={160} value={pps} onChange={(e) => setPps(Number(e.target.value))} /></label>
          </span>
        </div>
        <Timeline recette={recette} etat={etat} temps={temps} pps={pps} selection={selection} problemes={problemes}
          graphiques={modeles.graphiques} noms={noms} dureeSource={etat?.duree_source ?? Infinity}
          allerA={allerA} choisir={setSelection} deposer={deposer}
          debutGlisser={() => { hist.current.noter(recette); derniere.current = { cle: "", t: 0 }; return recette; }}
          pendantGlisser={(r) => setRecette(r)} finGlisser={() => rafraichir((x) => x + 1)} hauteur={hTimeline - 34}
          dureesChansons={dureesChansons} ondes={ondes} />
      </footer>

      {tiroir && (
        <aside className="tiroir">
          <div className="tete-colonne"><b>Garde-fous</b><button className="petit" onClick={() => setTiroir(false)}>✕</button></div>
          {etat?.erreur_outil && <div className="alerte erreur">Moteur : {etat.erreur_outil}</div>}
          {!erreurs.length && avis.length > 0 && <p className="note petite">Avertissements : règles de goût du moteur, à toi de décider. « Appliquer » reste permis.</p>}
          {!erreurs.length && !avis.length && <p className="note petite">Tout est bon.</p>}
          <ul>{[...erreurs, ...avis].map(ligneProbleme)}</ul>
          {infos.length > 0 && (
            <details className="infos">
              <summary>Ce que le moteur fait seul ({infos.length})</summary>
              <ul>{infos.map(ligneProbleme)}</ul>
            </details>
          )}
        </aside>
      )}

      {ia && (
        <div className="voile" onClick={() => setIa(false)}>
          <div className="dialogue" onClick={(e) => e.stopPropagation()}>
            <h3>Demander à l'IA</h3>
            <p>Claude reçoit le montage actuel (tes modifications comprises) et ta demande, renvoie une recette vérifiée par le moteur, puis l'aperçu est refait sur le Mac. Il garde tout ce que tu as posé à la main, sauf ce que ta demande vise. Pour l'IA, les règles de rythme et de goût restent obligatoires. Tout reste modifiable ensuite. Chaque demande coûte 1 à 3 appels à Claude.</p>
            <textarea autoFocus rows={4} value={demande} onChange={(e) => setDemande(e.target.value)} placeholder="Ex. : ajoute une carte sur « 15 000 personnes » et retire la carte de 45 s." />
            <div className="actions">
              <button onClick={() => setIa(false)}>Annuler</button>
              <button className="principal" disabled={!demande.trim()} onClick={demanderIA}>Envoyer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
