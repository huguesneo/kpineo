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

**Fait le 2026-08-03**, et différent de ce qui était prévu : les comptes
suivis côté Instagram et côté Facebook ne sont **pas les mêmes personnes**.
Ce sont 10 comptes distincts, pas 5 entreprises sur deux réseaux — seul
`richard.mzg` apparaît des deux côtés.

| Instagram | Abonnés | Facebook | Abonnés |
|---|---|---|---|
| trainbloom | 1 210 437 | Dr. Mindy Pelz | 619 271 |
| jonschoeff | 503 986 | Dr. Eric Berg | 5 850 828 |
| richard.mzg | 196 993 | Dr. Josh Axe | 3 217 439 |
| ben.nutritionniste | 58 205 | Amanda Tress | 66 481 |
| resilientgentleman | 19 398 | richard.mzg | 10 713 |

Le code ne doit donc jamais présumer qu'un compte existe sur les deux
réseaux : la clé d'identité est `(network, screen_name)`, pas `screen_name`.

## 3. Modèle de données

### 3.1 `social_competitor_posts` (existait déjà, vide)

Colonnes d'origine : `network, competitor, platform_post_id, published_at,
caption, reach, interactions, engagement_rate, raw jsonb, captured_at`, unique
sur `(network, platform_post_id)`.

Quatre colonnes ajoutées le 2026-08-03 :

| Colonne | Rôle |
|---|---|
| `media_type` | `'POST'` / `'REEL'`, défaut `'POST'`. Voir §4.1. |
| `likes` | J'aime (Instagram) ou réactions (Facebook). |
| `comments` | Commentaires. |
| `shares` | Partages — **Facebook uniquement**, Instagram ne les expose pas pour les concurrents. |

Le total `interactions` seul ne dit pas *comment* une publication a marché. La
décomposition permet de trier par partage, qui pèse 30 % du score interne des
publications NEO.

Contrôle de cohérence fait au chargement : côté Instagram,
`interactions = likes + comments` exactement sur les 325 lignes — confirmant
que le total Instagram n'inclut ni partages ni sauvegardes.

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

Pas d'edge function : Metricool n'expose pas de token d'API sur ce forfait.
Le sync passe par une **routine cloud Claude** (`trig_01XUz9B6nkmDq1FCssXEQueB`,
quotidienne à 7 h 45 America/Toronto) qui utilise le connecteur MCP Metricool
et le connecteur MCP Supabase. C'est le seul chemin disponible pour atteindre
ces données depuis une tâche planifiée.

- **Backfill initial** (fait le 2026-08-03) : 90 jours, les deux réseaux.
- **Sync quotidien** : fenêtre glissante de **14 jours seulement**, pas 90.
  Recharger 90 jours chaque nuit serait long et sans effet — un compte comme
  Dr. Eric Berg publie ~750 fois par trimestre, et les publications de plus de
  deux semaines n'évoluent plus significativement. La clé d'unicité
  `(network, platform_post_id)` rend les ré-exécutions idempotentes.

### 4.1 Le piège principal : posts et Reels sont deux connecteurs

Metricool range les publications du fil et les Reels dans **deux connecteurs
distincts**. Interroger seulement `competitor posts` fait disparaître
entièrement les comptes qui publient surtout en Reels — ce qui, dans la niche
santé, est la majorité.

Constaté au 2026-08-03 sur 90 jours :

| Compte Instagram | Posts fil | Reels |
|---|---|---|
| trainbloom | 0 | 23 |
| ben.nutritionniste | 0 | 64 |
| jonschoeff | 10 | 46 |
| resilientgentleman | 68 | 114 |

Il faut donc **trois appels** par synchronisation : `competitors` (identité),
`competitor posts` (fil, IG + FB) et `competitor reels` (IG uniquement —
Facebook n'expose pas de connecteur de Reels concurrents, ses
`competitor posts` couvrant déjà tout).

La colonne `social_competitor_posts.media_type` (`'POST'` / `'REEL'`, défaut
`'POST'`) porte la distinction. Elle sert aussi à l'analyse : savoir qu'un
concurrent mise à 100 % sur le Reel est en soi une information de stratégie.

### 4.2 Autres pièges, vérifiés en conditions réelles

| Piège | Détail |
|---|---|
| `FBCO12` | Renvoie une copie du nombre d'abonnés, pas une moyenne de likes. Utiliser **`FBCO08`** (réactions moyennes) comme équivalent d'`IGCO09`. |
| `interactions` Facebook | N'existe pas comme champ direct. Le calculer : `FBCP07 + FBCP08 + FBCP09` (réactions + commentaires + partages). Vérifié : 63 243 + 2 436 + 8 352 = 74 031. |
| URL Facebook | `FBCP11` est une **formule de tableur**, pas une URL. Le lien se reconstruit depuis `platform_post_id` (forme `pageId_postId`) → `facebook.com/{pageId}/posts/{postId}`. |
| `published_at` | Renvoyé au format `20260731` (YYYYMMDD), pas ISO. |
| `engagement_rate` | Souvent `null` côté Instagram. Ne pas en faire une colonne de tri par défaut. |
| Vignettes et avatars | URL du CDN Meta avec jeton d'expiration : elles cassent au bout de quelques jours. L'UI doit dégrader proprement. |

### 4.3 Erreurs et limites connues

Si un réseau ou un connecteur renvoie une liste vide, la routine continue avec
les autres sans échouer. Pas d'alerte proactive : un sync quotidien de veille
qui saute une nuit n'est pas critique.

Deux limites assumées :

- **Les vignettes et avatars expirent.** Ce sont des URL du CDN Meta portant un
  jeton de signature. Le sync quotidien ne couvrant que 14 jours, les images
  plus anciennes finiront par ne plus se charger et ne seront jamais
  rafraîchies. L'UI dégrade proprement (image retirée, initiale pour l'avatar)
  et le lien vers la publication reste valide. Corriger cela demanderait de
  rapatrier les images dans le bucket `social-media`, ce qui n'est pas dans ce
  périmètre.
- **`richard.mzg` sur Instagram** ne renvoie aucune publication ni aucun Reel
  sur 90 jours, côté Metricool lui-même — alors que le compte publie. Ce n'est
  pas un défaut de requêtage. À vérifier dans l'interface Metricool (compte mal
  lié ou restreint).

## 5. UI

Onglet « Compétiteurs » dans `AnalyseView`, alimenté par le hook
`useSocialCompetitors()` (`src/hooks/useSocialCompetitors.js`).

### 5.1 L'index, seule lecture honnête

Metricool ne donne, par publication concurrente, ni vues ni portée — seulement
interactions, légende et date. Un compteur brut ne dirait donc que la taille du
compte : 400 interactions ne veulent pas dire la même chose chez
`resilientgentleman` (19 k abonnés) et chez Dr. Eric Berg (5,8 M).

Chaque publication est donc ramenée à la **médiane de son propre auteur** :
index 100 = publication ordinaire pour ce compte. Même convention que le score
interne des publications NEO.

Deux garde-fous, repris du scoring interne :
- La médiane se calcule toujours sur 90 jours, **jamais sur la période choisie
  à l'écran** — sinon elle changerait de sens à chaque clic sur le filtre.
- Sous 8 publications, un compte n'a pas d'index du tout.

Seuils calés sur la distribution réellement observée (1 203 publications au
2026-08-03), pas sur une intuition — elle est très asymétrique :

| Seuil | Part des publications | Libellé |
|---|---|---|
| ≥ 500 (≈ 90e centile) | 11 % | percée |
| ≥ 200 | 31 % | au-dessus |
| ≥ 60 | — | ordinaire |
| < 60 | — | sous la médiane |

Le seuil de « percée » initialement envisagé à 200 (le double de la médiane) a
été écarté : à ce niveau, un tiers des publications seraient des percées, ce
qui ne distingue plus rien.

### 5.2 Composition de la vue

La vue reprend délibérément la grammaire de l'onglet Publications — tableau
trié par colonne, ligne cliquable, panneau latéral — pour qu'on lise les
concurrents avec les mêmes réflexes que ses propres publications.

1. **Cartes compte** — avatar, réseau, abonnés, cadence hebdomadaire, nombre
   de percées, médiane d'interactions, part de Reels. Cliquables pour filtrer
   le tableau.
2. **Tableau** — colonnes J'aime, Commentaires, Partages, Interactions,
   Engagement, Index. Toutes triables par clic sur l'en-tête, alternant
   croissant/décroissant ; la colonne Publication trie par date. Tri par
   défaut : index décroissant. Une métrique absente reste en bas quel que soit
   le sens du tri — elle n'est pas « la plus petite », elle est inconnue.
3. **Filtres** — Tous / Reels / Publications, et « percées seulement ».
4. **Panneau de détail** (`CompetiteurDrawer`) — visuel, décomposition
   complète des interactions, et surtout **la légende intégrale**, qui occupe
   la place principale. C'est le hook réel du concurrent, la seule chose
   directement réutilisable pour produire du contenu.

### 5.3 Pagination obligatoire

PostgREST plafonne une réponse à **1 000 lignes**. La table dépasse ce seuil
(1 650 lignes au 2026-08-03) et la troncature est silencieuse. Le hook doit
donc paginer par `.range()` jusqu'à épuisement.

Ce n'est pas cosmétique : sans pagination, les médianes de référence se
calculent sur un échantillon amputé, et **tous les index sont faux** sans
qu'aucun signe ne l'indique. Constaté en conditions réelles — la publication
de tête affichait un index de 8 426 au lieu de 13 473.

## 6. Hors périmètre

- Comparatif de croissance dans le temps (évolution des followers).
- Ajout de compétiteurs depuis l'UI de l'app (reste manuel dans Metricool).
- Alerte automatique sur un post compétiteur qui explose.
- Comparaison de notre taux d'engagement au leur : les deux ne se calculent
  pas sur la même base (le nôtre rapporté à la portée, le leur aux abonnés
  selon Metricool). Les afficher côte à côte suggérerait une équivalence
  fausse.
