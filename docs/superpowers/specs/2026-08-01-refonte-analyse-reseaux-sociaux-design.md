# Refonte de l'analyse des réseaux sociaux

Date : 2026-08-01
Branche : `refonte-analyse-reseaux-sociaux`
Source visuelle : projet Claude Design `8d32fa91-ab64-4ff4-8ec6-48cb6e1f326f`, fichier `Réseaux sociaux.dc.html`

## 1. Objectif

Reprendre la direction visuelle et la structure du dashboard conçu dans Claude
Design, en la branchant sur des données réelles. Les fonctionnalités de
planification existantes (Calendrier, Pipeline, Idées & Hooks) sont conservées
telles quelles. Les onglets Performances et Patterns sont remplacés par un
dashboard d'analyse à six sections.

Le design d'origine repose sur des données inventées. Une partie de ce qu'il
affiche n'existe dans aucune API accessible. Ce spec tranche, bloc par bloc,
entre ce qui est construit, ce qui est remplacé par un équivalent réel, et ce
qui est abandonné.

## 2. État des sources, vérifié le 2026-08-01

### 2.1 Base actuelle

| Table | Contenu |
|---|---|
| `social_accounts` | 2 comptes : Instagram (10 913 abonnés), Facebook (23 089) |
| `social_publications` | 50, **toutes Instagram** |
| `social_metric_snapshots` | 140 lignes |
| `social_post_scores` | 41 |
| `social_account_snapshots` | 2 |
| `social_competitor_posts` | 0 |
| `social_posts` | 17, dont 1 seule reliée à une publication |

Remplissage des colonnes de `social_metric_snapshots` sur 140 lignes :
`views`, `reach`, `saves`, `shares` complets ; `avg_watch_time_s` 94 ;
`total_watch_time_s` 71 ; `view_rate_3s` 23 ; `follows` 7 ;
`profile_visits` 0 ; `link_clicks` 0 ; `full_watch_rate` 0.

`social-sync-meta` pose `view_rate_3s: null` explicitement : l'API Meta n'a pas
d'équivalent confirmé du hook rate. Les 23 valeurs présentes viennent du
backfill Metricool initial.

### 2.2 Metricool

Marque « Neo Performance - Naturopathe », id `6648608`, fuseau America/Toronto.
Réseaux connectés : Facebook, Instagram, TikTok. Pas de fiche Google.
Connexion créée le 2026-07-31.

Vérifié par appels réels :

- **Hook rate** : `IGRE28 reelsViewRate` renvoie de vraies valeurs
  (43,8 % le 31/07 ; 32,8 % le 30/07 ; 47,4 % le 09/06). 24 Reels sur 3 mois.
- **Temps d'écoute moyen** : `IGRE24` renvoie des valeurs (7,4 s, 12,6 s, 18,3 s).
- **Rétention moyenne** `IGRE27` et **durée** `IGRE26` : renvoient `null`.
- **Démographie** : `IGAG01/02/03` renvoie des effectifs réels par âge et sexe.
  Dominante nette : femmes 35-44 (2 997), femmes 25-34 (2 254), femmes 45-54 (1 198).
- **Série journalière** : `IGEV05/06` renvoie vues et portée par jour, mais
  **seulement depuis le 2026-07-26**. `IGEV01` (abonnés) : deux points.
- **TikTok** : `TKPO07` (vues) et `TKPO06` (durée) remontent sur 3 mois.
  `TKPO11` (portée), `TKPO13` (complétion), `TKPO15` (temps moyen) et les
  sources de trafic renvoient tous `null`.
- **Compétiteurs** : le connecteur existe mais aucun compétiteur n'est
  configuré, et il n'expose jamais les vues — seulement abonnés, publications,
  likes et engagement.
- **Géographie** : par pays uniquement (`IGDP01/02`). Pas de granularité ville.
- **Meilleur moment pour publier** : `getBestTimeToPostByNetwork` disponible.

### 2.3 GHL

4 comptes connectés : Google (`hasStatisticsPermissions: false`), Facebook,
Instagram, TikTok. `get-social-media-statistics` couvre 7 jours glissants, sans
détail par publication.

Sur les 7 derniers jours : Facebook 55 667 impressions et 38 543 de portée,
Instagram 23 790 et 17 179, Google 104 impressions en baisse de 61 %,
TikTok 0.

**Conséquence majeure : Facebook est le premier réseau en portée et il est
totalement absent de la base.** Le module actuel analyse le deuxième réseau en
croyant analyser le premier.

Le jeton Google porte une expiration au 2026-08-01T02:42:18Z, déjà dépassée.

### 2.4 Verdict par bloc du design

| Bloc | Décision |
|---|---|
| Hook rate | Construit, source Metricool |
| Audience âge / sexe | Construit, niveau abonnés (pas par publication) |
| Vues par jour | Construit, historique démarrant au 2026-07-26 |
| Croissance abonnés | Construit, historique démarrant au 2026-07-31 |
| Géographie | Construit, granularité pays |
| Heures actives | Remplacé par « meilleurs moments pour publier » |
| TikTok | Construit sur les vues seules, en attente de correction du compte |
| Comparatif compétiteurs | Abandonné pour cette itération |
| Courbe de rétention seconde par seconde | Abandonné définitivement, aucune source |
| Funnel profil → clic → lead → RDV | Abandonné, `profileViews` et `websiteClicks` dépréciés chez Meta |
| Fiche Google comme source de leads | Abandonné, pas de permission statistiques |

## 3. Architecture

### 3.1 Navigation

Barre principale inchangée dans sa mécanique, quatre entrées :

```
Calendrier | Pipeline | Idées & Hooks | Analyse
```

`Analyse` ouvre le dashboard, qui porte sa propre barre d'onglets, comme dans
le design :

```
Vue d'ensemble | Publications | Rétention & hook | Audience | Croissance | Patterns
```

Filtres globaux au-dessus des onglets, persistants entre eux : période
(7 j / 30 j / 90 j) et plateforme (Toutes / Instagram / Facebook / TikTok).

### 3.2 Données

On remplit le schéma existant plutôt que d'en créer un parallèle.

- `social_metric_snapshots.view_rate_3s` — alimenté par `IGRE28`.
- `social_metric_snapshots.avg_watch_time_s` — complété par `IGRE24` quand Meta
  n'a rien renvoyé.
- `social_publications` — création des publications **Facebook** et **TikTok**
  manquantes, avec le même algorithme de matching que `social-sync-meta`
  (35 % temps, 50 % légende, 15 % format ; seuil auto 0,80 ; marge 0,15).
- `social_account_snapshots` — une ligne par jour et par compte, depuis les
  séries journalières Metricool.
- `social_accounts` — ajout des comptes TikTok et Google.

Une seule table nouvelle :

```sql
CREATE TABLE public.social_audience_snapshots (
  id           bigserial PRIMARY KEY,
  account_id   uuid NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  dimension    text NOT NULL CHECK (dimension IN ('age_gender','country')),
  bucket       text NOT NULL,   -- '35-44|F' ou 'Canada'
  value        integer NOT NULL,
  raw          jsonb,
  UNIQUE (account_id, snapshot_date, dimension, bucket)
);
```

RLS identique aux autres tables du module : `has_social_access()` en `USING` et
`WITH CHECK`.

### 3.3 Synchronisation

Tâche planifiée quotidienne, exécutée par un agent Claude, qui tire Metricool
par MCP et écrit dans Supabase.

Limite assumée et documentée : ce mécanisme dépend d'une session qui s'exécute.
Un échec crée un trou dans la série journalière qu'aucun rattrapage rétroactif
ne peut combler, puisque Metricool ne réexpose pas l'historique antérieur à la
connexion. L'écriture se fait dans les tables métier et non dans un format
propre à l'agent, précisément pour que le remplacement par une edge function
— le jour où un jeton API Metricool est disponible — ne touche aucune ligne du
code applicatif.

## 4. Contenu des onglets

### 4.1 Vue d'ensemble

Disposition A du design : décision d'abord.

1. **Bandeau de recommandation** — dégradé turquoise `#00bdb2 → #00a89e`, titre,
   justification, trois chiffres. Contenu issu de `social_ai_reports`.
2. **Six cartes KPI** avec sparkline et quatre repères en pied de carte :
   vues totales, hook rate moyen, temps d'écoute, taux d'engagement, abonnés
   gagnés, publications mesurées.
   Les repères du design (« vs cible », « vs compétiteurs ») sont remplacés par
   « vs ma médiane », « vs période précédente » et « n mesuré ». Aucun repère
   n'est affiché quand la donnée n'existe pas ; la ligne disparaît plutôt que
   d'afficher un tiret.
3. **Vues par jour par plateforme** — aires empilées, une couleur par réseau.
   Un bandeau indique la date de début réelle de la série tant qu'elle est plus
   courte que la période demandée.
4. **Temps d'écoute total** — total et répartition par plateforme.
5. **Top 3 publications** — cartes cliquables ouvrant le drawer.
6. **Hook rate par format** et **audience résumée**.

### 4.2 Publications

Le grand tableau du design, une ligne par publication, toutes plateformes.
Colonnes triables : vues, portée, hook rate, écoute moyenne, partages,
sauvegardes, abonnés gagnés, engagement, score.

Le titre affiché est celui du `social_posts` lié quand il existe, sinon les
premiers mots de la légende. La vignette est un dégradé aux couleurs de la
plateforme, comme dans le design : aucune URL d'image n'est stockée aujourd'hui.

Clic sur une ligne : drawer latéral, largeur `min(560px, 94vw)`, animation
d'entrée depuis la droite. Contenu : en-tête coloré, grille de statistiques,
score et verdict existants, barres d'indice par dimension, lien permalien.
Le graphique de rétention du design est retiré du drawer.

### 4.3 Rétention & hook

Remplace l'onglet Rétention du design, qui reposait sur une courbe inexistante.

- Quatre KPIs : hook rate moyen, écoute moyenne, nombre de vidéos mesurées,
  durée médiane.
- **Nuage durée vs hook rate** — chaque point est une vidéo, l'axe des abscisses
  la durée, celui des ordonnées le hook rate. C'est ce qui remplace la courbe :
  la question « quelle durée fonctionne » reçoit une réponse fondée.
- **Classement hook rate**, liste triée, cliquable vers le drawer.
- Encart d'avertissement tant que moins de 12 vidéos portent un hook rate.

### 4.4 Audience

- Répartition par sexe, barre horizontale.
- Âge par tranche, barres verticales, tranche dominante en turquoise plein.
- Croisement âge × sexe, puisque la donnée le permet.
- Pays, barres horizontales.
- **Meilleurs moments pour publier** — heatmap 7 jours × 24 h, source
  `getBestTimeToPostByNetwork`. Le libellé dit explicitement qu'il s'agit d'une
  recommandation de publication, pas d'une mesure de présence en ligne.

### 4.5 Croissance

- Quatre KPIs : abonnés totaux, nouveaux abonnés, portée, publications.
- Courbe des abonnés cumulés par plateforme.
- Portée par jour.

Tant que la série compte moins de 14 points, un bandeau explique que l'historique
a commencé le 2026-07-26 et qu'il s'allonge d'un jour par jour. Aucun delta
n'est affiché tant qu'il n'y a pas deux périodes complètes à comparer.

### 4.6 Patterns

L'onglet actuel, conservé dans sa logique et restylé selon le design :
médianes par sphère, format, type de hook et problème d'audience ; seuil
`MIN_N = 6` ; bandes de confiance à 95 % par bootstrap 1000 ; fenêtre 90 jours.

C'est la contrepartie rigoureuse du bandeau de recommandation. Elle ne bouge pas.

## 5. Recommandation IA

Génération hebdomadaire dans `social_ai_reports`, une ligne par semaine, clé
`week_start`.

Entrée : publications scorées de la fenêtre avec leurs métriques, agrégats par
format et par sphère, effectifs.
Sortie : `{ headline, why, stats: [{label, value} × 3], cited_publication_ids }`.

Trois contraintes appliquées à la génération :

1. Toute publication citée dans `why` doit figurer dans `cited_publication_ids`,
   et l'affichage vérifie que ces identifiants existent. Une citation
   invérifiable fait rejeter le rapport.
2. Les trois chiffres proviennent de la base, jamais du modèle.
3. Sous 10 publications scorées dans la fenêtre, aucune recommandation n'est
   générée. Le bandeau affiche à la place le nombre de publications manquantes
   avant qu'une lecture soit possible.

## 6. Design visuel

Repris du fichier Claude Design, adapté aux conventions du projet (Tailwind,
composants `Card`, `Button`, `Layout`, `Header` existants).

- Turquoise principal `#00bdb2`, fond turquoise pâle `#e6f8f7`, texte turquoise
  foncé `#00958d`. À noter : le projet utilise aujourd'hui `#00bbb1`. On aligne
  tout sur `#00bdb2`.
- Fond de page `#f5f5f7`, cartes blanches, bordure `#ececf0`, rayon 18 px.
- Texte principal `#1a1a1a`, secondaire `#6c7280`, tertiaire `#9a9aa4`.
- Delta positif : fond `#e6f8f7`, texte `#00958d`. Négatif : `#fdecec` / `#c9463c`.
- Seuils de hook rate : ≥ 70 % vert, ≥ 60 % ambre `#fff5e6` / `#b57d1a`,
  en dessous rouge, absent gris `#f2f2f5` / `#9a9aa4`.
- Couleurs de plateforme : Instagram `#E1306C`, Facebook `#1877F2`,
  TikTok `#1a1a1a`, Google `#EA9E34`.
- Graphiques en SVG inline, comme dans le design. Aucune librairie de charting
  n'est ajoutée.
- Chiffres en `font-variant-numeric: tabular-nums`.

La police Poppins du design n'est pas importée : le projet a déjà sa police, et
l'ajouter créerait une incohérence avec les autres pages.

## 7. Découpage des fichiers

`src/pages/ReseauxSociaux.jsx` fait 1 950 lignes et absorberait sinon six vues
de plus. Découpage :

```
src/pages/ReseauxSociaux.jsx          orchestration, onglets, modales
src/features/social/analyse/
  AnalyseView.jsx                     barre d'onglets, filtres globaux
  VueEnsemble.jsx
  Publications.jsx
  RetentionHook.jsx
  Audience.jsx
  Croissance.jsx
  Patterns.jsx                        déplacé depuis la page
  PublicationDrawer.jsx
  charts/                             Sparkline, AreaChart, BarRow, Heatmap, Scatter
src/hooks/useSocialAnalytics.js       chargement et agrégation
src/lib/socialFormat.js               formatage fr-CA des nombres et durées
```

Les vues de planification restent dans le fichier de page pour cette itération :
les déplacer serait un refactor sans rapport avec l'objectif.

## 8. Hors périmètre

- Comparatif compétiteurs.
- Courbe de rétention par publication.
- Funnel d'attribution vers les leads et les rendez-vous.
- Analyse de la fiche Google.
- Export PDF, présent dans le design.
- Bouton « Synchroniser » manuel : le sync est planifié, un déclenchement
  manuel supposerait une edge function qui n'existe pas encore.
- Sélecteur de disposition A/B/C : la disposition A est retenue en dur.

## 9. Dépendances externes

Trois points bloquants ou dégradants qui relèvent d'une action manuelle :

1. **Facebook** — 5 publications sur 7 jours d'après GHL, aucune en base.
   Premier gain du projet, conditionné à la remontée des publications Facebook
   par Metricool.
2. **TikTok** — portée et temps de visionnement vides chez Metricool comme chez
   GHL. Vérifier le mode Business du compte et ré-autoriser. Sans ça, TikTok
   n'apparaît qu'en vues.
3. **Google** — jeton GHL expiré le 2026-08-01 à 02h42 UTC, et permission de
   statistiques absente. À reconnecter, sinon la fiche décroche.
