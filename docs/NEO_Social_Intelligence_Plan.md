# NEO Performance — Moteur d'intelligence réseaux sociaux

**Recherche + plan de build**
Préparé pour Hugues Pugliese · 31 juillet 2026

---

## Résumé exécutif — les 6 décisions à prendre

Tu as déjà 80 % de la plomberie. Ce qui manque, c'est le pont entre ce que tu publies et ce que les plateformes savent de ces publications. Voici les six décisions qui structurent tout le reste.

**1. Brancher Meta en direct, pas GHL.** L'API statistiques de GoHighLevel est au niveau du compte, hebdomadaire, sans sauvegardes ni rétention. Elle ne te dira jamais pourquoi un Reel a marché. Tu as déjà une app Meta vérifiée (elle roule ton `meta-ads-sync`), donc l'ajout d'Instagram + Facebook Page est un incrément, pas un projet. C'est la seule décision vraiment urgente.

**2. Arrêter de normaliser par les abonnés.** En 2026, environ la moitié des vues Instagram viennent de non-abonnés. Un taux d'engagement calculé sur ta base d'abonnés mesure surtout la taille de ta base, pas la qualité de ton contenu. Tout doit être normalisé par la portée.

**3. Renoncer au test d'heures comme projet principal.** Je sais que ce n'est pas ce que tu voulais entendre, et je détaille pourquoi en partie 2. Résumé : avec 5-10 posts par semaine, la seule chose que tu peux détecter statistiquement, ce sont des effets de l'ordre de +50 % et plus. L'effet d'une heure de publication est de l'ordre de ±10-15 %. Tu chercherais un signal sous ton plancher de détection pendant 14 mois. Par contre, l'effet d'un changement de format ou de pilier de contenu est de l'ordre de ×2 — détectable en un mois. Le système doit tester ça en priorité, et traiter l'heure comme une donnée qu'on accumule en arrière-plan sans y baser de décision avant plusieurs mois.

**4. Figer une fenêtre de mesure à J+7.** Un Reel Instagram met 70 jours à atteindre 95 % de ses vues; un TikTok en fait 72 % le premier jour. Comparer un post de 2 jours à un post de 3 semaines, c'est comparer n'importe quoi. Tous les scores se calculent sur un instantané pris à J+7, avec un second relevé à J+28 stocké à part.

**5. Taguer au moment de la publication, jamais après.** Tu as déjà les sphères, formats, intentions et CTA dans ton `PostModal`. C'est excellent et c'est rare. Il manque deux champs : le **type de hook** et le **problème d'audience visé**. Sans eux, l'IA ne pourra pas te dire « ce qui marche, c'est le hook confession sur le problème de la reprise de poids » — elle pourra seulement te dire « les Reels marchent ». La différence de valeur est énorme.

**6. L'IA analyse des index relatifs, pas des chiffres bruts.** Si tu envoies des vues brutes à un modèle, il va commenter le post viral et ignorer les vingt autres. Le moteur doit d'abord calculer un index de performance par rapport à ta propre médiane glissante, et l'IA raisonne sur ces index. C'est la différence entre un rapport qui dit « le post 47 a fait 32 000 vues » et un rapport qui dit « les carrousels sur la digestion surperforment ta médiane de 2,3× en sauvegardes depuis six semaines, et c'est le seul angle qui le fait ».

---

# Partie 1 — Ce que font ceux qui dominent vraiment

## 1.1 Le contenu n'est pas produit, il est validé

Le point commun de tous les opérateurs à volume, c'est qu'ils ne traitent pas une publication comme un livrable mais comme un test à faible coût. Alex Hormozi a publié environ 5 300 vidéos courtes, dont 91 % des vues viennent des Shorts, et il utilise explicitement le format court comme couche de validation d'idées : ce qui performe en court est promu en long, puis en chapitre de livre. La production est volontairement pauvre — caméra directe, sous-titres, tableau blanc — parce que c'est l'idée qui est testée, pas l'esthétique.

Dan Koe applique une règle 70/30 : environ 70 % de sa production quotidienne réplique des formats déjà gagnants, 30 % explore. Quand une exploration gagne, elle entre en rotation dans les 70 %. Justin Welsh, lui, logge chaque publication dans une base avec date, style, et un score de résonance de 1 à 10, puis recycle automatiquement les gagnants à 6, 12, 18 et 24 mois.

Ce que ça implique pour ton app : ton pipeline actuel va de l'idée à « publié ». Il lui manque l'étape d'après — le retour du gagnant dans la banque. Ta table `social_hooks` avec son booléen `used` est la bonne intuition, mais elle est unidirectionnelle. Il faut qu'un hook qui a produit un post à score élevé remonte automatiquement en tête de la banque, avec son score.

## 1.2 Le hook est la seule variable qui mérite un vrai protocole de test

La méthode qui revient partout : garder le corps et le CTA constants, ne faire varier que l'ouverture, tester 5 à 10 **angles distincts** (pas des micro-variations de la même phrase), décider à 48-72 heures, tuer tout ce qui est sous la médiane du compte.

La métrique de décision est le **hook rate** — vues à 3 secondes divisées par les impressions. Sous 50 % en organique, on ne touche à rien d'autre : ni au corps, ni au CTA, ni à l'heure. C'est une hiérarchie de diagnostic, et la respecter évite 90 % des fausses conclusions.

Instagram t'a donné l'outil natif pour ça et presque personne ne l'utilise : les **Trial Reels**. Le Reel est montré aux non-abonnés d'abord, sans être servi à ta base. Trois usages qui te concernent directement :

- Tester deux ou trois ouvertures différentes sur la même vidéo, sur audience froide.
- Revalider un ancien gagnant sur audience froide pour savoir si sa performance venait du contenu ou de la familiarité de tes abonnés.
- Tester un angle sensible (par exemple un contenu plus vendeur) sans risquer ta base.

C'est gratuit et c'est le seul mécanisme qui te donne un vrai groupe témoin. Ça mérite un statut dédié dans ton pipeline.

## 1.3 Le diagnostic par forme de courbe de rétention

Trois formes, trois diagnostics :

| Forme | Signature | Diagnostic |
|---|---|---|
| **Falaise** | 30-50 % perdus en 1-3 s | Problème d'ouverture : carton d'intro, logo, « salut tout le monde », plan d'établissement |
| **Bosse** | Tient >60 % jusqu'au payoff puis décroît | Bon contenu, structure correcte. Fort taux de partage attendu |
| **Plateau** | >70 % de bout en bout, pic >100 % à la seconde 1 (replays) | Format préféré de l'algorithme. Typique de l'éducatif en liste |

Correctifs mesurés : supprimer les cartons et logos d'intro (+10 à 20 points de durée moyenne), sous-titres dès la première seconde (+25 à 40 % en rétention son coupé), couper les deux premières secondes (transforme souvent une falaise en plateau), boucler la dernière image sur la première.

Une perte de 30 à 50 % dans les trois premières secondes est **normale**, pas un échec. C'est le genre de repère qui évite de tuer un bon format par panique.

## 1.4 La hiérarchie des signaux a changé

L'ordre d'importance rapporté pour Instagram en 2026 : temps de visionnement et replays, puis **partages en DM rapportés à la portée** (sends per reach), puis likes rapportés à la portée, puis conversation bidirectionnelle. Mosseri a déclaré publiquement que les sends per reach font partie des signaux de classement les plus importants sur toutes les surfaces.

Concrètement : **les likes et les commentaires ne font quasiment plus rien pour ta portée.** Le filtre à appliquer à chaque post devient une seule question — est-ce que quelqu'un enverrait ça à une amie en privé ?

Et pour ta niche spécifiquement, il y a un piège documenté : l'audience santé fait ses recherches en privé. Peu de commentaires, beaucoup de sauvegardes et de DM. Si ton dashboard met les commentaires en avant, il va te faire tuer tes meilleurs contenus.

Autres changements 2025-2026 qui te concernent :

- **Mise à jour originalité du 1er mai 2026** : elle s'applique maintenant aux photos et carrousels, plus seulement aux Reels. Le repost au-delà d'un certain seuil sur 30 jours fait perdre l'accès aux recommandations. Le contenu original obtiendrait 40 à 60 % de distribution en plus.
- **Éditer un post après publication réinitialise ses signaux d'engagement.** À documenter comme règle interne.
- **TikTok est passé en distribution follower-first** : la vidéo est d'abord testée sur tes abonnés avant élargissement. Ta base est devenue ton jury. Et le seuil de completion rate pour percer serait passé d'environ 50 % en 2024 à 70 %+ aujourd'hui.
- **Carrousels Instagram** : jusqu'à 20 slides, ratio 4:5, et un algorithme de « seconde chance » qui re-sert un carrousel non swipé. Portée 1,4× la base mais engagement autour de 10 %, contre 2,5 % pour les Reels. Les Reels servent la découverte, les carrousels servent la conversion.

## 1.5 Social SEO — le levier structurel le plus sous-exploité

Pour TikTok, la méthode de la triple mention : le mot-clé cible prononcé à l'oral dans les trois premières secondes, écrit en texte à l'écran, et présent dans les 80 premiers caractères de la légende, plus 3-5 hashtags dont le mot-clé. Le ranking rapporté est deux à trois fois meilleur qu'avec une mention unique.

Pour Instagram, même logique : les mots-clés dans le champ Nom (le gras sous la photo de profil), la bio, les légendes, le handle et les tags de lieu. Instagram fonctionne comme un moteur de recherche fermé.

Pour toi, les mots-clés évidents sont « métabolisme », « cortisol », « périménopause », « perte de gras », « digestion », « ménopause », plus les variantes géographiques (Brossard, Rive-Sud, Montréal). Ça devrait devenir un champ taguable dans ton `PostModal` : **mot-clé SEO ciblé**. Ça te permettra de mesurer si le contenu optimisé SEO recrute plus de non-abonnés que le reste.

## 1.6 Google Business — le canal que tu sous-estimes probablement

Répartition des signaux de classement local : la fiche Google Business pèse environ 32 %, le on-page 19 %, les avis 16 %, les liens 15 %. 46 % des recherches Google ont une intention locale, et un map pack apparaît sur 39 % des recherches locales.

Deux seuils critiques pour une clinique :

- **150+ avis** semble être le seuil à partir duquel les IA génératives (ChatGPT, Perplexity, Gemini) nomment l'entreprise de façon fiable quand on leur demande une recommandation locale. C'est devenu un canal d'acquisition en soi.
- **La vélocité prime sur le volume.** Un concurrent qui reçoit 10 avis frais par mois dépasse une fiche à 200 avis dormants. En santé, le plancher du quartile supérieur tourne autour de 145 avis, atteignable en 6-8 mois à 20-25 avis par mois.

Cadence recommandée : au moins un post par semaine sur la fiche, 4 photos par mois, une vidéo par mois. Les métriques à valeur commerciale directe sont les clics d'appel (repère 5-8 % des vues), les clics vers le site (4-7 %) et les demandes d'itinéraire (3-5 %).

Ça vaut la peine d'inclure GBP dans le module dès le départ, même en dernier dans l'ordre de build.

## 1.7 Le cas le plus transposable à ton audience

Melani Sanders, « We Do Not Care Club ». Première vidéo le 13 mai 2025, sans plan. Format : humour pince-sans-rire, liste de choses dont les femmes en périménopause et ménopause arrêtent de se soucier, se terminant par un appel à publier sa propre liste. Résultat : 2 M d'abonnés Instagram, 1 M+ TikTok, environ 4 M tous canaux, livre bestseller du New York Times en janvier 2026.

La mécanique n'est ni la production, ni la fréquence. C'est **un format nommé, répétable, participatif, sur une audience sous-servie qui cherchait un langage pour son expérience**. Le « club » transforme le contenu en identité collective, et c'est exactement ce qui produit les partages en DM — le signal numéro deux d'Instagram.

Ton audience, ce sont des femmes de 35 à 50 ans qui ont déjà échoué en perte de poids et qui portent de la honte à ce sujet. Elles n'ont pas de langage collectif pour ça. C'est probablement l'opportunité la plus grosse de ce document, et elle ne coûte rien à tester : un format nommé, récurrent, participatif. Le système d'analyse te dira en trois semaines s'il prend.

## 1.8 Benchmarks santé et bien-être 2026

| Plateforme | Engagement moyen | Vues moyennes / post | Tendance |
|---|---|---|---|
| TikTok santé/bien-être | 2,3 % (cible 2,0-2,5 %) | 219 K | Partages −41 % en un an, vues +146 % |
| Instagram santé/bien-être | 1,8 % (cible 1,0-2,0 %) | 90 K | Vues +29 % |
| YouTube | 77 % de rétention | 137 K | Top performers passés de 2 à 3 pub/semaine |

**Un avertissement important sur ces chiffres.** Le benchmark « santé » le plus cité dans l'industrie (Hootsuite, Instagram 3,7 %) regroupe « Healthcare, Pharma & Biotech » — donc une clinique de trois employés et Pfizer dans le même seau. Ces moyennes ne te décrivent pas. **Le seul benchmark valide pour toi, c'est ton propre historique.** C'est précisément pour ça que tout le moteur de scoring décrit en partie 4 est basé sur ta médiane glissante et non sur des repères externes.

---

# Partie 2 — Les trois vérités inconfortables

## 2.1 La distribution de la portée est log-normale, donc toute moyenne est fausse

Buffer, qui analyse 52 millions de publications, le reconnaît explicitement : les distributions de performance sociale sont fortement asymétriques, un petit nombre de posts viraux tirent les moyennes loin de ce que la plupart des comptes vivent réellement. Ils utilisent donc systématiquement des médianes.

Conséquence pratique pour ton dashboard : **aucune moyenne de portée nulle part.** Médianes, rangs, ou calculs en espace logarithmique. Un seul Reel à 200 000 vues déplace la moyenne d'un mois entier et te fait prendre la mauvaise décision.

## 2.2 Le combien de posts avant de conclure — le calcul honnête

C'est la partie que personne ne fait, et c'est celle qui détermine ce que ton système peut réellement te dire.

En travaillant en espace logarithmique avec un écart-type typique du contenu social (σ ≈ 0,7), pour une puissance de 80 % et un seuil de 5 % :

| Effet réel recherché | Posts par condition | Total | Durée à 8 posts/semaine, split 50/50 |
|---|---|---|---|
| **+20 %** de portée médiane | ~236 | 472 | **≈ 14 mois** |
| **+50 %** | ~48 | 96 | **≈ 3 mois** |
| **×2** | ~16 | 32 | **≈ 1 mois** |

Ce que ça veut dire concrètement :

- **Tester l'heure de publication** : l'effet réel, si effet il y a, est probablement de ±10 à 15 %. C'est sous ton plancher de détection. Tu chercherais pendant plus d'un an, et le résultat serait contaminé par la saisonnalité, la croissance du compte et le contenu lui-même.
- **Tester le format** (Reel vs image statique : reach rate de 30,8 % contre 13,1 %, soit ×2,3) : parfaitement dans ta plage. Un mois.
- **Tester un pilier de contenu** : dans ta plage aussi.
- **Tester un type de hook** : à la limite, autour de trois mois si l'effet est fort.

Et il faut aussi savoir que les quatre grandes études sur les meilleures heures de 2026 se contredisent frontalement — Sprout dit mardi-mercredi 12h-19h, Buffer dit jeudi 9h, Later dit 5h du matin, Hootsuite dit autre chose encore. Aucune ne publie de taille d'effet chiffrée. La seule statistique quantifiée que j'ai trouvée (+30-50 % d'engagement) vient de Later, c'est-à-dire du vendeur de la fonctionnalité, sans méthodologie publiée.

L'explication de la divergence est simple et elle est convaincante : les études qui comptent l'engagement total favorisent les heures où le plus de monde est en ligne (midi et soir), celles qui normalisent par la portée favorisent les heures à faible concurrence (tôt le matin). **Le « meilleur moment » est un artefact du dénominateur choisi, pas une propriété du monde.**

## 2.3 Ce qu'on fait avec l'heure, alors

On ne l'abandonne pas — on la rétrograde. Trois choses :

1. **Fixer deux créneaux** et arrêter d'y penser. Pour des femmes de 35-50 ans au Québec, 11h-13h et 19h-21h heure de l'Est sont les deux hypothèses plausibles. On alterne, on randomise l'assignation post par post.
2. **Accumuler la donnée en arrière-plan** dans le système sans afficher de conclusion. L'écran « Heures » affiche le nombre de posts par cellule et un message explicite : « 6 posts dans ce créneau — il en faut au moins 48 avant de pouvoir conclure ». Ça te protège contre toi-même.
3. **Ré-évaluer à 6 mois**, quand tu auras 200+ posts en base, avec un test non-paramétrique propre.

Pendant ce temps, la puissance statistique disponible va sur le format, le pilier et le type de hook, où les effets sont détectables.

Une note qui vaut de l'or : Buffer, avec 52 millions de posts, refuse quand même de faire des tests de significativité sur des expériences de compte individuel, et recommande à la place la **réplication** — refaire l'expérience quelques fois et voir si le résultat tient. C'est le bon standard pour toi. **Réplication sur deux cycles indépendants, pas p < 0,05 sur un test unique.**

## 2.4 Les métriques à mettre au dashboard, et celles à en bannir

**Les formules exactes à coder :**

```
ER_reach       = (likes + comments + saves + shares) / reach × 100
Save rate      = saves / reach × 100
Share rate     = shares / reach × 100          ← "sends per reach", le signal n°2
Follow rate    = follows / reach × 100
Profile CTR    = profile_visits / reach × 100
Watch-through  = average_watch_time / duration × 100
Reach rate     = reach / followers × 100        ← contexte seulement, pas décision
```

**Repères pour un compte nano à petit (1-10 K) :**

| Métrique | Faible | Correct | Fort | Viral |
|---|---|---|---|---|
| Share rate (sends/reach) | < 0,5 % | 0,5-1 % | 1-2 % | > 2 % |
| Save rate (éducatif santé) | < 1 % | 1-2 % | 2-5 % | > 5 % |
| ER by reach | < 3 % | 3-6 % | 6 %+ | — |
| Hook rate (vues 3s / impressions) | < 40 % | 40-50 % | 50 %+ | — |
| Watch-through TikTok 15-30 s | < 40 % | 40-60 % | 60-75 % | 75 %+ |
| Reel → visites de profil | < 2 % | 2-3 % | 3-7 % | — |

**À bannir du dashboard, sans exception :**

- Les impressions (double comptage du même utilisateur) — utiliser la portée.
- Le nombre absolu d'abonnés — utiliser la vélocité nette hebdomadaire.
- Les likes totaux — le signal d'engagement le plus faible en 2026.
- Les visites de profil brutes — utiliser le ratio.
- Toute moyenne de portée — utiliser la médiane.
- Les vues TikTok brutes en métrique principale.

**Un résultat bien mesuré et pas cher à implémenter** : sur environ 2 millions de posts avec modélisation intra-compte, répondre aux commentaires est associé à +21 % d'engagement sur Instagram et +9,5 % sur Facebook. Effet plus grand, mieux mesuré, et infiniment moins cher que n'importe quelle optimisation d'horaire. Ça mérite une tâche récurrente dans ton module Tâches.

---

# Partie 3 — Ce que tu as déjà (audit du code)

J'ai lu ton app sans rien modifier. Voici l'état réel.

**Stack** : React 18 + Vite 5 + Tailwind 3 + Supabase (`@supabase/supabase-js` 2.39), `date-fns`, `jspdf`. **Aucune librairie de graphiques** — il faudra en ajouter une (je recommande Recharts, il s'intègre bien avec ton style de composants).

**Ce qui existe déjà et qui est bon :**

| Élément | État | Verdict |
|---|---|---|
| Table `social_posts` | Pipeline complet idée → montage → programmé → publié, avec `stats jsonb` et `stats_synced_at` déjà prévus | Les colonnes d'accueil des stats sont là, vides |
| Taxonomie de contenu | `SPHERES` (9), `FORMATS` (8), `INTENTIONS` (5), `CTAS` (4) dans `ReseauxSociaux.jsx` | **Excellent et rare.** C'est ta fondation d'analyse |
| Tables `social_ideas` / `social_hooks` | Banques avec flag `used` | Bonne intuition, unidirectionnelle |
| Edge function `social-planner` | 7 actions GHL dont `stats` (account-level) | Publication OK, stats insuffisantes |
| RLS | `has_social_access()` sur allowlist email | Propre, à réutiliser tel quel |
| Bucket `social-media` | Public, RLS en écriture | Prêt |
| `meta-ads-sync` | App Meta fonctionnelle, `META_ACCESS_TOKEN` en env, cron horaire pg_cron + pg_net | **Ton plus gros atout** : l'infra Meta et le pattern de cron existent |
| `ghl_post_id` | Colonne présente sur `social_posts` | Pointe vers GHL, pas vers Instagram |

**Le trou central.** Ton `ghl_post_id` te donne l'identifiant du post dans GoHighLevel. Instagram ne connaît pas cet identifiant. Il n'existe aujourd'hui **aucun pont entre une ligne de `social_posts` et le média Instagram correspondant**. C'est la première chose à construire, et c'est la partie technique la moins évidente du projet — je la détaille en 4.3.

**Ce qui manque au niveau du tagging.** Tu as la sphère, le format, l'intention et le CTA. Il manque, par ordre de valeur analytique :

1. **`hook_type`** — erreur, résultat, confession, checklist, contrarian, question, comparaison, statistique
2. **`audience_problem`** — le point d'entrée douleur ou désir (reprise de poids, fatigue chronique, ballonnements, bouffées de chaleur, plateau, honte du corps, etc.)
3. **`proof_method`** — cas client, donnée, démonstration, expérience personnelle, source scientifique, avant/après
4. **`seo_keyword`** — le mot-clé ciblé pour le social SEO
5. **`is_trial`** — booléen Trial Reel

Ces cinq champs sont ce qui fera la différence entre une IA qui te dit « les Reels marchent » et une IA qui te dit « le hook confession sur la reprise de poids, en Reel face caméra, avec preuve par cas client, surperforme ta médiane de 2,4× en partages — c'est ton format signature, produis-en trois cette semaine ».

---

# Partie 4 — Architecture technique

## 4.1 Schéma de données

Six nouvelles tables. Je garde ta convention de nommage et ta fonction `has_social_access()`.

```sql
-- ============================================================================
-- 1. Comptes sociaux connectés
-- ============================================================================
CREATE TABLE public.social_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform      text NOT NULL CHECK (platform IN ('instagram','facebook','tiktok','google')),
  external_id   text NOT NULL,          -- ig_user_id / page_id / open_id / locations/{id}
  handle        text,
  display_name  text,
  followers_count integer,
  timezone      text DEFAULT 'America/Toronto',
  is_active     boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);

-- ============================================================================
-- 2. Le pont : une publication native par plateforme
--    (post_id nullable = on capte aussi ce qui a été publié hors de l'app)
-- ============================================================================
CREATE TABLE public.social_publications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id          uuid REFERENCES public.social_posts(id) ON DELETE SET NULL,
  account_id       uuid NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  platform         text NOT NULL,
  platform_post_id text NOT NULL,       -- ig media id / fb post id / tiktok video id
  permalink        text,
  media_type       text,                -- REELS | CAROUSEL_ALBUM | IMAGE | VIDEO | STORY
  caption          text,
  duration_seconds numeric,
  published_at     timestamptz NOT NULL,
  publish_hour     smallint GENERATED ALWAYS AS
                     (EXTRACT(hour FROM published_at AT TIME ZONE 'America/Toronto')::smallint) STORED,
  publish_dow      smallint GENERATED ALWAYS AS
                     (EXTRACT(isodow FROM published_at AT TIME ZONE 'America/Toronto')::smallint) STORED,
  match_status     text NOT NULL DEFAULT 'auto'
                     CHECK (match_status IN ('auto','manual','ambiguous','unlinked')),
  match_score      numeric,
  is_final         boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, platform_post_id)
);
CREATE INDEX social_pub_published_idx ON public.social_publications (published_at DESC);
CREATE INDEX social_pub_post_idx      ON public.social_publications (post_id);
CREATE INDEX social_pub_match_idx     ON public.social_publications (match_status)
  WHERE match_status IN ('ambiguous','unlinked');

-- ============================================================================
-- 3. Snapshots de métriques — append-only, jamais d'UPDATE destructif
-- ============================================================================
CREATE TABLE public.social_metric_snapshots (
  id               bigserial PRIMARY KEY,
  publication_id   uuid NOT NULL REFERENCES public.social_publications(id) ON DELETE CASCADE,
  captured_at      timestamptz NOT NULL DEFAULT now(),
  age_hours        numeric NOT NULL,
  window_tag       text CHECK (window_tag IN ('h6','d1','d3','d7','d28')),
  reach            integer,
  views            integer,
  likes            integer,
  comments         integer,
  saves            integer,
  shares           integer,
  total_interactions integer,
  profile_visits   integer,
  follows          integer,
  link_clicks      integer,
  avg_watch_time_s numeric,
  total_watch_time_s numeric,
  full_watch_rate  numeric,
  raw              jsonb NOT NULL,      -- réponse API brute, non transformée
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX social_snap_window_uniq
  ON public.social_metric_snapshots (publication_id, window_tag)
  WHERE window_tag IS NOT NULL;
CREATE INDEX social_snap_pub_idx ON public.social_metric_snapshots (publication_id, captured_at DESC);

-- ============================================================================
-- 4. Scores calculés à J+7 (rafraîchis par le moteur, pas par l'API)
-- ============================================================================
CREATE TABLE public.social_post_scores (
  publication_id   uuid PRIMARY KEY REFERENCES public.social_publications(id) ON DELETE CASCADE,
  -- ratios normalisés
  er_reach         numeric,
  save_rate        numeric,
  share_rate       numeric,
  follow_rate      numeric,
  profile_ctr      numeric,
  watch_through    numeric,
  -- index de performance vs médiane glissante (1.00 = performance typique)
  pi_reach         numeric,
  pi_save          numeric,
  pi_share         numeric,
  pi_follow        numeric,
  pi_watch         numeric,
  score            numeric,             -- 100 = médiane du compte
  baseline_n       integer,             -- taille de l'échantillon de baseline
  verdict          text CHECK (verdict IN ('surperforme','normal','sous_performe','insuffisant')),
  computed_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 5. Snapshots au niveau compte (croissance, démographie, part non-abonnés)
-- ============================================================================
CREATE TABLE public.social_account_snapshots (
  id             bigserial PRIMARY KEY,
  account_id     uuid NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  snapshot_date  date NOT NULL,
  followers      integer,
  reach          integer,
  views          integer,
  non_follower_view_share numeric,      -- IG: breakdown follower_type
  profile_views  integer,
  raw            jsonb,
  UNIQUE (account_id, snapshot_date)
);

-- ============================================================================
-- 6. Rapports IA hebdomadaires
-- ============================================================================
CREATE TABLE public.social_ai_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start    date NOT NULL,
  week_end      date NOT NULL,
  model         text,
  payload_in    jsonb,                  -- ce qu'on a envoyé au modèle (audit)
  report        jsonb NOT NULL,         -- sortie structurée
  markdown      text,                   -- version lisible
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_start)
);

-- ============================================================================
-- 7. Expériences en cours (le garde-fou méthodologique)
-- ============================================================================
CREATE TABLE public.social_experiments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  variable        text NOT NULL,        -- 'format' | 'sphere' | 'hook_type' | 'publish_hour'
  variants        text[] NOT NULL,
  decision_metric text NOT NULL,        -- pré-enregistré AVANT le lancement
  min_n_per_arm   integer NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  status          text NOT NULL DEFAULT 'en_cours'
                    CHECK (status IN ('en_cours','conclu','abandonne')),
  conclusion      text,
  replication_of  uuid REFERENCES public.social_experiments(id)
);

-- ============================================================================
-- 8. Enrichissement de social_posts (le tagging qui manque)
-- ============================================================================
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS hook_type        text,
  ADD COLUMN IF NOT EXISTS audience_problem text,
  ADD COLUMN IF NOT EXISTS proof_method     text,
  ADD COLUMN IF NOT EXISTS seo_keyword      text,
  ADD COLUMN IF NOT EXISTS is_trial         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS experiment_id    uuid REFERENCES public.social_experiments(id),
  ADD COLUMN IF NOT EXISTS experiment_arm   text;

-- RLS identique au reste du module
-- (ALTER TABLE ... ENABLE ROW LEVEL SECURITY + policy USING public.has_social_access())
```

**Deux choix de conception qui vont te sauver du temps :**

Le champ `raw jsonb` sur chaque snapshot n'est pas de la paresse — c'est de l'assurance. Meta renomme ses métriques deux fois par an (`impressions` supprimé en avril 2025, trois vagues de dépréciation Facebook en 2025-2026 dont une le 15 juin 2026). Quand ils renomment, tu ajoutes une colonne typée et tu rejoues le JSONB historique. Sans ça, tu perds ton historique à chaque changement.

Le flag `is_final` basé sur `published_at + 72h` (Meta a jusqu'à 48 h de latence, plus marge) te permet d'arrêter de rafraîchir les vieux posts. Ça divise tes appels API par dix.

## 4.2 Edge functions

Cinq nouvelles fonctions, sur le même pattern que ton `meta-ads-sync`.

| Fonction | Rôle | Cron |
|---|---|---|
| `social-sync-meta` | IG media list + insights, FB posts + insights, insights compte | `0 */4 * * *` (toutes les 4 h) |
| `social-sync-stories` | Stories IG uniquement (leurs insights meurent à 24 h) | `0 */6 * * *` |
| `social-sync-tiktok` | Liste vidéos + métriques | `30 3 * * *` (quotidien) |
| `social-sync-gbp` | Google Business Profile Performance | `0 4 * * *` (quotidien) |
| `social-compute-scores` | Baselines, index, scores, verdicts | `15 5 * * *` (quotidien) |
| `social-ai-weekly` | Rapport IA + envoi Slack | `0 12 * * 1` (lundi 8h HE) |

Pour les crons, réutilise exactement ton pattern de `042_fix_meta_cron.sql` (pg_cron + `net.http_post`). Une remarque de sécurité au passage : ta anon key est en dur dans la migration. C'est acceptable puisqu'elle est déjà publique côté frontend, mais **le `META_ACCESS_TOKEN` et les futurs tokens sociaux doivent aller dans Supabase Vault**, pas en variable d'environnement lisible ni en table.

## 4.3 Le pont GHL → plateforme : l'algorithme de matching

C'est la pièce la moins évidente. Quand tu publies via GHL, Instagram crée un média avec son propre ID que GHL ne te renvoie pas de façon exploitable. Il faut le retrouver.

L'approche, exécutée par `social-sync-meta` à chaque passage :

```
Pour chaque social_posts avec status='publie' et published_at dans les 14 derniers jours
et sans social_publications pour une plateforme donnée :

  1. Récupérer les médias de la plateforme dans la fenêtre
     [published_at − 2 h, published_at + 8 h]
     (GHL peut avoir du retard de publication)

  2. Pour chaque candidat, calculer un score de correspondance :
       score_temps    = max(0, 1 − |Δminutes| / 240)
       score_caption  = similarité(normaliser(caption_locale),
                                   normaliser(caption_plateforme))
                        ← comparaison sur les 120 premiers caractères,
                          accents retirés, emojis retirés, casse ignorée
       score_format   = 1.0 si media_type concorde avec KIND(format), sinon 0.3
       score_total    = 0.35·temps + 0.50·caption + 0.15·format

  3. Décision :
       score ≥ 0.80 et écart avec le 2e candidat ≥ 0.15  → match_status='auto'
       score ≥ 0.50                                       → match_status='ambiguous'
       aucun candidat                                     → ne rien créer, réessayer
                                                            au prochain passage

  4. Les médias plateforme sans correspondance après 14 jours sont insérés
     avec post_id = NULL et match_status = 'unlinked'
     → ils apparaissent dans l'UI avec un bouton « Lier à un post »
```

**Pourquoi ne rien créer plutôt que de forcer un match faible** : un mauvais appariement pollue les baselines de façon invisible et durable. Mieux vaut un post non lié — visible dans l'UI, corrigeable en deux clics — qu'un post mal lié qui fausse silencieusement tes médianes pendant six mois.

**Un raccourci à envisager** : si à terme tu publies directement via l'API Instagram (Content Publishing) plutôt que via GHL, tu récupères le `media_id` au moment de la publication et tout ce problème disparaît. Ça vaut la peine d'y penser en phase 4, mais ce n'est pas urgent — la stratégie de matching fonctionne.

## 4.4 Instagram et Facebook — les détails qui comptent

**Voie recommandée : Instagram API with Facebook Login for Business** (host `graph.facebook.com`), pas la voie « Instagram Login ». Trois raisons : ton compte IG est déjà lié à ta Page, tu as déjà un Business Manager pour les Ads, et surtout tu peux utiliser un **System User token qui n'expire jamais** — parfait pour un cron Deno, contrairement à la voie Instagram Login qui impose un refresh tous les 60 jours.

**Endpoints :**

```
GET /v25.0/{page-id}?fields=instagram_business_account
GET /v25.0/{ig-user-id}/media
    ?fields=id,caption,media_type,media_product_type,permalink,timestamp,
            like_count,comments_count,thumbnail_url
    &since={unix}&until={unix}&limit=50
GET /v25.0/{ig-media-id}/insights
    ?metric=views,reach,likes,comments,saved,shares,total_interactions,
            profile_visits,follows
GET /v25.0/{ig-media-id}/insights
    ?metric=ig_reels_avg_watch_time,ig_reels_video_view_total_time   ← Reels seulement
GET /v25.0/{ig-user-id}/insights
    ?metric=views&breakdown=follower_type&period=day&metric_type=total_value
```

**Métriques disponibles par média (état 2026) :**

| Type | Disponible | Supprimé |
|---|---|---|
| Post feed | `views`, `reach`, `likes`, `comments`, `saved`, `shares`, `total_interactions`, `follows`, `profile_visits`, `profile_activity` | `impressions` (avril 2025) |
| Reels | idem + `ig_reels_avg_watch_time`, `ig_reels_video_view_total_time` | `plays`, `clips_replays_count`, `video_views` |
| Stories | `views`, `reach`, `replies`, `shares`, `navigation`, `follows` | `impressions` |
| Carrousel | ⚠️ **à valider empiriquement** — la doc dit « pas d'insights », la pratique dit le contraire | — |

**Trois limites importantes à connaître avant de dessiner les écrans :**

1. **Pas de répartition abonnés / non-abonnés par post.** Ce breakdown n'existe qu'au niveau compte (`breakdown=follower_type` sur `views`). L'app mobile Instagram te l'affiche par post, mais l'API ne l'expose pas. Ton écran doit donc présenter cette donnée comme un agrégat compte, pas comme une colonne de tableau par post. C'est une contrainte réelle, pas contournable.
2. **`online_followers` n'apparaît plus** dans la table des métriques 2026. Si tu veux les heures d'activité de ton audience, il faudra les inférer de ton propre historique — ce qui renforce l'approche de la partie 2.
3. **Rétroactivité** : les insights par média sont conservés 2 ans, les insights compte 90 jours avec maximum 30 jours par requête. Les stories meurent à 24 h — d'où le cron dédié.

**Rate limit** : `4800 × impressions du compte sur 24 h` d'appels par 24 h. Très largement suffisant. Logge quand même le header `X-Business-Use-Case-Usage` — c'est ton seul signal avant un throttle (erreur 80002).

**App Review** : Meta annonce désormais officiellement **jusqu'à 20 jours** de délai (contre 1-3 jours jusqu'en 2025). Deux conséquences : un rejet coûte un mois, donc soigne la soumission; et ne demande **que** `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement` — les permissions « pour plus tard » sont un motif de rejet automatique. Ta Business Verification est déjà faite, c'est le plus gros obstacle en moins.

**Sur Facebook** : c'est la zone la plus instable. Trois vagues de dépréciation, dont une **le 15 juin 2026** qui vient de passer. `post_impressions` est remplacé par `post_media_view`, mais les sources divergent sur les noms exacts. **Fais un appel de test contre ta version d'API avant d'écrire les colonnes** — et c'est exactement pourquoi le `raw jsonb` est non négociable.

## 4.5 TikTok — la partie difficile

Trois APIs, une seule utile :

| API | Donne quoi |
|---|---|
| Display API (`open.tiktokapis.com/v2`, scope `video.list`) | `view_count`, `like_count`, `comment_count`, `share_count` — des compteurs bruts, snapshots seulement |
| Content Posting API | Publication uniquement, aucune stat |
| **Business Account API** (`business-api.tiktok.com/open_api/v1.3`) | `video_reach`, `video_average_time_watched`, `full_video_watched_rate`, `video_new_followers`, `video_profile_views`, `impression_sources`, `audience_countries` |

C'est le Business Account API qu'il te faut, et c'est le plus dur à obtenir. Les conditions d'entrée sont l'obstacle réel : TikTok exige une app **publique en production**, avec privacy policy et conditions d'utilisation hébergées. Les apps beta ou internes « ne sont pas encouragées et ne seront pas approuvées ». Compte 4 à 10 semaines avec une issue non garantie.

**Ma recommandation : fais TikTok en dernier, et prévois un plan B.** Le Display API seul (scope `video.list`) est nettement plus facile à faire approuver et te donne déjà vues, likes, commentaires et partages. En snapshottant quotidiennement dans Supabase, tu reconstruis les courbes de croissance. Tu perds la portée et le watch time — c'est une perte réelle, mais pas bloquante pour démarrer.

L'alternative agrégateur (Ayrshare, environ 149-299 $/mois) ne se justifie que si tu te fais rejeter et que TikTok est critique. Ils facturent par profil social, pas par plateforme, donc tu paierais le plan complet pour un seul réseau. À éviter tant que possible. Et **écarte complètement les scrapers** (Apify et compagnie) : ils ne voient que le public, ils violent les conditions d'utilisation, et le risque de suspension de ton compte n'est pas raisonnable pour une marque.

## 4.6 Google Business Profile

La plus simple techniquement des quatre. Service `businessprofileperformance.googleapis.com`, OAuth Google standard, pas d'App Review au sens Meta — juste un formulaire de demande de quota. Conditions : fiche vérifiée et active depuis 60+ jours, site web renseigné, compte Organisation. Vérification de l'approbation : le quota dans la Cloud Console passe de 0 à 300 QPM.

```
GET /v1/{location=locations/*}:fetchMultiDailyMetricsTimeSeries
    ?dailyMetrics=CALL_CLICKS
    &dailyMetrics=WEBSITE_CLICKS
    &dailyMetrics=BUSINESS_DIRECTION_REQUESTS
    &dailyMetrics=BUSINESS_IMPRESSIONS_MOBILE_SEARCH
    &dailyMetrics=BUSINESS_IMPRESSIONS_MOBILE_MAPS
    &dailyRange...
GET /v1/{parent=locations/*}/searchkeywords/impressions/monthly
```

Il n'y a **pas de métrique « impressions totales »** — il faut additionner les quatre `BUSINESS_IMPRESSIONS_*` (desktop/mobile × maps/search) toi-même.

L'endpoint des stats de posts locaux (`localPosts:reportInsights`) existe encore mais c'est un reliquat de l'API v4 legacy, la même surface dont l'API Questions-Réponses a été supprimée le 3 novembre 2025. **Traite-le comme un bonus opportuniste, pas comme une fondation.** Compte 1 à 4 semaines.

---

# Partie 5 — Le moteur d'analyse

## 5.1 L'index de performance relatif

C'est le cœur du système, et c'est ce qui le distingue d'un dashboard ordinaire. Le principe : **la seule référence valide, c'est ton propre historique récent, segmenté par plateforme et par format.**

```
Pour chaque métrique m, plateforme p, type de média f :

  baseline(m, p, f) = MÉDIANE des 20 dernières publications (p, f)
                      ayant un snapshot d7, fenêtre glissante,
                      recalculée quotidiennement

  PI(m) = valeur_d7(m) / baseline(m, p, f)     ← 1,00 = performance typique

Classification :
  PI ≥ 1,20              → surperforme
  0,80 < PI < 1,20       → normal (bruit, ne rien conclure)
  PI ≤ 0,80              → sous-performe
  baseline_n < 8         → 'insuffisant', on n'affiche aucun verdict
```

Le score composite utilise une **moyenne géométrique pondérée**, pas arithmétique — parce que c'est mathématiquement équivalent à faire la moyenne des log-ratios, ce qui est le traitement correct d'une distribution log-normale :

```
Score = 100 × Π PI(m)^w(m)

Pondérations pour un Reel IG / TikTok :
  share_rate      0,30      ← le signal n°1 de l'algorithme
  save_rate       0,20
  reach           0,20
  follow_rate     0,20
  watch_through   0,10
                  ————
                  1,00

Pour un carrousel ou une image (pas de watch_through) :
  renormaliser les 4 poids restants sur 1,00
```

Un score de 100 veut dire « exactement ta médiane ». 180 veut dire « 1,8× ta performance typique pour ce format sur cette plateforme ». C'est comparable entre un Reel et un carrousel, ce qu'aucun chiffre brut ne permet.

Le seuil de 8 publications minimum en baseline avant d'afficher un verdict est important. Sans lui, tes trois premiers posts vont s'auto-comparer et produire du bruit que tu vas prendre pour du signal.

## 5.2 Le protocole d'expérimentation

Six règles, encodées dans l'UI plutôt que laissées à la discipline :

1. **Une seule variable à la fois.** L'app refuse de créer une deuxième expérience active sur la même variable.
2. **Assignation randomisée post par post**, pas « semaine A vs semaine B » — sinon tu confonds avec la saisonnalité. Le `PostModal` propose le bras assigné automatiquement quand une expérience est active.
3. **Blocage par format et pilier** : l'expérience ne compare que des posts de même format.
4. **Métrique de décision pré-enregistrée** dans `social_experiments.decision_metric`, avant le lancement, et non modifiable après. C'est le garde-fou contre le choix a posteriori de la métrique qui donne le résultat souhaité.
5. **Durée minimale de deux semaines**, et l'app affiche `n / min_n_per_arm` en permanence avec un message explicite tant que le seuil n'est pas atteint.
6. **Réplication obligatoire** : une expérience conclue propose de créer sa réplication. Aucune conclusion n'entre dans le rapport IA comme « établie » avant deux cycles concordants.

## 5.3 Analyse par pilier plutôt que par post

Les piliers bougent lentement — on ne les analyse jamais en temps réel. Cadence : hebdomadaire pour les posts individuels, **mensuelle pour les piliers**, avec un minimum de 6 publications par pilier avant tout verdict. On ne tue jamais un pilier sur un mauvais mois.

Et il faut mesurer chaque pilier sur ses quatre dimensions séparément — visibilité (portée), engagement (partages, sauvegardes), recrutement (follows par post), conversion (visites de profil, clics de lien, DM). Après quelques mois, chaque pilier révèle son rôle : certains recrutent, d'autres convertissent, d'autres entretiennent. Un pilier « Notre approche » qui a une portée faible mais un taux de clic de lien élevé n'est pas un mauvais pilier — c'est ton pilier de conversion, et le juger sur la portée serait une erreur coûteuse.

---

# Partie 6 — L'IA hebdomadaire

## 6.1 Ce qu'on envoie au modèle

Le principe directeur : **le modèle ne voit jamais de chiffres bruts non normalisés.** Il reçoit des index relatifs et des agrégats déjà calculés en SQL. Ça évite qu'il commente le post viral et ignore les vingt autres, et ça réduit massivement le coût en tokens.

```json
{
  "periode": { "debut": "2026-07-20", "fin": "2026-07-26",
               "posts_publies": 8, "posts_mesures_d7": 7 },

  "contexte_compte": {
    "abonnes_ig": 12400, "delta_7j": 86, "delta_7j_precedent": 41,
    "part_vues_non_abonnes_ig": 0.52,
    "mediane_glissante_20": { "reach": 4200, "save_rate": 0.021, "share_rate": 0.009 }
  },

  "publications": [
    { "titre": "3 signes que ton cortisol bloque ta perte de gras",
      "plateforme": "instagram", "format": "Reel Face caméra éducatif",
      "sphere": "Hormones", "hook_type": "erreur",
      "audience_problem": "plateau de perte de poids",
      "proof_method": "cas client", "intention": "Éduquer/Valeur",
      "cta": "Commente Métabolisme", "seo_keyword": "cortisol",
      "publie_le": "2026-07-21T19:30", "jour": "mardi", "heure": 19,
      "duree_s": 42,
      "score": 187, "verdict": "surperforme",
      "index": { "reach": 1.9, "save": 2.4, "share": 2.1, "follow": 1.6, "watch": 1.2 },
      "ratios": { "save_rate": 0.051, "share_rate": 0.019, "watch_through": 0.61 },
      "baseline_n": 18 }
  ],

  "agregats_90j": {
    "par_sphere":    [ { "sphere": "Hormones", "n": 14, "score_median": 132,
                         "share_index_median": 1.4, "follow_index_median": 1.6 } ],
    "par_format":    [ { "format": "Carroussel", "n": 11, "score_median": 108 } ],
    "par_hook_type": [ { "hook_type": "confession", "n": 6, "score_median": 145 } ],
    "par_probleme":  [ { "probleme": "reprise de poids", "n": 9, "score_median": 156 } ]
  },

  "experiences_actives": [
    { "nom": "Reel éducatif vs carrousel sur Hormones", "variable": "format",
      "metrique_decision": "save_rate", "n_par_bras": { "reel": 6, "carrousel": 5 },
      "min_requis": 16, "statut": "en_cours_insuffisant" }
  ],

  "heures": { "note": "données accumulées, aucune conclusion — voir n par cellule",
              "cellules": [ { "jour": "mardi", "creneau": "19-21h", "n": 6,
                              "score_median": 121 } ] },

  "google_business": { "vues_7j": 1840, "clics_appel": 94, "clics_site": 71,
                       "itineraires": 38, "avis_nouveaux": 6,
                       "avis_total": 112 }
}
```

## 6.2 Le prompt

```
Tu es l'analyste réseaux sociaux de NEO Performance, une clinique
d'optimisation métabolique à Brossard (Québec). Clientèle : 75 % de femmes
de 35 à 50 ans, majoritairement avec un historique d'échecs en perte de
poids. Objectif business : générer des rencontres découverte gratuites.

Tu reçois les données de la semaine écoulée. Toutes les métriques de
performance sont déjà normalisées : un "score" ou un "index" de 1,00 (ou
100) signifie exactement la performance médiane du compte pour ce format
sur cette plateforme. Tu ne dois JAMAIS commenter des chiffres bruts.

RÈGLES D'ANALYSE — non négociables :

1. Ne conclus jamais sur moins de 6 publications dans une catégorie.
   Si n < 6, écris explicitement "échantillon insuffisant (n=X)" et
   passe. C'est une réponse acceptable et attendue.
2. Ne conclus JAMAIS sur l'heure ou le jour de publication. Le volume de
   données ne le permet pas avant plusieurs mois. Si on te le demande,
   explique pourquoi et redirige vers format ou pilier.
3. Un index entre 0,80 et 1,20 est du bruit. Ne le commente pas comme
   une tendance.
4. Priorise les signaux dans cet ordre : partages (share_rate),
   sauvegardes (save_rate), nouveaux abonnés par post, rétention.
   Les likes et commentaires sont des signaux faibles en 2026 — ne base
   aucune recommandation dessus.
5. L'audience santé s'engage en privé. Un contenu avec peu de
   commentaires mais un fort taux de sauvegarde ou de partage est un
   SUCCÈS, pas un échec. Ne suggère jamais "il faut plus de commentaires".
6. Distingue systématiquement : ce qui est établi (répliqué), ce qui est
   une hypothèse (un seul cycle), ce qui est du bruit.
7. Si une expérience active n'a pas atteint son n minimum, dis-le et ne
   conclus pas dessus.

TON : professionnel direct, comme un partenaire d'affaires. Pas de
jargon marketing creux. Pas d'emojis. Français québécois. Sois franc
quand une semaine est mauvaise ou quand les données ne disent rien.

Réponds UNIQUEMENT en JSON valide selon ce schéma :

{
  "verdict_semaine": "string — 2 phrases max, ce qui s'est réellement passé",
  "ce_qui_a_marche": [
    { "quoi": "string — le pattern, pas le post",
      "preuve": "string — les index et le n",
      "confiance": "etabli" | "hypothese" | "bruit",
      "a_refaire": "string — action concrète cette semaine" }
  ],
  "ce_qui_a_rate": [
    { "quoi": "string", "preuve": "string",
      "diagnostic": "string — hook, format, angle, ou timing de production ?",
      "action": "arreter" | "corriger" | "retester",
      "detail": "string" }
  ],
  "signaux_faibles": [
    { "observation": "string", "n": 0,
      "quoi_faire": "string — quel test lancer pour valider" }
  ],
  "plan_semaine": [
    { "priorite": 1, "action": "string — verbe à l'infinitif",
      "sphere": "string", "format": "string", "hook_type": "string",
      "pourquoi": "string — rattaché à une donnée du rapport" }
  ],
  "idees_posts": [
    { "titre": "string", "hook": "string — la première ligne exacte",
      "sphere": "string", "format": "string",
      "probleme_audience": "string",
      "base_sur": "string — quel gagnant on réplique et pourquoi" }
  ],
  "experiences": [
    { "nom": "string",
      "statut": "continuer" | "conclure" | "repliquer" | "abandonner",
      "raison": "string" }
  ],
  "google_business": {
    "constat": "string",
    "action": "string"
  },
  "ce_que_les_donnees_ne_disent_pas": "string — sois honnête sur les
   limites de cette semaine"
}
```

Le dernier champ, `ce_que_les_donnees_ne_disent_pas`, n'est pas décoratif. C'est ce qui empêche le rapport de devenir un générateur de certitudes hebdomadaire. Un système qui te dit chaque lundi qu'il a trouvé quelque chose, alors que la moitié du temps il n'y a rien à trouver, est pire qu'inutile — il te fait changer de cap sur du bruit.

## 6.3 Livraison

Le rapport tombe dans Supabase, s'affiche dans un onglet « Analyse » du module, et part dans ton Slack privé (`C0BB2QLFRQF`) le lundi à 8h. Un bouton « Créer les posts » transforme directement les `idees_posts` en lignes de `social_posts` au statut « idée », avec les tags pré-remplis. La boucle se referme : donnée → analyse → production → donnée.

---

# Partie 7 — Les écrans

Quatre onglets à ajouter à `ReseauxSociaux.jsx`, en gardant ta structure actuelle.

**Onglet Performance.** Un tableau de toutes les publications avec snapshot J+7, triable par score. Colonnes : titre, plateforme, format, sphère, hook type, date, score (avec code couleur vert/gris/rouge), et les cinq index en petites barres. Un clic ouvre le détail — les ratios, la courbe des snapshots dans le temps, le lien vers le post natif. En haut : la vélocité d'abonnés sur 7 jours, la part de vues non-abonnés au niveau compte, et le nombre de posts en attente de matching.

**Onglet Patterns.** L'analyse agrégée, sur 90 jours glissants. Quatre tableaux — par sphère, par format, par type de hook, par problème d'audience — avec pour chacun le n, le score médian, et une bande de confiance issue d'un bootstrap. Toute ligne avec n < 6 est affichée en gris avec la mention « échantillon insuffisant ». C'est le garde-fou visuel : tu vois immédiatement sur quoi tu as le droit de conclure.

**Onglet Analyse IA.** Le rapport de la semaine, l'historique des rapports précédents, et le bouton « Créer les posts » sur les idées proposées.

**Onglet Expériences.** Les expériences actives avec leur barre de progression `n / min_n`, la métrique de décision pré-enregistrée (non modifiable), et le bouton de conclusion qui ne s'active qu'au seuil atteint. Plus l'historique des expériences conclues et de leurs réplications.

**Modifications au `PostModal` existant** : ajouter les champs `hook_type`, `audience_problem`, `proof_method`, `seo_keyword`, la case `is_trial`, et l'assignation automatique du bras d'expérience quand une expérience est active. Garder ton pattern `SelectOrText` avec datalist — il est bon, il permet de sortir de la taxonomie quand nécessaire.

**Une dépendance à ajouter** : `recharts` pour les graphiques. Ton `package.json` n'a aucune librairie de viz.

---

# Partie 8 — Roadmap

| Phase | Contenu | Effort | Dépendance |
|---|---|---|---|
| **0 — Cette semaine** | Migration du schéma (6 tables + colonnes de tagging), enrichissement du `PostModal`, saisie manuelle des stats pour les posts déjà publiés | 1-2 j | Aucune |
| **1 — Meta** | Soumission App Review (IG + FB dans la même demande), `social-sync-meta`, algorithme de matching, crons | 3-4 j de dev + **jusqu'à 20 j d'attente Meta** | Phase 0 |
| **2 — Moteur** | `social-compute-scores`, baselines, index, verdicts, onglets Performance et Patterns, Recharts | 3-4 j | Phase 1 |
| **3 — IA** | `social-ai-weekly`, prompt, cron lundi, livraison Slack, bouton « Créer les posts » | 2 j | Phase 2, ~4 semaines de données |
| **4 — Google Business** | Formulaire de quota, `social-sync-gbp`, section GBP | 1-2 j + 1-4 sem. d'attente | Indépendante, peut démarrer en parallèle de la phase 1 |
| **5 — TikTok** | Soumission développeur, `social-sync-tiktok` | 2 j + 4-10 sem. d'attente, issue incertaine | Indépendante |
| **6 — Expériences** | Onglet Expériences, assignation randomisée, protocole de réplication | 2 j | Phase 2 |

**L'ordre optimal** : lancer la phase 0 immédiatement (elle ne dépend de rien et elle démarre l'accumulation de données), soumettre Meta et Google Business le même jour puisque leurs délais tournent en parallèle, développer les phases 2 et 6 pendant l'attente, et garder TikTok pour la fin.

**Le point le plus important de toute la roadmap** : la phase 0 démarre l'accumulation de données. L'IA de la phase 3 a besoin d'environ 4 semaines de données taguées pour dire quoi que ce soit d'utile. Chaque jour où tu publies sans taguer est un jour de données perdu définitivement — et tu ne pourras pas le rattraper rétroactivement, parce que personne ne se souvient du type de hook d'un post publié il y a trois semaines.

---

# Partie 9 — Ce qui reste à valider

Sept incertitudes à lever par un appel de test avant de figer le schéma. Aucune n'est bloquante, mais chacune peut coûter une journée de retouches si elle est découverte trop tard.

1. **Carrousels Instagram** — la doc Meta dit « Albums: no insights data available », la pratique observée dit le contraire. La ligne de la doc réfère probablement aux enfants du carrousel, pas au conteneur. À tester avec un `media_id` de carrousel réel.
2. **`online_followers`** — absent de la table des métriques 2026 mais mention résiduelle ailleurs dans la doc. À traiter comme supprimé jusqu'à preuve du contraire.
3. **Noms des métriques Facebook de remplacement** — `post_media_view` vs `post_views` vs `post_total_media_view_unique`. Les sources divergent, la vague de dépréciation du 15 juin 2026 vient de passer. À tester contre ta version d'API.
4. **Champs exacts du TikTok Business Account API** — issus de documentations de connecteurs partenaires, le portail officiel n'étant pas lisible sans JavaScript. Crédibles mais non confirmés.
5. **Quartiles de rétention TikTok organiques** — je n'en ai trouvé trace qu'en Ads Reporting, pas en organique. Ne compte pas dessus.
6. **Enum des métriques de posts locaux Google Business** — plus énuméré dans la doc v4 actuelle, et cette surface API a un historique de suppressions.
7. **Comportement de GHL après publication** — est-ce que l'API `get` d'un post GHL renvoie un identifiant natif de plateforme exploitable ? Si oui, tout l'algorithme de matching de la section 4.3 devient inutile. Ça vaut un appel de test de dix minutes avant de développer.

---

# Sources

**Stratégie et systèmes de contenu**
[Hormozi growth strategy — OutlierKit](https://outlierkit.com/resources/alex-hormozi-growth-strategy/) · [Hormozi 250 posts/semaine](https://timomason.substack.com/p/how-alex-hormozi-posts-250-times-3db) · [Dan Koe content engine](https://pod.wave.co/podcast/the-startup-ideas-podcast-419dd166-eb67-4971-ab0f-a963c1d70d97/inside-dan-koes-ai-content-engine) · [Justin Welsh — content library](https://www.justinwelsh.me/newsletter/build-a-content-library) · [Paddy Galloway — new rules](https://www.colinandsamir.com/resources/the-new-rules-of-youtube-from-paddy-galloway) · [Swipe file exploitable](https://www.attentionclaw.com/blog/creator-swipe-file-content-system) · [Mesurer les piliers de contenu](https://www.content-technologist.com/measuring-content-pillars/)

**Hooks, rétention, algorithmes**
[Hook testing](https://sovran.ai/blog/best-hook-testing-tools-video-ads) · [Trial Reels — Later](https://later.com/blog/instagram-trial-reels-strategy-how-to-use/) · [Courbes de rétention](https://aibrify.com/blog/youtube-shorts-retention-curve-playbook) · [Hook/hold/completion benchmarks](https://creatorhouse.app/blog/instagram-reel-hook-rate-hold-rate-completion-rate-benchmarks) · [Algorithme Instagram — Later](https://later.com/blog/how-instagram-algorithm-works/) · [Mise à jour originalité mai 2026](https://almcorp.com/blog/instagram-original-content-algorithm-update/) · [Ce qui marche sur IG en 2026](https://www.aureliusmedia.co/blog/what-works-on-instagram-2026) · [Algorithme TikTok 2026](https://www.socialync.io/blog/tiktok-algorithm-2026-what-works-now) · [Sends per reach](https://influencermarketinghub.com/instagram-sends-per-reach-playbook/)

**Métriques, benchmarks, méthodologie**
[Buffer — State of Social Media Engagement 2026](https://buffer.com/resources/state-of-social-media-engagement-2026/) · [Buffer — fréquence de publication](https://buffer.com/resources/how-often-to-post-on-instagram/) · [Buffer — expériences sociales](https://buffer.com/resources/run-social-media-experiments/) · [Socialinsider — benchmarks Instagram](https://www.socialinsider.io/social-media-benchmarks/instagram) · [Socialinsider — benchmarks Facebook](https://www.socialinsider.io/social-media-benchmarks/facebook) · [Dash Social — benchmarks wellness](https://www.dashsocial.com/social-media-benchmarks/wellness-industry) · [Dash Social — vues non-abonnés](https://www.dashsocial.com/blog/non-followers-instagram-audience) · [Measure Studio — benchmarking de posts](https://www.measure.studio/post/post-benchmarking) · [Measure Studio — durée de vie TikTok vs IG](https://www.measure.studio/post/tiktok-vs-instagram) · [Mann-Whitney et petits échantillons](https://mcpanalytics.ai/whitepapers/mann-whitney-u-test-whitepaper) · [Règles de taille d'échantillon](https://www.statology.org/5-practical-rules-of-thumb-for-power-sample-size/) · [A/B testing social](https://www.socialinsider.io/blog/ab-testing-social-media/) · [Critique du « meilleur moment »](https://socialk.it/en/best-time-to-post/instagram) · [Le mythe de la meilleure heure](https://blog.liinks.co/the-best-time-to-post-is-a-myth) · [Sprout — meilleures heures](https://sproutsocial.com/insights/best-times-to-post-on-instagram/) · [NETendances 2025 — Québec](https://transformation-numerique.ulaval.ca/enquetes-et-mesures/netendances/reseaux-sociaux-et-divertissement-en-ligne-2025/)

**APIs**
[Instagram Platform](https://developers.facebook.com/documentation/instagram-platform) · [Instagram Media Insights](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/) · [Instagram User Insights](https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-user/insights/) · [Rate limiting Graph API](https://developers.facebook.com/docs/graph-api/overview/rate-limiting/) · [Métriques Facebook dépréciées](https://developers.facebook.com/docs/platforminsights/page/deprecated-metrics/) · [Dépréciation FB juin 2026](https://docs.emplifi.io/platform/latest/home/facebook-metric-deprecation-june-2026) · [App Review — 20 jours](https://bundle.social/blog/meta-app-review-20-days) · [TikTok video list](https://developers.tiktok.com/doc/tiktok-api-v2-video-list) · [TikTok FAQ](https://developers.tiktok.com/doc/getting-started-faq) · [TikTok Business video list](https://www.postman.com/tiktok/tiktok-api-for-business/request/7u65xdl/business-video-list) · [Google Business Performance API](https://developers.google.com/my-business/reference/performance/rest) · [DailyMetric enum](https://developers.google.com/my-business/reference/performance/rest/v1/DailyMetric) · [GBP — prérequis](https://developers.google.com/my-business/content/prereqs) · [GHL — statistiques](https://help.gohighlevel.com/support/solutions/articles/155000004101-social-planner-track-social-performance-using-advance-analytics) · [GHL — API statistiques](https://marketplace.gohighlevel.com/docs/ghl/social-planner/get-statistics/) · [Ayrshare — tarifs](https://www.ayrshare.com/pricing/)

**Local SEO et cas**
[Facteurs de classement local](https://www.clickrank.ai/local-seo-ranking-factors/) · [Google Business ranking 2026](https://www.mapranks.com/2026/07/13/google-business-profile-ranking-factors-in-2026/) · [Benchmarks GBP](https://www.webfx.com/blog/seo/google-business-profile-benchmarks/) · [Stratégie IG santé/wellness](https://www.socialmon.ai/blog/healthcare-and-wellness-instagram-strategy-guide) · [Melani Sanders — We Do Not Care Club](https://en.wikipedia.org/wiki/Melani_Sanders) · [Croissance TikTok — 62 créateurs](https://influenceradvisory.com/blog/how-to-grow-on-tiktok/) · [TikTok SEO 2026](https://sproutsagesolutions.com/tiktok-seo-strategy-2026/)
