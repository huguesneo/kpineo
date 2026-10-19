// Copie de video-neo/labo/timeline/src/logique.ts, retouchée pour le hub par scripts/synchro-timeline.mjs : ne pas modifier à la main.
// Logique pure de la timeline (sans React) : temps, rognage des plages, déplacements, historique, garde-fous.
// Testée par labo/timeline/tests/logique.test.mjs (node --test). Aucun import : le fichier reste autonome.

export const FPS = 30;

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Element = { texte: string; a?: number; niveau?: number; valeur?: number; fort?: boolean };
export type Carte = {
  id?: string; type?: string; lignes?: string[]; debut: number; duree: number; style?: string; accent?: string;
  secondaire?: string; elements?: Element[]; [cle: string]: any;
};
export type Plage = { source: string; debut: number; fin: number; note?: string };
export type Plan = { debut: number; fin: number; zoom_de?: number; zoom_a?: number; mouvement?: string; [cle: string]: any };
export type Son = { fichier: string; debut: number; volume_db?: number };
export type Musique = {
  active?: boolean; fichier?: string; debut?: number; fin?: number; volume_db?: number; fondu_entree?: number;
  fondu_sortie?: number; demandee?: string; [cle: string]: any;
};
export type BlocMusique = {
  fichier: string; debut: number; fin: number; decalage?: number; volume_db?: number; fondu_entree?: number;
  fondu_sortie?: number; demandee?: string;
};
export type Recette = {
  plages: Plage[]; plans: Plan[]; cartes: Carte[]; sons?: Son[]; musique?: Musique; musiques?: BlocMusique[];
  sous_titres: { groupes?: string[]; mots_cles?: string[]; [cle: string]: any };
  [cle: string]: any;
};
// erreur : limite technique (bloque le rendu) ; avis : avertissement objectif (jaune, jamais bloquant) ;
// info : ce que le moteur fait seul (dézoom, réduction), affiché discrètement
export type Probleme = { message: string; carte: number | null; niveau: "erreur" | "avis" | "info" };

export const img = (t: number) => Math.round(t * FPS);
export const caler = (t: number) => Math.round(img(t) / FPS * 10000) / 10000; // temps posé sur une image
export const copie = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Place de chaque plage dans la vidéo finale (mêmes arrondis que recette.py). */
export const morceaux = (r: Recette) => {
  let pos = 0;
  return r.plages.map((p) => {
    const a = img(p.debut), b = img(p.fin);
    const m = { sortie: pos / FPS, duree: (b - a) / FPS, debut: p.debut, fin: p.fin };
    pos += b - a;
    return m;
  });
};

export const dureeTotale = (r: Recette) => morceaux(r).reduce((s, m) => s + m.duree, 0);

/** Morceaux lus dans la source par le lecteur en direct : une plage coupée sans rien retirer reste un seul morceau
 *  (comme recette.py), donc aucune relecture de la vidéo là où rien n'est coupé. */
export const morceauxLecture = (r: Recette) => {
  const out: { source: string; sortie: number; duree: number; debut: number }[] = [];
  morceaux(r).forEach((m, i) => {
    const p = r.plages[i], av = r.plages[i - 1], der = out[out.length - 1];
    if (der && av && av.source === p.source && img(av.fin) === img(p.debut)) der.duree += m.duree;
    else out.push({ source: p.source, sortie: m.sortie, duree: m.duree, debut: m.debut });
  });
  return out;
};

/** Plans à montrer : ceux du moteur (dézooms pendant les cartes compris) seulement s'ils ont les mêmes temps que la
 *  recette ; sinon (vérification pas encore revenue après une coupe) ceux de la recette. */
export const plansAffiches = (recette: Plan[], moteur?: Plan[] | null): Plan[] => {
  if (!moteur || moteur.length !== recette.length
    || !moteur.every((p, i) => img(p.debut) === img(recette[i].debut) && img(p.fin) === img(recette[i].fin))) return recette;
  // Le moteur ne fait que dézoomer : une valeur plus forte que celle de la recette est un état périmé
  const z = (p: Plan, k: "zoom_de" | "zoom_a") => p[k] ?? p.zoom_de ?? 1;
  return recette.map((p, i) => (z(moteur[i], "zoom_de") <= z(p, "zoom_de") + 1e-9 && z(moteur[i], "zoom_a") <= z(p, "zoom_a") + 1e-9
    && (moteur[i].mouvement || "coupe") === (p.mouvement || "coupe") ? { ...p, zoom_de: moteur[i].zoom_de, zoom_a: moteur[i].zoom_a } : p));
};

/** Décale de `delta` tout ce qui commence après `borne` (cartes, sons, plans) ; le plan qui contient la borne
 *  s'allonge ou raccourcit. inclusif : la borne elle-même bouge aussi (fin d'une plage). */
export const decaler = (r: Recette, borne: number, delta: number, inclusif: boolean): Recette => {
  const out = copie(r);
  // Comparaison en images : les temps de la recette sont arrondis à 4 décimales (10,2333 pour 307 images)
  const apres = (t: number) => (inclusif ? img(t) >= img(borne) : img(t) > img(borne));
  // Rien ne recule avant la borne (début rogné) ou avant la nouvelle fin de la plage (fin raccourcie)
  const plancher = inclusif ? borne + Math.min(0, delta) : borne;
  const bouge = (t: number) => caler(Math.max(plancher, t + delta));
  out.plans = out.plans
    .map((p) => ({ ...p, debut: apres(p.debut) ? bouge(p.debut) : p.debut, fin: apres(p.fin) ? bouge(p.fin) : p.fin }))
    .filter((p) => img(p.fin) > img(p.debut));
  for (const c of out.cartes) if (apres(c.debut)) c.debut = bouge(c.debut);
  for (const s of out.sons || []) if (apres(s.debut)) s.debut = bouge(s.debut);
  const mus = out.musique;
  if (mus?.active) {
    if (mus.debut !== undefined && apres(mus.debut)) mus.debut = bouge(mus.debut);
    if (mus.fin !== undefined && apres(mus.fin)) mus.fin = bouge(mus.fin);
  }
  if (out.musiques) {
    for (const m of out.musiques) {
      if (apres(m.debut)) m.debut = bouge(m.debut);
      if (apres(m.fin)) m.fin = bouge(m.fin);
    }
    out.musiques = out.musiques.filter((m) => m.fin - m.debut > 0.1);
  }
  // Les plans couvrent toute la vidéo, sans trou
  const total = caler(dureeTotale(out));
  if (out.plans.length) {
    out.plans[0].debut = 0;
    for (let i = 1; i < out.plans.length; i++) out.plans[i].debut = out.plans[i - 1].fin;
    out.plans[out.plans.length - 1].fin = total;
  }
  return out;
};

/** Rogne le début ou la fin d'une plage (temps de la source), en gardant les plages dans l'ordre et 0,3 s au moins.
 *  dureeSource : durée de la vidéo source (borne de la dernière plage). */
export const rognerPlage = (r: Recette, k: number, cote: "debut" | "fin", t: number, dureeSource = Infinity): Recette => {
  const p = r.plages[k];
  const avant = r.plages[k - 1], apres = r.plages[k + 1];
  const m = morceaux(r)[k];
  let nouveau = t;
  if (cote === "debut") {
    const mini = avant && avant.source === p.source ? avant.fin : 0;
    nouveau = Math.min(Math.max(nouveau, mini), p.fin - 0.3);
  } else {
    const maxi = apres && apres.source === p.source ? apres.debut : dureeSource;
    nouveau = Math.max(Math.min(nouveau, maxi), p.debut + 0.3);
  }
  nouveau = Math.round(nouveau * 1000) / 1000;
  const ancien = p[cote];
  const delta = cote === "debut" ? (img(ancien) - img(nouveau)) / FPS : (img(nouveau) - img(ancien)) / FPS;
  if (Math.abs(delta) < 1e-9) return r;
  // Le premier plan de la plage garde 0,2 s au moins (un rognage plus long est refusé)
  const borne = cote === "debut" ? m.sortie : m.sortie + m.duree;
  const avecPlage = copie(r);
  avecPlage.plages[k] = { ...p, [cote]: nouveau };
  const out = decaler(avecPlage, borne, delta, cote === "fin");
  return out;
};

/** Brut retiré qu'on récupère en étirant la plage k (secondes de la source), avant son début et après sa fin : jusqu'à
 *  la plage voisine de la même source, au début de la source ou à dureeSource (0 si elle est inconnue). Mêmes bornes que
 *  rognerPlage. Décision du 15 oct. 2026 : le « Coupé ! » retiré par l'IA doit se voir et se récupérer d'un geste. */
export const brutRetire = (r: Recette, k: number, dureeSource = Infinity): { avant: number; apres: number } => {
  const p = r.plages[k];
  const avant = r.plages[k - 1], apres = r.plages[k + 1];
  const mini = avant && avant.source === p.source ? avant.fin : 0;
  const maxi = apres && apres.source === p.source ? apres.debut : dureeSource;
  const s = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.round(x * 1000) / 1000) : 0);
  return { avant: s(p.debut - mini), apres: s(maxi - p.fin) };
};

/** Sons posés avec une carte (même début, à 0,05 s près) : ils la suivent. */
export const sonsDeCarte = (r: Recette, k: number): number[] =>
  (r.sons || []).map((s, i) => ({ s, i })).filter(({ s }) => Math.abs(s.debut - r.cartes[k].debut) < 0.05).map(({ i }) => i);

export const deplacerCarte = (r: Recette, k: number, debut: number): Recette => {
  const out = copie(r);
  const c = out.cartes[k];
  const lies = sonsDeCarte(r, k);
  c.debut = caler(Math.max(0, Math.min(dureeTotale(r) - c.duree, debut)));
  for (const i of lies) out.sons![i].debut = c.debut;
  return out;
};

export const supprimerCarte = (r: Recette, k: number): Recette => {
  const out = copie(r);
  const lies = new Set(sonsDeCarte(r, k));
  out.cartes.splice(k, 1);
  out.sons = (out.sons || []).filter((_, i) => !lies.has(i));
  return out;
};

// Son posé avec une nouvelle carte, selon son type (fiche-recette.md, « Sons et musique »)
export const SON_PAR_TYPE: Record<string, string> = {
  texte: "texte/pop_01.MP3", chiffre_photo: "texte/pop_01.MP3", liste: "transitions/swish-court_01.MP3",
  etapes: "transitions/swish-court_01.MP3", revelation: "transitions/swish-court_01.MP3",
  question: "interface/click-souris_01.MP3", cta: "interface/click-souris_01.MP3", jauge: "transitions/Riser-court_01.MP3",
  courbe: "transitions/Riser-court_01.MP3", comparaison: "transitions/Riser-court_01.MP3",
  cycle: "transitions/swish-court_01.MP3", mythe_realite: "transitions/swish-court_01.MP3",
};

export const etirerCarte = (r: Recette, k: number, duree: number, bornes: [number, number] = [1, 10]): Recette => {
  const out = copie(r);
  const c = out.cartes[k];
  const maxi = Math.min(bornes[1], dureeTotale(r) - c.debut);
  c.duree = Math.round(Math.max(bornes[0], Math.min(maxi, duree)) * 100) / 100;
  // Les éléments restent dans la carte (0,6 s avant la fin au plus)
  for (const e of c.elements || []) if (e.a !== undefined) e.a = Math.min(e.a, Math.max(0, c.duree - 0.6));
  return out;
};

export const deplacerSon = (r: Recette, k: number, debut: number): Recette => {
  const out = copie(r);
  out.sons![k].debut = caler(Math.max(0, Math.min(dureeTotale(r) - 0.1, debut)));
  return out;
};

/** Nouvelle carte posée à `debut` depuis un modèle de la palette. */
export const ajouterCarte = (r: Recette, modele: Carte, debut: number): { recette: Recette; index: number } => {
  const out = copie(r);
  const c: Carte = { ...copie(modele), debut: 0 };
  c.duree = c.duree || 3;
  c.debut = caler(Math.max(0, Math.min(dureeTotale(r) - c.duree, debut)));
  const ids = new Set(out.cartes.map((x) => x.id));
  let n = out.cartes.length + 1;
  while (ids.has(`c${n}`)) n++;
  c.id = `c${n}`;
  out.cartes.push(c);
  out.cartes.sort((a, b) => a.debut - b.debut);
  return { recette: out, index: out.cartes.indexOf(c) };
};

export const ajouterSon = (r: Recette, fichier: string, debut: number): Recette => {
  const out = copie(r);
  out.sons = [...(out.sons || []), { fichier, debut: caler(debut) }].sort((a, b) => a.debut - b.debut);
  return out;
};

/** Texte corrigé d'un groupe de sous-titres : les groupes deviennent écrits (ceux affichés par le moteur). */
export const corrigerSousTitre = (r: Recette, groupesActuels: string[], i: number, texte: string): Recette => {
  // Un groupe vidé garde sa place (les numéros des suivants ne bougent pas) ; le moteur saute les groupes vides.
  const out = copie(r);
  const groupes = out.sous_titres.groupes && out.sous_titres.groupes.length ? [...out.sous_titres.groupes] : [...groupesActuels];
  groupes[i] = texte.trim();
  out.sous_titres.groupes = groupes;
  return out;
};

// ------------------------------------------------------------------ garde-fous immédiats (le reste vient du moteur)
export const nomSon = (f: string) => (f.split("/").pop() || f).replace(/\.(mp3|wav|m4a|aac|ogg|flac|aiff?)$/i, "");

/** Garde-fous de la timeline (décision de Hugues du 19 oct. 2026) : aucune règle de goût pour une édition à la main
 *  (écart de 8 s, nombre de cartes, durées, rythme, sons, contractions, tiret, zooms : rien n'est montré). Restent les
 *  limites techniques du moteur (rouges, elles bloquent le rendu), ce qu'il fait seul (info) et deux avertissements
 *  objectifs : « Cette carte touche le visage » (moteur) et « hors de la zone visible Instagram/Facebook » (ici). */
export const AVIS_OBJECTIFS = [/touche le visage/, /hors de la zone visible Instagram\/Facebook/];
export const problemesTimeline = (
  r: Recette, etat?: { cartes: PlacementCarte[]; sous_titres?: { groupes: GroupeSousTitre[]; hauteur: number; taille?: number }; problemes?: Probleme[] } | null,
): Probleme[] => {
  const tous = [...(etat ? avertissementsInterface(r, etat.cartes, etat.sous_titres) : []), ...(etat?.problemes || [])];
  const vus = new Set<string>();
  return tous.filter((p) => p.niveau !== "avis" || AVIS_OBJECTIFS.some((re) => re.test(p.message)))
    .filter((p) => (vus.has(`${p.carte}|${p.message}`) ? false : (vus.add(`${p.carte}|${p.message}`), true)));
};

// ------------------------------------------------------------------ couper la vidéo
/** Coupe la plage sous la tête de lecture `t` (temps de la vidéo finale) en deux morceaux, sans rien retirer :
 *  le moteur la lit comme une seule plage (aucune coupe visible) tant qu'aucun morceau n'est supprimé. */
export const couperPlage = (r: Recette, t: number): { recette: Recette; index: number } | null => {
  const ms = morceaux(r);
  const k = ms.findIndex((m) => t > m.sortie + 0.1 && t < m.sortie + m.duree - 0.1);
  if (k < 0) return null;
  const p = r.plages[k];
  const f = img(p.debut) + img(t) - img(ms[k].sortie);   // image de la source sous la tête
  const s = Math.round((f / FPS) * 10000) / 10000;
  const out = copie(r);
  out.plages.splice(k, 1, { ...p, fin: s }, { ...p, debut: s });
  return { recette: out, index: k + 1 };
};

/** Plans sans l'intervalle [a, b[ de la vidéo finale : ce qui suit recule de b - a ; un zoom qui commence dans le
 *  morceau retiré part avec lui (le reste revient au cadrage de base) ; un plan coupé en deux par la suppression
 *  garde son zoom des deux côtés, puis la coupe reçoit un changement de zoom (règle du moteur). */
const retirerDesPlans = (plans: Plan[], a: number, b: number): Plan[] => {
  const d = b - a;
  const out: Plan[] = [];
  let coupe = -1;
  for (const p of plans) {
    // Comparaisons en images (temps de la recette arrondis à 4 décimales)
    const [pa, pb, ia, ib] = [img(p.debut), img(p.fin), img(a), img(b)];
    if (pb <= ia) out.push(p);
    else if (pa >= ib) out.push({ ...p, debut: caler(p.debut - d), fin: caler(p.fin - d) });
    else {
      if (pa < ia) out.push({ ...p, fin: caler(a) });
      if (pb > ib) {
        const parti = pa >= ia && !estBase(p);
        const reste: Plan = parti
          ? { zoom_de: ZOOM_BASE, zoom_a: ZOOM_BASE, mouvement: "coupe", ...(p.position !== undefined ? { position: p.position } : {}), debut: 0, fin: 0 }
          : fendre([p], b)[1] ?? p;   // glissé : repart du zoom atteint à b
        if (pa < ia) coupe = out.length;
        out.push({ ...reste, debut: caler(a), fin: caler(p.fin - d) });
      }
    }
  }
  if (coupe > 0) {
    const av = out[coupe - 1], ap = out[coupe];
    const zAv = av.zoom_a ?? av.zoom_de ?? 1, zAp = ap.zoom_de ?? 1;
    if (Math.abs(zAv - zAp) < 0.15 - 1e-9) {
      const z = Math.round((zAv + 0.2 <= 1.8 ? zAv + 0.2 : zAv - 0.2) * 100) / 100;
      out[coupe] = { ...ap, zoom_de: z, zoom_a: ap.mouvement === "glisse" ? Math.max(z, ap.zoom_a ?? z) : z };
    }
  }
  return out.filter((p) => img(p.fin) > img(p.debut));
};

export type GroupeAffiche = { source: number; debut: number; fin: number };

/** Supprime le morceau k (plage) : tout ce qui suit recule ; cartes et sons posés dans le morceau partent avec lui
 *  (ils parlaient de ce qui est coupé), les groupes de sous-titres écrits dont tous les mots y étaient aussi. */
export const supprimerPlage = (r: Recette, k: number, groupes: GroupeAffiche[] = []): Recette => {
  if (r.plages.length <= 1 || !r.plages[k]) return r;
  const m = morceaux(r)[k];
  const a = m.sortie, b = m.sortie + m.duree;
  const dedans = (t: number) => img(t) >= img(a) && img(t) < img(b);
  const out = copie(r);
  out.plages.splice(k, 1);
  const lies = new Set<number>();
  out.cartes.forEach((c, i) => { if (dedans(c.debut)) sonsDeCarte(r, i).forEach((x) => lies.add(x)); });
  out.cartes = out.cartes.filter((c) => !dedans(c.debut));
  out.sons = (out.sons || []).filter((s, i) => !dedans(s.debut) && !lies.has(i));
  const ecrits = out.sous_titres.groupes;
  if (ecrits && ecrits.length && groupes.length) {
    const tout = (g: GroupeAffiche) => g.debut >= a - 0.02 && g.fin <= b + 0.02;
    const garder = new Set(groupes.filter((g) => !tout(g)).map((g) => g.source));
    const retirer = new Set(groupes.filter(tout).map((g) => g.source).filter((x) => !garder.has(x)));
    out.sous_titres.groupes = ecrits.filter((_, i) => !retirer.has(i));
  }
  out.plans = retirerDesPlans(out.plans, a, b);
  const d = b - a;
  for (const c of out.cartes) if (img(c.debut) >= img(b)) c.debut = caler(c.debut - d);
  for (const s of out.sons || []) if (img(s.debut) >= img(b)) s.debut = caler(s.debut - d);
  if (out.musique?.active) {
    const mu = out.musique;
    const recule = (t: number) => (t >= b ? t - d : t > a ? a : t);
    if (mu.debut !== undefined) mu.debut = caler(recule(mu.debut));
    if (mu.fin !== undefined) mu.fin = caler(recule(mu.fin));
  }
  // Blocs de musique : la partie sous le morceau retiré part, la chanson continue sans saut (bloc raccourci)
  if (out.musiques) {
    out.musiques = out.musiques.map((m) => {
      if (m.fin <= a) return m;
      if (m.debut >= b) return { ...m, debut: caler(m.debut - d), fin: caler(m.fin - d) };
      const reste = (m.fin - m.debut) - (Math.min(m.fin, b) - Math.max(m.debut, a));
      const debut = Math.min(m.debut, a);
      return { ...m, debut: caler(debut), fin: caler(debut + reste) };
    }).filter((m) => m.fin - m.debut > 0.1);
  }
  const total = caler(dureeTotale(out));
  if (out.plans.length) { out.plans[0].debut = 0; out.plans[out.plans.length - 1].fin = total; }
  return out;
};

// ------------------------------------------------------------------ zooms (plans de la recette)
export type ModeleZoom = { cle: string; nom: string; aide: string; duree: number; plan: Partial<Plan> };
export const ZOOMS: ModeleZoom[] = [
  { cle: "punch_in", nom: "Punch-in rapide", aide: "1,0 → 1,35 en 0,25 s, puis tenu", duree: 2.5,
    plan: { zoom_de: 1.0, zoom_a: 1.35, mouvement: "glisse", courbe: "sortie", rampe: 0.25 } },
  { cle: "poussee_lente", nom: "Poussée lente", aide: "1,0 → 1,2 sur toute la durée", duree: 5,
    plan: { zoom_de: 1.0, zoom_a: 1.2, mouvement: "glisse", courbe: "douce" } },
  { cle: "dezoom", nom: "Dézoom", aide: "1,35 → 1,0 en 1,2 s", duree: 3,
    plan: { zoom_de: 1.35, zoom_a: 1.0, mouvement: "glisse", courbe: "douce", rampe: 1.2 } },
  { cle: "serre", nom: "Cadrage serré", aide: "1,45 fixe", duree: 3, plan: { zoom_de: 1.45, zoom_a: 1.45, mouvement: "coupe" } },
  { cle: "large", nom: "Retour au plan large", aide: "1,0 fixe", duree: 3, plan: { zoom_de: 1.0, zoom_a: 1.0, mouvement: "coupe" } },
];

// Batch 3b : la piste Zooms montre des blocs ; un plan « de base » (1,0 fixe, le cadrage de la source) est l'absence
// de zoom. Les plans couvrent toujours toute la vidéo (règle du moteur) : poser, déplacer ou étirer un zoom recouvre ce
// qui est dessous, le supprimer remet le cadrage de base.
export const ZOOM_BASE = 1.0;
export const ZOOM_MAX = 1.8; // recette.py : zoom_de et zoom_a de 1,0 à 1,8

/** Plan sans zoom : cadrage de base, fixe. */
export const estBase = (p: Plan) =>
  (p.zoom_de ?? 1) === ZOOM_BASE && (p.zoom_a ?? p.zoom_de ?? 1) === ZOOM_BASE;

/** Zoom d'un plan à l'instant t (vidéo finale), comme image.expr_zoom du moteur. */
export const zoomA = (p: Plan, t: number): number => {
  const z0 = p.zoom_de ?? 1, z1 = p.zoom_a ?? z0;
  if ((p.mouvement || "coupe") === "coupe" || z0 === z1) return z0;
  const n = Math.max(1, Math.round((p.rampe ?? p.fin - p.debut) * FPS));
  const u = Math.min(Math.max(0, img(t) - img(p.debut)) / n, 1);
  const c = p.courbe === "sortie" ? 1 - Math.pow(1 - u, 3) : u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  return z0 + (z1 - z0) * c;
};

export const planA = (plans: Plan[], t: number): Plan | undefined =>
  plans.find((p) => t >= p.debut - 1e-6 && t < p.fin) || plans[plans.length - 1];

/** Coupe les plans à t. La 2e moitié d'un plan glissé repart du zoom atteint à t (pas de saut). */
const fendre = (plans: Plan[], t: number): Plan[] => {
  const out: Plan[] = [];
  for (const p of plans) {
    if (t > p.debut + 1 / FPS / 2 && t < p.fin - 1 / FPS / 2) {
      const suite: Plan = { ...p, debut: t };
      if (p.mouvement === "glisse" && p.zoom_de !== p.zoom_a) {
        const rampe = p.rampe ?? p.fin - p.debut;
        suite.zoom_de = Math.round(zoomA(p, t) * 1000) / 1000;
        if (t - p.debut >= rampe - 1e-6) { suite.mouvement = "coupe"; suite.zoom_de = suite.zoom_a; delete suite.rampe; }
        else if (p.rampe !== undefined) suite.rampe = caler(rampe - (t - p.debut));
      }
      out.push({ ...p, fin: t }, suite);
    } else out.push(p);
  }
  return out;
};

/** Coupes visibles (passage d'une plage à une autre qui ne la continue pas), en images de la vidéo finale. */
const imagesDesCoupes = (r: Recette): Set<number> =>
  new Set(morceaux(r).slice(1).filter((_, i) => {
    const av = r.plages[i], ap = r.plages[i + 1];
    return !(av.source === ap.source && img(av.fin) === img(ap.debut));
  }).map((m) => img(m.sortie)));

/** Fond les plans de base voisins (rien ne les distingue, aucune coupe entre eux). */
const fondreBases = (r: Recette, plans: Plan[]): Plan[] => {
  const coupes = imagesDesCoupes(r);
  const out: Plan[] = [];
  for (const x of plans) {
    const der = out[out.length - 1];
    if (der && estBase(der) && estBase(x) && !coupes.has(img(x.debut)) && der.position === x.position) der.fin = x.fin;
    else out.push({ ...x });
  }
  return out;
};

/** Pose un plan (zoom) sur [plan.debut, plan.fin[ : ce qui est dessous est recouvert. */
export const poserPlan = (r: Recette, plan: Plan): { recette: Recette; index: number } => {
  const total = caler(dureeTotale(r));
  const duree = Math.max(0.2, plan.fin - plan.debut);
  const a = caler(Math.max(0, Math.min(total - 0.2, plan.debut)));
  const b = caler(Math.min(total, a + duree));
  const out = copie(r);
  const plans = fendre(fendre(out.plans, a), b);
  const avant = plans.filter((p) => p.fin <= a + 1e-6), apres = plans.filter((p) => p.debut >= b - 1e-6);
  const dessous = plans.find((p) => p.debut < b - 1e-6 && p.fin > a + 1e-6);
  const nouveau: Plan = { ...(dessous?.position !== undefined ? { position: dessous.position } : {}), ...copie(plan), debut: a, fin: b };
  out.plans = fondreBases(out, [...avant, nouveau, ...apres]);
  return { recette: out, index: out.plans.indexOf(out.plans.find((p) => img(p.debut) === img(a))!) };
};

/** Pose un zoom préprogrammé à `t` : il devient un plan de la recette (zoom_de, zoom_a, mouvement, courbe). */
export const poserZoom = (r: Recette, t: number, modele: ModeleZoom): { recette: Recette; index: number } =>
  poserPlan(r, { debut: t, fin: t + modele.duree, ...copie(modele.plan), modele: modele.cle });

/** Supprime un zoom : retour au cadrage de base (1,0 fixe), fondu avec les plans de base voisins. */
export const supprimerZoom = (r: Recette, k: number): Recette => {
  const out = copie(r);
  const ps = out.plans;
  if (!ps[k] || estBase(ps[k])) return r;
  const p: Plan = { debut: ps[k].debut, fin: ps[k].fin, zoom_de: ZOOM_BASE, zoom_a: ZOOM_BASE, mouvement: "coupe" };
  if (ps[k].position !== undefined) p.position = ps[k].position;
  ps[k] = p;
  out.plans = fondreBases(out, ps);
  return out;
};

/** Déplace un zoom (même durée) : il recouvre ce qui est sous sa nouvelle place, l'ancienne revient au cadrage de base. */
export const deplacerZoom = (r: Recette, k: number, debut: number): { recette: Recette; index: number } => {
  const p = r.plans[k];
  if (!p || estBase(p)) return { recette: r, index: k };
  const d = p.fin - p.debut;
  const a = Math.max(0, Math.min(dureeTotale(r) - d, debut));
  return poserPlan(supprimerZoom(r, k), { ...copie(p), debut: a, fin: a + d });
};

/** Étire un zoom par son début ou sa fin (0,2 s au moins). */
export const etirerZoom = (r: Recette, k: number, cote: "debut" | "fin", t: number): { recette: Recette; index: number } => {
  const p = r.plans[k];
  if (!p || estBase(p)) return { recette: r, index: k };
  const a = cote === "debut" ? Math.max(0, Math.min(t, p.fin - 0.2)) : p.debut;
  const b = cote === "fin" ? Math.min(dureeTotale(r), Math.max(t, p.debut + 0.2)) : p.fin;
  return poserPlan(supprimerZoom(r, k), { ...copie(p), debut: a, fin: b });
};

/** Change le début et la durée d'un zoom depuis l'inspecteur. */
export const bornerPlan = (r: Recette, k: number, debut: number, fin: number): Recette => {
  const p = r.plans[k];
  if (!p) return r;
  if (estBase(p)) return r;
  const d = Math.max(0.2, fin - debut);
  const a = Math.max(0, Math.min(dureeTotale(r) - 0.2, debut));
  return poserPlan(supprimerZoom(r, k), { ...copie(p), debut: a, fin: a + d }).recette;
};

/** Zoom réglé depuis l'inspecteur : une valeur impossible est bloquée à la valeur permise (1,0 à 1,8) et notée
 *  dans le plan (`bloque`, ignoré par le moteur) pour l'avertissement jaune. */
export const reglerZoom = (r: Recette, k: number, champ: "zoom_de" | "zoom_a", valeur: number): Recette => {
  const out = copie(r);
  const p = out.plans[k];
  if (!p || !Number.isFinite(valeur)) return r;
  const v = Math.round(Math.max(ZOOM_BASE, Math.min(ZOOM_MAX, valeur)) * 100) / 100;
  p[champ] = v;
  if ((p.mouvement || "coupe") === "coupe") { p.zoom_de = v; p.zoom_a = v; }
  if (Math.abs(v - valeur) > 1e-9) {
    const f = (x: number) => String(Math.round(x * 100) / 100).replace(".", ",");
    p.bloque = `zoom ${f(valeur)} demandé, bloqué à ${f(v)} (${valeur < ZOOM_BASE ? "un zoom sous 1,0 laisserait des bords noirs" : "au-delà de 1,8, l'image du 4K deviendrait floue"})`;
  } else delete p.bloque;
  return out;
};

/** Cadrage d'un plan à l'instant t, calculé comme image.construire (zoompan du moteur) : fenêtre de largeur 1/zoom
 *  dans la source, centrée sur cadre.cx, le visage à `position` de la hauteur, gardée dans l'image (jamais de bord
 *  noir). Valeurs en fraction de l'image source. */
export type Cadre = { cx?: number; cy?: number; position?: number };
export const cadrage = (p: Plan | undefined, t: number, cadre: Cadre = {}) => {
  const demande = p ? zoomA(p, t) : 1;
  const z = Math.max(ZOOM_BASE, Math.min(ZOOM_MAX, demande));
  const cx = cadre.cx ?? 0.5, cy = cadre.cy ?? 0.33, pos = p?.position ?? cadre.position ?? 0.3;
  const voulu = { x: cx - 1 / z / 2, y: cy - pos / z };
  const x = Math.max(0, Math.min(1 - 1 / z, voulu.x)), y = Math.max(0, Math.min(1 - 1 / z, voulu.y));
  return { z, x, y, demande, decale: Math.max(Math.abs(x - voulu.x), Math.abs(y - voulu.y)) };
};

// ------------------------------------------------------------------ musique (batch 4b : piste comme CapCut)
// « musiques » dans la recette : des blocs {fichier, debut, fin (s de la vidéo finale), decalage (s dans la chanson),
// volume_db, fondu_entree, fondu_sortie}, sans chevauchement, plusieurs chansons possibles. Une recette d'avant
// (« musique », un seul morceau) est lue comme un bloc et réécrite en « musiques » au premier geste sur la musique.
export const MUSIQUE_SOUS_VOIX = -23;
export const FONDUS_MUSIQUE: [number, number] = [1.5, 2];   // défaut : entrée, sortie (s)
export const FONDU_MAX = 5;
export const BLOC_MUSIQUE_MIN = 0.5;
export const VOLUME_MUSIQUE: [number, number] = [-35, -10];
// Réglage → niveau réel, même calcul que le rendu (moteur/neo_moteur/son.py, sons.py ; 16 oct. 2026) : la musique est
// à (réglage + 11) LU de la voix (12 LU sous la voix à -23) et baisse de 4 dB pendant que la voix parle (groupes de
// sous-titres, 0,1 s avant à 0,2 s après). La voix de la copie légère est à -23,6 LUFS (outil.py proxy) ; le niveau de
// chaque chanson vient de la bibliothèque (« lufs », même mesure que le rendu), -14 LUFS si elle ne le donne pas.
export const MUSIQUE_REFERENCE = 11;
export const BAISSE_SOUS_VOIX = -4;
export const VOIX_LUFS = -23.6;
export const LUFS_CHANSON_DEFAUT = -14;
export const PAROLE: [number, number] = [0.1, 0.2];
export const db = (v: number) => Math.pow(10, v / 20);
/** La voix parle à l'instant t (groupes de sous-titres du moteur) : la musique y baisse. */
export const parleA = (groupes: { debut: number; fin: number }[], t: number): boolean =>
  groupes.some((g) => t >= g.debut - PAROLE[0] && t < g.fin + PAROLE[1]);
/** Volume (0 à 1) d'un bloc de musique à l'instant t dans l'aperçu en direct. */
export const gainMusique = (b: BlocMusique, t: number, lufsChanson: number | undefined, parle: boolean): number => {
  const lufs = Number.isFinite(lufsChanson) && (lufsChanson as number) > -70 ? (lufsChanson as number) : LUFS_CHANSON_DEFAUT;
  const niveau = VOIX_LUFS + (b.volume_db ?? MUSIQUE_SOUS_VOIX) + MUSIQUE_REFERENCE - lufs;
  return Math.min(1, db(niveau) * gainFondu(b, t) * (parle ? db(BAISSE_SOUS_VOIX) : 1));
};
const DEMANDEE = "musique posée dans la timeline par Hugues";
const cent = (v: number) => Math.round(v * 100) / 100;
const borner = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Blocs de musique, triés (ceux d'une recette d'avant convertis, sans la modifier). */
export const blocsMusique = (r: Recette): BlocMusique[] => {
  if (Array.isArray(r.musiques)) return [...r.musiques].sort((a, b) => a.debut - b.debut);
  const m = r.musique;
  if (!m?.active || !m.fichier) return [];
  const b: BlocMusique = { fichier: m.fichier, debut: m.debut ?? 0, fin: m.fin ?? caler(dureeTotale(r)) };
  if (m.volume_db !== undefined) b.volume_db = m.volume_db;
  if (m.fondu_entree !== undefined) b.fondu_entree = m.fondu_entree;
  if (m.fondu_sortie !== undefined) b.fondu_sortie = m.fondu_sortie;
  if (m.demandee !== undefined) b.demandee = m.demandee;
  return [b];
};

const avecBlocs = (r: Recette, blocs: BlocMusique[]): Recette => {
  const out = copie(r);
  out.musiques = copie(blocs).sort((a, b) => a.debut - b.debut);
  delete out.musique;
  return out;
};

/** Chanson déposée à `t` depuis la palette : un nouveau bloc (les autres restent), de la longueur de la chanson au
 *  plus, arrêté au bloc suivant ou à la fin de la vidéo. Déposée sur un bloc : posée juste après lui. */
export const poserMusique = (r: Recette, fichier: string, t: number, dureeChanson?: number): { recette: Recette; index: number } => {
  const total = caler(dureeTotale(r));
  const blocs = blocsMusique(r);
  let a = caler(borner(t, 0, total - BLOC_MUSIQUE_MIN));
  const dessous = blocs.find((b) => a >= b.debut - 1e-6 && a < b.fin - 1e-6);
  if (dessous) a = dessous.fin;
  const suivant = blocs.find((b) => b.debut >= a - 1e-6);
  const fin = caler(Math.min(total, suivant ? suivant.debut : total, dureeChanson ? a + dureeChanson : total));
  if (fin - a < BLOC_MUSIQUE_MIN - 1e-6) return { recette: r, index: -1 };
  const nouveau: BlocMusique = { fichier, debut: a, fin, volume_db: MUSIQUE_SOUS_VOIX, demandee: DEMANDEE };
  const out = avecBlocs(r, [...blocs, nouveau]);
  return { recette: out, index: out.musiques!.findIndex((b) => b.debut === a) };
};

/** Déplace le bloc k (même durée, même partie de la chanson) entre ses voisins. */
export const deplacerMusique = (r: Recette, k: number, debut: number): Recette => {
  const blocs = blocsMusique(r), b = blocs[k];
  if (!b) return r;
  const d = b.fin - b.debut, total = caler(dureeTotale(r));
  const mini = blocs[k - 1]?.fin ?? 0, maxi = (blocs[k + 1]?.debut ?? total) - d;
  const a = caler(Math.max(mini, Math.min(maxi, debut)));
  blocs[k] = { ...b, debut: a, fin: caler(a + d) };
  return avecBlocs(r, blocs);
};

/** Rogne ou étire le bloc k par un bord. Début : la chanson reste calée sur la vidéo (le décalage suit), jamais
 *  avant le début de la chanson. Fin : jusqu'au bloc suivant ou la fin de la vidéo (la chanson reprend en boucle). */
export const rognerMusique = (r: Recette, k: number, cote: "debut" | "fin", t: number): Recette => {
  const blocs = blocsMusique(r), b = blocs[k];
  if (!b) return r;
  const total = caler(dureeTotale(r));
  if (cote === "debut") {
    const dec = b.decalage ?? 0;
    const a = caler(borner(t, Math.max(blocs[k - 1]?.fin ?? 0, b.debut - dec), b.fin - BLOC_MUSIQUE_MIN));
    blocs[k] = { ...b, debut: a, decalage: Math.max(0, cent(dec + a - b.debut)) };
  } else {
    blocs[k] = { ...b, fin: caler(borner(t, b.debut + BLOC_MUSIQUE_MIN, blocs[k + 1]?.debut ?? total)) };
  }
  return avecBlocs(r, blocs);
};

/** Partie de la chanson qui joue (« Début dans la chanson ») : le contenu glisse dans le bloc, le bloc ne bouge pas. */
export const glisserContenu = (r: Recette, k: number, decalage: number, dureeChanson?: number): Recette => {
  const blocs = blocsMusique(r), b = blocs[k];
  if (!b || !Number.isFinite(decalage)) return r;
  blocs[k] = { ...b, decalage: cent(borner(decalage, 0, dureeChanson ? Math.max(0, dureeChanson - 0.05) : Infinity)) };
  return avecBlocs(r, blocs);
};

/** Coupe le bloc k à `t` : deux blocs qui se suivent, la chanson continue sans saut (pas de fondu à la coupe). */
export const couperMusique = (r: Recette, k: number, t: number): { recette: Recette; index: number } | null => {
  const blocs = blocsMusique(r), b = blocs[k];
  if (!b || t <= b.debut + 0.25 || t >= b.fin - 0.25) return null;
  const c = caler(t);
  blocs.splice(k, 1, { ...b, fin: c, fondu_sortie: 0 },
    { ...b, debut: c, decalage: cent((b.decalage ?? 0) + c - b.debut), fondu_entree: 0 });
  return { recette: avecBlocs(r, blocs), index: k + 1 };
};

/** Autre chanson pour le bloc k : même place, depuis le début de la chanson. */
export const changerChanson = (r: Recette, k: number, fichier: string): Recette => {
  const blocs = blocsMusique(r), b = blocs[k];
  if (!b) return r;
  blocs[k] = { ...b, fichier, decalage: 0 };
  return avecBlocs(r, blocs);
};

export const supprimerMusique = (r: Recette, k: number): Recette => {
  const blocs = blocsMusique(r);
  if (!blocs[k]) return r;
  blocs.splice(k, 1);
  return avecBlocs(r, blocs);
};

/** Bloc sous la tête de lecture (-1 : aucun). */
export const musiqueA = (r: Recette, t: number) => blocsMusique(r).findIndex((b) => t >= b.debut - 1e-6 && t < b.fin);

/** Volume (-35 à -10 dB sous la voix) ou fondu (0 à 5 s) d'un bloc. */
export const reglerMusique = (r: Recette, k: number, champ: "volume_db" | "fondu_entree" | "fondu_sortie", v: number): Recette => {
  const blocs = blocsMusique(r), b = blocs[k];
  if (!b || !Number.isFinite(v)) return r;
  blocs[k] = { ...b, [champ]: champ === "volume_db" ? Math.round(borner(v, ...VOLUME_MUSIQUE)) : Math.round(borner(v, 0, FONDU_MAX) * 10) / 10 };
  return avecBlocs(r, blocs);
};

export const fondus = (b: BlocMusique): [number, number] => [b.fondu_entree ?? FONDUS_MUSIQUE[0], b.fondu_sortie ?? FONDUS_MUSIQUE[1]];

/** Gain des fondus à l'instant t de la vidéo (0 à 1), comme afade du moteur (rampe linéaire). */
export const gainFondu = (b: BlocMusique, t: number): number => {
  const [fi, fo] = fondus(b);
  if (t < b.debut || t >= b.fin) return 0;
  return Math.min(fi > 0 ? Math.min(1, (t - b.debut) / fi) : 1, fo > 0 ? Math.min(1, (b.fin - t) / fo) : 1);
};

/** Morceaux de chanson joués par un bloc : à partir du décalage, puis la chanson reprend au début si elle finit
 *  avant le bloc (exactement comme le moteur : -stream_loop et atrim). */
export const segmentsMusique = (b: BlocMusique, dureeChanson?: number) => {
  const L = dureeChanson && dureeChanson > 0.1 ? dureeChanson : Infinity;
  const out: { debut: number; duree: number; depuis: number }[] = [];
  let t = b.debut, pos = (b.decalage ?? 0) % L;
  while (t < b.fin - 1e-6 && out.length < 100) {
    const d = Math.min(b.fin - t, L - pos);
    out.push({ debut: t, duree: d, depuis: pos });
    t += d;
    pos = 0;
  }
  return out;
};

// ------------------------------------------------------------------ balises audio du lecteur (19 oct. 2026)
/** Balises audio du Player (numberOfSharedAudioTags) : au-delà, Remotion lève une erreur et le lecteur devient noir. */
export const AUDIOS_LECTEUR = 16;
const AUDIOS_MARGE = 2;             // une balise rendue et la suivante prise dans la même image
const DUREE_SON_INCONNUE = 3;

/** Sons et morceaux de musique joués par le lecteur en direct (en images). Un son n'occupe une balise que le temps de
 *  son fichier : avant, il restait monté jusqu'à la fin de la vidéo et le 6e son posé faisait planter le lecteur.
 *  S'il en faudrait plus à un même moment, les sons suivants ne sont pas joués dans le lecteur (`muets`, le rendu
 *  les garde). */
export const pistesAudio = (r: Recette, durees: Record<string, number> = {}, limite = AUDIOS_LECTEUR - AUDIOS_MARGE) => {
  const total = img(dureeTotale(r));
  const pris: [number, number][] = [];
  const libre = (de: number, fin: number) => pris.filter(([a, b]) => a < fin && de < b).length < limite;
  const musique: { k: number; j: number; bloc: BlocMusique; depuis: number; de: number; n: number }[] = [];
  blocsMusique(r).forEach((bloc, k) => segmentsMusique(bloc, durees[bloc.fichier]).forEach((sg, j) => {
    const de = img(sg.debut), fin = Math.max(de + 1, img(sg.debut + sg.duree));
    if (!libre(de, fin)) return;
    pris.push([de, fin]);
    musique.push({ k, j, bloc, depuis: sg.depuis, de, n: fin - de });
  }));
  const sons: { k: number; de: number; n: number }[] = [];
  let muets = 0;
  (r.sons || []).map((s, k) => ({ s, k })).sort((a, b) => a.s.debut - b.s.debut).forEach(({ s, k }) => {
    const de = img(s.debut);
    const d = durees[s.fichier] > 0 ? durees[s.fichier] : DUREE_SON_INCONNUE;
    const fin = Math.min(Math.max(total, de + 1), de + Math.max(1, Math.ceil(d * FPS)));
    if (!libre(de, fin)) { muets += 1; return; }
    pris.push([de, fin]);
    sons.push({ k, de, n: fin - de });
  });
  return { sons, musique, muets };
};

// ------------------------------------------------------------------ historique (annuler / rétablir)
export class Historique {
  passe: string[] = [];
  futur: string[] = [];
  max: number;
  constructor(max = 200) {
    this.max = max;
  }
  noter(r: Recette) {
    const s = JSON.stringify(r);
    if (this.passe[this.passe.length - 1] !== s) this.passe.push(s);
    if (this.passe.length > this.max) this.passe.shift();
    this.futur = [];
  }
  annuler(actuelle: Recette): Recette | null {
    const s = this.passe.pop();
    if (!s) return null;
    this.futur.push(JSON.stringify(actuelle));
    return JSON.parse(s);
  }
  retablir(actuelle: Recette): Recette | null {
    const s = this.futur.pop();
    if (!s) return null;
    this.passe.push(JSON.stringify(actuelle));
    return JSON.parse(s);
  }
}

export const formatTemps = (t: number) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0").replace(".", ",")}`;
};

// ------------------------------------------------------------------ repères réseaux sociaux (batch 3b)
// Zones de l'interface dans le repère 1080 × 1920 de la vidéo, mesurées sur les captures de Hugues
// (labo/timeline/reperes/fabriquer.py → zones.json) : [x0, y0, x1, y1]. « visible » : partie de la vidéo montrée par
// l'app (la vidéo remplit la hauteur, ses côtés sont rognés).
export type Reseau = "instagram" | "facebook";
export const ZONES_INTERFACE: Record<Reseau, { nom: string; visible: [number, number]; zones: { nom: string; r: [number, number, number, number] }[] }> = {
  instagram: {
    nom: "Instagram", visible: [56, 1024],
    zones: [
      { nom: "le haut (heure, flèche, caméra)", r: [107, 40, 998, 231] },
      { nom: "la colonne de droite (cœur, commentaires, partage)", r: [910, 1081, 1005, 1866] },
      { nom: "le bas (compte et légende)", r: [74, 1719, 833, 1880] },
      { nom: "la barre de progression", r: [56, 1904, 1024, 1920] },
    ],
  },
  facebook: {
    nom: "Facebook", visible: [59, 1021],
    zones: [
      { nom: "le haut (heure, flèche, loupe)", r: [81, 40, 999, 233] },
      { nom: "la colonne de droite (cœur, commentaires, partage)", r: [912, 1267, 1003, 1764] },
      { nom: "le bas (compte et légende)", r: [70, 1698, 999, 1870] },
    ],
  },
};

type Rect = { x: number; y: number; w: number; h: number };
const touche = (a: Rect, z: [number, number, number, number]) => a.x < z[2] && a.x + a.w > z[0] && a.y < z[3] && a.y + a.h > z[1];

/** Ce que l'interface d'un réseau cache d'un rectangle de la vidéo : zones touchées, côté rogné. */
export const zonesTouchees = (a: Rect, reseau: Reseau): string[] => {
  const z = ZONES_INTERFACE[reseau];
  const out = z.zones.filter((x) => touche(a, x.r)).map((x) => x.nom);
  if (a.x < z.visible[0] || a.x + a.w > z.visible[1]) out.push("le bord rogné par l'app");
  return out;
};

export type PlacementCarte = { haut?: number; x?: number; cx?: number; w?: number; h?: number; ajustement?: number };
export type GroupeSousTitre = { affiche: string; debut: number; fin: number; largeur?: number };

/** Avertissement jaune : carte ou sous-titre hors de la zone visible Instagram/Facebook (sous l'interface, bord rogné). */
export const avertissementsInterface = (
  r: Recette, cartes: PlacementCarte[], st?: { groupes: GroupeSousTitre[]; hauteur: number; taille?: number },
): Probleme[] => {
  const out: Probleme[] = [];
  const dire = (quoi: string, rect: Rect, carte: number | null) => {
    const parReseau = (["instagram", "facebook"] as Reseau[])
      .map((n) => ({ n, z: zonesTouchees(rect, n) })).filter((x) => x.z.length);
    if (!parReseau.length) return;
    const memes = parReseau.length === 2 && parReseau[0].z.join() === parReseau[1].z.join();
    const detail = memes ? `${parReseau[0].z.join(" et ")} d'Instagram et de Facebook`
      : parReseau.map((x) => `${x.z.join(" et ")} ${x.n === "instagram" ? "d'Instagram" : "de Facebook"}`).join(" ; ");
    out.push({ carte, niveau: "avis", message: `${quoi} : hors de la zone visible Instagram/Facebook (passe sous ${detail})` });
  };
  r.cartes.forEach((c, k) => {
    const b = boiteCarte(c, cartes[k]); // place choisie à la main suivie tout de suite (batch 4)
    if (b) dire(`Carte ${k + 1}`, b, k);
  });
  if (st && r.sous_titres?.actifs !== false) {
    const t = st.taille ?? 66;
    for (const g of st.groupes) {
      if (!g.affiche) continue;
      if (r.cartes.some((c) => g.debut >= c.debut && g.debut < c.debut + c.duree)) continue; // caché pendant une carte
      const l = g.largeur ?? g.affiche.length * 0.62 * t;
      dire(`Sous-titre « ${g.affiche} » (${g.debut.toFixed(1).replace(".", ",")} s)`, { x: 540 - l / 2, y: st.hauteur - 0.6 * t, w: l, h: 1.2 * t }, null); // boîte du moteur (calques.py)
    }
  }
  return out;
};

// ------------------------------------------------------------------ place et taille des cartes à la main (batch 4)
// « place » dans la recette : x = centre horizontal du corps, y = haut du corps (px de l'image 1080 × 1920),
// taille = échelle (1 = taille du moteur). Sans x/y : placement automatique du moteur (sous le menton).
export type Place = { x?: number; y?: number; taille?: number };
export const TAILLE_MANUELLE: [number, number] = [0.5, 1.3];
export const LARGEUR_CARTE_MAX = 740; // styles-cartes.json, placement.largeur_max (colonne des icônes, bandes rognées)
type InfoPlace = { x?: number; cx?: number; haut?: number; w?: number; h?: number; ajustement?: number };

/** Rectangle du corps de la carte montré tout de suite : la place de la recette (déjà déplacée ou réduite par Hugues)
 *  appliquée au dernier placement vérifié par le moteur (taille et place réelles). null si le moteur ne l'a pas placée. */
export const boiteCarte = (c: Carte, info?: InfoPlace | null): Rect | null => {
  if (!info || info.haut === undefined || info.w === undefined || info.h === undefined) return null;
  const place: Place = c.place || {};
  const k = place.taille !== undefined && info.ajustement ? place.taille / info.ajustement : 1;
  const w = info.w * k, h = info.h * k;
  const cx = place.x ?? info.cx ?? (info.x !== undefined ? info.x + info.w / 2 : 540);
  return { x: cx - w / 2, y: place.y ?? info.haut, w, h };
};

const arrondir = (v: number) => Math.round(v);

/** Déplace la carte k : son corps (w × h) reste entièrement dans l'image (un texte coupé est une limite technique). */
export const placerCarte = (r: Recette, k: number, cx: number, haut: number, w: number, h: number): Recette => {
  const out = copie(r);
  const c = out.cartes[k];
  if (!c) return r;
  const x = Math.max(w / 2, Math.min(1080 - w / 2, cx));
  const y = Math.max(0, Math.min(1920 - h, haut));
  c.place = { ...(c.place || {}), x: arrondir(x), y: arrondir(y) };
  return out;
};

/** Taille de la carte k (échelle, 1 = moteur), bornée de 50 à 130 % ; la place manuelle (x, y) ne change pas. */
export const reglerTaille = (r: Recette, k: number, taille: number): Recette => {
  const out = copie(r);
  const c = out.cartes[k];
  if (!c || !Number.isFinite(taille)) return r;
  const t = Math.round(Math.max(TAILLE_MANUELLE[0], Math.min(TAILLE_MANUELLE[1], taille)) * 100) / 100;
  c.place = { ...(c.place || {}), taille: t };
  return out;
};

const nettoyerPlace = (c: Carte) => { if (c.place && !Object.keys(c.place).length) delete c.place; };

/** Bouton « Position automatique » : le moteur replace la carte sous le menton (la taille choisie reste). */
export const positionAuto = (r: Recette, k: number): Recette => {
  const out = copie(r);
  const c = out.cartes[k];
  if (!c?.place) return r;
  delete c.place.x;
  delete c.place.y;
  nettoyerPlace(c);
  return out;
};

/** Taille du moteur (réduite par lui seulement si la place manque). */
export const tailleAuto = (r: Recette, k: number): Recette => {
  const out = copie(r);
  const c = out.cartes[k];
  if (!c?.place) return r;
  delete c.place.taille;
  nettoyerPlace(c);
  return out;
};

// ------------------------------------------------------------------ hauteur de la timeline (batch 4)
// Mémorisée dans le navigateur (localStorage) ; 38 % de l'écran par défaut ; T bascule grand lecteur / grande timeline.
export const CLE_HAUTEUR_TIMELINE = "neo-timeline-hauteur";
export const HAUTEUR_TIMELINE_DEFAUT = 0.38;
export const HAUTEUR_TIMELINE_MIN = 150;
type Stockage = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };

/** Hauteur permise : 150 px au moins, et le lecteur garde 220 px au moins (en-tête compris). */
export const bornerHauteurTimeline = (h: number, ecran: number) =>
  Math.round(Math.max(HAUTEUR_TIMELINE_MIN, Math.min(ecran - 48 - 6 - 220, h)));

export const lireHauteurTimeline = (stockage: Stockage | null | undefined, ecran: number): number => {
  let v = NaN;
  try { v = Number(stockage?.getItem(CLE_HAUTEUR_TIMELINE)); } catch { /* stockage refusé : défaut */ }
  return bornerHauteurTimeline(Number.isFinite(v) && v > 0 ? v : ecran * HAUTEUR_TIMELINE_DEFAUT, ecran);
};

export const ecrireHauteurTimeline = (stockage: Stockage | null | undefined, h: number) => {
  try { stockage?.setItem(CLE_HAUTEUR_TIMELINE, String(Math.round(h))); } catch { /* stockage refusé : rien */ }
};

/** Raccourci « grand lecteur / grande timeline » : 24 % ou 60 % de l'écran. */
export const basculerHauteurTimeline = (h: number, ecran: number) =>
  bornerHauteurTimeline(h > ecran * 0.42 ? ecran * 0.24 : ecran * 0.6, ecran);
