# Module Compétiteurs — Réseaux sociaux

Date : 2026-08-03

## 1. Objectif

Ajouter une sous-vue « Compétiteurs » dans l'onglet Analyse de
`/reseaux-sociaux`, alimentée par le suivi de compétiteurs déjà disponible
dans Metricool. Sert deux buts :

1. Veille visuelle directe (fil des publications récentes de 5 compétiteurs,
   suivis à la fois sur Instagram et sur Facebook).
2. Repérage de ce qui performe chez eux (tri par engagement), pour nourrir
   plus tard le moteur de suggestion IA (spec séparée).

Pas de comparatif de croissance (followers dans le temps) dans ce périmètre —
seulement les publications et leur performance.

## 2. Préalable côté Metricool (hors code)

Les 5 compétiteurs doivent être ajoutés manuellement dans l'app Metricool
(section Compétiteurs du brand « Neo Performance - Naturopathe », id
`6648608`) avant le premier sync. L'API Metricool ne permet pas d'ajouter un
compétiteur, seulement de lire ceux déjà configurés. Seuls Instagram,
Facebook, Twitch, YouTube, Twitter et Bluesky supportent le suivi de
compétiteurs côté Metricool — TikTok n'est pas couvert.

**Fait le 2026-08-03** : les 5 compétiteurs sont ajoutés à la fois côté
Instagram et côté Facebook (10 fiches de suivi au total dans Metricool pour
5 entreprises). Le sync couvre donc les deux réseaux, pas seulement
Instagram.

## 3. Modèle de données

### 3.1 `social_competitor_posts` (existe déjà, vide)

Aucune modification de schéma. Colonnes déjà en place :
`network, competitor, platform_post_id, published_at, caption, reach,
interactions, engagement_rate, raw jsonb, captured_at`, unique sur
`(network, platform_post_id)`.

### 3.2 `social_competitors` (nouvelle table)

Snapshot quotidien de l'identité et des indicateurs de compte de chaque
compétiteur suivi — évite un appel Metricool supplémentaire à chaque
affichage de la vue.

```sql
CREATE TABLE public.social_competitors (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network          text NOT NULL,
  competitor_id    text NOT NULL,       -- id compétiteur côté Metricool
  screen_name      text NOT NULL,
  display_name     text,
  picture_url      text,
  followers        integer,
  posts_count      integer,
  avg_likes        numeric,
  avg_engagement   numeric,
  snapshot_date    date NOT NULL,
  raw              jsonb NOT NULL,
  UNIQUE (network, competitor_id, snapshot_date)
);
```

RLS : même politique que les autres tables `social_*` — accès conditionné à
`public.has_social_access()`.

## 4. Synchronisation

Nouvelle edge function `social-competitors-sync`, déployée avec
`verify_jwt false` (auth interne au code, cf. consigne standard). Appelle
directement l'API Metricool (pas via MCP, qui est un outil côté agent, pas
accessible depuis une tâche serveur) :

- **Connecteur `competitors`**, réseaux Instagram **et** Facebook → upsert
  une ligne par compétiteur et par réseau dans `social_competitors` avec la
  date du jour (10 lignes/jour : 5 compétiteurs × 2 réseaux).
- **Connecteur `competitor posts`**, réseaux Instagram **et** Facebook →
  upsert dans `social_competitor_posts` sur une fenêtre glissante de 90
  jours, clé d'unicité `(network, platform_post_id)` déjà en place donc les
  ré-exécutions sont idempotentes.

Sur Facebook, `interactions` n'existe pas comme champ direct (contrairement à
Instagram) : on le calcule comme `reactions + comments + shares`
(`FBCP07 + FBCP08 + FBCP09`). `engagement_rate` vient directement de
`FBCP10`/`IGCP10` dans les deux cas.

Le token d'API Metricool (`METRICOOL_API_TOKEN`, `METRICOOL_USER_ID`) est
stocké en secret Supabase — aucun secret en dur dans le code, à la
différence de l'URL/anon key du pattern `net.http_post` existant (anon key
déjà publique côté frontend, donc sans risque).

Cron quotidien via `pg_cron`, même mécanique que
`social-sync-meta-4h` (`net.http_post` vers l'edge function, une seule
migration SQL dédiée).

### 4.1 Erreurs

Si l'appel Metricool échoue (compétiteur retiré, quota API, timeout) : log
l'erreur, ne pas faire échouer tout le cron, laisser les données de la veille
en place. Pas d'alerte proactive dans ce périmètre — un cron quotidien qui
échoue une fois n'est pas critique pour une fonctionnalité de veille.

## 5. UI

Nouvelle sous-vue dans `AnalyseView` (`src/features/social/analyse/`),
onglet ou section « Compétiteurs », composée de :

1. **Cartes compétiteur** — avatar, nom, followers actuels (dernier
   `snapshot_date` de `social_competitors`).
2. **Fil chronologique** — publications des 3 compétiteurs mélangées,
   triées par `published_at` décroissant : miniature/texte, date,
   likes/comments, taux d'engagement.
3. **Tri « Top performances »** — mêmes publications réordonnées par
   `engagement_rate` décroissant, pour repérer vite les formats/sujets qui
   cartonnent chez eux.

Un hook `useSocialCompetitors()` (même forme que `useSocialAnalytics`)
charge les deux tables et expose `{ competitors, posts, loading, error }`.

## 6. Hors périmètre

- Comparatif de croissance dans le temps (évolution des followers).
- Ajout de compétiteurs depuis l'UI de l'app (reste manuel dans Metricool).
- Alerte automatique sur un post compétiteur qui explose.
