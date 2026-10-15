// Timeline du labo dans le hub, plein écran (chargée à part : Remotion n'est téléchargé qu'ici).
// Avant d'afficher : catalogue de la palette lu, polices des graphiques chargées par lien signé (jamais une
// police de remplacement).
import React, { useEffect, useState } from "react";
import { App } from "./App";
import { chargerPolicesHub } from "./graphiques/polices";
import type { Source } from "./source";
import "./style.css";

type Liens = { signerMaintenant(bucket: string, chemin: string): Promise<string | null> };

const TimelineHub: React.FC<{
  source: Source; liens: Liens; erreur: string | null;
  extra: (o: { brouillon: boolean; enCours: boolean }) => React.ReactNode;
}> = ({ source, liens, erreur, extra }) => {
  const [etat, setEtat] = useState<{ pret: boolean; erreur: string | null; avis: string | null }>({ pret: false, erreur: null, avis: null });
  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const m = await source.modeles();
        const polices: Record<string, string> = m.polices || {};
        const urls: Record<string, string> = {};
        for (const [fichier, chemin] of Object.entries(polices)) {
          const u = await liens.signerMaintenant("video-timeline", chemin);
          if (u) urls[fichier] = u;
        }
        const echecs = await chargerPolicesHub(urls);
        const manquent = [...Object.keys(polices).filter((f) => !urls[f]), ...echecs];
        if (actif) setEtat({ pret: true, erreur: null, avis: manquent.length ? `Police non chargée : ${manquent.join(", ")} (les graphiques qui l'utilisent ne s'affichent pas).` : null });
      } catch (e) {
        if (actif) setEtat({ pret: false, erreur: (e as Error).message, avis: null });
      }
    })();
    return () => { actif = false; };
  }, [source, liens]);

  return (
    <div className="timeline-neo" style={{ position: "fixed", inset: 0, zIndex: 60 }}>
      {etat.erreur ? <div className="chargement">{etat.erreur}</div>
        : !etat.pret ? <div className="chargement">Chargement de la palette et des polices…</div>
          : <App source={source} extra={extra} />}
      {(erreur || etat.avis) && (
        <div className="alerte erreur" style={{ position: "fixed", left: "50%", bottom: 16, transform: "translateX(-50%)", zIndex: 70, maxWidth: 640 }}>
          {erreur || etat.avis}
        </div>
      )}
    </div>
  );
};

export default TimelineHub;
