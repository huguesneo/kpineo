// Hub : polices des graphiques (Allrounder, versions d'essai) chargées par lien signé, après connexion seulement.
// Jamais dans git ni dans le build Netlify : l'agent du Mac les met dans le stockage privé (hub/polices/) et les
// nomme dans hub/catalogue.json. Remplace labo/graphiques/polices.ts (qui les importait du dossier du moteur) ;
// mêmes exports pour commun.tsx et Graphique.tsx. Aucune police de remplacement : une police absente refuse la
// carte (message dans le lecteur), jamais une autre police.

// Nom du fichier (champ « police » du style) → famille CSS (les mêmes noms que dans le labo)
export const FAMILLES: Record<string, string> = {
  "AllrounderGroteskTest-Black.otf": "NEO Grotesk Noir",
  "AllrounderAntiquaTest-Bold.otf": "NEO Antiqua Gras",
};
const familleDe = (fichier: string) => FAMILLES[fichier] || `NEO ${fichier.replace(/\.[^.]+$/, "")}`;

const chargees = new Set<string>();

// urls : fichier → lien signé. Résout quand toutes sont chargées dans le document (celles qui échouent sont dites).
export const chargerPolicesHub = async (urls: Record<string, string>) => {
  const echecs: string[] = [];
  await Promise.all(Object.entries(urls).map(async ([fichier, url]) => {
    if (chargees.has(fichier)) return;
    try {
      const face = new FontFace(familleDe(fichier), `url(${JSON.stringify(url)}) format("opentype")`);
      await face.load();
      document.fonts.add(face);
      chargees.add(fichier);
    } catch {
      echecs.push(fichier);
    }
  }));
  return echecs;
};

// Le labo charge ses polices à l'import de Graphique.tsx ; le hub les charge avant d'ouvrir la timeline.
export const chargerPolices = () => {};

export const famille = (fichier: string) => {
  if (!chargees.has(fichier)) throw new Error(`Police « ${fichier} » absente du stockage : relance l'agent du Mac (il la publie au démarrage).`);
  return familleDe(fichier);
};
