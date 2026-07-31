# Addendum — Architecture avec Metricool comme source de données

**Complément au plan du 31 juillet 2026** · NEO Performance

---

## Ce que j'ai vérifié, et comment

Plutôt que de me fier à la documentation publique de Metricool (qui est mince sur la partie analytics), j'ai téléchargé et lu le **code source de leur serveur MCP officiel**, `mcp-metricool` v1.1.0. C'est le wrapper que Metricool publie eux-mêmes, donc les URLs qu'il appelle sont l'API réelle, pas une reconstitution.

Bonne nouvelle : c'est mieux que ce que leur doc laissait croire, et il y a une découverte qui change l'architecture.

**Base et authentification :**

```
Base URL : https://app.metricool.com/api
Header   : X-Mc-Auth: <METRICOOL_USER_TOKEN>
Requis sur chaque appel : userId + blogId (le blogId = une « marque »)
```

**Endpoints analytics par publication — confirmés :**

| Endpoint | Contenu |
|---|---|
| `/v2/analytics/posts/instagram` | Posts IG sur une période |
| `/v2/analytics/reels/instagram` | Reels IG |
| `/v2/analytics/stories/instagram` | Stories IG |
| `/v2/analytics/posts/facebook` | Posts FB |
| `/v2/analytics/reels/facebook` | Reels FB |
| `/v2/analytics/stories/facebook` | Stories FB |
| `/v2/analytics/posts/tiktok` | Vidéos TikTok |
| `/v2/analytics/competitors/{network}` | **Publications de tes concurrents** |
| `/v2/scheduler/besttimes/{provider}` | Leur modèle d'heures optimales |
| `/v2/settings/brands` | Liste des marques et leur blogId |
| `/v2/scheduler/posts` | Créer / lire / modifier une publication programmée |

Tous les endpoints analytics prennent `from` / `to` en ISO — donc tu peux rejouer l'historique et faire des relevés à J+7 et J+28 proprement.

**Ce qui n'existe pas :** aucun endpoint analytics pour Google Business Profile. Metricool publie sur GBP mais n'expose pas ses statistiques via l'API. C'est le seul trou, et je propose deux solutions en section 5.

---

## 1. La découverte qui change l'architecture

Dans le schéma de réponse de `/v2/scheduler/posts`, chaque publication renvoie ceci :

```json
{
  "id": 12345,
  "publicationDate": { "dateTime": "...", "timezone": "..." },
  "text": "...",
  "providers": [
    { "network": "instagram",
      "id": "17912345678901234",        ← l'identifiant NATIF du média
      "status": "PUBLISHED",
      "publicUrl": "https://www.instagram.com/reel/..." ,
      "detailedStatus": "..." }
  ]
}
```

`providers[].id` et `publicUrl` sont exactement ce qui manquait.

**Concrètement : si tu publies via Metricool plutôt que via GoHighLevel, tout l'algorithme de matching de la section 4.3 du plan initial disparaît.** Plus de score de similarité de légende, plus de fenêtre temporelle, plus de posts « ambigus » à relier à la main. Tu publies, Metricool te rend l'identifiant Instagram natif, tu l'écris dans `social_publications.platform_post_id`, et la jointure est parfaite pour toujours.

C'est une simplification majeure : ça retire la partie la plus fragile et la plus coûteuse à déboguer de tout le projet.

**La décision à prendre.** Tu viens de construire ton intégration GHL Social Planner, et je comprends que ce soit frustrant de la mettre de côté. Deux options honnêtes :

| | Publier via Metricool | Garder GHL |
|---|---|---|
| Clé de jointure | Native, gratuite | Algorithme de matching à écrire et maintenir |
| Fiabilité des données | Parfaite | ~90-95 %, avec des posts à relier à la main |
| Effort | Réécrire `social-planner` en `social-publisher` (~1 j) | 0 j maintenant, ~2 j pour le matching |
| Ton edge function GHL | Devient inutilisée (pas supprimée) | Reste en place |

Ma recommandation : **publier via Metricool.** Une journée de travail pour supprimer définitivement la partie la plus fragile du système, et tu gardes ton code GHL en place au cas où. Mais ce n'est pas bloquant — l'architecture ci-dessous fonctionne dans les deux cas.

---

## 2. Architecture révisée

```
┌─────────────────────────────────────────────────────────────┐
│  APP NEO (React)                                            │
│  Le cerveau : taxonomie, tagging, scoring, décisions        │
│                                                             │
│  social_posts  ← sphere, format, hook_type,                 │
│                  audience_problem, proof_method,            │
│                  seo_keyword, intention, cta                │
└───────────┬─────────────────────────────────────────────────┘
            │
            │ publication
            ▼
    ┌───────────────────┐
    │    METRICOOL      │──► Instagram · Facebook · TikTok · GBP
    │  (tuyau, pas      │
    │   cerveau)        │◄── retour : providers[].id + publicUrl
    └─────────┬─────────┘         │
              │                   └──► social_publications
              │ cron 4 h                (platform_post_id natif)
              ▼
   social-sync-metricool
   /v2/analytics/{posts|reels|stories}/{ig|fb|tiktok}
              │
              ▼
   social_metric_snapshots  (append-only, raw jsonb, fenêtres d1/d3/d7/d28)
              │
              ▼
   social-compute-scores    (médiane glissante × plateforme × format → index → score)
              │
              ▼
   social-ai-weekly ────► rapport structuré ────► Slack lundi 8h
                                              └─► onglet Analyse IA
```

Le principe reste le même que dans le plan initial, et c'est ce qui compte : **Metricool est un tuyau, ton app est le cerveau.** Metricool ne saura jamais ce qu'est un hook « confession » sur le problème « reprise de poids ». Toi oui, et c'est là qu'est toute la valeur.

---

## 3. Ce qui change dans le schéma

Le schéma du plan initial tient presque tel quel. Trois deltas.

```sql
-- social_publications : on ajoute la traçabilité Metricool
ALTER TABLE public.social_publications
  ADD COLUMN metricool_post_id  text,   -- l'id du post programmé (scheduler)
  ADD COLUMN metricool_blog_id  integer,
  ADD COLUMN source             text NOT NULL DEFAULT 'metricool'
    CHECK (source IN ('metricool','meta_direct','ghl','manuel'));

-- Le match_status devient marginal : avec Metricool il vaut 'auto' à
-- la publication. On le garde uniquement pour les posts publiés
-- directement depuis le téléphone, hors de l'app.

-- social_accounts : le blogId Metricool remplace les tokens par plateforme
ALTER TABLE public.social_accounts
  ADD COLUMN metricool_blog_id integer;

-- NOUVELLE TABLE — le bonus concurrentiel (voir section 4)
CREATE TABLE public.social_competitor_posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network        text NOT NULL,
  competitor     text NOT NULL,
  platform_post_id text,
  published_at   timestamptz,
  caption        text,
  reach          integer,
  interactions   integer,
  engagement_rate numeric,
  raw            jsonb NOT NULL,
  captured_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network, platform_post_id)
);
```

Tout le reste — `social_metric_snapshots`, `social_post_scores`, `social_ai_reports`, `social_experiments`, les 5 colonnes de tagging sur `social_posts` — est identique. C'est justement l'avantage d'avoir mis un `raw jsonb` sur chaque snapshot : la source de données peut changer sans que le moteur de scoring bouge.

---

## 4. Un bonus que je n'avais pas prévu

`/v2/analytics/competitors/{network}` te donne les publications de tes concurrents avec leurs métriques.

**Ni l'API Meta ni l'API TikTok ne donnent ça.** C'est structurellement impossible en direct — tu ne peux voir les insights que de tes propres comptes. Metricool y arrive parce qu'ils agrègent des données publiques à l'échelle de leur base.

Ce que ça débloque pour ton rapport IA : au lieu de « ton taux de sauvegarde est de 2,1 % », l'analyse peut dire « ton taux de sauvegarde sur les contenus hormones est 1,8× celui du concurrent X sur le même angle, mais ton taux de partage est deux fois moindre — ils font quelque chose de mieux sur la fin de leurs vidéos ». C'est une autre catégorie d'information.

Ça vaut la peine d'ajouter tes 5 à 10 concurrents directs dans Metricool dès la configuration : cliniques d'optimisation métabolique, naturopathes avec une forte présence, coachs en périménopause au Québec, plus deux ou trois comptes internationaux dont tu admires le contenu. Le snapshot concurrents peut tourner une fois par semaine, pas besoin de plus.

---

## 5. Ce qui reste à faire hors Metricool

**Google Business Profile.** Pas d'endpoint analytics. Trois options, par ordre de préférence :

1. **API Google directe** — c'est l'intégration la plus simple des quatre du plan initial : OAuth Google standard, pas d'App Review, juste un formulaire de quota, 1 à 4 semaines d'attente. Comme elle est indépendante, tu peux la soumettre aujourd'hui et elle sera prête quand le reste le sera.
2. **Saisie manuelle mensuelle** — Cloé entre 5 chiffres par mois (vues, clics d'appel, clics site, itinéraires, nouveaux avis) depuis le tableau de bord Google. Cinq minutes. Suffisant pour démarrer.
3. **Ignorer au début** et l'ajouter en phase 2.

**Meta en direct — maintenant optionnel.** Le plan initial le rendait obligatoire; il devient un arbitrage. L'API Meta te donne des champs que Metricool pourrait ne pas exposer : `ig_reels_avg_watch_time`, `follows` par post, `profile_visits` par post. Ce sont trois de tes cinq métriques de score.

**Ne tranche pas maintenant.** Fais d'abord le test 1 de la section 7 : regarde ce que Metricool renvoie réellement dans `/v2/analytics/reels/instagram`. Si le watch time et les follows par post y sont, tu n'as aucune raison de faire Meta en direct et tu économises trois semaines d'App Review. S'ils n'y sont pas, tu ajoutes Meta en direct plus tard, uniquement pour ces champs, et le `raw jsonb` fait que les deux sources cohabitent sans conflit.

---

## 6. L'edge function de sync

```ts
// supabase/functions/social-sync-metricool/index.ts
// Cron : 0 */4 * * *   (même pattern que meta-ads-sync)

const BASE = 'https://app.metricool.com/api'
const AUTH = { 'X-Mc-Auth': Deno.env.get('METRICOOL_USER_TOKEN')! }
const UID  = Deno.env.get('METRICOOL_USER_ID')!

const SOURCES = [
  { path: '/v2/analytics/reels/instagram',   platform: 'instagram', media: 'REELS' },
  { path: '/v2/analytics/posts/instagram',   platform: 'instagram', media: 'POST' },
  { path: '/v2/analytics/stories/instagram', platform: 'instagram', media: 'STORY' },
  { path: '/v2/analytics/reels/facebook',    platform: 'facebook',  media: 'REELS' },
  { path: '/v2/analytics/posts/facebook',    platform: 'facebook',  media: 'POST' },
  { path: '/v2/analytics/posts/tiktok',      platform: 'tiktok',    media: 'VIDEO' },
]

// 1. Fenêtre : 35 jours en arrière (couvre le relevé d28 + marge)
// 2. Pour chaque source : GET {BASE}{path}?from=...&to=...&blogId=...&userId=...
//    → délai de 1 s entre les appels (Metricool ne publie pas de rate limit,
//      répond 429 avec Retry-After)
// 3. Upsert social_publications sur (platform, platform_post_id)
//    → si post_id est NULL, tenter la liaison via metricool_post_id
// 4. Pour chaque publication, calculer age_hours = now - published_at
//    et déterminer window_tag :
//        24h ± 3h  → 'd1'      72h ± 4h  → 'd3'
//        168h ± 6h → 'd7'      672h ± 12h → 'd28'
//        sinon     → NULL (snapshot de suivi, pas de fenêtre canonique)
// 5. INSERT dans social_metric_snapshots avec raw = réponse brute intégrale
//    ON CONFLICT (publication_id, window_tag) DO NOTHING
//    → la première capture dans la fenêtre gagne, pas de réécriture
// 6. Marquer is_final = true à age_hours > 720
//    → on arrête de rafraîchir, ça divise les appels par 10
```

Deux points qui comptent :

Le `ON CONFLICT DO NOTHING` sur la fenêtre canonique est délibéré. Si le cron tourne trois fois dans la fenêtre J+7, c'est la première capture qui compte et elle ne bouge plus. Sans ça, tes scores changeraient rétroactivement et tu ne pourrais jamais reproduire une analyse.

Le `raw jsonb` intégral, encore une fois. Tu ne sais pas encore quels champs Metricool renvoie. En stockant tout, tu pourras ajouter des colonnes typées après coup et rejouer l'historique, plutôt que de découvrir dans deux mois qu'une métrique intéressante était là depuis le début et que tu l'as jetée.

---

## 7. Les trois tests à faire dès que tu as le token

Trente minutes, et ça lève toutes les incertitudes qui restent. Je peux les faire pour toi dès que tu me donnes accès.

**Test 1 — quels champs pour un Reel Instagram ?** C'est le test décisif.

```bash
curl -H "X-Mc-Auth: $TOKEN" \
  "https://app.metricool.com/api/v2/analytics/reels/instagram?\
from=2026-07-01T00:00:00&to=2026-07-31T00:00:00&blogId=$BLOG&userId=$UID"
```

Ce qu'on cherche, dans l'ordre d'importance : l'identifiant natif du média, `reach`, `saves`, `shares`, `follows`, `profile_visits`, `avg_watch_time`. Les quatre derniers déterminent si tu as besoin de Meta en direct ou non.

**Test 2 — est-ce que `providers[].id` revient bien ?** Créer un post en brouillon via `POST /v2/scheduler/posts`, puis le relire. Si l'identifiant natif Instagram est là après publication, la décision de publier via Metricool est verrouillée.

**Test 3 — quelle profondeur pour les concurrents ?**

```bash
curl -H "X-Mc-Auth: $TOKEN" \
  "https://app.metricool.com/api/v2/analytics/competitors/instagram?\
from=...&to=...&blogId=$BLOG&userId=$UID&limit=50&timezone=America/Toronto"
```

Est-ce qu'on a le texte des publications et des métriques par post, ou seulement des agrégats de compte ? Ça détermine si l'IA peut faire de l'analyse comparative fine.

---

## 8. Roadmap révisée

C'est ici que le gain est le plus visible.

| Phase | Contenu | Effort | Attente externe |
|---|---|---|---|
| **0** | Compte Metricool Advanced, connecter IG + FB + TikTok + GBP, ajouter les concurrents, générer le token | 2 h | — |
| **0b** | Les 3 tests API | 30 min | — |
| **1** | Migration du schéma (6 tables + tagging + deltas Metricool), enrichir le `PostModal` | 1-2 j | — |
| **2** | `social-sync-metricool` + cron, backfill de 90 jours d'historique | 2 j | — |
| **3** | `social-compute-scores`, onglets Performance et Patterns, Recharts | 3-4 j | — |
| **4** | `social-ai-weekly`, prompt, Slack | 2 j | ~4 sem. de données taguées |
| **5** | Google Business (API directe ou saisie manuelle) | 1 j | 1-4 sem. si API |
| **6** | Onglet Expériences | 2 j | — |
| **7** | *Optionnel* : Meta en direct pour watch time / follows / profile visits | 2-3 j | ~20 j App Review |

**Comparaison avec le plan initial :**

| | Plan initial | Avec Metricool |
|---|---|---|
| Premiers chiffres réels | 3 semaines (App Review Meta) | **Aujourd'hui** |
| TikTok fonctionnel | 4 à 10 semaines, issue incertaine | **Aujourd'hui** |
| Dev total | ~13 jours | **~10 jours** |
| Attente externe bloquante | 20 j Meta + 4-10 sem. TikTok | **Aucune** |
| Algorithme de matching | À écrire et maintenir | **Supprimé** |
| Données concurrents | Impossible | **Incluses** |
| Coût récurrent | 0 $ | ~43 €/mois + taxes |

Le chemin critique passe de « trois mois d'attente administrative » à « deux semaines de développement ». Pour environ 43 € par mois, c'est un des meilleurs arbitrages que tu puisses faire.

---

## 9. Les risques, honnêtement

**Dépendance à un tiers.** Si Metricool change son API, augmente ses prix ou ferme, tu es exposé. Trois atténuations : tes données brutes vivent dans **ton** Supabase (pas chez eux), le `raw jsonb` te permet de rebrancher une autre source sans perdre l'historique, et ton actif réel — la taxonomie taguée et les quatre années de tagging que tu vas accumuler — n'est chez personne d'autre que toi. Le jour où tu voudrais partir, tu remplaces le tuyau, pas le cerveau.

**Rate limits non publiés.** Metricool ne documente pas ses limites. Le comportement observé est un HTTP 429 avec un header `Retry-After`. Mets une seconde de délai entre les appels et un backoff exponentiel sur 429. Avec 6 sources × 1 appel toutes les 4 heures, tu es très loin de tout plafond raisonnable.

**Champs analytics inconnus.** C'est la seule vraie inconnue, et le test 1 la lève en cinq minutes.

**L'API exige le plan Advanced** (~43 €/mois facturé annuellement, hors taxes). Le MCP est disponible sur tous les plans, mais un MCP est conversationnel — il ne peut pas alimenter un cron. Pour l'automatisation, c'est l'API, donc Advanced.

**Latence des données.** Metricool récupère ses données via les mêmes APIs que celles décrites dans le plan initial, donc les latences des plateformes s'ajoutent aux leurs. Compte jusqu'à 48 h avant qu'un chiffre soit stable — ce qui est déjà pris en compte par la fenêtre canonique à J+7.

---

## 10. Ce que je ferais à ta place, cette semaine

- **Aujourd'hui** — Ouvrir un essai Metricool, connecter Instagram, Facebook, TikTok et Google Business, ajouter 5 à 10 concurrents. Compter 2 heures avec Cloé.
- **Aujourd'hui aussi** — Soumettre le formulaire de quota Google Business Profile. C'est gratuit, ça prend 20 minutes, et le délai tourne pendant que tu fais autre chose.
- **Dès que le token est généré** — Me le donner (ou lancer les 3 curls toi-même) pour verrouiller la question « Meta en direct, oui ou non ».
- **En parallèle, sans attendre quoi que ce soit** — La migration du schéma et l'enrichissement du `PostModal`. C'est ce qui démarre l'accumulation de données taguées, et c'est le seul élément du projet qui ne se rattrape pas rétroactivement. Chaque post publié sans son `hook_type` et son `audience_problem` est une ligne d'analyse perdue pour toujours.

Ce dernier point est le seul qui soit vraiment urgent. Tout le reste peut attendre une semaine sans conséquence.

---

## Sources

Surface API vérifiée en lisant le code source de [`mcp-metricool` v1.1.0](https://pypi.org/project/mcp-metricool/), le serveur MCP officiel publié par Metricool.

Documentation complémentaire : [Accès API Metricool](https://help.metricool.com/en/article/api-access-export-your-metricool-data-to-other-tools-and-automate-tasks-1r1jqn0/) · [MCP vs API](https://help.metricool.com/mcp-vs-api-access-what-is-the-difference-5y3ib) · [Documentation API — premiers pas](https://static.metricool.com/API+DOC/API+English.pdf) · [Guide pratique et pièges de l'API](https://tygartmedia.com/metricool-api-guide/) · [Tarifs 2026](https://socialk.it/en/pricing/metricool)
