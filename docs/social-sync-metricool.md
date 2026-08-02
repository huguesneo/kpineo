# Synchronisation Metricool → Supabase

Procédure exécutée par une tâche Claude planifiée, en attendant un jeton API
Metricool qui permettrait de la déplacer dans une edge function. L'écriture se
fait dans les tables métier, jamais dans un format propre à l'agent : le jour du
remplacement, aucune ligne de code applicatif ne bouge.

- Marque Metricool : `Neo Performance - Naturopathe`, `brandId = 6648608`
- Fuseau : `America/Toronto`
- Réseaux connectés : Instagram, Facebook, TikTok. Pas de fiche Google.
- Projet Supabase : `cbqwrmyctsfdqmenczhm`

## Limite à connaître

Metricool ne réexpose pas l'historique antérieur à la connexion d'un compte.
Un jour de sync manqué est un trou définitif dans les séries journalières.
Les métriques par publication, elles, se rattrapent : elles sont cumulatives et
un sync tardif récupère la valeur courante.

Points de départ réels des séries journalières :

| Compte | Premier jour disponible |
|---|---|
| Facebook | 2026-05-01 |
| Instagram | 2026-07-26 |

## 1. Publications et métriques

Un appel `getAnalyticsDataByMetrics` par connecteur, fenêtre glissante de 35
jours (marge confortable au-dessus du sync quotidien).

| Connecteur | Champs |
|---|---|
| Instagram Reels | `IGRE02` date+heure, `IGRE06` url, `IGRE23` vues, `IGRE11` portée, `IGRE10` likes, `IGRE07` commentaires, `IGRE12` sauvegardes, `IGRE21` partages, `IGRE24` écoute moyenne, `IGRE25` écoute totale, **`IGRE28` hook rate** |
| Instagram Posts | `IGPO02`, `IGPO06`, `IGPO28` vues, `IGPO14` portée, `IGPO13`, `IGPO08`, `IGPO15`, `IGPO27`, `IGPO29` abonnés gagnés |
| Facebook Reels | `FBRE02`, `FBRE06`, `FBRE10` vues, `FBRE08` likes, `FBRE07` actions, `FBRE12` écoute totale, `FBRE13` écoute moyenne |
| Facebook Posts | `FBPO02`, `FBPO06`, `FBPO07` type, `FBPO11` impressions, `FBPO12` portée, `FBPO13` réactions, `FBPO08`, `FBPO14`, `FBPO09` clics lien |
| TikTok | `TKPO02`, `TKPO03` url, `TKPO07` vues, `TKPO08`, `TKPO09`, `TKPO10`, `TKPO06` durée |

Champs demandés qui reviennent systématiquement vides, à ne pas rechercher :
`IGRE27` rétention moyenne, `IGRE26` durée (donnée payante), `FBRE11` portée
des Reels Facebook, `TKPO11` portée TikTok, `TKPO13` taux de complétion,
`TKPO15` temps moyen, sources de trafic TikTok, et tout le connecteur
`facebook / age and gender`.

### Écriture

Les publications Instagram existent déjà via `social-sync-meta` : on les
retrouve par `permalink`, identique des deux côtés. Pour Facebook et TikTok,
`social_publications` est créée par cette procédure, avec
`platform_post_id` extrait de l'URL et `source = 'metricool'`.

Les métriques vont dans `social_metric_snapshots` en **insertion**, jamais en
mise à jour : `window_tag = null` et `raw = {"source":"metricool", …}`. La
table reste append-only, et un sync quotidien construit naturellement une série
par publication. Le front fusionne Meta et Metricool champ par champ, en gardant
la valeur non nulle la plus récente.

Les légendes de Facebook et TikTok sont reprises du Reel Instagram publié à
moins d'une heure d'écart : ce sont les mêmes contenus, republiés. Inutile de
retélécharger le texte.

## 2. Séries journalières

| Connecteur | Champs |
|---|---|
| Instagram Evolution | `IGEV01` abonnés, `IGEV03` solde d'abonnés, `IGEV05` vues, `IGEV06` portée |
| Facebook Evolution | `FBEV17` abonnés, `FBEV47` abonnés gagnés, `FBEV49` vues de contenu |

Écriture dans `social_account_snapshots`, en `ON CONFLICT (account_id,
snapshot_date) DO UPDATE`. Une journée déjà relevée est rafraîchie, pas
dupliquée.

## 3. Démographie

`IGAG01/02/03` pour l'âge et le sexe, `IGDP01/02` pour les pays.

`IGDP02` renvoie une **proportion**, pas un effectif : la convertir en nombre
d'abonnés avec le total du jour avant d'écrire, pour rester homogène avec la
dimension `age_gender`.

Écriture dans `social_audience_snapshots`, une ligne par tranche, en
`ON CONFLICT (account_id, snapshot_date, dimension, bucket) DO UPDATE`.

Fréquence hebdomadaire suffit : ces chiffres bougent lentement.

## 4. Lecture hebdomadaire

Une ligne par semaine dans `social_ai_reports`, clé `week_start` (lundi).

Entrée : les publications de la semaine avec leurs métriques et leurs scores,
plus les médianes par plateforme et par type de contenu.

Sortie, dans la colonne `report` :

```json
{
  "headline": "…",
  "why": "…",
  "stats": [{ "label": "…", "value": "…" }],
  "cited_publication_ids": ["uuid", "…"]
}
```

Trois règles, appliquées à la génération **et** revérifiées par le front :

1. Toute publication évoquée dans `why` figure dans `cited_publication_ids`.
   Le front rejette le rapport entier si un identifiant cité est introuvable.
2. Les trois chiffres de `stats` sont recopiés des données, jamais estimés.
3. Sous 10 publications scorées sur la fenêtre, aucun rapport n'est écrit.
   Le bandeau affiche alors combien il en manque.

## 5. En cas d'échec

Un échec de sync n'est pas silencieux : `social_accounts.last_sync_error`
reçoit le message, et la date de dernière synchronisation affichée en bas du
dashboard cesse d'avancer. Ne jamais écrire de valeurs approximatives pour
« boucher » un trou de série — une courbe fausse coûte plus cher qu'une courbe
qui s'arrête.
