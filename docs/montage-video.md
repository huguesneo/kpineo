# Module Montage vidéo : progression

Branche `feat/montage-video`, feature flag `VITE_MONTAGE_VIDEO` (désactivé par défaut, jamais activé dans Netlify pour l'instant).
Plan de référence : `PROMPT-CLAUDE-CODE-MONTAGE-VIDEO-2026-10-01.md` (hors dépôt).

## État au 2 octobre 2026

| Phase | Contenu | État |
|---|---|---|
| 0 | Préalables hors code (skill `neo-video-montage`, catalogue de cartes, Drive pour ordinateur, clé Anthropic, licence Remotion) | Côté Hugues (Drive et clé : faits) |
| 1a | Tables Supabase, RLS, bucket des aperçus | **Fait, appliqué en production (soma-hq) le 2 oct.** |
| **1a-bis** | **Ajouts pour l'agent : `session_id`, `nom_source`, `format`, `sous_titres`, lien template → montage, `video_config`** | **Fait, testé, appliqué en production le 2 oct.** |
| **1b** | **Agent vidéo (`video-neo/agent/`, branche `feat/agent-hub`) : file, heartbeat, six tâches, simulation, launchd** | **Fait, testé en simulation. Service pas encore installé (Hugues)** |
| **1c** | **Sous-menus Réseaux sociaux (Analyse et pub + Montage vidéo), redirection de `/reseaux-sociaux`, accueil, pastille Mac en ligne, file d'attente, configuration du dossier Brut** | **Fait, testé (logique), derrière le flag** |
| **2a-2b** | **Upload résumable vers Brut, Google Picker (vidéos), copie dans Brut, galerie de templates, prompt, lancement (montage + tâche), aperçu et progression dans la liste** | **Fait, testé (logique), derrière le flag** |
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
- `video_config (cle, valeur jsonb, updated_at)` : lecture `has_montage_access()`, écriture `is_hugues()`. Clés `dossier_brut_id` et `dossier_brut_nom` (dossier Brut choisi une fois avec le Picker, page de configuration de la phase 1c).

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

## Phase 1c : menu, accueil, configuration (hub)

Tout est derrière `VITE_MONTAGE_VIDEO=true`. Flag absent ou autre valeur : menu et route `/reseaux-sociaux` exactement comme avant.

Fichiers :
- `src/lib/montageVideoAccess.js` : ajout de `MONTAGE_VIDEO_ENABLED`, `canUseMontageVideo(email)` (flag + liste) et `canConfigureMontageVideo(email)` (flag + Hugues).
- `src/lib/montageVideo.js` : logique pure (Mac en ligne si dernier signal < 90 s, positions de file, statuts en français, lecture de `video_config`, lien Drive).
- `src/lib/googlePicker.js` : Google Identity Services + Picker (portée `drive.file`, `setAppId` = numéro du projet pour que l'app ait accès au dossier choisi).
- `src/features/social/montage/` : `MontageAccueil.jsx`, `MontageNouvelle.jsx` (étape 1, vide), `MontageConfiguration.jsx`, `useMontageVideo.js` (requêtes et temps réel).
- `src/App.jsx`, `src/components/layout/Sidebar.jsx` : routes et groupe de menu.
- `src/lib/montageVideo.test.js` : 18 tests.

Routes avec le flag actif :

| URL | Écran | Accès |
|---|---|---|
| `/reseaux-sociaux` | Redirige vers `/reseaux-sociaux/analyse` | |
| `/reseaux-sociaux/analyse` | Analyse et pub (l'écran Réseaux sociaux actuel, inchangé) | `socialAccess` |
| `/reseaux-sociaux/montage` | Accueil Montage vidéo | `montageVideoAccess` |
| `/reseaux-sociaux/montage/nouvelle` | Étape 1, la vidéo (vide jusqu'à la phase 2) | `montageVideoAccess` |
| `/reseaux-sociaux/montage/configuration` | Dossier Brut | Hugues seulement |

Décisions :
- Avec le flag, « Réseaux sociaux » est toujours un groupe ; « Montage vidéo » n'y apparaît que pour la liste `montageVideoAccess`. Une personne de cette liste qui n'est pas dans `socialAccess` verrait le groupe avec Montage vidéo seulement.
- Position dans la file calculée dans le hub : montages `en_file` triés par `created_at` (puis `id`). Les montages en transcription, montage ou rendu sont affichés « En cours » avec leur progression. `position_file` écrit par l'agent n'est pas utilisé par l'écran.
- Temps réel : `video_jobs` (insertion, mise à jour, suppression appliquées à la liste) et `video_agent_status`. La pastille est recalculée toutes les 5 s, donc elle passe hors ligne même sans nouvel événement. Si le canal coupe, un bandeau propose d'actualiser et la liste se recharge à la reconnexion.
- Auteur : nom du profil (`profiles.email`), sinon le courriel.
- Lien Drive : la vidéo finale si `lien_drive_export` est une URL ; sinon la vidéo source (`fichier_drive_id`) ; un chemin `NEO vidéo/Out/…` est affiché en texte (retrouvé par l'API Drive en phase 3).
- Clés `video_config` : `dossier_brut_id` et `dossier_brut_nom` (et non `drive_brut_id`, jamais utilisé). Si le dossier choisi ne s'appelle pas « Brut », il est enregistré quand même, avec un avertissement.

### Activer le flag en local

Dans `.env.local` à la racine du hub (ignoré par git) :

```bash
VITE_MONTAGE_VIDEO=true
VITE_GOOGLE_CLIENT_ID=198971596729-7oiapdbhnl80uh9r0ufsh47dv0jakdgr.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=<clé Picker, voir section 9 du plan>
```

Puis `npm run dev` et ouvrir `http://localhost:5173` (seule origine locale autorisée par Google). Ne pas ajouter `VITE_MONTAGE_VIDEO` dans Netlify avant la fin des tests.

### Tester à la main (6 points)

1. **Flag désactivé** : sans `VITE_MONTAGE_VIDEO`, le menu montre « Réseaux sociaux » comme avant et `/reseaux-sociaux` ouvre l'écran habituel. `/reseaux-sociaux/montage` renvoie au tableau de bord.
2. **Menu** : avec le flag, « Réseaux sociaux » s'ouvre sur « Analyse et pub » et « Montage vidéo ». `/reseaux-sociaux` redirige vers Analyse et pub, identique à avant. Le menu de gauche reste visible dans Montage vidéo. Connecté avec un compte hors liste (ex. un closeur), aucun des deux n'apparaît et l'URL directe renvoie au tableau de bord.
3. **Pastille** : agent arrêté, « Mac hors ligne » et le bandeau jaune. Démarrer l'agent (`npm run simule` dans `video-neo/agent`, ou le service) : « Mac en ligne » en moins de 30 s, sans recharger. L'arrêter : « hors ligne » environ 90 s plus tard.
4. **Liste et file** : sans montage, l'état vide s'affiche avec « Nouvelle vidéo ». Dans l'éditeur SQL de Supabase, page du hub ouverte : `insert into video_jobs (titre, prompt) values ('Essai 1','test'), ('Essai 2','test');` les deux apparaissent sans recharger, « 1er » et « 2e » dans la file (auteur vide, normal depuis l'éditeur SQL). Puis `update video_jobs set statut='montage', progression=40, etape='Essai' where titre='Essai 1';` : Essai 1 passe « En cours » à 40 % et Essai 2 devient « 1er ». Supprimer ensuite : `delete from video_jobs where titre like 'Essai %';` (agent arrêté, pour qu'il ne prenne rien).
5. **Configuration** (connecté comme hugues@) : le bouton « Configuration » est visible sur l'accueil (pas pour info@, dont l'URL directe ramène à l'accueil). « Non configuré » au départ. « Choisir le dossier dans Google Drive », se connecter, choisir `NEO vidéo/Brut` : « Dossier Brut configuré : Brut ».
6. **Nouvelle vidéo** : le bouton mène à l'étape 1 (écran vide pour l'instant) et « Retour aux montages » revient à l'accueil.

Vérifié : 18 tests de logique, build Vite, ESLint sans remarque sur les fichiers touchés, colonnes interrogées présentes en production (lecture seule). Pas vérifié dans un navigateur connecté (demande un compte de la liste) : c'est l'objet des 6 points ci-dessus.

## Phase 2a et 2b : dépôt de la vidéo et lancement (hub)

Toujours derrière `VITE_MONTAGE_VIDEO=true`. Aucune fonction existante du hub modifiée ; aucune logique de montage dans le hub (il crée le montage et la tâche, l'agent fait le reste).

Fichiers :
- `src/lib/montageUpload.js` : nom de fichier sûr, validation (mp4, mov, m4v, 10 Go au plus), débit et temps restant, `EnvoiResumable` (upload résumable Drive v3 par morceaux de 8 Mio, reprise, Annuler). Transport injecté.
- `src/lib/googleDrive.js` : transport XHR (progression de chaque morceau), accès au dossier Brut, lecture d'un fichier, copie côté Drive, examen d'un fichier choisi dans le Picker.
- `src/lib/googlePicker.js` : ajouts seulement (`obtenirJetonDrive` avec jeton gardé en mémoire, `choisirVideoDrive`, `prechargerGoogle`, `jetonDriveEnMemoire`). `choisirDossierDrive` n'a pas changé.
- `src/lib/montageVideo.js` : ajouts (règle template/prompt, titre, ligne `video_jobs`, première tâche, messages d'erreur, dernière tâche par montage, chemin du dernier aperçu).
- `src/features/social/montage/` : `MontageNouvelle.jsx` (les deux étapes), `EtapeVideo.jsx`, `EtapeDirection.jsx`, `useEnvoiVideo.js` (états de l'étape 1), `useMontageVideo.js` (templates, lancement, URL signée, dernières tâches), `MontageAccueil.jsx` (aperçu, progression, erreurs).
- Tests : `montageUpload.test.js` (20, dont un faux serveur Drive), `googleDrive.test.js` (9), `montageLancement.test.js` (9).

Étape 1, la vidéo :
- Glisser-déposer ou « Choisir un fichier » : validation, puis envoi direct dans Brut (`dossier_brut_id`), octet pour octet. Barre avec pourcentage, octets, vitesse (moyenne sur 8 s) et temps restant.
- Coupure : jusqu'à 6 nouveaux essais (1 à 30 s), chaque fois en demandant à Drive combien d'octets il a reçus. Ensuite « En pause » : reprise automatique au retour du réseau (`online`) ou bouton « Reprendre maintenant », même session Drive (rien n'est renvoyé). Session expirée : nouvel envoi complet. Annuler : coupe l'envoi ; une session inachevée ne crée aucun fichier dans Drive. Quitter la page pendant l'envoi demande une confirmation.
- « Choisir dans Google Drive » (Picker, vidéos seulement) : si le fichier est déjà dans Brut, il est utilisé tel quel (`nom_source` = son nom) ; sinon le hub propose « Copier dans Brut » (copie côté Drive sous un nom sûr, sans retéléchargement).
- Dossier Brut non configuré : lien vers Configuration pour hugues@, sinon « Demande à Hugues ».
- Compte Google sans accès au dossier Brut (cas de info@ : `drive.file` donne l'accès par compte) : message et bouton « Autoriser le dossier Brut », qui ouvre le Picker des dossiers ; le dossier choisi doit être celui configuré.
- Titre : le nom d'origine sans l'extension, modifiable (120 caractères au plus). Il sert de nom au dossier `Out/<titre>/`.

Étape 2, la direction : galerie des templates `approuve` (aperçu par URL signée d'une heure, ouvert au clic dans une fenêtre), état vide « Aucun template pour l'instant, décris ce que tu veux », champ prompt (obligatoire sans template, vérifié dans l'écran en plus du CHECK). « Lancer le montage » reste désactivé tant que la vidéo n'est pas dans Brut.

Lancement : insertion dans `video_jobs` (`titre`, `fichier_drive_id`, `nom_source`, `template_id`, `prompt`, `format` = `9:16`), puis tâche `montage` dans `video_taches`, puis retour à la liste. En cas d'erreur (RLS, réseau, template plus approuvé), message clair et « Réessayer » : la vidéo n'est pas renvoyée et, si le montage a déjà été créé, seule la tâche est recréée (pas de doublon).

Liste des montages : « Voir l'aperçu (vN) » quand une version existe (`version_courante > 0`) : URL signée d'une heure vers la dernière version qui a un aperçu, ouverte dans un nouvel onglet. Étape et progression en direct (barre) pour un montage en cours. Erreur de l'agent : celle du montage s'il est en erreur, sinon celle de sa dernière tâche si elle a échoué (un refus de l'agent laisse le montage en file sans le marquer en erreur). Ce n'est qu'un dépannage avant l'éditeur (phase 3).

Décisions :
- **Nom dans Brut** : sans espaces, parenthèses, accents ni caractères spéciaux, **suivi de la date et de l'heure** (`Ete_au_chalet_2026-10-02_1405.mov`). Sans ce suffixe, deux `IMG_1234.MOV` auraient le même nom dans Brut et Drive pour ordinateur renommerait l'un des deux sur le Mac : l'agent pourrait monter la mauvaise vidéo.
- **Tâche `montage` avec `payload` vide** : à la première ronde, l'agent lit `video_jobs.prompt` et y ajoute `payload.prompt`. Mettre le prompt aux deux endroits le donnerait deux fois à Claude.
- **Limite de taille : 10 Go.** Une vidéo plus lourde est refusée avant l'envoi.
- Les morceaux (PUT) partent sans jeton : l'adresse de session Drive suffit. Seule l'ouverture de la session demande un jeton, ce qui évite d'être bloqué par l'expiration du jeton (1 h) pendant un long envoi.
- Après un glisser-déposer, la fenêtre de connexion Google serait bloquée par le navigateur : sans jeton en mémoire, un bouton « Se connecter et envoyer » demande le clic.
- Fichier choisi dans Brut avec le Picker : son nom n'est pas changé (`nom_source` = nom actuel).

Vérifié : 38 nouveaux tests de logique (122 au total qui passent), build Vite, ESLint (règles recommandées React) sans remarque sur les fichiers du module, colonnes utilisées présentes en production (lecture seule, soma-hq). Les 2 fichiers de tests des commissions échouaient déjà avant (photo de référence `scripts/baseline` absente du worktree). Le dépôt n'a pas de configuration ESLint sur cette branche (`npm run lint` échoue avant toute vérification) : la vérification a été faite avec une configuration temporaire hors dépôt. Pas vérifié dans un navigateur connecté à Google : c'est l'objet des 8 points ci-dessous.

### Tester à la main (8 points)

Prérequis : `.env.local` comme en phase 1c, `npm run dev`, connecté au hub comme hugues@, dossier Brut configuré.

1. **Dossier non configuré** : dans l'éditeur SQL, `delete from video_config where cle like 'dossier_brut%';` puis ouvrir « Nouvelle vidéo » : message avec lien vers Configuration (info@ : « Demande à Hugues »). Reconfigurer ensuite le dossier Brut dans Configuration.
2. **Validation** : glisser un .jpg ou un .avi : message « Format non accepté » ; rien ne part vers Drive.
3. **Envoi** : glisser une vraie vidéo .mov de quelques centaines de Mo (nom avec espaces, accents et parenthèses). Se connecter si demandé. Vérifier pourcentage, vitesse, temps restant ; à la fin, « Vidéo envoyée » et `Brut/<nom sûr avec date>`. Dans Google Drive : même taille au octet près que l'original, nom sûr. Le titre proposé est le nom d'origine.
4. **Coupure** : pendant un envoi, couper le Wi-Fi 30 s : la barre passe « En pause » (ou ralentit) puis reprend seule au retour du réseau, sans repartir de zéro. Le fichier final dans Drive a la bonne taille et se lit.
5. **Annuler** : lancer un envoi, cliquer « Annuler » : retour au dépôt, aucun fichier dans Brut.
6. **Google Drive** : « Choisir dans Google Drive », choisir une vidéo hors de Brut : « Copier dans Brut » crée la copie dans Brut (rapide, sans retéléchargement). Choisir ensuite une vidéo déjà dans Brut : « déjà dans le dossier Brut ». Au téléphone, le texte sur l'app Google Drive est visible sous la zone de dépôt.
7. **Direction et lancement** : galerie vide avec « Aucun template pour l'instant, décris ce que tu veux ». « Lancer le montage » sans prompt : message sous le champ. Écrire un prompt, lancer : retour à la liste, le montage apparaît en file. Dans l'éditeur SQL : une ligne `video_jobs` (bon `nom_source`, `format` 9:16) et une tâche `montage` `en_attente`, `payload` `{}`. Pour l'erreur réseau : couper le Wi-Fi avant de cliquer, message clair, rallumer, « Réessayer » : un seul montage créé.
8. **Liste** : agent démarré (`npm run simule` dans `video-neo/agent`) : l'étape et la barre avancent sans recharger, puis « Voir l'aperçu (v1) » ouvre l'aperçu dans un nouvel onglet. Pour une erreur : `update video_jobs set statut='erreur', erreur='Essai d''erreur' where titre='<titre>';` agent arrêté : le message apparaît sous le titre sans recharger.

## Reste à faire

- Hugues : installer le service (`bash agent/launchd/installer.sh --essai`, puis sans `--essai`) après avoir fusionné `feat/agent-hub` dans `main` de video-neo ; premier vrai montage pour valider Claude de bout en bout.
- Hugues : partager `NEO vidéo/Brut` (en modification) avec info@ ; à son premier envoi, info@ cliquera une fois « Autoriser le dossier Brut ».
- Hub 3 : éditeur (aperçu par URL signée, `reponse_agent`, bande de sous-titres depuis `sous_titres`, versions, Terminer, lien d'export).
- Hub 4 : proposition de template avec `job_id` et `numero_version`, approbation par Hugues, menu Variantes.
- `lien_drive_export` est un chemin dans Drive, pas une URL : le hub pourra retrouver le fichier par l'API Drive (phase 3).

## Tester la migration en local

Avec un Postgres local vide (jamais un projet Supabase, le script refuse), migrations e et f :

```bash
PGHOST=/chemin/socket PGPORT=5432 PGUSER=postgres supabase/tests/montage_video/run.sh
```

Résultat attendu : `PASS: 94  FAIL: 0`. Sur le Mac : `brew install postgresql@17`, puis un Postgres jetable (`initdb`, `pg_ctl ... -o "-k '' -p 54329"`) et `PGHOST=localhost PGPORT=54329`.
