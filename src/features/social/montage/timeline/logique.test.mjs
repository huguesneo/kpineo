// Copie de video-neo/labo/timeline/tests/logique.test.mjs, retouchée pour le hub par scripts/synchro-timeline.mjs : ne pas modifier à la main.
// node --test labo/timeline/tests/  (Node 22.6 ou plus : le .ts est lu sans compilation)
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  Historique, ZOOMS, ajouterCarte, ajouterSon, bornerPlan, corrigerSousTitre, couperPlage, decaler, deplacerCarte, dureeTotale,
  etirerCarte, problemesTimeline, morceaux, poserZoom, rognerPlage, supprimerCarte, supprimerPlage,
  supprimerZoom, zoomA, cadrage, deplacerZoom, estBase, etirerZoom, morceauxLecture, plansAffiches,
  reglerZoom, avertissementsInterface, zonesTouchees, brutRetire,
} from "./logique.ts";

const recette = () => ({
  plages: [{ source: "P1", debut: 0, fin: 6.651 }, { source: "P1", debut: 6.924, fin: 10.502 }, { source: "P1", debut: 10.644, fin: 35.376 }],
  plans: [
    { debut: 0, fin: 3, zoom_de: 1.45, zoom_a: 1.45 }, { debut: 3, fin: 6.6667, zoom_de: 1.15, zoom_a: 1.3 },
    { debut: 6.6667, fin: 10.2333, zoom_de: 1, zoom_a: 1 }, { debut: 10.2333, fin: 34.9667, zoom_de: 1.35, zoom_a: 1.35 },
  ],
  cartes: [
    { id: "c1", lignes: ["15 000 personnes"], debut: 17, duree: 2.5 },
    { id: "c2", type: "cycle", lignes: ["Ce qui bloque"], debut: 25.1, duree: 7.2, elements: [{ texte: "Stress", a: 3 }, { texte: "Danger", a: 4.2 }] },
  ],
  sons: [{ fichier: "texte/pop_01.MP3", debut: 17 }, { fichier: "transitions/swish-court_01.MP3", debut: 25.1 }],
  sous_titres: { mots_cles: ["stress"] },
});

test("place des plages dans la vidéo finale (arrondis du moteur)", () => {
  const m = morceaux(recette());
  assert.equal(m[1].sortie, 200 / 30);
  assert.ok(Math.abs(dureeTotale(recette()) - 1049 / 30) < 1e-9);
});

test("rogner le début d'une plage décale ce qui suit, les plans couvrent toujours tout", () => {
  const r = recette();
  const out = rognerPlage(r, 2, "debut", 11.144); // 0,5 s de moins
  assert.equal(out.plages[2].debut, 11.144);
  assert.ok(Math.abs(out.cartes[0].debut - 16.5) < 0.02);
  assert.ok(Math.abs(out.sons[1].debut - 24.6) < 0.02);
  assert.equal(out.plans[0].debut, 0);
  for (let i = 1; i < out.plans.length; i++) assert.equal(out.plans[i].debut, out.plans[i - 1].fin);
  assert.ok(Math.abs(out.plans.at(-1).fin - dureeTotale(out)) < 1e-3);
  assert.equal(r.plages[2].debut, 10.644, "la recette d'origine ne change pas");
});

test("brut retiré récupérable aux bords d'une plage (15 oct. : le « Coupé ! » de Brice)", () => {
  const r = recette();
  assert.deepEqual(brutRetire(r, 0, 50.7), { avant: 0, apres: 0.273 });       // jusqu'à la plage suivante
  assert.deepEqual(brutRetire(r, 2, 50.7), { avant: 0.142, apres: 15.324 });  // jusqu'à la fin de la source
  assert.deepEqual(brutRetire(r, 2), { avant: 0.142, apres: 0 });             // durée de la source inconnue
  const tout = rognerPlage(r, 2, "fin", r.plages[2].fin + brutRetire(r, 2, 50.7).apres, 50.7);
  assert.equal(tout.plages[2].fin, 50.7);                                     // « tout récupérer »
  assert.ok(Math.abs(tout.plans.at(-1).fin - dureeTotale(tout)) < 1e-3);
});

test("rogner la fin : bornée par la plage suivante et la durée de la source", () => {
  const r = recette();
  assert.equal(rognerPlage(r, 0, "fin", 9).plages[0].fin, 6.924);
  assert.equal(rognerPlage(r, 2, "fin", 99, 50.7).plages[2].fin, 50.7);
  assert.equal(rognerPlage(r, 0, "debut", 6.6).plages[0].debut, 6.351); // 0,3 s au moins
});

test("raccourcir la fin d'une plage : la coupe tombe toujours entre deux plans", () => {
  const out = rognerPlage(recette(), 0, "fin", 6.151);
  const coupe = morceaux(out)[1].sortie;
  assert.ok(out.plans.some((p) => Math.round(p.fin * 30) === Math.round(coupe * 30)), "un plan finit à la coupe");
  assert.ok(out.plans.some((p) => Math.round(p.debut * 30) === Math.round(coupe * 30)), "un plan commence à la coupe");
  assert.ok(Math.abs(out.cartes[0].debut - 16.5) < 0.02);
});

test("décaler garde les temps sur une image", () => {
  const out = decaler(recette(), 5, 0.123, false);
  for (const c of out.cartes) assert.ok(Math.abs(c.debut * 30 - Math.round(c.debut * 30)) < 2e-3); // 4 décimales
});

test("déplacer une carte emmène son son ; supprimer la carte retire son son", () => {
  const r = deplacerCarte(recette(), 0, 16.7);
  assert.equal(r.cartes[0].debut, 16.7);
  assert.equal(r.sons[0].debut, 16.7);
  assert.equal(r.sons[1].debut, 25.1);
  const s = supprimerCarte(r, 0);
  assert.equal(s.cartes.length, 1);
  assert.deepEqual(s.sons.map((x) => x.fichier), ["transitions/swish-court_01.MP3"]);
});

test("étirer : bornes du type, éléments gardés dans la carte", () => {
  const r = etirerCarte(recette(), 1, 2, [4, 10]);
  assert.equal(r.cartes[1].duree, 4);
  assert.equal(r.cartes[1].elements[1].a, 3.4);
  assert.equal(etirerCarte(recette(), 1, 30, [4, 10]).cartes[1].duree, 9.87, "jamais au-delà de la fin de la vidéo");
  assert.equal(etirerCarte(deplacerCarte(recette(), 1, 20), 1, 30, [4, 10]).cartes[1].duree, 10);
});

test("ajouter une carte depuis la palette, avec son son", () => {
  const { recette: r, index } = ajouterCarte(recette(), { type: "comparaison", lignes: ["Le problème"], duree: 4, elements: [] }, 8.31);
  assert.equal(r.cartes[index].type, "comparaison");
  assert.equal(r.cartes[index].debut, 8.3, "posée sur une image");
  assert.equal(r.cartes[index].id, "c3");
  assert.equal(index, 0, "triées par début");
  const avecSon = ajouterSon(r, "transitions/Riser-court_01.MP3", r.cartes[index].debut);
  assert.equal(avecSon.sons[0].fichier, "transitions/Riser-court_01.MP3");
});

test("19 oct. : aucune règle de goût en manuel ; restent les limites techniques et les 2 avertissements objectifs", () => {
  const r = recette();
  r.cartes[1].debut = 21;                                   // 4 s après la carte 1
  r.cartes[0].lignes = ["Tu es — vraiment"];                // tiret
  r.cartes[1].elements[0].texte = "T'es fatiguée";          // contraction
  r.sons.push({ fichier: "impacts/deep-impact.mp3", debut: 18 });   // son à moins de 2 s
  r.plans[0].zoom_de = 0.5;                                 // zoom hors bornes (bloqué à 1,0 à la lecture)
  r.sources = { P1: { cadre: { cx: 0.98, cy: 0.5 } } };     // cadrage collé au bord
  assert.deepEqual(problemesTimeline(r, null), []);
  // Ce que le moteur renvoie : ses règles de goût (ancien agent) sont filtrées, le reste passe
  const moteur = [
    { carte: 1, niveau: "avis", message: "carte 2 commence 4,00 s après carte 1 : au moins 8 s entre le début de deux cartes" },
    { carte: null, niveau: "avis", message: "Plans ajustés : plan 2 commence à 5,00 s" },
    { carte: 0, niveau: "avis", message: "Cette carte touche le visage : carte 1 (texte, « Tu es »)" },
    { carte: 2, niveau: "erreur", message: "Carte 3 : sort de l'image, le texte serait coupé" },
    { carte: 0, niveau: "info", message: "Carte 1 réduite à 90 % pour tenir sous le menton" },
    { carte: 1, niveau: "avis", message: "carte 2 (Chez Neo) : « Neo » interdit, la marque s'écrit « NEO Performance »" },
  ];
  const p = problemesTimeline(r, { cartes: [{ haut: 1650, x: 140, w: 800, h: 200 }], problemes: moteur });
  assert.deepEqual(p.map((x) => x.niveau), ["avis", "avis", "erreur", "info", "avis"]);
  assert.match(p[4].message, /la marque s'écrit « NEO Performance »/);   // orthographe : jaune en manuel
  assert.match(p[0].message, /^Carte 1 : hors de la zone visible Instagram\/Facebook \(passe sous .*le bas/);
  assert.match(p[1].message, /touche le visage/);
});

test("corriger un groupe de sous-titres le rend écrit", () => {
  const r = corrigerSousTitre(recette(), ["Tu bouges plus,", "tu manges moins,"], 1, "tu manges moins.");
  assert.deepEqual(r.sous_titres.groupes, ["Tu bouges plus,", "tu manges moins."]);
  const vide = corrigerSousTitre(r, [], 0, "  ");
  assert.deepEqual(vide.sous_titres.groupes, ["", "tu manges moins."], "un groupe vidé garde sa place");
});

test("annuler / rétablir", () => {
  const h = new Historique();
  const a = recette();
  const b = deplacerCarte(a, 0, 10);
  h.noter(a);
  const annule = h.annuler(b);
  assert.equal(annule.cartes[0].debut, 17);
  assert.equal(h.retablir(annule).cartes[0].debut, 10);
  assert.equal(h.annuler(annule)?.cartes[0].debut, 17);
});

test("couper : la plage sous la tête devient deux morceaux, rien ne bouge", () => {
  const r = recette();
  const { recette: c, index } = couperPlage(r, 20);
  assert.equal(c.plages.length, 4);
  assert.equal(index, 3);
  assert.equal(c.plages[2].fin, c.plages[3].debut);
  assert.equal(c.plages[2].debut, 10.644);
  assert.equal(c.plages[3].fin, 35.376);
  assert.ok(Math.abs(dureeTotale(c) - dureeTotale(r)) < 1e-9, "aucune image retirée");
  assert.deepEqual(c.cartes, r.cartes);
  assert.equal(couperPlage(r, 6.65), null, "pas de coupe collée au bord d'une plage");
});

test("supprimer un morceau : tout ce qui suit recule, ce qui était dedans part", () => {
  const r = recette();
  r.sous_titres.groupes = ["Un", "Deux", "Trois"];
  const { recette: c } = couperPlage(r, 15);
  const { recette: c2 } = couperPlage(c, 19);   // morceau 4 : de 15 à 19 s de la vidéo finale
  const avant = dureeTotale(c2);
  const ms = morceaux(c2);
  assert.ok(Math.abs(ms[3].sortie - 15) < 0.04 && Math.abs(ms[3].sortie + ms[3].duree - 19) < 0.04);
  const groupes = [{ source: 0, debut: 1, fin: 2 }, { source: 1, debut: 16, fin: 17 }, { source: 2, debut: 18.5, fin: 20 }];
  const s = supprimerPlage(c2, 3, groupes);
  assert.equal(s.plages.length, 4);
  assert.ok(Math.abs(dureeTotale(s) - (avant - ms[3].duree)) < 1e-9);
  assert.deepEqual(s.cartes.map((x) => x.id), ["c2"], "la carte de 17 s (dans le morceau) part avec son son");
  assert.ok(Math.abs(s.cartes[0].debut - (25.1 - ms[3].duree)) < 0.02, "la carte suivante recule");
  assert.deepEqual(s.sons.map((x) => x.fichier), ["transitions/swish-court_01.MP3"]);
  assert.deepEqual(s.sous_titres.groupes, ["Un", "Trois"], "le groupe entier dans le morceau part, celui à cheval reste");
  assert.equal(s.plans[0].debut, 0);
  for (let i = 1; i < s.plans.length; i++) assert.equal(s.plans[i].debut, s.plans[i - 1].fin);
  assert.ok(Math.abs(s.plans.at(-1).fin - dureeTotale(s)) < 1e-3);
});

test("supprimer un morceau au milieu d'un plan fixe : la coupe reçoit un changement de zoom", () => {
  const { recette: c } = couperPlage(recette(), 15);
  const { recette: c2 } = couperPlage(c, 19);
  const s = supprimerPlage(c2, 3);
  const coupe = morceaux(s)[3].sortie;
  const av = s.plans.find((p) => Math.round(p.fin * 30) === Math.round(coupe * 30));
  const ap = s.plans.find((p) => Math.round(p.debut * 30) === Math.round(coupe * 30));
  assert.ok(av && ap, "la coupe tombe entre deux plans");
  assert.ok(Math.abs((av.zoom_a ?? av.zoom_de) - ap.zoom_de) >= 0.15 - 1e-9);
});

test("zoom préprogrammé : devient un plan de la recette, se modifie et se supprime", () => {
  const r = recette();
  const punch = ZOOMS.find((z) => z.cle === "punch_in");
  const { recette: z, index } = poserZoom(r, 5, punch);
  const p = z.plans[index];
  assert.equal(p.debut, 5);
  assert.equal(p.fin, 7.5);
  assert.equal(p.modele, "punch_in");
  assert.equal(p.mouvement, "glisse");
  assert.equal(p.zoom_a, 1.35);
  for (let i = 1; i < z.plans.length; i++) assert.equal(z.plans[i].debut, z.plans[i - 1].fin);
  assert.ok(Math.abs(zoomA(p, 5) - 1.0) < 1e-9);
  assert.ok(Math.abs(zoomA(p, 5.5) - 1.35) < 1e-9, "rampe de 0,25 s finie");
  const b = bornerPlan(z, index, 4.5, 8);
  assert.equal(b.plans[index].debut, 4.5);
  assert.equal(b.plans[index - 1].fin, 4.5);
  assert.equal(b.plans[index + 1].debut, 8);
  const s = supprimerZoom(z, index);
  assert.ok(!s.plans.some((x) => x.modele), "le zoom est parti");
  assert.equal(s.plans[0].debut, 0);
  for (let i = 1; i < s.plans.length; i++) assert.equal(s.plans[i].debut, s.plans[i - 1].fin);
  assert.ok(Math.abs(s.plans.at(-1).fin - r.plans.at(-1).fin) < 1e-9);
});

test("zoom : courbe douce comme le moteur (image.expr_zoom)", () => {
  const p = { debut: 0, fin: 4, zoom_de: 1, zoom_a: 1.2, mouvement: "glisse", courbe: "douce" };
  assert.ok(Math.abs(zoomA(p, 2) - 1.1) < 1e-9);
  assert.ok(Math.abs(zoomA(p, 4) - 1.2) < 1e-9);
  assert.equal(zoomA({ debut: 0, fin: 3, zoom_de: 1.45, zoom_a: 1.45 }, 1), 1.45);
});

test("musique : recette d'avant (un seul morceau) lue comme un bloc, -23 dB, suit le rognage", () => {
  const r = recette();
  r.musique = { active: true, fichier: "musique/Chill Vibe/leberch-corporate-509707.mp3", debut: 10, fin: 20, volume_db: -23, demandee: "oui" };
  assert.deepEqual(blocsMusique(r), [{ fichier: r.musique.fichier, debut: 10, fin: 20, volume_db: -23, demandee: "oui" }]);
  const coupe = rognerPlage(r, 0, "debut", 1.0);   // 1 s de moins au début : la musique recule
  assert.ok(Math.abs(coupe.musique.debut - 9) < 0.02);
  const m = deplacerMusique(r, 0, 12);             // 1er geste : réécrite en « musiques »
  assert.equal(m.musique, undefined);
  assert.deepEqual(m.musiques.map((b) => [b.debut, b.fin]), [[12, 22]]);
  r.musique = { active: false };
  assert.deepEqual(blocsMusique(r), []);
});

test("son de la bibliothèque : posé sur une image, volume gardé", () => {
  const r = ajouterSon(recette(), "impacts/deep-impact.mp3", 30.013);
  const s = r.sons.find((x) => x.fichier === "impacts/deep-impact.mp3");
  assert.equal(s.debut, 30);
  s.volume_db = -6;
  assert.equal(deplacerCarte(r, 1, 26).sons.find((x) => x.fichier === "impacts/deep-impact.mp3").volume_db, -6);
});

// ------------------------------------------------------------------ batch 3b : zooms
const couvre = (r) => {
  assert.equal(r.plans[0].debut, 0);
  for (let i = 1; i < r.plans.length; i++) assert.equal(r.plans[i].debut, r.plans[i - 1].fin, "plans sans trou");
  assert.ok(Math.abs(r.plans.at(-1).fin - dureeTotale(r)) < 1e-3, "les plans couvrent toute la vidéo");
};

test("3b piste éditable : un zoom de l'IA se déplace et s'étire comme un bloc", () => {
  const r = recette();
  // Plan 1 de l'IA (1,45 de 0 à 3 s) : déplacé à 5 s, il recouvre ce qui est dessous ; sa place revient à la base
  const { recette: d, index } = deplacerZoom(r, 0, 5);
  couvre(d);
  assert.equal(d.plans[index].debut, 5);
  assert.equal(d.plans[index].fin, 8);
  assert.equal(d.plans[index].zoom_de, 1.45);
  assert.ok(estBase(d.plans[0]) && d.plans[0].fin === 3, "0 à 3 s : cadrage de base");
  // Le glissé recouvert à moitié (3 à 6,67) repart du zoom atteint à 5 s : pas de saut
  // Étirer la fin à 9,5 s
  const { recette: e, index: j } = etirerZoom(d, index, "fin", 9.5);
  couvre(e);
  assert.equal(e.plans[j].fin, 9.5);
  assert.equal(e.plans[j].debut, 5);
  // Étirer le début, jamais sous 0,2 s de durée
  const { recette: f, index: m } = etirerZoom(e, j, "debut", 20);
  assert.ok(Math.abs(f.plans[m].fin - f.plans[m].debut - 0.2) < 1e-3);
  couvre(f);
});

test("3b suppression : un zoom de l'IA retiré revient au cadrage de base (1,0), fondu avec la base voisine", () => {
  const r = recette();
  const s = supprimerZoom(r, 0);
  couvre(s);
  assert.equal(s.plans[0].zoom_de, 1);
  assert.equal(s.plans[0].zoom_a, 1);
  assert.equal(s.plans[0].mouvement, "coupe");
  // Plans 2 (glissé) puis 3 (1,0) : supprimer le glissé fond 3 à 10,23 s avec la base qui suit (aucune coupe entre eux ? si)
  const t = supprimerZoom(r, 1);
  couvre(t);
  assert.ok(estBase(t.plans[1]));
  assert.equal(supprimerZoom(t, 1), t, "la base ne se supprime pas");
  const v = supprimerZoom(supprimerZoom(r, 0), 0);
  assert.ok(estBase(v.plans[0]) && v.plans[0].fin >= 3, "deux bases sans coupe entre elles : un seul plan");
});

test("3b recalage après coupe : un zoom qui commence dans le morceau supprimé part avec lui, ⌘Z le remet", () => {
  const h = new Historique();
  const r0 = recette();
  // Zoom posé à 15 s dans la plage 3, puis coupe au milieu de la plage 3 et suppression du morceau qui le contient
  const { recette: r1 } = poserZoom(r0, 15, ZOOMS.find((z) => z.cle === "serre"));
  const { recette: r2 } = couperPlage(r1, 14);
  const { recette: r3 } = couperPlage(r2, 17);
  h.noter(r3);
  const s = supprimerPlage(r3, 3);
  couvre(s);
  assert.ok(!s.plans.some((p) => p.modele === "serre"), "le zoom posé dans le morceau est parti");
  // Ce qui suit recule de la durée retirée (le plan 1,35 de l'IA qui finissait à 34,97 s finit 3 s plus tôt)
  const fin = s.plans.find((p) => p.zoom_de === 1.35 && p.fin > 30);
  assert.ok(fin && Math.abs(fin.fin - (34.9667 - 3)) < 0.05);
  const avant = h.annuler(s);
  assert.ok(avant.plans.some((p) => p.modele === "serre"), "⌘Z le remet");
});

test("3b recalage : un zoom qui commence pile à la fin du morceau supprimé recule avec ce qui suit", () => {
  const s = supprimerPlage(recette(), 1);   // morceau 2 : 6,67 à 10,23 s ; le plan 1,35 commence à 10,2333 (4 décimales)
  couvre(s);
  const p = s.plans.find((x) => x.zoom_de === 1.35);
  assert.ok(Math.abs(p.debut - 6.6667) < 1e-3, `début ${p.debut}`);
});

test("3b recalage : un rognage décale les zooms qui suivent", () => {
  const r = recette();
  const s = rognerPlage(r, 1, "fin", 9.5);
  couvre(s);
  const d = (10.502 - 9.5);
  assert.ok(Math.abs(s.plans.find((p) => p.zoom_de === 1.35).debut - (10.2333 - d)) < 0.05);
});

test("3b valeurs bloquées : zoom < 1,0 ou > 1,8 bloqué à la valeur permise (note dans l'inspecteur)", () => {
  const r = recette();
  const s = reglerZoom(r, 0, "zoom_de", 0.8);
  assert.equal(s.plans[0].zoom_de, 1);
  assert.equal(s.plans[0].zoom_a, 1, "zoom fixe : les deux bougent");
  assert.match(s.plans[0].bloque, /0,8 demandé, bloqué à 1/);
  const t = reglerZoom(s, 0, "zoom_de", 2.5);
  assert.equal(t.plans[0].zoom_de, 1.8);
  assert.match(t.plans[0].bloque, /bloqué à 1,8/);
  const u = reglerZoom(t, 0, "zoom_de", 1.3);
  assert.equal(u.plans[0].bloque, undefined, "valeur permise : plus d'avertissement");
  // Valeur écrite à la main dans la recette (hors bornes) : lecture bloquée (le moteur la refuse au rendu)
  const w = recette(); w.plans[0].zoom_de = 0.5; w.plans[0].zoom_a = 0.5;
  assert.equal(cadrage(w.plans[0], 1, {}).z, 1);
});

test("3b cadrage : même calcul que le zoompan du moteur, jamais hors de l'image (pas de bord noir)", () => {
  const cadre = { cx: 0.527, cy: 0.266, position: 0.3 };
  const c = cadrage({ debut: 0, fin: 3, zoom_de: 1.45, zoom_a: 1.45, position: 0.34 }, 1, cadre);
  assert.ok(Math.abs(c.x - (0.527 - 1 / 1.45 / 2)) < 1e-9);
  assert.ok(Math.abs(c.y - (0.266 - 0.34 / 1.45)) < 1e-9);
  for (const z of [1, 1.2, 1.5, 1.8]) for (const cx of [0, 0.5, 1]) for (const cy of [0, 0.5, 1]) {
    const k = cadrage({ debut: 0, fin: 1, zoom_de: z }, 0, { cx, cy });
    assert.ok(k.x >= 0 && k.x <= 1 - 1 / k.z + 1e-12 && k.y >= 0 && k.y <= 1 - 1 / k.z + 1e-12);
  }
  // Visage collé au bord à 1,8 : le cadre est poussé contre le bord (sans avertissement depuis le 19 oct. 2026)
  const r = cadrage({ debut: 0, fin: 1, zoom_de: 1.8 }, 0, { cx: 0.98, cy: 0.5 });
  assert.ok(r.decale > 0.02 && r.x <= 1 - 1 / r.z + 1e-12);
});

test("3b lecture en direct : une plage coupée sans rien retirer reste un seul morceau ; plans du moteur périmés ignorés", () => {
  const { recette: c } = couperPlage(recette(), 15);
  assert.equal(morceauxLecture(c).length, morceauxLecture(recette()).length);
  const s = supprimerPlage(c, 0);
  assert.equal(morceauxLecture(s)[0].debut, 6.924);
  const r = recette();
  const moteur = r.plans.map((p) => ({ ...p }));
  moteur[3] = { ...moteur[3], zoom_de: 1.2, zoom_a: 1.2 };   // dézoom pendant une carte
  assert.equal(plansAffiches(r.plans, moteur)[3].zoom_de, 1.2);
  const coupe = supprimerPlage(r, 0);   // les temps ont changé : l'état du moteur n'est pas encore revenu
  assert.equal(plansAffiches(coupe.plans, moteur), coupe.plans);
  const plusFort = r.plans.map((p) => ({ ...p, zoom_de: 1.7, zoom_a: 1.7 }));   // valeur périmée (Hugues vient de baisser)
  assert.equal(plansAffiches(r.plans, plusFort)[0].zoom_de, 1.45);
});

// ------------------------------------------------------------------ batch 3b : repères réseaux sociaux
test("3b zone de l'interface : le sous-titre de instagram-reel.png passe sous le cœur d'Instagram, pas de Facebook", () => {
  const r = recette();
  // « toujours avant l'action » : 795 px en Montserrat ExtraBold 66 (mesure du moteur), centré à 1107 px
  const st = { hauteur: 1107, taille: 66, groupes: [{ affiche: "toujours avant l'action", debut: 5, fin: 6, largeur: 795 }, { affiche: "de toi", debut: 7, fin: 8, largeur: 203 }] };
  const a = avertissementsInterface(r, [], st);
  assert.equal(a.length, 1, "« de toi », court, ne touche rien");
  assert.equal(a[0].niveau, "avis", "jaune, jamais bloquant");
  assert.match(a[0].message, /toujours avant l'action/);
  assert.match(a[0].message, /colonne de droite \(cœur, commentaires, partage\) d'Instagram/);
  assert.doesNotMatch(a[0].message, /de Facebook/, "la colonne de Facebook commence plus bas (1267 px)");
});

test("3b zone de l'interface : cartes (bas, haut, bord rogné), sous-titre caché pendant une carte", () => {
  const r = recette();
  const placements = [
    { haut: 1650, x: 140, w: 800, h: 200 },   // carte 1 : trop basse, sur le compte et la légende
    { haut: 700, x: 190, w: 700, h: 300 },    // carte 2 : sur le torse, rien ne la cache
  ];
  const a = avertissementsInterface(r, placements);
  assert.equal(a.length, 1);
  assert.equal(a[0].carte, 0);
  assert.match(a[0].message, /le bas \(compte et légende\) d'Instagram et de Facebook/);
  assert.deepEqual(zonesTouchees({ x: 20, y: 800, w: 300, h: 100 }, "instagram"), ["le bord rogné par l'app"]);
  assert.ok(zonesTouchees({ x: 400, y: 100, w: 200, h: 60 }, "facebook").some((z) => /le haut/.test(z)));
  // Sous-titre pendant une carte : jamais affiché, donc jamais signalé
  const st = { hauteur: 1107, groupes: [{ affiche: "toujours avant l'action", debut: 17.5, fin: 18, largeur: 795 }] };
  assert.equal(avertissementsInterface(r, [], st).length, 0);
});

// ------------------------------------------------------------------ batch 4
import {
  LARGEUR_CARTE_MAX, boiteCarte, placerCarte, reglerTaille, positionAuto, tailleAuto, lireHauteurTimeline, ecrireHauteurTimeline,
  basculerHauteurTimeline, CLE_HAUTEUR_TIMELINE,
} from "./logique.ts";

const INFO = { haut: 900, x: 170, cx: 540, w: 740, h: 400, ajustement: 1 };

test("4 position et taille manuelles : boîte montrée tout de suite, gardées dans la recette", () => {
  const r = recette();
  assert.deepEqual(boiteCarte(r.cartes[0], INFO), { x: 170, y: 900, w: 740, h: 400 }, "sans place : celle du moteur");
  const d = placerCarte(r, 0, 400, 760, 740, 400);
  assert.deepEqual(d.cartes[0].place, { x: 400, y: 760 }, "x = centre, y = haut, en px de l'image");
  assert.equal(r.cartes[0].place, undefined, "la recette d'origine ne change pas (historique)");
  assert.deepEqual(boiteCarte(d.cartes[0], INFO), { x: 30, y: 760, w: 740, h: 400 });
  // Jamais hors de l'image (texte coupé = limite technique) : bornée
  const bord = placerCarte(r, 0, 2000, -50, 740, 400);
  assert.deepEqual(bord.cartes[0].place, { x: 710, y: 0 });
  // Taille : 50 à 130 %, la place reste ; le moteur avait déjà réduit la carte à 80 % : 60 % = 3/4 de sa boîte
  const t = reglerTaille(d, 0, 0.6);
  assert.deepEqual(t.cartes[0].place, { x: 400, y: 760, taille: 0.6 });
  assert.equal(reglerTaille(d, 0, 3).cartes[0].place.taille, 1.3);
  assert.equal(reglerTaille(d, 0, 0.1).cartes[0].place.taille, 0.5);
  const b = boiteCarte(t.cartes[0], { ...INFO, w: 592, h: 320, ajustement: 0.8 });
  assert.deepEqual([b.w, b.h, b.x + b.w / 2, b.y].map(Math.round), [444, 240, 400, 760]);
});

test("4 bouton « Position automatique » : retour au placement du moteur, la taille choisie reste", () => {
  const r = reglerTaille(placerCarte(recette(), 1, 300, 700, 740, 500), 1, 0.9);
  const auto = positionAuto(r, 1);
  assert.deepEqual(auto.cartes[1].place, { taille: 0.9 });
  assert.deepEqual(Object.values(boiteCarte(auto.cartes[1], INFO)).map(Math.round), [207, 900, 666, 360]);
  assert.equal(tailleAuto(auto, 1).cartes[1].place, undefined, "place vide retirée de la recette");
  const sans = recette();
  assert.equal(positionAuto(sans, 0), sans, "sans place : rien à changer");
});

test("4 avertissements jaunes : interface Instagram/Facebook et bandes coupées pour une carte déplacée", () => {
  const r = placerCarte(recette(), 0, 900, 1150, 740, 300);   // poussée à droite, sur la colonne des icônes
  const a = avertissementsInterface(r, [INFO]);
  assert.equal(a.length, 1);
  assert.equal(a[0].niveau, "avis", "jamais bloquant");
  assert.match(a[0].message, /colonne de droite/);
  assert.match(a[0].message, /le bord rogné par l'app/);
  // Largeur par défaut : 740 px centrée ne touche ni la colonne (x ≥ 910) ni les bandes ; 760 la toucherait
  assert.equal(LARGEUR_CARTE_MAX, 740);
  const centree = recette();
  assert.equal(avertissementsInterface(centree, [{ ...INFO, haut: 1000 }]).length, 0);
  assert.equal(avertissementsInterface(centree, [{ ...INFO, haut: 1000, x: 160, cx: 540, w: 760 }]).length, 1);
});

test("4 hauteur de la timeline : 38 % par défaut, mémorisée, bornée, bascule lecteur / timeline", () => {
  const memoire = new Map();
  const stock = { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => memoire.set(k, String(v)) };
  assert.equal(lireHauteurTimeline(stock, 1000), 380, "rien de mémorisé : 38 % de l'écran");
  ecrireHauteurTimeline(stock, 455.6);
  assert.equal(memoire.get(CLE_HAUTEUR_TIMELINE), "456");
  assert.equal(lireHauteurTimeline(stock, 1000), 456, "relue au prochain lancement");
  memoire.set(CLE_HAUTEUR_TIMELINE, "5000");
  assert.equal(lireHauteurTimeline(stock, 1000), 726, "le lecteur garde 220 px");
  memoire.set(CLE_HAUTEUR_TIMELINE, "abc");
  assert.equal(lireHauteurTimeline(stock, 1000), 380);
  const refuse = { getItem: () => { throw new Error("refusé"); }, setItem: () => { throw new Error("refusé"); } };
  assert.equal(lireHauteurTimeline(refuse, 1000), 380, "stockage refusé : défaut, sans erreur");
  ecrireHauteurTimeline(refuse, 300);
  assert.equal(lireHauteurTimeline(null, 900), 342);
  assert.equal(basculerHauteurTimeline(380, 1000), 600, "grande timeline");
  assert.equal(basculerHauteurTimeline(600, 1000), 240, "grand lecteur");
});

// ------------------------------------------------------------------ batch 4b : piste Musique comme CapCut
import {
  poserMusique, blocsMusique, deplacerMusique, rognerMusique, glisserContenu, couperMusique, supprimerMusique, musiqueA,
  reglerMusique, gainFondu, fondus, segmentsMusique, changerChanson,
} from "./logique.ts";

const A = "musique/Chill Vibe/leberch-corporate-509707.mp3", B = "musique/Calme/piano.mp3";
const deuxBlocs = () => {
  const un = poserMusique(recette(), A, 2, 12);       // chanson de 12 s : bloc de 2 à 14
  return poserMusique(un.recette, B, 20, 60);          // jusqu'à la fin de la vidéo (34,97 s)
};

test("4b bogue : un bloc de musique se déplace (avant : aucun geste ne changeait son début)", () => {
  const { recette: r, index } = poserMusique(recette(), A, 5, 8);
  assert.equal(index, 0);
  assert.deepEqual(r.musiques[0], { fichier: A, debut: 5, fin: 13, volume_db: -23, demandee: "musique posée dans la timeline par Hugues" });
  const d = deplacerMusique(r, 0, 9.5);
  assert.deepEqual([d.musiques[0].debut, d.musiques[0].fin], [9.5, 17.5], "même durée, même partie de la chanson");
  assert.equal(r.musiques[0].debut, 5, "la recette d'origine ne change pas (historique)");
  assert.deepEqual([deplacerMusique(r, 0, -4).musiques[0].debut, deplacerMusique(r, 0, 99).musiques[0].fin], [0, 34.9667]);
});

test("4b plusieurs blocs, chansons différentes : jamais l'un sur l'autre", () => {
  const r = deuxBlocs().recette;
  assert.deepEqual(r.musiques.map((b) => [b.fichier, b.debut, b.fin]), [[A, 2, 14], [B, 20, 34.9667]]);
  assert.equal(deplacerMusique(r, 0, 15).musiques[0].fin, 20, "arrêté par le bloc suivant");
  assert.equal(deplacerMusique(r, 1, 3).musiques[1].debut, 14, "arrêté par le bloc précédent");
  const sur = poserMusique(r, B, 5, 4);                 // déposée sur le 1er bloc : posée juste après lui
  assert.deepEqual([sur.index, sur.recette.musiques[1].debut, sur.recette.musiques[1].fin], [1, 14, 18]);
  assert.equal(poserMusique(sur.recette, A, 16, 4).index, 2);
  assert.equal(poserMusique(poserMusique(sur.recette, A, 18, 10).recette, A, 18.1, 10).index, -1, "aucune place libre");
  assert.equal(changerChanson(r, 0, B).musiques[0].fichier, B);
});

test("4b rogner : bord gauche (la chanson reste calée, le décalage suit), bord droit, 0,5 s au moins", () => {
  const r = deuxBlocs().recette;
  const g = rognerMusique(r, 0, "debut", 5);
  assert.deepEqual([g.musiques[0].debut, g.musiques[0].fin, g.musiques[0].decalage], [5, 14, 3]);
  assert.equal(rognerMusique(g, 0, "debut", 1).musiques[0].debut, 2, "jamais avant le début de la chanson");
  assert.equal(rognerMusique(r, 0, "fin", 30).musiques[0].fin, 20, "jusqu'au bloc suivant");
  assert.equal(rognerMusique(r, 0, "fin", 0).musiques[0].fin, 2.5);
  assert.equal(rognerMusique(r, 1, "fin", 80).musiques[1].fin, 34.9667, "jusqu'à la fin de la vidéo");
});

test("4b décalage dans la chanson : contenu glissé, boucle comme le moteur", () => {
  const r = deuxBlocs().recette;
  assert.equal(glisserContenu(r, 0, 31.234, 120).musiques[0].decalage, 31.23);
  assert.equal(glisserContenu(r, 0, -3, 120).musiques[0].decalage, 0);
  assert.equal(glisserContenu(r, 0, 500, 120).musiques[0].decalage, 119.95);
  const b = { fichier: A, debut: 10, fin: 30, decalage: 5 };
  assert.deepEqual(segmentsMusique(b, 12), [{ debut: 10, duree: 7, depuis: 5 }, { debut: 17, duree: 12, depuis: 0 }, { debut: 29, duree: 1, depuis: 0 }]);
  assert.deepEqual(segmentsMusique(b, 200), [{ debut: 10, duree: 20, depuis: 5 }]);
});

test("4b couper à la tête de lecture puis supprimer un morceau (C, Suppr)", () => {
  const r = deuxBlocs().recette;
  r.musiques[1].decalage = 4;
  assert.equal(musiqueA(r, 25), 1);
  assert.equal(musiqueA(r, 16), -1);
  const c = couperMusique(r, 1, 25);
  assert.equal(c.index, 2);
  const [x, y] = c.recette.musiques.slice(1);
  assert.deepEqual([x.debut, x.fin, x.decalage, x.fondu_sortie], [20, 25, 4, 0]);
  assert.deepEqual([y.debut, y.fin, y.decalage, y.fondu_entree], [25, 34.9667, 9, 0], "la chanson continue sans saut");
  assert.equal(couperMusique(r, 1, 20.1), null, "trop près du bord");
  const s = supprimerMusique(c.recette, 2);
  assert.deepEqual(s.musiques.map((b) => [b.debut, b.fin]), [[2, 14], [20, 25]]);
});

test("4b fondus (0 à 5 s, défaut 1,5 et 2 s) et volume (-23 dB par défaut, -35 à -10)", () => {
  const r = deuxBlocs().recette;
  const b = r.musiques[0];
  assert.deepEqual(fondus(b), [1.5, 2]);
  assert.equal(gainFondu(b, 2), 0);
  assert.equal(gainFondu(b, 2.75), 0.5);
  assert.equal(gainFondu(b, 8), 1);
  assert.equal(gainFondu(b, 13), 0.5);
  assert.equal(gainFondu(b, 14), 0, "fini");
  const f = reglerMusique(reglerMusique(r, 0, "fondu_entree", 3), 0, "fondu_sortie", 9);
  assert.deepEqual(fondus(f.musiques[0]), [3, 5]);
  assert.equal(reglerMusique(r, 0, "fondu_entree", -1).musiques[0].fondu_entree, 0);
  assert.equal(reglerMusique(r, 0, "volume_db", -2).musiques[0].volume_db, -10);
  assert.equal(reglerMusique(r, 0, "volume_db", -40).musiques[0].volume_db, -35);
});

test("4b annuler / rétablir couvrent la musique", () => {
  const h = new Historique();
  const r0 = recette();
  h.noter(r0);
  const r1 = poserMusique(r0, A, 2, 12).recette;
  h.noter(r1);
  const r2 = deplacerMusique(r1, 0, 6);
  assert.deepEqual(h.annuler(r2).musiques[0].debut, 2);
  assert.equal(h.annuler(r1).musiques, undefined);
  assert.equal(h.retablir(r0).musiques[0].debut, 2);
});

test("4b coupe ou suppression d'un morceau de vidéo : les blocs suivent", () => {
  const r = deuxBlocs().recette;
  const k = supprimerPlage(r, 1, []);       // retire 6,6667 à 10,2333 (3,5667 s)
  assert.deepEqual(k.musiques.map((b) => [b.debut, b.fin]), [[2, 10.4333], [16.4333, 31.4]]);
});

import { gainMusique, parleA, db as dbLin, VOIX_LUFS, MUSIQUE_REFERENCE, BAISSE_SOUS_VOIX, LUFS_CHANSON_DEFAUT } from "./logique.ts";

test("16 oct. : volume de la musique en direct = calcul du rendu (12 LU sous la voix à -23, -4 dB quand elle parle)", () => {
  const b = { fichier: "musique/x.mp3", debut: 0, fin: 20, volume_db: -23, fondu_entree: 0, fondu_sortie: 0 };
  const dB = (g) => 20 * Math.log10(g);
  // chanson à -12 LUFS jouée au gain g : niveau -12 + dB(g) ; il doit valoir voix (-23,6) - 12 LU
  assert.ok(Math.abs(-12 + dB(gainMusique(b, 5, -12, false)) - (VOIX_LUFS - 12)) < 1e-9);
  assert.ok(Math.abs(dB(gainMusique(b, 5, -12, true)) - dB(gainMusique(b, 5, -12, false)) - BAISSE_SOUS_VOIX) < 1e-9);
  assert.ok(Math.abs(dB(gainMusique({ ...b, volume_db: -17 }, 5, -12, false)) - dB(gainMusique(b, 5, -12, false)) - 6) < 1e-9);
  // une chanson plus forte de 5 dB est jouée 5 dB plus bas : même niveau sous la voix
  assert.ok(Math.abs(dB(gainMusique(b, 5, -7, false)) - dB(gainMusique(b, 5, -12, false)) + 5) < 1e-9);
  assert.equal(gainMusique(b, 5, undefined, false), gainMusique(b, 5, LUFS_CHANSON_DEFAUT, false));   // niveau inconnu
  assert.equal(gainMusique({ ...b, volume_db: -10 }, 5, -40, false), 1);                                 // plafond du lecteur
  assert.equal(gainMusique({ ...b, fondu_entree: 2 }, 1, -12, false), gainMusique(b, 1, -12, false) * 0.5);
  assert.equal(MUSIQUE_REFERENCE, 11);
  assert.ok(Math.abs(dbLin(-6) - 0.501187) < 1e-6);
  const groupes = [{ debut: 2, fin: 3 }];
  assert.deepEqual([1.85, 1.95, 3.1, 3.25].map((t) => parleA(groupes, t)), [false, true, true, false]);
});

import { pistesAudio, AUDIOS_LECTEUR } from "./logique.ts";

// Plus grand nombre de balises audio prises à une même image
const auPlus = (p) => {
  const ivs = [...p.sons, ...p.musique].map(({ de, n }) => [de, de + n]);
  let max = 0;
  for (const [a] of ivs) max = Math.max(max, ivs.filter(([x, y]) => x <= a && a < y).length);
  return max;
};

test("19 oct. : un son n'occupe une balise audio que le temps de son fichier (plus d'écran noir au 6e son)", () => {
  // montage réel m-33ae7fd2 : 9 sons, + une carte ajoutée (son pop) ; avant, le 6e son posé faisait planter le lecteur
  const r = { ...recette(), plages: [{ source: "P1", debut: 0, fin: 93.5 }] };
  r.sons = [0.88, 3.44, 18.82, 32.49, 43.41, 55.51, 73.67, 84.89, 89.97, 60].map((debut, i) => ({ fichier: `s${i % 3}.mp3`, debut }));
  const durees = { "s0.mp3": 0.6, "s1.mp3": 1.2, "s2.mp3": 2.5 };
  const p = pistesAudio(r, durees);
  assert.equal(p.sons.length, 10);
  assert.equal(p.muets, 0);
  assert.ok(auPlus(p) <= 2);
  const pop = p.sons.find((s) => s.k === 0);
  assert.deepEqual([pop.de, pop.n], [26, 18]);                          // 0,88 s → image 26, 0,6 s → 18 images
  assert.equal(p.sons.find((s) => s.k === 2).n, 75);                    // 2,5 s
  // durée inconnue : 3 s ; un son près de la fin s'arrête à la fin de la vidéo
  const q = pistesAudio({ ...r, sons: [{ fichier: "x.mp3", debut: 10 }, { fichier: "x.mp3", debut: 93.4 }] }, {});
  assert.deepEqual(q.sons.map((s) => s.n), [90, 3]);
});

test("19 oct. : jamais plus de balises audio que le lecteur n'en a, même avec des sons empilés", () => {
  const r = { ...recette(), plages: [{ source: "P1", debut: 0, fin: 30 }] };
  r.sons = Array.from({ length: 25 }, (_, i) => ({ fichier: "long.mp3", debut: 1 + i * 0.1 }));
  r.musiques = [{ fichier: "musique/a.mp3", debut: 0, fin: 30 }];
  const p = pistesAudio(r, { "long.mp3": 8, "musique/a.mp3": 12 });
  assert.ok(auPlus(p) <= AUDIOS_LECTEUR - 2);
  assert.equal(p.musique.length, 3);                                     // 12 s + 12 s + 6 s (en boucle)
  assert.equal(p.sons.length + p.muets, 25);
  assert.ok(p.muets > 0);
});
