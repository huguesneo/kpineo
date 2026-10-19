#!/usr/bin/env node
// Timeline du hub : recopie la timeline du labo (video-neo, labo/timeline et labo/graphiques) dans
// src/features/social/montage/timeline/, puis applique les retouches du hub, chacune vérifiée : si le code du labo a
// changé de forme, le script s'arrête et dit laquelle ne s'applique plus (rien n'est écrit).
//
//   node scripts/synchro-timeline.mjs [dossier video-neo]   (défaut : ~/NEO/dev/video-neo)
//   node scripts/synchro-timeline.mjs --verifier [dossier]  compare seulement (code 1 si une copie diffère)
//
// Recopiés tels quels : logique.ts, Timeline.tsx, Inspecteur.tsx, les graphiques (sauf polices.ts, propre au hub :
// polices chargées par lien signé), les calques des repères, les polices de l'interface (Satoshi, Montserrat).
// Retouchés : App.tsx (le serveur local devient la « source » du hub : Supabase, tâches de l'agent, liens signés),
// Montage.tsx (adresses des médias par lien signé), style.css (limité à .timeline-neo), logique.test.mjs (Vitest).
// Les polices Allrounder ne sont jamais copiées : l'agent les met dans le stockage privé.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const VERIFIER = process.argv.includes("--verifier");
const VIDEO_NEO = path.resolve(process.argv.slice(2).find((a) => !a.startsWith("--")) || path.join(os.homedir(), "NEO/dev/video-neo"));
const LABO = path.join(VIDEO_NEO, "labo");
const CIBLE = path.join(ICI, "..", "src/features/social/montage/timeline");

const lire = (f) => readFileSync(path.join(LABO, f), "utf8");
const sorties = new Map();   // chemin relatif dans CIBLE → contenu (écrit seulement si tout s'applique)
const binaires = new Map();  // chemin relatif dans CIBLE → fichier source

// Remplace exactement une occurrence (ou toutes avec tous: true) ; sinon arrêt
const retoucher = (fichier, texte, liste) => {
  let t = texte;
  for (const [avant, apres, o = {}] of liste) {
    const n = t.split(avant).length - 1;
    if (o.tous ? n < 1 : n !== 1) {
      console.error(`Retouche impossible dans ${fichier} (${n} occurrence(s)) :\n${avant}`);
      process.exit(1);
    }
    t = o.tous ? t.split(avant).join(apres) : t.replace(avant, () => apres);
  }
  return t;
};

const ENTETE = (origine) => `// Copie de video-neo/${origine}, retouchée pour le hub par scripts/synchro-timeline.mjs : ne pas modifier à la main.\n`;
const ENTETE_CSS = (origine) => `/* Copie de video-neo/${origine}, limitée à .timeline-neo par scripts/synchro-timeline.mjs : ne pas modifier à la main. */\n`;

// ---------------------------------------------------------------- tels quels
for (const f of ["logique.ts", "Timeline.tsx", "Inspecteur.tsx"]) {
  sorties.set(f, ENTETE(`labo/timeline/src/${f}`) + lire(`timeline/src/${f}`));
}
for (const f of ["Graphique.tsx", "commun.tsx", "Comparaison.tsx", "Courbe.tsx", "Cycle.tsx", "MytheRealite.tsx"]) {
  sorties.set(`graphiques/${f}`, ENTETE(`labo/graphiques/${f}`) + lire(`graphiques/${f}`));
}
for (const f of ["instagram.png", "facebook.png"]) binaires.set(`reperes/${f}`, path.join(LABO, "timeline/reperes", f));
for (const f of ["Satoshi-Medium.woff2", "Satoshi-Bold.woff2", "Montserrat-ExtraBold.woff2"]) {
  binaires.set(`polices/${f}`, path.join(VIDEO_NEO, "public/fonts", f));
}

// ---------------------------------------------------------------- App.tsx : le serveur local devient la source du hub
sorties.set("App.tsx", ENTETE("labo/timeline/src/App.tsx") + retoucher("App.tsx", lire("timeline/src/App.tsx"), [
  [`import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";`,
    `import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";\nimport type { Source } from "./source";`],
  [`const json = async (url: string, corps?: unknown, methode = "POST") => {
  const r = await fetch(url, corps === undefined && methode === "POST" ? undefined
    : { method: methode, headers: { "Content-Type": "application/json" }, body: corps === undefined ? undefined : JSON.stringify(corps) });
  return r.json();
};
`, ""],
  [`export const App: React.FC = () => {`,
    `// Hub : « source » remplace le serveur local du labo ; « extra » ajoute les boutons du hub (retour, Terminer).
export const App: React.FC<{ source: Source; extra?: (o: { brouillon: boolean; enCours: boolean }) => React.ReactNode }> = ({ source, extra }) => {`],
  [`  const [, rafraichir] = useState(0);`,
    `  const [, rafraichir] = useState(0);\n  const versionLiens = useSyncExternalStore(source.abonner, source.version);   // liens signés renouvelés`],
  ["json(`/api/onde?fichier=${encodeURIComponent(f)}`, undefined, \"GET\")", "source.onde(f)"],
  [`await json("/api/montage", undefined, "GET")`, `await source.montage()`, { tous: true }],
  [`json("/api/modeles", undefined, "GET").then(setModeles);`, `source.modeles().then(setModeles);`],
  [`await json("/api/proxies", undefined, "GET")`, `await source.proxies()`],
  [`await json("/api/verifier", { recette })`, `await source.verifier(recette)`],
  [`await json("/api/brouillon", { recette })`, `await source.sauver(recette)`],
  [`await json("/api/brouillon", undefined, "DELETE")`, `await source.jeter()`],
  [`await json("/api/travail", undefined, "GET")`, `await source.travail()`],
  [`await json("/api/appliquer", { recette })`, `await source.appliquer(recette)`],
  [`await json("/api/ia", { recette, demande, mode: modeIA })`, `await source.ia(recette, demande)`],
  ["    const a = new Audio(`/sons/${fichier.split(\"/\").map(encodeURIComponent).join(\"/\")}`);",
    `    const u = source.lienSon(fichier);\n    if (!u) return;\n    const a = new Audio(u);`],
  [`    selection: selection?.genre === "carte" ? selection.index : null, proxies, durees: dureesChansons,
  }), [recette, etat, mode, reperes, versions, selection, proxies, dureesChansons]);`,
    `    selection: selection?.genre === "carte" ? selection.index : null, proxies, durees: dureesChansons,
    lien: source.lien, lienSon: source.lienSon, apercu: source.lienApercu(), versionLiens,
    lienVideo: source.lienVideo, echecVideo: source.echecVideo,
  }), [recette, etat, mode, reperes, versions, selection, proxies, dureesChansons, source, versionLiens]);`],
  [`<b>NEO</b> Timeline <span>labo · `, `<b>NEO</b> Timeline <span>{source.titre} · `],
  [`          <button onClick={annuler} disabled={!hist.current.passe.length} title="⌘Z">↶ Annuler</button>`,
    `          {extra?.({ brouillon, enCours })}\n          <button onClick={annuler} disabled={!hist.current.passe.length} title="⌘Z">↶ Annuler</button>`],
  [`Sons et musiques : bibliothèque Pixabay (copie locale du dossier Sons, jamais écrite).`,
    `Sons et musiques : bibliothèque Pixabay (copie du dossier Sons dans le stockage privé, jamais écrite).`],
  [`              {travail.etat === "erreur" && <pre>{travail.resultat?.erreur}</pre>}`,
    `              {travail.etat === "fini" && travail.resultat?.reponse && <small className="reponse-agent">{travail.resultat.reponse}</small>}\n              {travail.etat === "erreur" && <pre>{travail.resultat?.erreur}</pre>}`],
  // Hub : seule la correction existe côté agent (pas de « ronde complète »)
  [`<p>« Corriger » : Claude reçoit le montage actuel et ta demande, renvoie une recette vérifiée par le moteur, puis l'aperçu est refait. « Ronde complète » : Claude repart de la vidéo et de sa transcription. Pour l'IA, les règles de rythme et de goût restent obligatoires. Tout reste modifiable ensuite (⌘Z pour revenir). Chaque demande coûte 1 à 3 appels à Claude.</p>`,
    `<p>Claude reçoit le montage actuel (tes modifications comprises) et ta demande, renvoie une recette vérifiée par le moteur, puis l'aperçu est refait sur le Mac. Il garde tout ce que tu as posé à la main, sauf ce que ta demande vise. Pour l'IA, les règles de rythme et de goût restent obligatoires. Tout reste modifiable ensuite. Chaque demande coûte 1 à 3 appels à Claude.</p>`],
  [`            <div className="bascule choix-ia">
              <button className={modeIA === "correction" ? "actif" : ""} onClick={() => setModeIA("correction")}>Corriger ce montage</button>
              <button className={modeIA === "ronde" ? "actif" : ""} onClick={() => setModeIA("ronde")}>Refaire la ronde complète</button>
            </div>
`, ""],
  [`  const [modeIA, setModeIA] = useState<"correction" | "ronde">("correction");\n`, ""],
  [`  }, [recette, demande, modeIA, suivre, charger]);`, `  }, [recette, demande, suivre, charger, source]);`],
]));

// ---------------------------------------------------------------- Montage.tsx : médias par lien signé
sorties.set("Montage.tsx", ENTETE("labo/timeline/src/Montage.tsx") + retoucher("Montage.tsx", lire("timeline/src/Montage.tsx"), [
  [`import { Graphique } from "../../graphiques/Graphique";`, `import { Graphique } from "./graphiques/Graphique";`],
  [`import type { PropsGraphique } from "../../graphiques/commun";`, `import type { PropsGraphique } from "./graphiques/commun";`],
  [`import calqueFacebook from "../reperes/facebook.png";`, `import calqueFacebook from "./reperes/facebook.png";`],
  [`import calqueInstagram from "../reperes/instagram.png";`, `import calqueInstagram from "./reperes/instagram.png";`],
  [`  durees?: Record<string, number>;   // durée de chaque chanson (blocs de musique, batch 4b)\n};`,
    `  durees?: Record<string, number>;   // durée de chaque chanson (blocs de musique, batch 4b)
  // Hub : chemin du stockage privé → lien signé (undefined tant qu'il n'est pas prêt) ; son → lien signé ; aperçu rendu
  lien: (chemin?: string) => string | undefined; lienSon: (fichier: string) => string | undefined; apercu: string | null;
  versionLiens?: number;
  // Vidéo : même lien tant qu'elle marche (un nouveau src la recharge) ; echecVideo quand elle échoue (lien expiré)
  lienVideo: (chemin?: string) => string | undefined; echecVideo: (chemin?: string) => void;
};
const Liens = React.createContext<(chemin?: string) => string | undefined>(() => undefined);`],
  [`  const c = info.compteur!;\n`, `  const c = info.compteur!;\n  const lien = React.useContext(Liens);\n  if (!lien(c.sprite) || !lien(c.fond)) return null;\n`],
  ["<Img src={`/cache/${c.sprite}`}", "<Img src={lien(c.sprite)!}"],
  ["<Img src={`/cache/${c.fond}`}", "<Img src={lien(c.fond)!}"],
  // Graphique dont la police n'est pas chargée (absente du stockage) : carte refusée, le lecteur continue
  [`const SousTitres: React.FC`, `class GardeGraphique extends React.Component<{ texte: string; children: React.ReactNode }, { erreur: string | null }> {
  state = { erreur: null as string | null };
  static getDerivedStateFromError(e: Error) { return { erreur: e.message }; }
  render() { return this.state.erreur ? <Refusee texte={this.props.texte} message={this.state.erreur} /> : this.props.children; }
}

const SousTitres: React.FC`],
  [`export const Montage: React.FC<PropsMontage> = ({ recette, etat, mode, reperes, versions, selection, proxies, durees, niveaux }) => {`,
    `export const Montage: React.FC<PropsMontage> = ({ recette, etat, mode, reperes, selection, proxies, durees, niveaux, lien, lienSon, apercu, lienVideo, echecVideo }) => {`],
  ["    return versions.apercu ? <Html5Video src={`/media/apercu.mp4?v=${versions.apercu}`} /> : <AbsoluteFill style={{ background: \"#0A1416\" }} />;",
    `    return apercu ? <Html5Video src={apercu} /> : <AbsoluteFill style={{ background: "#0A1416" }} />;`],
  [`  return (\n    <AbsoluteFill style={{ background: "#0A1416" }}>\n      <VideoSource recette={recette} plans={plans} proxies={proxies} />`,
    `  const liens = Object.fromEntries(Object.entries(proxies).map(([k, v]) => [k, lienVideo(v)]).filter(([, v]) => v)) as Record<string, string>;
  return (
    <Liens.Provider value={lien}><AbsoluteFill style={{ background: "#0A1416" }}>
      <VideoSource recette={recette} plans={plans} proxies={liens} onErreur={(s) => echecVideo(proxies[s])} />`],
  [`{pistes.sons.map(({ k, de, n }) => { const s = recette.sons![k]; return (`, `{pistes.sons.map(({ k, de, n }) => { const s = recette.sons![k]; return !lienSon(s.fichier) ? null : (`],
  ["<Html5Audio src={`/sons/${s.fichier.split(\"/\").map(encodeURIComponent).join(\"/\")}`}", "<Html5Audio src={lienSon(s.fichier)!}"],
  [`{pistes.musique.map(({ k, j, bloc: b, depuis, de, n }) => (`, `{pistes.musique.map(({ k, j, bloc: b, depuis, de, n }) => !lienSon(b.fichier) ? null : (`],
  ["<Html5Audio src={`/sons/${b.fichier.split(\"/\").map(encodeURIComponent).join(\"/\")}`}", "<Html5Audio src={lienSon(b.fichier)!}"],
  [`              <Graphique {...info.props} duree={c.duree} n={n} apercuFlou />`,
    `              <GardeGraphique texte={info.texte || c.type || "graphique"}><Graphique {...info.props} duree={c.duree} n={n} apercuFlou /></GardeGraphique>`],
  ["              <CartePng src={`/cache/${info.png}`} duree={c.duree} info={info} />",
    `              lien(info.png) ? <CartePng src={lien(info.png)!} duree={c.duree} info={info} /> : null`],
  [`      {(reperes === "instagram" || reperes === "facebook") && <RepereReseau reseau={reperes} />}\n    </AbsoluteFill>\n  );\n};`,
    `      {(reperes === "instagram" || reperes === "facebook") && <RepereReseau reseau={reperes} />}\n    </AbsoluteFill></Liens.Provider>\n  );\n};`],
]));

// ---------------------------------------------------------------- style.css : limité à .timeline-neo
// Chaque sélecteur reçoit le préfixe ; html, body, #racine et :root deviennent .timeline-neo lui-même.
const portee = (css) => {
  const sortie = [];
  let i = 0;
  const bloc = (texte, prefixer) => {
    // découpe en règles de premier niveau : « sélecteurs { … } » ou « @règle { … } »
    let j = 0, res = "";
    while (j < texte.length) {
      const ouvre = texte.indexOf("{", j);
      if (ouvre < 0) { res += texte.slice(j); break; }
      let prof = 1, k = ouvre + 1;
      while (k < texte.length && prof) { if (texte[k] === "{") prof++; else if (texte[k] === "}") prof--; k++; }
      const avant = texte.slice(j, ouvre);
      const corps = texte.slice(ouvre + 1, k - 1);
      const tete = avant.replace(/\/\*[\s\S]*?\*\//g, (c) => { res += c; return ""; });
      const sel = tete.trim();
      const blanc = tete.slice(0, tete.length - tete.trimStart().length);
      if (sel.startsWith("@font-face")) res += `${blanc}${sel} {${corps}}`;
      else if (sel.startsWith("@media") || sel.startsWith("@supports")) res += `${blanc}${sel} {${bloc(corps, prefixer)}}`;
      else if (sel.startsWith("@")) res += `${blanc}${sel} {${corps}}`;
      else res += `${blanc}${prefixer(sel)} {${corps}}`;
      j = k;
    }
    return res;
  };
  const prefixer = (sel) => sel.split(",").map((s) => {
    const x = s.trim();
    if (x === ":root" || x === "html" || x === "body" || x === "#racine") return ".timeline-neo";
    if (x === "*") return ".timeline-neo, .timeline-neo *";
    return `.timeline-neo ${x}`;
  }).filter((x, k, t) => t.indexOf(x) === k).join(", ");
  sortie.push(bloc(css.slice(i), prefixer));
  return sortie.join("");
};
const css = retoucher("style.css", lire("timeline/src/style.css"), [
  [`url("../../../public/fonts/`, `url("./polices/`, { tous: true }],
]);
sorties.set("style.css", ENTETE_CSS("labo/timeline/src/style.css") + portee(css));

// ---------------------------------------------------------------- tests de la logique : Vitest
sorties.set("logique.test.mjs", ENTETE("labo/timeline/tests/logique.test.mjs") + retoucher("logique.test.mjs", lire("timeline/tests/logique.test.mjs"), [
  [`import { test } from "node:test";`, `import { test } from "vitest";`],
  [`from "../src/logique.ts";`, `from "./logique.ts";`, { tous: true }],
]));

// ---------------------------------------------------------------- vérification seulement
if (VERIFIER) {
  const ecarts = [];
  for (const [f, contenu] of sorties) {
    const c = path.join(CIBLE, f);
    if (!existsSync(c) || readFileSync(c, "utf8") !== contenu) ecarts.push(f);
  }
  for (const [f, source] of binaires) {
    const c = path.join(CIBLE, f);
    if (!existsSync(c) || !readFileSync(c).equals(readFileSync(source))) ecarts.push(f);
  }
  if (ecarts.length) {
    console.error(`Copies différentes du labo (relancer node scripts/synchro-timeline.mjs) : ${ecarts.join(", ")}`);
    process.exit(1);
  }
  console.log("Copies de la timeline à jour.");
  process.exit(0);
}

// ---------------------------------------------------------------- écriture (tout s'est appliqué)
for (const [f, contenu] of sorties) {
  mkdirSync(path.dirname(path.join(CIBLE, f)), { recursive: true });
  writeFileSync(path.join(CIBLE, f), contenu);
}
for (const [f, source] of binaires) {
  if (!existsSync(source)) { console.error(`Fichier absent : ${source}`); process.exit(1); }
  mkdirSync(path.dirname(path.join(CIBLE, f)), { recursive: true });
  copyFileSync(source, path.join(CIBLE, f));
}
console.log(`Timeline recopiée depuis ${VIDEO_NEO} : ${sorties.size} fichiers retouchés ou recopiés, ${binaires.size} fichiers binaires.`);
