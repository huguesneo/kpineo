# Plan : mise en production de la timeline, étape 2 (le hub)

15 oct. 2026. Phase A : plan seulement. Aucun code modifié, rien de fusionné ni publié.
Branche `feat/timeline-video` (worktree `.claude/worktrees/timeline-video`), 1 commit devant `main` (5191ae9, migration
déjà appliquée sur soma-hq), 0 derrière : l'avance rapide reste possible.
Sources : `video-neo/docs/plan-production-timeline.md`, `video-neo/agent/README.md` (« Timeline du hub »),
`video-neo/agent/src/taches.ts` et `timeline.ts` (b1126ee), `labo/docs/labo/batch4-demandes.md`,
`labo/timeline/` (identique dans `video-neo` et dans le labo), migration `20261015a_montage_video_timeline.sql`.

## 0. Ce que le hub doit faire, d'après l'agent tel qu'il tourne

| Besoin de la timeline | Ce qui existe en production |
|---|---|
| Préparer (copie légère, cartes, ondes) | Tâche `timeline_preparer` (payload `{}`). **L'agent ne la lance jamais tout seul** (le plan de l'étape 1 le prévoyait, le code ne le fait pas) : le hub l'insère à l'ouverture si `video_timeline` manque, si `ressources` est vide (après Terminer ou 7 jours) ou si `numero_version` ≠ `version_courante`. |
| Brouillon | `UPDATE video_timeline SET brouillon = <recette complète>` (le hub ne peut pas insérer la ligne : 0 ligne touchée = « timeline pas prête »). Jeter : `brouillon = null`. |
| Vérifier en direct | `INSERT video_timeline_requetes {job_id, type:'verifier', recette}` → réponse `{etat, cartes}` par le temps réel. Pas de dédoublonnage côté agent : le hub attend 600 ms après le dernier geste et ignore les réponses périmées. |
| Appliquer | Brouillon sauvé, puis tâche `timeline_appliquer` (payload `{}`). |
| Demander à l'IA | Brouillon sauvé, puis tâche `montage` `{prompt, depuis_timeline: true}`. Seul le mode « correction » existe (pas de « ronde » complète comme dans le labo). |
| Terminer | Tâche `terminer` existante (`tacheTerminer`). |
| Suivi | `video_taches.statut/erreur` + `video_jobs.etape/progression` + nouvelle ligne `video_versions` (temps réel, comme l'éditeur actuel). Pas de journal ligne par ligne. |
| Médias | Bucket `video-timeline` : `ressources.proxies`, `ressources.cartes` / chemins dans `etat`, `ressources.ondes`, `sons/index.json` (`fichier` réel → `chemin` sans accent). Aperçu rendu : `video-apercus` (fonction existante). Liens signés 15 min. |
| `/api/modeles` du labo (types, graphiques, styles, éléments, transparences, volume) | **Aucun équivalent.** Voir décision 2. |
| Onde d'une musique ajoutée dans la timeline | **Aucun équivalent** (seul `timeline_preparer` en fait, pour les musiques déjà dans la recette). Voir décision 3. |

Conditions de l'agent pour la timeline (moteur recette) : `personnes = 'moi_equipe'`, **aucun template**, **un seul clip
Principal**. Une vidéo de cliente : refusée par la base et par l'agent.

## 1. Fichiers touchés

**Nouveaux** (tout sous `src/features/social/montage/timeline/`, chargé à la demande par `React.lazy` : le reste du hub
ne télécharge pas Remotion) :

| Fichier | Contenu |
|---|---|
| `App.tsx`, `Montage.tsx`, `Timeline.tsx`, `Inspecteur.tsx`, `logique.ts`, `style.css` | Copies de `labo/timeline/src/`. `logique.ts`, `Timeline.tsx`, `Inspecteur.tsx` : **inchangés**. `App.tsx` : les 9 appels `json('/api/…')` remplacés par un objet `source` reçu en prop. `Montage.tsx` : les adresses `/cache/…`, `/sons/…`, `/media/…` passent par une fonction `lien(chemin)`. `style.css` : règles préfixées par `.timeline-neo` (pas de collision avec Tailwind). |
| `graphiques/` | Copie de `labo/graphiques/` (graphiques Remotion en direct), sans les polices d'essai (décision 4). |
| `reperes/instagram.png`, `facebook.png` | Calques des repères (copiés tels quels). |
| `modeles.json` | Catalogue de la palette (décision 2). |
| `sourceHub.js` | Le « serveur » du hub : lecture `video_timeline`, sauvegarde du brouillon (anti-rebond 1 s), requêtes de vérification, tâches, temps réel, liens signés (`createSignedUrls` par lots, renouvelés à 12 min ; la copie légère n'est renouvelée que lecteur à l'arrêt), index des sons, ondes. Session de l'utilisateur seulement. |
| `PageTimeline.jsx` | Route plein écran : chargement, « Préparation de la timeline… » (tâche en cours), erreurs en français, puis `<App source=… />`. |
| `src/lib/montageTimeline.js` (+ `.test.js`) | Fonctions pures : `peutOuvrirTimeline(job)`, `timelineAPreparer(ligne, job, taches)`, formes des tâches, `cheminSon(index, fichier)`, `reponseAJour(id)`, `etatBoutons`. |
| `scripts/synchro-timeline.sh` | Recopie `labo/timeline/src` et `labo/graphiques` de `video-neo` puis réapplique les adaptations (pour les prochains batchs du labo) ; vérifie l'écart avec `git diff --stat`. |
| `logique.test.js` | `labo/timeline/tests/logique.test.mjs` passé sous Vitest (même contenu, import changé). |

**Modifiés** :

| Fichier | Changement (tout derrière `TIMELINE_ENABLED`) |
|---|---|
| `src/lib/montageVideoAccess.js` | `TIMELINE_ENABLED = MONTAGE_VIDEO_ENABLED && VITE_TIMELINE === 'true'`. |
| `src/App.jsx` | Route `/reseaux-sociaux/montage/:jobId/timeline` (dans `MontageVideoRoute`), présente seulement si le flag est allumé. |
| `MontageAccueil.jsx` | Colonne Titre : bouton « Ouvrir » si `peutOuvrirTimeline(job)` ; pour une cliente : « Timeline fermée : la vidéo d'une cliente ne quitte pas le Mac. » |
| `MontageEditeur.jsx` | Même bouton « Ouvrir la timeline » en haut de l'éditeur (pratique, une ligne). |
| `MontageNouvelle.jsx` + `lib/montageVideo.js` | Flag allumé : « Lancer le montage » remplacé par « Monter avec l'IA » et « Monter moi-même » (cliente : seulement l'IA). Voir section 2. |
| `useMontageVideo.js` | `COLONNES` : ajout de `personnes, template_id` (pour le bouton). |
| `package.json` | `remotion` et `@remotion/player` **4.0.523 exactement** (même version que le moteur). React 18 du hub suffit (aucune API propre à React 19 dans la timeline). |
| `.env.example`, `docs/montage-video.md` | `VITE_TIMELINE=false`, section « Timeline ». |

**Non touchés** : migrations (sauf décision 1), fonctions Edge, agent, moteur. Aucun `supabaseAdmin`, aucune clé
service_role : tout passe par `supabase` (session) et le RLS `has_montage_access()`. Une recherche
`supabaseAdmin|service_role` sur les nouveaux fichiers fait partie des tests.

## 2. Parcours

- **Liste** : bouton « Ouvrir » quand `personnes = 'moi_equipe'`, sans template, non supprimé. Pas de bouton pour les
  montages d'avant le moteur recette (`personnes` vide) ni avec template (ancien moteur).
- **Création** (flag allumé), après les vidéos et « Qui est dans la vidéo ? » :
  - « Monter avec l'IA » : prompt facultatif (et templates comme aujourd'hui). Sans template et sans un seul clip
    Principal, c'est l'ancien moteur : on va à l'éditeur actuel comme aujourd'hui. Sinon on va à la timeline, qui
    affiche la progression de la v1 puis s'ouvre dessus (elle lance `timeline_preparer` dès que la v1 existe).
  - « Monter moi-même » (moi ou l'équipe, un seul clip, aucun template) : tâche `montage {manuel: true}`, puis la
    timeline (sans cartes). Désactivé avec une phrase d'explication si plusieurs clips ou un template est choisi.
  - Une cliente : seulement « Monter avec l'IA », vers l'éditeur actuel.
- **Timeline** : identique au labo (pistes, gestes, raccourcis Espace/C/Suppr/T/Cmd+Z, repères Visage/Instagram/Facebook,
  garde-fous, séparateur, palette et inspecteur repliables). Différences : barre du haut avec « Retour au montage »,
  pastille du Mac, état de la tâche en cours et « Annuler » (RPC existante). Brouillon d'une version plus ancienne
  (nouvelle version faite ailleurs) : bandeau « La timeline repart de la v{n} » et brouillon jeté après confirmation.
- **Appliquer** → aperçu v{n+1} affiché dans le lecteur ; **Terminer** : la même confirmation que l'éditeur, refusée
  tant qu'un brouillon n'est pas appliqué (« Applique d'abord tes changements »).

## 3. À trancher par toi avant la phase B

1. **Règle « template ou prompt » de la base.** `video_jobs_template_ou_prompt` exige un prompt sans template ; or
   « Monter moi-même » interdit le template et « Monter avec l'IA » rend le prompt facultatif.
   **Proposé** : aucune migration ; le hub écrit un texte fixe dans `video_jobs.prompt` : « Monter moi-même (sans IA) »
   ou « Monte cette vidéo selon la fiche, sans consigne particulière. » (lu par Claude pour la v1 IA). Autre choix :
   migration qui assouplit la règle quand `personnes` est rempli.
2. **Catalogue de la palette (`/api/modeles`).** **Proposé** : `modeles.json` figé dans le hub, produit par
   `outil.py modeles` via `synchro-timeline.sh` (change rarement) ; les sons viennent de `sons/index.json` (à jour).
   Autre choix : l'agent publie `sons/modeles.json` (modification de l'agent, hors de cette étape).
3. **Onde d'une musique ajoutée.** **Proposé** : le hub la calcule dans le navigateur (Web Audio, même format
   `{duree, pas: 0.05, pics}`) à partir du lien signé du son ; aucune modification de l'agent.
4. **Polices Allrounder (versions d'essai).** Les mettre dans le build Netlify les rendrait publiques (licence d'essai).
   **Proposé** : graphiques Remotion affichés en direct avec une police de remplacement ; les cartes Python restent
   des PNG exacts et le rendu final (Mac) est inchangé. Autre choix : les servir par le bucket (migration + agent).

## 4. Tâches de l'agent appelées

| Geste | Appel (session de l'utilisateur) |
|---|---|
| Ouvrir (si à préparer) | `video_taches` ← `{job_id, type:'timeline_preparer', payload:{}}` (une seule à la fois) |
| Chaque geste | `video_timeline.brouillon` (anti-rebond 1 s) + `video_timeline_requetes` ← `{type:'verifier', recette}` (600 ms) |
| Appliquer | brouillon, puis `{type:'timeline_appliquer', payload:{}}` |
| Demander à l'IA | brouillon, puis `{type:'montage', payload:{prompt, depuis_timeline:true}}` |
| Revenir au dernier aperçu | `brouillon = null` |
| Terminer | `{type:'terminer', payload:{}}` |
| Monter moi-même / avec l'IA | `video_jobs` + `video_clips` + `{type:'montage', payload:{manuel:true}}` ou `{clips}` (comme aujourd'hui) |
| Annuler | `rpc('video_annuler_tache')` |

Lecture : `video_jobs`, `video_versions`, `video_taches`, `video_timeline`, `video_timeline_requetes` (temps réel),
liens signés `video-timeline` et `video-apercus`.

## 5. Tests

- **Vitest** : `logique.test.js` (porté du labo, mêmes cas) ; `montageTimeline.test.js` (bouton Ouvrir : moi/équipe,
  cliente, template, ancien montage, corbeille ; quand préparer ; formes exactes des tâches ; son `fichier` → `chemin`
  avec accents ; réponse périmée ignorée ; Terminer bloqué avec brouillon ; version périmée) ; `sourceHub` avec un faux
  client Supabase (UPDATE à 0 ligne → « timeline pas prête », lots de liens signés, renouvellement) ; rendus statiques
  (`renderToStaticMarkup`) : liste (bouton / explication cliente), création (2 boutons, 1 pour une cliente, flag éteint
  = écran d'aujourd'hui) ; aucune chaîne `supabaseAdmin`/`service_role` dans les nouveaux fichiers.
- Tests existants verts, `npm run lint`, `npm run build` (et taille du morceau timeline chargé à part).
- **Essai réel en local** (`.env.local` avec `VITE_TIMELINE=true`, soma-hq, agent en ligne), vidéo « Moi ou l'équipe »
  seulement : Monter moi-même → timeline sans cartes → déplacer/rogner, carte, son, 2 musiques (onde), zoom, coupe →
  vérifications en direct → Appliquer → v2 → Demander à l'IA (éditions gardées) → Terminer ; puis connexion avec
  info@ (accès), et un compte sans accès (route refusée, liens signés refusés).

## 6. Ordre de publication et retour en arrière

| # | Étape | Retour en arrière |
|---|---|---|
| B1 | Code, tests, build sur `feat/timeline-video`, commits par sujet (fichiers nommés) | Rien de publié |
| B2 | Ton essai réel en local (liste exacte fournie) | — |
| B3 | Ton OK : `git merge --ff-only feat/timeline-video` dans `main`, push. Netlify publie, **flag éteint** : rien de visible | `git revert` des commits (jamais de force) |
| B4 | Ton OK : `VITE_TIMELINE=true` dans Netlify, nouveau déploiement ; essai rapide en ligne | Remettre `VITE_TIMELINE=false` et redéployer (2 min) |

La migration reste en place dans tous les cas (additive) ; son script de retour
(`supabase/retours/20261015a_montage_video_timeline_retour.sql`) ne sert que si on abandonne la timeline.
