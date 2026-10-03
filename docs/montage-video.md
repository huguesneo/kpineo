# Module Montage vidéo : progression

Branche `feat/montage-video`, feature flag `VITE_MONTAGE_VIDEO` (désactivé par défaut, jamais activé dans Netlify pour l'instant).
Plan de référence : `PROMPT-CLAUDE-CODE-MONTAGE-VIDEO-2026-10-01.md` (hors dépôt).

## État au 3 octobre 2026

| Phase | Contenu | État |
|---|---|---|
| 0 | Préalables hors code (skill `neo-video-montage`, catalogue de cartes, Drive pour ordinateur, clé Anthropic, licence Remotion) | Côté Hugues (Drive et clé : faits) |
| 1a | Tables Supabase, RLS, bucket des aperçus | **Fait, appliqué en production (soma-hq) le 2 oct.** |
| **1a-bis** | **Ajouts pour l'agent : `session_id`, `nom_source`, `format`, `sous_titres`, lien template → montage, `video_config`** | **Fait, testé, appliqué en production le 2 oct.** |
| **1b** | **Agent vidéo (`video-neo/agent/`, branche `feat/agent-hub`) : file, heartbeat, six tâches, simulation, launchd** | **Fait, testé en simulation. Service pas encore installé (Hugues)** |
| **1c** | **Sous-menus Réseaux sociaux (Analyse et pub + Montage vidéo), redirection de `/reseaux-sociaux`, accueil, pastille Mac en ligne, file d'attente, configuration du dossier Brut** | **Fait, testé (logique), derrière le flag** |
| **2a-2b** | **Upload résumable vers Brut, Google Picker (vidéos), copie dans Brut, galerie de templates, prompt, lancement (montage + tâche), aperçu et progression dans la liste** | **Fait, testé (logique), derrière le flag** |
| **3a** | **Éditeur : lecteur 9:16 (aperçu du bucket), fil de conversation, demande « Qu'est-ce que tu veux changer ? », bande des versions, Mac en ligne, temps réel** | **Fait, testé (logique, composants, RLS), derrière le flag** |
| 3b et suite | Sous-titres éditables, restaurer une version, Terminer et lien d'export | À faire |
| **4-départ** | **Templates de départ « Pub 0929 » et « Entrevue mythe 0924 » (approuvés, aperçus), colonne `style_enregistre`, montage parti de la composition de départ du style** | **Fait, testé, appliqué en production le 3 oct.** |
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

## Templates de départ (3 oct. 2026)

Deux styles déjà validés par Hugues sont dans la galerie de l'étape 2 dès le départ, sans passer par une proposition :

| Template | `id` | `reference_video_neo` | Composition de départ | Aperçu (10 s, 540 x 960) |
|---|---|---|---|---|
| Pub 0929 | `4aa4bc15-1d52-4c4f-a65a-8a3c2e22ad3f` | `style/pub-0929` | `src/pubs/Pub0929.tsx` | extrait de `out/pub-0929-neo-pub.mp4` |
| Entrevue mythe 0924 | `678ddebc-013f-45ed-b164-cbeaf886c833` | `style/entrevue-mythe-0924` | `src/pubs/Pub0924.tsx` | extrait de `out/pub-0924-hd.mp4` |

`type_video` = `neo-video-montage`, `statut` = `approuve`, `approuve_par` = hugues@, `style_enregistre` = true, `chemin_apercu` = `templates/<id>/apercu.mp4` (déposé dans `video-apercus` avec la clé de l'agent). `out/pub-0929-hd.mp4` n'a jamais été ouvert (empreinte SHA-256 identique avant et après).

Migrations (soma-hq, appliquées sous les noms `montage_video_style_enregistre` et `montage_video_templates_depart`) :
- `20261003a_montage_video_style_enregistre.sql` : additive. Colonne `video_templates.style_enregistre` (false par défaut) et trigger de garde : un utilisateur du hub ne peut pas la changer (forcée à false à l'insertion). Aucune fonction ni trigger existant modifié.
- `20261003b_montage_video_templates_depart.sql` : les deux lignes, `ON CONFLICT DO NOTHING`.

**Pourquoi aucune tâche `enregistrer_style`** : le trigger `video_templates_approuve` ne se déclenche que sur un `UPDATE` du statut. Une ligne insérée directement en `approuve` (migration ou `service_role`) n'en crée pas. Vérifié en production : 0 tâche `enregistrer_style`.

Dans video-neo :
- Branches `style/pub-0929` et `style/entrevue-mythe-0924`, parties de `main`, jamais fusionnées. Chacune ajoute seulement son skill `.claude/skills/<nom>/SKILL.md`, dont l'en-tête déclare `composition_depart`.
- Agent (`feat/agent-hub`) : avec un template, la composition de départ est celle du skill du style (`composition_depart`), sinon le modèle `_Modele<Nom>.tsx` écrit par « enregistrer le style », sinon `_ModelePub.tsx`. Claude la copie et en remplace la vidéo, la transcription, les textes et les temps : il ne part plus du modèle vide. Une composition déclarée mais absente de la branche est refusée avec un message clair (le montage reste en file). `enregistrer_style` demande maintenant `composition_depart` dans le skill et passe `style_enregistre` à true.

Tests :
- Base : `run.sh` → `PASS: 105  FAIL: 0` (94 d'avant + 11 : templates de départ, galerie, aucune tâche, garde de `style_enregistre`).
- Agent : `NEO_HUB_DIR=<ce worktree> npm test` → 56 tests, dont le circuit en simulation d'un template de départ inséré approuvé (aucune tâche `enregistrer_style`, montage parti de `style/pub-0929`, prompt « copié de src/pubs/Pub0929.tsx », jamais `_ModelePub`).
- Hub : `npm test` → 122 tests qui passent ; les 2 fichiers des commissions échouent toujours faute de photo de référence (`scripts/baseline`), sans lien avec le module.

Vérifié en lecture seule en production : les 2 templates (comme hugues@, avec le RLS, par la requête de la galerie), les 2 fichiers dans `video-apercus/templates/` visibles par hugues@ (URL signée possible). Pas vérifié dans un navigateur : ouvrir « Nouvelle vidéo », étape 2, les deux cartes doivent s'afficher et leur aperçu s'ouvrir au clic.

## Reste à faire

- Hugues : installer le service (`bash agent/launchd/installer.sh --essai`, puis sans `--essai`) après avoir fusionné `feat/agent-hub` dans `main` de video-neo ; premier vrai montage pour valider Claude de bout en bout.
- Hugues : partager `NEO vidéo/Brut` (en modification) avec info@ ; à son premier envoi, info@ cliquera une fois « Autoriser le dossier Brut ».
- Hub 3b et suite : bande de sous-titres éditable depuis `sous_titres` (tâche `correction_sous_titres`), restaurer une version (tâche `restaurer`), Terminer et lien d'export. L'éditeur 3a est en place.
- Hub 4 : proposition de template avec `job_id` et `numero_version`, approbation par Hugues, menu Variantes.
- Premier vrai montage avec un template de départ (demande la clé Anthropic) : vérifier que Claude copie bien `Pub0929.tsx` ou `Pub0924.tsx`.
- `lien_drive_export` est un chemin dans Drive, pas une URL : le hub pourra retrouver le fichier par l'API Drive (phase 3).

## Phase 3a : éditeur de montage (hub)

Toujours derrière `VITE_MONTAGE_VIDEO=true`. Rien de changé dans l'agent ni dans la base (aucune migration) : l'agent gérait déjà un nouveau tour sur un montage existant et les politiques permettaient déjà au module de créer la tâche.

Contrat vérifié dans `video-neo/agent/src/taches.ts` (fonction `montage`) : tâche `montage` sur un montage existant, `payload` = `{ "prompt": "..." }`, obligatoire dès que `version_courante >= 1` (sinon refus « Écris ce que tu veux changer dans le montage. »). L'agent rouvre la branche `montage/<job_id>`, reprend la session Claude (`session_id`), crée la version n+1 avec `prompt`, `reponse_agent` et `auteur` = `cree_par` de la tâche, puis remet `erreur` à vide. À la version 0 (première ronde ratée), un `payload` vide relance avec `video_jobs.prompt` et un prompt écrit s'y ajoute.

Fichiers :
- `src/lib/montageEditeur.js` : logique pure (tâche envoyée, tâche active, état du champ, version affichée, fil de conversation, renouvellement de l'URL signée, messages d'erreur).
- `src/features/social/montage/MontageEditeur.jsx` : la page `/reseaux-sociaux/montage/:jobId`.
- `useMontageEditeur.js` : montage, versions et tâches en direct (temps réel filtré sur le montage, polling 3 s si le canal n'est pas abonné), envoi de la demande, noms des auteurs, URL signée renouvelée.
- `LecteurApercu.jsx`, `FilConversation.jsx`, `BandeVersions.jsx`, `ZoneDemande.jsx`.
- `PastilleMac.jsx` : la pastille de l'accueil, sortie dans son propre fichier pour servir aux deux écrans (accueil inchangé à l'écran).
- `MontageAccueil.jsx` : le titre d'un montage ouvre l'éditeur. `MontageNouvelle.jsx` : « Lancer le montage » ouvre l'éditeur du nouveau montage (avant : la liste).
- `src/App.jsx` : route `/reseaux-sociaux/montage/:jobId` (accès `montageVideoAccess`).

Écran :
- En haut : titre, statut, version actuelle, pastille Mac. Mac hors ligne (signal de plus de 90 s) : bandeau « Le Mac de montage est hors ligne, ta demande sera traitée à son retour. ». Montage en erreur : bandeau rouge avec le message de l'agent.
- Au centre : lecteur 9:16 de la version affichée. Sans version prête : statut, étape et barre de progression. Pendant une nouvelle ronde, l'ancienne version reste lisible avec « Nouvelle version en préparation · étape · % » au-dessus.
- À droite : fil (demande de l'utilisateur, puis réponse de l'agent, avec auteur, date et version). La demande en cours apparaît à la fin avec son état ; une demande refusée ou échouée apparaît avec l'erreur de l'agent. En bas : « Qu'est-ce que tu veux changer ? » et Envoyer (Ctrl + Entrée).
- Sous le lecteur : bande v1, v2, v3… Cliquer affiche cette version sans rien modifier ; « Actuelle » marque `version_courante`.
- Téléphone : lecteur, puis bande des versions, puis fil.

Décisions :
- **Champ désactivé tant qu'une tâche du montage est `en_attente` ou `en_cours`**, quel que soit son type, avec un message (« attend son tour » ou « l'agent travaille »). Désactivé aussi pour un montage `termine`. Mac hors ligne : le champ reste actif (la demande attend dans la file).
- **Relancer après une erreur** : dès que plus aucune tâche n'est active, on peut renvoyer une demande. À la version 0, le bouton devient « Relancer le montage » et part sans texte (`payload` vide).
- La tâche créée est ajoutée à l'écran dès la réponse de l'insertion, sans attendre le temps réel, pour que le champ se désactive aussitôt.
- **Nouvelle version** : le lecteur passe dessus, même si une autre version était choisie dans la bande.
- **URL signée** d'une heure, renouvelée 5 min avant l'expiration ; la lecture reprend où elle en était. Si la vidéo ne se charge plus, une nouvelle URL est demandée (au plus toutes les 10 s).
- Bande : numéros seulement, pas de miniatures (il faudrait une URL signée et un chargement vidéo par version).
- Pas de lien vers l'éditeur depuis la file d'attente de l'accueil (seulement depuis le titre dans la liste).

Tests :
- `src/lib/montageEditeur.test.js` (24) : contrat de la tâche, états désactivés, version affichée, fil, URL signée, messages d'erreur.
- `src/features/social/montage/editeur.test.jsx` (18) : fil, bande des versions (clic, version courante, version sans aperçu), états désactivés de la zone de demande, pastille Mac (30 s en ligne, 91 s hors ligne). Rendu par `react-dom/server` : le hub n'a ni jsdom ni Testing Library, aucune dépendance ajoutée.
- `supabase/tests/montage_video/30_tests_editeur.sql` (12) : lecture des versions et de l'aperçu, envoi d'une demande en trichant sur statut, auteur et erreur (forcés), pas de modification de `version_courante`, refus pour hors liste et non connecté. `run.sh` → `PASS: 117  FAIL: 0`.
- Hub : `npm test` → 244 tests qui passent ; les 2 fichiers des commissions échouent toujours (photo de référence absente). Build Vite et ESLint (configuration temporaire hors dépôt) sans remarque.

Pas vérifié dans un navigateur connecté : c'est l'objet des points ci-dessous.

### Tester à la main (8 points)

Prérequis : `.env.local` comme en phase 1c, `npm run dev`, `http://localhost:5173`, connecté comme hugues@ ou info@. Agent en simulation : `npm run simule` dans `video-neo/agent`.

1. **Arrivée** : lancer un nouveau montage (étape 2) : l'éditeur s'ouvre directement, lecteur remplacé par « En file d'attente » puis l'étape et la barre qui avancent, sans recharger. Depuis la liste, cliquer le titre d'un montage ouvre aussi l'éditeur.
2. **Version 1** : à la fin, le lecteur joue l'aperçu v1, la bande montre « v1 Actuelle », le fil montre le prompt (s'il y en a un) puis la réponse de l'agent.
3. **Nouveau tour** : écrire « Musique plus forte », Envoyer. Le champ et le bouton se désactivent tout de suite avec « attend son tour », puis « l'agent travaille » ; la demande apparaît dans le fil avec l'étape et le pourcentage. Quand v2 arrive : le lecteur passe sur v2, « Actuelle » passe sur v2, le champ se réactive. Dans l'éditeur SQL : la tâche a `payload` `{"prompt":"Musique plus forte"}`.
4. **Bande** : cliquer v1 : le lecteur joue v1, rien ne change dans la base (`version_courante` reste 2, aucune tâche créée).
5. **Mac hors ligne** : arrêter l'agent, attendre environ 90 s : pastille « Mac hors ligne » et bandeau, sans recharger. Une demande envoyée reste « attend son tour » ; redémarrer l'agent : elle est traitée.
6. **Erreur** : agent arrêté, `update video_jobs set statut='erreur', erreur='Essai d''erreur' where titre='<titre>';` : bandeau rouge avec le message. Une demande peut être renvoyée. Un refus de l'agent (ex. tâche `montage` sans prompt insérée à la main sur un montage qui a une version) apparaît dans le fil en rouge, et le champ redevient actif.
7. **Téléphone** (ou fenêtre étroite) : lecteur en haut, bande des versions dessous, puis le fil et le champ.
8. **Accès** : un compte hors liste qui ouvre `/reseaux-sociaux/montage/<id>` revient au tableau de bord ; une adresse inventée (`/reseaux-sociaux/montage/abc`) affiche « Montage introuvable ».

## Tester la migration en local

Avec un Postgres local vide (jamais un projet Supabase, le script refuse), migrations e et f :

```bash
PGHOST=/chemin/socket PGPORT=5432 PGUSER=postgres supabase/tests/montage_video/run.sh
```

Résultat attendu : `PASS: 117  FAIL: 0` (migrations e, f et 20261003a, puis les templates de départ, puis l'éditeur). Sur le Mac : `brew install postgresql@17`, puis un Postgres jetable (`initdb`, `pg_ctl ... -o "-k '' -p 54329"`) et `PGHOST=localhost PGPORT=54329`.
