# Module Montage vidéo : progression

Branche `feat/montage-video`, feature flag `VITE_MONTAGE_VIDEO` (pas encore créé).
Plan de référence : `PROMPT-CLAUDE-CODE-MONTAGE-VIDEO-2026-10-01.md` (hors dépôt).

## État au 2 octobre 2026

| Phase | Contenu | État |
|---|---|---|
| 0 | Préalables hors code (skill `neo-video-montage`, catalogue de cartes, Drive pour ordinateur, clé Anthropic, licence Remotion) | Côté Hugues (Drive et clé : faits) |
| 1a | Tables Supabase, RLS, bucket des aperçus | **Fait, appliqué en production (soma-hq) le 2 oct.** |
| **1a-bis** | **Ajouts pour l'agent : `session_id`, `nom_source`, `format`, `sous_titres`, lien template → montage, `video_config`** | **Fait, testé, appliqué en production le 2 oct.** |
| **1b** | **Agent vidéo (`video-neo/agent/`, branche `feat/agent-hub`) : file, heartbeat, six tâches, simulation, launchd** | **Fait, testé en simulation. Service pas encore installé (Hugues)** |
| 1c | Sous-menus Réseaux sociaux (Analyse et pub + Montage vidéo), redirection de `/reseaux-sociaux`, pastille Mac en ligne, file d'attente | À faire |
| 2 | Upload résumable Drive, Google Picker, galerie de templates, prompt, lancement du premier montage | À faire |
| 3 | Éditeur : aperçu (vidéo du bucket), fil des réponses, sous-titres éditables, versions, Terminer | À faire |
| 4 | Templates proposés et approbation par Hugues, variantes | À faire (côté agent : prêt) |

Prérequis vérifié : `public.is_hugues()` existe en production.

## Décisions prises (2 oct.)

- **Pas de Player Remotion dans le hub.** L'aperçu est un rendu 540 x 960 déposé par l'agent dans le bucket privé `video-apercus` (`apercus/<job_id>/v<n>.mp4`). Pas de partage de compositions Remotion avec le hub.
- **Fil de conversation : `video_versions.reponse_agent` suffit**, pas de table de messages. Le plan de montage de Claude y est écrit, sans étape d'approbation bloquante.
- **Drive** : l'agent lit `NEO vidéo/Brut/<nom_source>` dans le dossier synchronisé du Mac (`~/Library/CloudStorage/GoogleDrive-hugues@neoperformance.ca/Mon disque/NEO vidéo`, confirmé sur le Mac ; réglable par `NEO_VIDEO_DRIVE_DIR`). Il attend que la taille soit stable 10 s (30 min au plus), sinon erreur claire. L'export est écrit dans `NEO vidéo/Out/<titre>/<titre>_v<version>.mp4`, jamais écrasé.
- **Style approuvé** : branche `style/<nom>` dans video-neo, jamais fusionnée dans `main`. Un montage avec template part de cette branche.
- **Variante** : crée un nouveau montage (`<titre> (variante 4:5)`, colonne `format`), branche partie de l'original, session Claude bifurquée. L'original ne bouge pas.
- **Sous-titres** : chaque version garde ses mots dans `video_versions.sous_titres` (pour la bande éditable du hub). Correction = tâche `correction_sous_titres` avec `{ "mot": <index>, "texte": "..." }`.
- **Template → montage** : `video_templates.job_id` et `numero_version` disent quelle version enregistrer à l'approbation. Le hub doit les remplir à la proposition.
- Une demande refusée (version inexistante, prompt vide, export déjà fait…) passe la tâche en erreur sans casser le montage (son aperçu reste bon).

## Phase 1a : ce qui est fait

Fichiers :
- `supabase/migrations/20261001e_montage_video.sql` : la migration (se rejoue sans erreur).
- `src/lib/montageVideoAccess.js` : liste d'accès côté hub, miroir de `has_montage_access()`.
- `supabase/tests/montage_video/` : imitation Supabase + 73 tests RLS et triggers.

Accès :
- `has_montage_access()` : `hugues@neoperformance.ca`, `info@neoperformance.ca`. Pour ajouter un courriel : modifier la fonction (nouvelle migration `CREATE OR REPLACE`) **et** `montageVideoAccess.js`.
- Approbation des templates : `is_hugues()` seulement.
- L'agent vidéo écrit avec la clé `service_role`, dans `video-neo/agent/.env` sur le Mac (jamais dans le hub, Supabase ou Netlify).

Tables :

| Table | Rôle | Hub (utilisateurs du module) | Agent (`service_role`) |
|---|---|---|---|
| `video_jobs` | Un montage | Lire, créer, renommer | Statut, étape, progression, branche git, file, export |
| `video_versions` | Une ronde (commit git, aperçu, prompt, réponse) | Lire | Créer |
| `video_taches` | Demandes à l'agent | Lire, créer (`enregistrer_style` : Hugues) | Prendre, terminer |
| `video_templates` | Propositions et templates | Lire, proposer, modifier sa proposition ouverte ; Hugues approuve ou refuse | `reference_video_neo`, `chemin_apercu` |
| `video_agent_status` | Heartbeat (une ligne) | Lire | Écrire toutes les 30 s |

Règles garanties par la base :
- Un montage exige un template approuvé ou un prompt non vide ; il naît `en_file`, au nom de son créateur.
- Depuis le hub, seul le titre d'un montage se modifie ; tout le reste passe par une tâche.
- Les versions ne se modifient ni ne se suppriment depuis le hub. Restaurer = tâche `restaurer` (l'agent revient au commit et crée une nouvelle version).
- Une seule tâche `en_cours` à la fois (index unique).
- Approbation d'un template par Hugues : `approuve_par` / `approuve_le` remplis et tâche `enregistrer_style` créée automatiquement.
- Un template utilisé par un montage ne peut pas être supprimé.
- Temps réel activé sur les 5 tables.
- « Mac hors ligne » : `now() - dernier_signal > 90 s`, calculé dans le hub.

Bucket `video-apercus` : privé, mp4, 500 Mo max. Chemins `apercus/<job_id>/v<n>.mp4` et `templates/<template_id>/apercu.mp4`. Lecture par URL signée pour le module ; écriture par l'agent seulement.

## Phase 1a-bis : migration `20261001f_montage_video_ajouts.sql`

Additive, se rejoue sans erreur :
- `video_jobs` : `session_id` (session Claude, écrite par l'agent seulement), `nom_source` (nom du fichier dans Brut), `format` (`'9:16'` par défaut, `4:5`, `1:1`).
- `video_versions.sous_titres` (jsonb : `{ video, motsParLigne, dureeMs, mots: [{ texte, debutMs, finMs }] }`).
- `video_templates.job_id`, `numero_version`.
- `video_config (cle, valeur jsonb, updated_at)` : lecture `has_montage_access()`, écriture `is_hugues()`. Ex. `drive_brut_id` (dossier Brut choisi une fois avec le Picker, phase 2).

## Application en production (2 oct. 2026)

Projet **soma-hq** (`cbqwrmyctsfdqmenczhm`) seulement, rien sur Clinique neo. Avant : aucun objet `video_*`, ni `has_montage_access`, ni bucket `video-apercus`. Appliquées par le connecteur Supabase sous les noms `montage_video` et `montage_video_ajouts` (le nom « 20261001e_… » était déjà pris en production par `20261001e_terminal_therapeute_setter`). SQL identique aux fichiers, sans les `DROP ... IF EXISTS` (rien à retirer sur une base vierge). Vérifié après : 6 tables avec RLS, 16 politiques, temps réel sur les 5 tables, bucket privé 500 Mo, ligne `video_agent_status` présente. Un essai de l'agent en simulation a écrit son heartbeat et s'est abonné au temps réel.

## Phase 1b : agent vidéo (`video-neo/agent/`)

Branche `feat/agent-hub` de video-neo. Détails, variables et dépannage : `video-neo/agent/README.md`.

- Node + TypeScript, Claude Agent SDK (`claude-opus-5-5`, skill `neo-video-montage`, budget 5 $ par ronde), Remotion 4.0.523 par l'API Node (webpack, pas Rspack), Whisper du projet.
- File `video_taches` : temps réel + polling de secours 15 s, une tâche à la fois, `en_attente` → `en_cours` → `fait` / `erreur` (message en français). Au démarrage, les tâches restées `en_cours` passent en erreur. Heartbeat 30 s dans `video_agent_status`. `position_file` : 0 = en cours, 1, 2… = en attente.
- Progression : `etape` + `progression` (0 à 100), avec le vrai pourcentage des rendus Remotion.
- Travaille dans un worktree git (`video-neo/.travail-agent`) : ne change jamais de branche dans le dossier de Hugues. Branches `montage/<job_id>` (un commit par ronde) et `style/<nom>`.
- Claude limité à ce worktree et à `public/videos` : pas de `.env`, pas d'Internet, pas de commit ni de rendu complet, jamais `out/pub-0929-hd.mp4`.
- Mode `--simule` : même boucle, sans Claude ni Remotion (aperçus factices ffmpeg).
- Service launchd : `agent/launchd/installer.sh` (refuse sans les 3 variables du `.env`, `--essai` pour vérifier) et `desinstaller.sh`.

| Tâche | `payload` | Résultat |
|---|---|---|
| `montage` | 1re ronde : `{}` ou `{ "prompt" }` ; suivantes : `{ "prompt" }` obligatoire | Version n (commit, aperçu, plan dans `reponse_agent`) |
| `correction_sous_titres` | `{ "mot", "texte" }` ou `{ "corrections": [...] }` | Version n, sans Claude |
| `restaurer` | `{ "version": k }` | Version n identique à k (aperçu recopié) |
| `terminer` | `{}` | `lien_drive_export` = `NEO vidéo/Out/<titre>/<titre>_v<n>.mp4`, statut `termine` |
| `variante` | `{ "format"?, "hook"?, "prompt"? }` | Nouveau montage avec sa version 1 |
| `enregistrer_style` | `{ "template_id" }` (créée par la base) | `reference_video_neo` = `style/<nom>`, `chemin_apercu` du template |

Tests (sans clé ni coût, jamais en production) :
- Base : `supabase/tests/montage_video/run.sh` → `PASS: 94  FAIL: 0` (73 d'avant + 21).
- Agent : `cd video-neo/agent && npm test` → 54 tests (circuit complet des six tâches en simulation contre Postgres + PostgREST locaux, file, redémarrage, processus `--simule`, garde-fous de Claude, logique Drive).
- Vérifiés à la main sur le Mac : rendu Remotion réel d'un aperçu 540 x 960 depuis le worktree, transcription Whisper réelle.
- Pas encore testé : un vrai montage par Claude (demande la clé et coûte des crédits).

## Reste à faire

- Hugues : installer le service (`bash agent/launchd/installer.sh --essai`, puis sans `--essai`) après avoir fusionné `feat/agent-hub` dans `main` de video-neo ; premier vrai montage pour valider Claude de bout en bout.
- Hub 1c : sous-menus, redirection, pastille Mac en ligne (`now() - dernier_signal > 90 s`), file d'attente (`position_file`).
- Hub 2 : upload résumable vers Brut (`drive_brut_id` dans `video_config`), Google Picker, `nom_source` = nom du fichier, galerie de templates, création du montage + tâche `montage`.
- Hub 3 : éditeur (aperçu par URL signée, `reponse_agent`, bande de sous-titres depuis `sous_titres`, versions, Terminer, lien d'export).
- Hub 4 : proposition de template avec `job_id` et `numero_version`, approbation par Hugues, menu Variantes.
- `lien_drive_export` est un chemin dans Drive, pas une URL : le hub pourra retrouver le fichier par l'API Drive (phase 3).

## Tester la migration en local

Avec un Postgres local vide (jamais un projet Supabase, le script refuse), migrations e et f :

```bash
PGHOST=/chemin/socket PGPORT=5432 PGUSER=postgres supabase/tests/montage_video/run.sh
```

Résultat attendu : `PASS: 94  FAIL: 0`. Sur le Mac : `brew install postgresql@17`, puis un Postgres jetable (`initdb`, `pg_ctl ... -o "-k '' -p 54329"`) et `PGHOST=localhost PGPORT=54329`.
