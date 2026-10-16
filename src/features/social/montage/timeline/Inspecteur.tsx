// Copie de video-neo/labo/timeline/src/Inspecteur.tsx, retouchée pour le hub par scripts/synchro-timeline.mjs : ne pas modifier à la main.
// Panneau de droite : modifier la carte, le groupe de sous-titres, le son, la musique, le zoom (plan) ou le morceau choisis.
import React, { useEffect, useState } from "react";
import type { Etat } from "./Montage";
import type { Selection } from "./Timeline";
import {
  MUSIQUE_SOUS_VOIX, TAILLE_MANUELLE, ZOOM_MAX, boiteCarte, copie, deplacerZoom, etirerZoom, reglerZoom, corrigerSousTitre, deplacerCarte, formatTemps, morceaux, nomSon, placerCarte,
  positionAuto, reglerTaille, tailleAuto, FONDU_MAX, VOLUME_MUSIQUE, blocsMusique, changerChanson, deplacerMusique, fondus,
  brutRetire, glisserContenu, reglerMusique, rognerMusique, rognerPlage,
  type Carte, type Element, type Recette,
} from "./logique";

export type InfosModeles = {
  elements: Record<string, [number, number]>; transparences: string[]; musiques: string[]; volumeSon: [number, number];
  transparenceDefaut: string; dureesChansons: Record<string, number>;
};

type Props = {
  recette: Recette; etat: Etat | null; selection: Selection; noms: Record<string, string>; styles: string[];
  graphiques: string[]; problemes: { message: string; carte: number | null; niveau: string }[]; infos: InfosModeles;
  temps: number; modifier: (r: Recette, cle?: string) => void; supprimer: () => void; couper: () => void;
  ecouter: (fichier: string) => void; choisir: (s: Selection) => void;
};

// Champ texte qui garde sa saisie locale ; chaque frappe modifie la recette (historique regroupé par champ)
const Champ: React.FC<{ etiquette: string; valeur: string; changer: (v: string) => void; long?: boolean; aide?: string }> = ({ etiquette, valeur, changer, long, aide }) => {
  const [v, setV] = useState(valeur);
  useEffect(() => setV(valeur), [valeur]);
  return (
    <label className="champ">
      <span>{etiquette}</span>
      {long ? <textarea value={v} rows={3} onChange={(e) => { setV(e.target.value); changer(e.target.value); }} />
        : <input value={v} onChange={(e) => { setV(e.target.value); changer(e.target.value); }} />}
      {aide && <small>{aide}</small>}
    </label>
  );
};

// Nombre saisi au clavier : le texte reste local tant qu'il n'est pas un nombre complet (« 1. », « 1, »), virgule acceptée
const Nombre: React.FC<{ etiquette: string; valeur: number | undefined; changer: (v: number | undefined) => void }> = ({ etiquette, valeur, changer }) => {
  const [v, setV] = useState(valeur === undefined ? "" : String(valeur));
  useEffect(() => {
    setV((actuel) => (Number(actuel.replace(",", ".")) === valeur && actuel !== "" ? actuel : valeur === undefined ? "" : String(valeur)));
  }, [valeur]);
  return (
    <label className="champ court">
      <span>{etiquette}</span>
      <input inputMode="decimal" value={v} onChange={(e) => {
        const t = e.target.value;
        setV(t);
        if (t.trim() === "") return;
        if (/^-?\d+([.,]\d+)?$/.test(t.trim())) changer(Number(t.trim().replace(",", ".")));
      }} onBlur={() => setV(valeur === undefined ? "" : String(valeur))} />
    </label>
  );
};

// Curseur en dB (volume d'un son ou de la musique)
const Volume: React.FC<{ etiquette: string; valeur: number; bornes: [number, number]; changer: (v: number) => void; aide?: string }> = ({ etiquette, valeur, bornes, changer, aide }) => (
  <label className="champ">
    <span>{etiquette} : <b>{valeur > 0 ? "+" : ""}{valeur} dB</b></span>
    <input type="range" min={bornes[0]} max={bornes[1]} step={1} value={valeur} onChange={(e) => changer(Number(e.target.value))} />
    {aide && <small>{aide}</small>}
  </label>
);

const CHAMPS_TYPE: Record<string, { cle: string; nom: string; aide?: string }[]> = {
  chiffre_photo: [{ cle: "valeur", nom: "Chiffre (nombre entier dit)" }],
  cta: [{ cle: "bouton", nom: "Texte du bouton" }, { cle: "sous_texte", nom: "Sous-texte (rare)" }],
  courbe: [{ cle: "forme", nom: "Forme (monte, descend, creux, plateau)" }, { cle: "etiquette", nom: "Étiquette du point final" }, { cle: "unite", nom: "Unité" }],
  comparaison: [{ cle: "unite", nom: "Unité (avec chiffres)" }, { cle: "etiquettes", nom: "Étiquettes avant/après (2 mots dits, séparés par une virgule)" }],
  cycle: [{ cle: "centre", nom: "Texte du centre" }],
  mythe_realite: [{ cle: "etiquettes", nom: "Étiquettes (2 mots, séparés par une virgule)" }],
};
const AVEC_NIVEAU = ["jauge"];
const AVEC_VALEUR = ["courbe", "comparaison"];
const NOM_ELEMENT: Record<string, string> = { jauge: "État", cycle: "Étape", etapes: "Étape", courbe: "Point", comparaison: "Élément" };
const NOMS_TRANSPARENCE: Record<string, string> = { aucune: "aucune", legere: "légère", moyenne: "moyenne", forte: "forte" };

// Place et taille d'une carte (batch 4) : X, Y et Taille au clavier ; la carte se glisse aussi dans le lecteur.
const PlaceCarte: React.FC<{ recette: Recette; k: number; etat: Etat | null; modifier: Props["modifier"] }> = ({ recette, k, etat, modifier }) => {
  const c = recette.cartes[k];
  const info = etat?.cartes[k];
  const b = boiteCarte(c, info);
  const place = c.place || {};
  const manuelle = place.x !== undefined || place.y !== undefined;
  const taille = place.taille ?? info?.ajustement ?? 1;
  const cle = `carte${k}.place`;
  if (!b) return <p className="note">Place et taille : en attente du moteur.</p>;
  const pc = Math.round(taille * 100);
  return (
    <div className="bloc-place">
      <div className="titre-elements">
        <span>Place et taille</span>
        <small>{manuelle ? "Place choisie à la main : la carte reste là, même si le visage bouge." : "Place automatique (sous le menton). Glisse la carte dans le lecteur pour la déplacer, tire son coin pour la réduire."}</small>
      </div>
      <div className="ligne-champs">
        <Nombre etiquette="X (centre, px)" valeur={Math.round(b.x + b.w / 2)} changer={(v) => v !== undefined && modifier(placerCarte(recette, k, v, b.y, b.w, b.h), cle)} />
        <Nombre etiquette="Y (haut, px)" valeur={Math.round(b.y)} changer={(v) => v !== undefined && modifier(placerCarte(recette, k, b.x + b.w / 2, v, b.w, b.h), cle)} />
        <Nombre etiquette="Taille (%)" valeur={pc} changer={(v) => v !== undefined && modifier(reglerTaille(recette, k, v / 100), cle)} />
      </div>
      <label className="champ">
        <span>Taille : <b>{pc} %</b>{place.taille === undefined ? " (moteur)" : ""}</span>
        <input type="range" min={TAILLE_MANUELLE[0] * 100} max={TAILLE_MANUELLE[1] * 100} step={1} value={pc}
          onChange={(e) => modifier(reglerTaille(recette, k, Number(e.target.value) / 100), cle)} />
      </label>
      <div className="ligne-boutons">
        <button className="petit" disabled={!manuelle} onClick={() => modifier(positionAuto(recette, k))} title="Le moteur replace la carte sous le menton">Position automatique</button>
        <button className="petit" disabled={place.taille === undefined} onClick={() => modifier(tailleAuto(recette, k))}>Taille du moteur</button>
      </div>
    </div>
  );
};

export const Inspecteur: React.FC<Props> = (p) => {
  const { recette, etat, selection, noms, styles, graphiques, problemes, modifier, supprimer, infos } = p;
  if (!selection) {
    return (
      <div className="inspecteur vide">
        <h3>Rien de choisi</h3>
        <p>Clique une carte, un zoom, un sous-titre, un son, la musique ou un morceau de vidéo dans la timeline. Glisse un élément de la palette sur sa piste pour l'ajouter.</p>
        <p className="raccourcis">C couper · Suppr supprimer · ⌘Z annuler · ⌘⇧Z rétablir · Espace lecture</p>
      </div>
    );
  }
  if (selection.genre === "carte") {
    const k = selection.index;
    const c = recette.cartes[k];
    if (!c) return null;
    const t = c.type || "texte";
    const maj = (f: (x: Carte) => void, cle: string) => {
      const r = copie(recette);
      f(r.cartes[k]);
      modifier(r, `carte${k}.${cle}`);
    };
    const info = etat?.cartes[k];
    const pbs = problemes.filter((x) => x.carte === k);
    const paires = t === "mythe_realite";
    const [eMin, eMaxType] = infos.elements[t] || [0, 0];
    const avantApres = t === "comparaison" && !(c.elements || []).every((e) => typeof e.valeur === "number");
    const eMax = avantApres ? 2 : eMaxType;
    const nbE = (c.elements || []).length;
    const pas = paires ? 2 : 1;
    const nomEl = (i: number) => (paires ? `${i % 2 ? "Réalité" : "Mythe"} ${Math.floor(i / 2) + 1}` : `${NOM_ELEMENT[t] || "Élément"} ${i + 1}`);
    const bornes = paires ? `${eMin / 2} à ${eMax / 2} paires (mythe, puis réalité)` : eMin === eMax ? `${eMin} éléments` : `${eMin} à ${eMax} éléments`;
    return (
      <div className="inspecteur">
        <div className="titre-insp">
          <h3>{noms[t] || t}</h3>
          <span className={`etiquette-type ${graphiques.includes(t) ? "graphique" : ""}`}>{graphiques.includes(t) ? "graphique" : "carte"}</span>
        </div>
        {pbs.map((x, i) => <div key={i} className={`alerte ${x.niveau}`}>{x.message}</div>)}
        {info?.ajustement !== undefined && info.ajustement < 0.999 && c.place?.taille === undefined && <div className="note">Réduite à {Math.round(info.ajustement * 100)} % pour tenir sous le menton.</div>}
        {t === "chiffre_photo" && <div className="note">Photo de l'équipe : toujours mise par le moteur (obligatoire sur cette carte).</div>}
        {t === "comparaison" && <div className="note">Avec un chiffre dit sur chaque élément : 2 à 4 barres, chiffres en gros. Sans chiffre : avant/après en 2 colonnes (jamais de barre sans valeur).</div>}
        <div className="ligne-champs">
          <Nombre etiquette="Début (s)" valeur={c.debut} changer={(v) => modifier(deplacerCarte(recette, k, v ?? 0), `carte${k}.debut`)} />
          <Nombre etiquette="Durée (s)" valeur={c.duree} changer={(v) => maj((x) => { x.duree = Math.max(0.8, v ?? 2.5); }, "duree")} />
        </div>
        <Champ long etiquette={t === "question" ? "Question (une ligne par ligne)" : "Titre ou texte (une ligne par ligne)"} valeur={(c.lignes || []).join("\n")}
          changer={(v) => maj((x) => { x.lignes = v.split("\n").map((l) => l.trim()).filter(Boolean); }, "lignes")} />
        <div className="ligne-champs">
          <Champ etiquette="Accent (mot en couleur)" valeur={c.accent || ""} changer={(v) => maj((x) => { if (v.trim()) x.accent = v.trim(); else delete x.accent; }, "accent")} />
          <Champ etiquette="Mot en Antiqua" valeur={c.secondaire || ""} changer={(v) => maj((x) => { if (v.trim()) x.secondaire = v.trim(); else delete x.secondaire; }, "secondaire")} />
        </div>
        <div className="ligne-champs">
          <label className="champ">
            <span>Style</span>
            <select value={c.style || ""} onChange={(e) => maj((x) => { if (e.target.value) x.style = e.target.value; else delete x.style; }, "style")}>
              <option value="">par défaut</option>
              {styles.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="champ">
            <span>Transparence</span>
            <select value={c.transparence || infos.transparenceDefaut} onChange={(e) => maj((x) => { if (e.target.value !== infos.transparenceDefaut) x.transparence = e.target.value; else delete x.transparence; }, "transparence")}>
              {infos.transparences.map((n) => <option key={n} value={n}>{NOMS_TRANSPARENCE[n] || n}{n === infos.transparenceDefaut ? " (défaut)" : ""}</option>)}
            </select>
          </label>
        </div>
        <PlaceCarte recette={recette} k={k} etat={etat} modifier={modifier} />
        {(CHAMPS_TYPE[t] || []).map((ch) => (
          <Champ key={ch.cle} etiquette={ch.nom}
            valeur={Array.isArray(c[ch.cle]) ? c[ch.cle].join(", ") : c[ch.cle] !== undefined ? String(c[ch.cle]) : ""}
            changer={(v) => maj((x) => {
              const s = v.trim();
              if (!s) delete x[ch.cle];
              else if (ch.cle === "valeur") x.valeur = Number(s.replace(/\s/g, "")) || 0;
              else if (ch.cle === "etiquettes") x.etiquettes = s.split(",").map((y) => y.trim()).filter(Boolean);
              else x[ch.cle] = s;
            }, ch.cle)} />
        ))}
        {c.elements !== undefined && (
          <div className="elements">
            <div className="titre-elements">
              <span>{t === "jauge" ? "États (l'aiguille passe de l'un à l'autre)" : "Éléments"} · {bornes}</span>
              <small>« à » = secondes après le début de la carte (calé sur la voix)</small>
            </div>
            {c.elements.map((e: Element, i: number) => (
              <div key={i} className={`element ${paires && i % 2 ? "realite" : ""}`}>
                <Champ etiquette={nomEl(i)} valeur={e.texte} changer={(v) => maj((x) => { x.elements![i].texte = v; }, `el${i}`)} />
                <div className="ligne-champs">
                  <Nombre etiquette="à (s)" valeur={e.a} changer={(v) => maj((x) => { x.elements![i].a = v ?? 0; }, `el${i}a`)} />
                  {AVEC_NIVEAU.includes(t) && <Nombre etiquette="niveau (0 à 1)" valeur={e.niveau} changer={(v) => maj((x) => { if (v === undefined) delete x.elements![i].niveau; else x.elements![i].niveau = v; }, `el${i}n`)} />}
                  {AVEC_VALEUR.includes(t) && <Nombre etiquette="chiffre dit" valeur={e.valeur} changer={(v) => maj((x) => { if (v === undefined) delete x.elements![i].valeur; else x.elements![i].valeur = v; }, `el${i}v`)} />}
                  {nbE - pas >= eMin && (!paires || i % 2 === 1) && (
                    <button className="petit" title={paires ? "Retirer la paire" : "Retirer l'élément"} onClick={() => maj((x) => { x.elements!.splice(paires ? i - 1 : i, pas); }, "elements")}>✕</button>
                  )}
                </div>
              </div>
            ))}
            {nbE + pas <= eMax && (
              <button className="petit" onClick={() => maj((x) => {
                const d = x.elements!.length ? (x.elements![x.elements!.length - 1].a ?? 0) + 0.8 : 0.5;
                const a = (v: number) => Math.round(Math.min(v, x.duree - 0.6) * 100) / 100;
                if (paires) x.elements!.push({ texte: "Mythe dit", a: a(d) }, { texte: "Réalité dite", a: a(d + 1.2) });
                else x.elements!.push({ texte: "Nouvel élément", a: a(d), ...(AVEC_NIVEAU.includes(t) ? { niveau: 0.5 } : {}) });
              }, "elements")}>{paires ? "+ Ajouter une paire" : "+ Ajouter un élément"}</button>
            )}
          </div>
        )}
        <button className="danger" onClick={supprimer}>Supprimer la carte</button>
      </div>
    );
  }
  if (selection.genre === "sous_titre") {
    const g = etat?.sous_titres.groupes[selection.index];
    if (!g || !etat) return null;
    const actuels = etat.sous_titres.groupes.map((x) => x.texte);
    const ecrits = recette.sous_titres.groupes;
    const source = ecrits && ecrits.length ? g.source : selection.index;
    const texte = ecrits && ecrits.length ? ecrits[source] ?? g.texte : g.texte;
    return (
      <div className="inspecteur">
        <h3>Sous-titre {selection.index + 1}</h3>
        <p className="note">{formatTemps(g.debut)} à {formatTemps(g.fin)}. Corrige le texte (mots mal transcrits) sans changer ce qui est dit ; les temps viennent de la voix.</p>
        <Champ long etiquette="Texte du groupe" valeur={texte}
          changer={(v) => modifier(corrigerSousTitre(recette, actuels, source, v), `st${source}`)}
          aide="20 caractères environ par groupe. Le moteur recalcule les groupes après la modification." />
      </div>
    );
  }
  if (selection.genre === "son") {
    const s = (recette.sons || [])[selection.index];
    if (!s) return null;
    const maj = (f: (x: Recette) => void) => { const r = copie(recette); f(r); modifier(r, `son${selection.index}`); };
    return (
      <div className="inspecteur">
        <h3>Son · {nomSon(s.fichier)}</h3>
        <p className="note">{s.fichier}</p>
        <Nombre etiquette="Début (s)" valeur={s.debut} changer={(v) => maj((r) => { r.sons![selection.index].debut = Math.max(0, v ?? 0); })} />
        <Volume etiquette="Volume" valeur={s.volume_db ?? 0} bornes={infos.volumeSon} aide="0 dB : le niveau du moteur (discret, sous la voix)."
          changer={(v) => maj((r) => { if (v) r.sons![selection.index].volume_db = v; else delete r.sons![selection.index].volume_db; })} />
        <div className="ligne-boutons">
          <button className="petit" onClick={() => p.ecouter(s.fichier)}>▶ Écouter</button>
        </div>
        <p className="note">Règles du moteur (avertissements) : un son au plus toutes les 2 s, jamais sur un mot clé.</p>
        <button className="danger" onClick={supprimer}>Supprimer le son</button>
      </div>
    );
  }
  if (selection.genre === "musique") {
    // Batch 4b : un bloc de musique (plusieurs possibles, même de chansons différentes)
    const k = selection.index;
    const m = blocsMusique(recette)[k];
    if (!m) return null;
    const cle = `musique${k}`;
    const duree = infos.dureesChansons[m.fichier];
    const [fi, fo] = fondus(m);
    const f1 = (v: number) => v.toFixed(1).replace(".", ",");
    return (
      <div className="inspecteur">
        <h3>Musique {blocsMusique(recette).length > 1 ? `(bloc ${k + 1})` : ""}</h3>
        <label className="champ">
          <span>Morceau</span>
          <select value={m.fichier} onChange={(e) => modifier(changerChanson(recette, k, e.target.value), cle)}>
            {infos.musiques.map((f) => <option key={f} value={f}>{f.replace(/^musique\//, "")}</option>)}
          </select>
        </label>
        <div className="ligne-champs">
          <Nombre etiquette="Début (s)" valeur={m.debut} changer={(v) => v !== undefined && modifier(deplacerMusique(recette, k, v), cle)} />
          <Nombre etiquette="Fin (s)" valeur={m.fin} changer={(v) => v !== undefined && modifier(rognerMusique(recette, k, "fin", v), cle)} />
          <Nombre etiquette="Début dans la chanson (s)" valeur={m.decalage ?? 0} changer={(v) => v !== undefined && modifier(glisserContenu(recette, k, v, duree), cle)} />
        </div>
        <p className="note petite">{duree ? `Chanson de ${f1(duree)} s : elle reprend au début si le bloc dure plus longtemps. ` : ""}Dans la timeline : glisser le bloc pour le déplacer, Alt + glisser pour choisir la partie de la chanson, tirer ses bords pour rogner.</p>
        <div className="ligne-champs">
          <Nombre etiquette={`Fondu d'entrée (0 à ${FONDU_MAX} s)`} valeur={fi} changer={(v) => v !== undefined && modifier(reglerMusique(recette, k, "fondu_entree", v), cle)} />
          <Nombre etiquette={`Fondu de sortie (0 à ${FONDU_MAX} s)`} valeur={fo} changer={(v) => v !== undefined && modifier(reglerMusique(recette, k, "fondu_sortie", v), cle)} />
        </div>
        <Volume etiquette="Niveau sous la voix" valeur={m.volume_db ?? MUSIQUE_SOUS_VOIX} bornes={VOLUME_MUSIQUE} aide="-23 dB par défaut. La musique baisse aussi de 3 à 5 dB quand la voix parle."
          changer={(v) => modifier(reglerMusique(recette, k, "volume_db", v), cle)} />
        <div className="ligne-boutons">
          <button className="petit" disabled={!(p.temps > m.debut + 0.25 && p.temps < m.fin - 0.25)} onClick={p.couper} title="Touche C">✂ Couper à la tête de lecture</button>
          <button className="petit" onClick={() => p.ecouter(m.fichier)}>▶ Écouter</button>
        </div>
        <button className="danger" onClick={supprimer}>Supprimer ce bloc de musique</button>
      </div>
    );
  }
  if (selection.genre === "plan") {
    const k = selection.index;
    const pl = recette.plans[k];
    if (!pl) return null;
    const maj = (f: (x: Recette) => void) => { const r = copie(recette); f(r); modifier(r, `plan${k}`); };
    // Début et durée : le zoom peut changer de rang (il recouvre ce qui est dessous) ; la sélection le suit
    const placer = (res: { recette: Recette; index: number }) => { modifier(res.recette, `plan${k}`); p.choisir({ genre: "plan", index: res.index }); };
    const glisse = pl.mouvement === "glisse";
    const vu = etat?.plans?.[k];
    const f2 = (v: number) => v.toFixed(2).replace(".", ",");
    return (
      <div className="inspecteur">
        <h3>Zoom {pl.modele ? "posé par Hugues" : "du montage"}</h3>
        {pl.bloque && <div className="alerte avis">{pl.bloque}</div>}
        {vu && (vu.zoom_de !== pl.zoom_de || vu.zoom_a !== pl.zoom_a) && <div className="note">Le moteur le dézoome pendant une carte (place sous le menton) : {vu.zoom_de} → {vu.zoom_a}.</div>}
        <div className="ligne-champs">
          <Nombre etiquette="Début (s)" valeur={pl.debut} changer={(v) => placer(deplacerZoom(recette, k, v ?? 0))} />
          <Nombre etiquette="Durée (s)" valeur={Math.round((pl.fin - pl.debut) * 100) / 100} changer={(v) => placer(etirerZoom(recette, k, "fin", pl.debut + Math.max(0.2, v ?? 1)))} />
        </div>
        <div className="ligne-champs">
          <Nombre etiquette={glisse ? "Zoom de départ" : "Zoom"} valeur={pl.zoom_de ?? 1} changer={(v) => modifier(reglerZoom(recette, k, "zoom_de", v ?? 1), `plan${k}`)} />
          {glisse && <Nombre etiquette="Zoom d'arrivée" valeur={pl.zoom_a ?? 1} changer={(v) => modifier(reglerZoom(recette, k, "zoom_a", v ?? 1), `plan${k}`)} />}
        </div>
        <label className="champ">
          <span>{glisse ? "Zoom d'arrivée" : "Zoom"} : <b>{f2(glisse ? pl.zoom_a ?? 1 : pl.zoom_de ?? 1)}</b></span>
          <input type="range" min={1} max={ZOOM_MAX} step={0.05} value={glisse ? pl.zoom_a ?? 1 : pl.zoom_de ?? 1}
            onChange={(e) => modifier(reglerZoom(recette, k, glisse ? "zoom_a" : "zoom_de", Number(e.target.value)), `plan${k}`)} />
          <small>De 1,0 (cadrage de base) à 1,8. Une valeur impossible est bloquée à la valeur permise.</small>
        </label>
        <div className="ligne-champs">
          <label className="champ">
            <span>Mouvement</span>
            <select value={pl.mouvement || "coupe"} onChange={(e) => maj((r) => {
              const x = r.plans[k];
              x.mouvement = e.target.value;
              if (e.target.value === "coupe") { x.zoom_a = x.zoom_de; delete x.rampe; delete x.courbe; }
              else if (x.zoom_a === x.zoom_de) x.zoom_a = Math.min(ZOOM_MAX, Math.round(((x.zoom_de ?? 1) + 0.15) * 100) / 100);
            })}>
              <option value="coupe">coupe (zoom fixe)</option>
              <option value="glisse">glisse (de → à)</option>
            </select>
          </label>
          {glisse && (
            <label className="champ">
              <span>Courbe</span>
              <select value={pl.courbe || "douce"} onChange={(e) => maj((r) => { r.plans[k].courbe = e.target.value; })}>
                <option value="douce">douce</option>
                <option value="sortie">rapide puis lente</option>
              </select>
            </label>
          )}
          {glisse && <Nombre etiquette="Rampe (s)" valeur={pl.rampe ?? Math.round((pl.fin - pl.debut) * 100) / 100} changer={(v) => maj((r) => { r.plans[k].rampe = Math.max(0.1, Math.min(r.plans[k].fin - r.plans[k].debut, v ?? 1)); })} />}
        </div>
        <p className="note">Glisser le bloc pour le déplacer, tirer ses bords pour l'étirer. Règle du moteur (avertissement) : à chaque coupe, le zoom change d'au moins 0,15.</p>
        <button className="danger" onClick={supprimer}>Supprimer le zoom (retour au cadrage de base)</button>
      </div>
    );
  }
  const m = morceaux(recette)[selection.index];
  const pl = recette.plages[selection.index];
  if (!m || !pl) return null;
  const dedans = p.temps > m.sortie + 0.1 && p.temps < m.sortie + m.duree - 0.1;
  const dureeSource = etat?.duree_source ?? Infinity;
  const brut = brutRetire(recette, selection.index, dureeSource);
  const s = (v: number) => v.toFixed(2).replace(".", ",");
  const recuperer = (cote: "debut" | "fin") =>
    modifier(rognerPlage(recette, selection.index, cote, cote === "debut" ? pl.debut - brut.avant : pl.fin + brut.apres, dureeSource));
  return (
    <div className="inspecteur">
      <h3>Morceau {selection.index + 1}</h3>
      <p className="note">Dans la vidéo finale : {formatTemps(m.sortie)} à {formatTemps(m.sortie + m.duree)}.</p>
      <p className="note">Dans la source : {formatTemps(pl.debut)} à {formatTemps(pl.fin)}.</p>
      <div className="ligne-boutons">
        <button className="petit" disabled={!dedans} onClick={p.couper} title="Touche C">✂ Couper à la tête de lecture</button>
        {recette.plages.length > 1 && <button className="petit" onClick={supprimer} title="Touche Suppr">Supprimer ce morceau</button>}
      </div>
      {(brut.avant > 0 || brut.apres > 0) && (
        <div className="ligne-boutons">
          {brut.avant > 0 && <button className="petit" onClick={() => recuperer("debut")}
            title="Rallonge le début du morceau jusqu'au brut gardé avant lui">◂ Récupérer {s(brut.avant)} s avant</button>}
          {brut.apres > 0 && <button className="petit" onClick={() => recuperer("fin")}
            title="Rallonge la fin du morceau jusqu'au brut gardé après lui (ou la fin de la vidéo)">Récupérer {s(brut.apres)} s après ▸</button>}
        </div>
      )}
      <p className="note">Tire les bords du morceau dans la timeline pour couper plus tôt, ou plus tard pour récupérer du brut retiré (les pastilles « +2,2 s » le montrent). Supprimer un morceau retire aussi les cartes, sons et sous-titres posés dedans ; tout ce qui suit recule. La vidéo en direct suit tout de suite ; « Appliquer » refait l'aperçu complet.</p>
    </div>
  );
};
