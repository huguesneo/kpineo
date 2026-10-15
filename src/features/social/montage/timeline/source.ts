// Contrat entre la timeline (App.tsx, recopiée du labo) et le hub : ce que faisait le serveur local du labo.
// Implémentation : sourceHub.js (session de la personne connectée, tâches de l'agent, liens signés).
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Source = {
  titre: string;
  montage(): Promise<{ recette: any; medias: { apercu: number | null; base: null; voix: null }; brouillon: boolean; proxies: Record<string, string>; plages_rendues?: unknown }>;
  modeles(): Promise<any>;
  proxies(): Promise<{ proxies: Record<string, string>; en_cours: boolean }>;
  verifier(recette: unknown): Promise<any>;
  sauver(recette: unknown): Promise<unknown>;
  jeter(): Promise<unknown>;
  onde(fichier: string): Promise<{ duree: number; pas: number; pics: number[] } | null>;
  appliquer(recette: unknown): Promise<{ travail?: any; refus?: string }>;
  ia(recette: unknown, demande: string): Promise<{ travail?: any; refus?: string }>;
  travail(): Promise<{ travail: any }>;
  lien(chemin?: string): string | undefined;
  lienSon(fichier: string): string | undefined;
  lienApercu(): string | null;
  abonner(f: () => void): () => void;
  version(): number;
};
