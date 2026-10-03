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
| **8** | **Correction des sous-titres à la main dans l'éditeur (tâche `correction_sous_titres`), réponse de l'agent rendue en markdown dans le fil** | **Fait, testé (logique, composants), derrière le flag. Aucune migration, agent inchangé** |
| **8b** | **Retrait de mots dans le panneau de sous-titres (`{ mot, supprimer: true }`), garde-fous, numéros relus avant l'envoi** | **Fait, testé (logique, composants), derrière le flag. Aucune migration. Agent : ee2a41d (`feat/agent-hub`)** |
| **9** | **Restaurer une version (tâche `restaurer`), Terminer et exporter (tâche `terminer`), lien « Ouvrir dans Drive » dans l'éditeur et la liste** | **Fait, testé (logique, composants), derrière le flag. Aucune migration, agent inchangé** |
| **Clips 1** | **Plusieurs clips par montage (Principal et B-roll) : table `video_clips`, liste ordonnée à l'étape 1, clips dans le payload de la tâche, panneau dans l'éditeur ; la file de l'accueil ouvre l'éditeur** | **Fait, testé, appliqué en production le 3 oct. Agent : partie 2, à faire** |
| 3b et suite | Sous-titres éditables, restaurer une version, Terminer et lien d'export | À faire |
| **4-départ** | **Templates de départ « Pub 0929 » et « Entrevue mythe 0924 » (approuvés, aperçus), colonne `style_enregistre`, montage parti de la composition de départ du style** | **Fait, testé, appliqué en production le 3 oct.** |
| **10a** | **Templates proposés depuis l'éditeur, écran Templates, approbation et refus motivé par Hugues, archivage ; galerie limitée aux styles enregistrés** | **Fait, testé (logique, composants, RLS), derrière le flag. Migration `20261003d` appliquée en production le 3 oct. Agent inchangé** |
| **10b** | **Variantes (autre hook, format 4:5 ou 1:1) depuis l'éditeur, lien « Variante de » et liste des variantes, lecteur au ratio du montage** | **Fait, testé (logique, composants, RLS), derrière le flag. Migration `20261003e` appliquée en production le 3 oct. Agent : doit écrire `variante_de` (voir étape 10b)** |

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
- `supabase/migrations/20261002112114_montage_video.sql` : la migration (se rejoue sans erreur).
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

## Phase 1a-bis : migration `20261002112126_montage_video_ajouts.sql`

Additive, se rejoue sans erreur :
- `video_jobs` : `session_id` (session Claude, écrite par l'agent seulement), `nom_source` (nom du fichier dans Brut), `format` (`'9:16'` par défaut, `4:5`, `1:1`).
- `video_versions.sous_titres` (jsonb : `{ video, motsParLigne, dureeMs, mots: [{ texte, debutMs, finMs }] }`).
- `video_templates.job_id`, `numero_version`.
- `video_config (cle, valeur jsonb, updated_at)` : lecture `has_montage_access()`, écriture `is_hugues()`. Clés `dossier_brut_id` et `dossier_brut_nom` (dossier Brut choisi une fois avec le Picker, page de configuration de la phase 1c).

## Application en production (2 oct. 2026)

Projet **soma-hq** (`cbqwrmyctsfdqmenczhm`) seulement, rien sur Clinique neo. Avant : aucun objet `video_*`, ni `has_montage_access`, ni bucket `video-apercus`. Appliquées par le connecteur Supabase sous les noms `montage_video` et `montage_video_ajouts` (le nom « 20261001e_… » était déjà pris en production par `20261001e_terminal_therapeute_setter`). Les fichiers portent depuis le 3 oct. les versions exactes enregistrées en production : `20261002112114_montage_video.sql` et `20261002112126_montage_video_ajouts.sql`. SQL identique aux fichiers, sans les `DROP ... IF EXISTS` (rien à retirer sur une base vierge). Vérifié après : 6 tables avec RLS, 16 politiques, temps réel sur les 5 tables, bucket privé 500 Mo, ligne `video_agent_status` présente. Un essai de l'agent en simulation a écrit son heartbeat et s'est abonné au temps réel.

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
- Hub 3b et suite : ~~bande de sous-titres éditable~~ (fait, étape 8), ~~restaurer une version~~, ~~Terminer et lien d'export~~ (faits, étape 9). L'éditeur 3a est en place.
- ~~Hub 4 : proposition de template avec `job_id` et `numero_version`, approbation par Hugues~~ (fait, étape 10a). ~~Menu Variantes~~ (fait, étape 10b ; l'agent doit écrire `variante_de`).
- Premier vrai montage avec un template de départ (demande la clé Anthropic) : vérifier que Claude copie bien `Pub0929.tsx` ou `Pub0924.tsx`.
- `lien_drive_export` est un chemin dans Drive, pas une URL. Avec la portée `drive.file`, le hub ne peut pas retrouver le fichier par l'API (il a été créé par Drive pour ordinateur) : « Ouvrir dans Drive » ouvre une recherche sur le nom du fichier (`?safe=strict&q=<nom>`, sans guillemets). Agent : écrire l'URL du fichier (voir étape 9).

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
- **Champ désactivé tant qu'une tâche du montage est `en_attente` ou `en_cours`**, quel que soit son type, avec un message (« attend son tour » ou « l'agent travaille »). ~~Désactivé aussi pour un montage `termine`~~ : verrou retiré (étape 9b). Mac hors ligne : le champ reste actif (la demande attend dans la file).
- **Relancer après une erreur** : dès que plus aucune tâche n'est active, on peut renvoyer une demande. À la version 0, le bouton devient « Relancer le montage » et part sans texte (`payload` vide).
- La tâche créée est ajoutée à l'écran dès la réponse de l'insertion, sans attendre le temps réel, pour que le champ se désactive aussitôt.
- **Nouvelle version** : le lecteur passe dessus, même si une autre version était choisie dans la bande.
- **URL signée** d'une heure, renouvelée 5 min avant l'expiration ; la lecture reprend où elle en était. Si la vidéo ne se charge plus, une nouvelle URL est demandée (au plus toutes les 10 s).
- Bande : numéros seulement, pas de miniatures (il faudrait une URL signée et un chargement vidéo par version).
- ~~Pas de lien vers l'éditeur depuis la file d'attente de l'accueil~~ : corrigé avec les clips, chaque ligne de la file ouvre l'éditeur.

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

## Clips, partie 1 : base et hub (3 oct. 2026)

Toujours derrière `VITE_MONTAGE_VIDEO=true`. Agent (video-neo) non modifié : c'est la partie 2.

Migration `20261003c_montage_video_clips.sql` (additive, se rejoue ; appliquée sur soma-hq sous le nom `montage_video_clips`) :
- Table `video_clips` : `id`, `job_id` (cascade), `ordre` (1 à 10, unique par montage), `role` (`principal` ou `broll`), `nom`, `fichier_drive_id`, `nom_source` (même source que `video_jobs`), `duree_s` (vide, pour l'agent), `created_at`.
- RLS : lecture et création pour `has_montage_access()` (hugues@ et info@), ni modification ni suppression depuis le hub. Trigger : le hub n'ajoute des clips qu'à un montage sans version (au lancement) et ne peut pas remplir `duree_s`.
- Backfill : chaque montage existant a reçu son clip 1, principal, copié de `fichier_drive_id` / `nom_source` (nom = `nom_source`, sinon le titre). Production : 2 montages, 2 clips, vérifiés.
- `video_jobs.fichier_drive_id` et `nom_source` restent : ils reçoivent le **premier clip Principal dans l'ordre**, la seule vidéo que l'agent actuel monte.

Hub :
- `src/lib/montageClips.js` : règles (premier clip ajouté Principal, les suivants B-roll, 10 au plus, au moins un Principal, noms obligatoires), ordre, lignes `video_clips`, payload.
- Étape 1 (« Les vidéos ») : chaque vidéo prête dans Brut (envoi, Picker ou copie, comme avant) rejoint la liste et la zone de dépôt revient (« Ajouter un clip »). Flèches haut et bas, nom modifiable, Principal ou B-roll, retirer (le fichier reste dans Drive). Liste figée pendant un envoi et après un lancement à moitié réussi (réessai). Titre proposé : le nom du premier clip.
- Lancement : montage, puis clips (seulement si le montage n'en a encore aucun, pour un réessai sans doublon), puis tâche `montage`.
- Éditeur : panneau « Clips » (lecture seule) sous la bande des versions : ordre, nom, rôle, durée si connue.
- Accueil : chaque ligne de la file d'attente ouvre l'éditeur du montage.

Payload de la première tâche `montage` (le prompt reste sur le montage, jamais dans le payload) :

```json
{ "clips": [
  { "ordre": 1, "nom": "Entrevue", "role": "principal", "fichier_drive_id": "…", "nom_source": "Entrevue_2026-10-03_1000.mov" },
  { "ordre": 2, "nom": "Cuisine", "role": "broll", "fichier_drive_id": "…", "nom_source": "Cuisine_2026-10-03_1001.mov" }
] }
```

L'agent actuel ignore `clips` (vérifié dans `agent/src/taches.ts` : il ne lit que `payload.prompt`) et monte `video_jobs.nom_source`.

Pour la partie 2 (agent) :
- Lire `payload.clips` (ou `video_clips` du montage, trié par `ordre`, même contenu) ; sans `clips` (montages d'avant), garder `nom_source` comme source unique.
- Chaque `nom_source` est dans `NEO vidéo/Brut/` : attendre la synchro de chacun comme aujourd'hui.
- Écrire `video_clips.duree_s` (service_role).
- `variante` recopie aujourd'hui `nom_source` seulement : il faudra recopier les clips.

Tests : `montageClips.test.js` (12), `clips.test.jsx` (14 : liste, flèches, rôles, 10 au plus, verrou, panneau de l'éditeur, liens de la file), `40_tests_clips.sql` (22 : backfill, ordre unique, 10 au plus, rôle, nom, verrou après version, hors liste, non connecté, agent, cascade). `run.sh` → `PASS: 139  FAIL: 0`. Hub : 270 tests qui passent (les 2 fichiers des commissions échouent toujours, photo de référence absente). Build et ESLint (configuration temporaire hors dépôt) sans remarque.

### Tester à la main (3 points)

1. **Liste** : ajouter 3 vidéos (un envoi, deux par le Picker) : 1re Principal, les autres B-roll. Monter, descendre, renommer, passer la 1re en B-roll : « Choisis au moins un clip Principal » et le lancement est refusé. Au 10e clip, la zone de dépôt disparaît.
2. **Lancement** : remettre un Principal, lancer. Dans l'éditeur SQL : `select ordre, role, nom, nom_source from video_clips where job_id='<id>' order by ordre;` dans l'ordre choisi, `video_jobs.nom_source` = le premier Principal, et la tâche a `payload.clips`. Avec l'agent en simulation, le montage se fait comme avant. L'éditeur montre le panneau « Clips ».
3. **File d'attente** : sur l'accueil, cliquer une ligne de la file (en cours ou en attente) ouvre l'éditeur de ce montage.

## Étape 8 : correction des sous-titres à la main (3 oct. 2026)

Toujours derrière `VITE_MONTAGE_VIDEO=true`. **Aucune migration** (la colonne `video_versions.sous_titres` existe depuis 1a-bis et se lit déjà avec le RLS) et **agent inchangé** : il gérait déjà la tâche.

Contrat vérifié dans `video-neo/agent/src/taches.ts` (`correctionSousTitres`, `nouvelleVersion`) :
- À chaque version, l'agent copie `public/sous-titres/m-<id>.json` dans `video_versions.sous_titres` : `{ video, motsParLigne, dureeMs, mots: [{ texte, debutMs, finMs }] }`. Ce sont des **mots**, pas des lignes ; le gabarit `SousTitres` de video-neo les regroupe au rendu.
- Payload : `{ "corrections": [{ "mot": <index dans mots>, "texte": "..." }] }`. Refus si un index n'existe pas ou si un texte est vide ; l'agent ne sait ni ajouter ni retirer un mot. (Retrait possible depuis l'étape 8b.)
- Il corrige le fichier de la **version courante** (branche du montage), fait un commit, rend l'aperçu et crée la version n+1 (prompt « Correction des sous-titres à la main », réponse « « ancien » → « nouveau » »). **Aucun appel Claude** : seulement le rendu Remotion.

Hub :
- `src/lib/montageSousTitres.js` : mots, regroupement en lignes (même règle que le gabarit, variante classique : ponctuation, pause de plus de 350 ms, 5 mots, 24 caractères), avertissements de longueur, ligne modifiée → corrections mot par mot, payload, état du panneau.
- `PanneauSousTitres.jsx` : panneau « Sous-titres de la vN » sous la bande des versions. Une ligne par sous-titre avec son début (« 1,2 s ») ; cliquer l'heure ou entrer dans le champ fait sauter le lecteur à ce moment (`LecteurApercu`, prop `saut`). Texte modifiable, minutage non.
- `useMontageEditeur.js` : `sous_titres` lu avec les versions, `corriger()` crée la tâche, `useConfirmerSortie()` (fermeture de l'onglet et liens internes).
- `src/lib/markdownSimple.js` et `TexteMarkdown.jsx` : la réponse de l'agent est rendue (titres, gras, italique, code, listes, tableaux, séparateurs) en éléments React, sans `innerHTML` : le HTML du texte reste du texte. Aucune dépendance ajoutée (aucune bibliothèque markdown dans `package.json`). Les demandes restent en texte brut.
- `montageEditeur.js` : dans le fil, une tâche de correction s'affiche « Correction des sous-titres à la main (N mots) » (avant : « Lancer le montage »).

Décisions :
- **Une ligne modifiée → corrections par mot.** Les mots du texte sont posés un à un sur les mots d'origine ; s'il y en a plus, les derniers rejoignent le dernier mot de la ligne (son minutage ne change pas). ~~S'il y en a moins : erreur sur la ligne (« Garde au moins N mots ») et envoi bloqué, puisque l'agent ne peut pas retirer un mot.~~ Remplacé à l'étape 8b : un mot en moins est retiré. Seuls les mots changés partent.
- **Avertissements sans blocage** : plus de 5 mots, plus de 24 caractères (règles du skill, `SOUS_TITRES_NEO_CLASSIQUE`), retour à la ligne.
- **Seule la version actuelle se corrige** (l'agent corrige `version_courante`) : une ancienne version affichée est en lecture seule, avec « Affiche-la pour corriger ses sous-titres ».
- « Appliquer les corrections » : désactivé sans changement, avec une erreur de ligne, tant qu'une tâche du montage attend ou tourne (même message que le champ de demande), et pour un montage terminé (panneau en lecture seule). Les champs se désactivent aussi.
- « Annuler mes changements » efface les brouillons. Corrections non envoyées : confirmation avant de fermer l'onglet ou de suivre un lien interne (menu, « Retour aux montages »). Une nouvelle version efface les brouillons de l'ancienne (les index de mots ne valent plus).
- Le découpage du hub suit la règle 5 mots / 24 caractères ; une composition qui passe un autre `motsParLigne` au gabarit coupera autrement à l'écran. Sans effet sur la correction, qui se fait par mot.

Tests : `montageSousTitres.test.js` (26 : lignes sur un extrait de `0929-2.json`, avertissements, corrections par mot, payload, états, fil), `markdownSimple.test.js` (9), `sousTitres.test.jsx` (12 : panneau, états désactivés, avertissements, rendu markdown, échappement, fil). Hub : 317 tests qui passent (les 2 fichiers des commissions échouent toujours, photo de référence absente). Build et ESLint (configuration temporaire hors dépôt) sans remarque. Sur le vrai `0929-2.json` : 203 mots, 65 lignes, aucun avertissement. Pas de test SQL : aucune migration, et la lecture de `sous_titres` comme l'envoi d'une `correction_sous_titres` sont déjà couverts par `10_tests_rls.sql`.

### Tester à la main (3 points)

Agent en simulation (`npm run simule` dans `video-neo/agent`), un montage avec une version.

1. **Panneau** : les lignes et leurs débuts s'affichent sous la bande ; cliquer « 1,2 s » place le lecteur à 1,2 s. Allonger une ligne au-delà de 24 caractères : avertissement orange, « Appliquer » reste actif. Retirer un mot : erreur rouge, « Appliquer » désactivé. « Annuler mes changements » remet le texte d'origine.
2. **Envoi** : corriger un mot, Appliquer. Le panneau et le champ de demande se désactivent (« attend son tour »), le fil montre « Correction des sous-titres à la main (1 mot) ». Dans l'éditeur SQL, la tâche a `payload` `{"corrections":[{"mot":…,"texte":"…"}]}`. La version suivante arrive, et son `sous_titres` contient le mot corrigé.
3. **Sortie et markdown** : avec une correction non envoyée, cliquer « Retour aux montages » ou recharger : confirmation demandée. Une réponse de l'agent avec `##` et un tableau s'affiche en titre et en tableau.

## Étape 8b : retirer un mot des sous-titres (3 oct. 2026)

Toujours derrière `VITE_MONTAGE_VIDEO=true`. **Aucune migration** (le `payload` de `video_taches` n'a pas de contrainte ; `10_tests_rls.sql` inchangé) et **agent inchangé dans ce dépôt** : il sait retirer un mot depuis ee2a41d (`feat/agent-hub` de video-neo).

Contrat vérifié dans `video-neo/agent/README.md` (« Sous-titres ») et `agent/src/taches.ts` (`appliquerCorrections`) :
- `{ "mot": n, "supprimer": true }` retire le mot ; il se mélange aux `{ "mot": n, "texte": "..." }` dans `corrections`. Les autres mots gardent leur minutage.
- Dans une même tâche, **tous les numéros sont ceux d'avant la tâche** : retirer le mot 3 ne décale pas la correction du mot 7.
- Refus de l'agent : numéro inexistant, texte vide sans `supprimer`, même mot corrigé et retiré, tous les mots retirés (compte = longueur de `mots` dans le fichier). Réponse de la version : « « Hux » → « Hugues », « euh » supprimé ».

Hub :
- `montageSousTitres.js`, `correctionsLigne` : avec moins de mots qu'à l'origine, les mots retirés sont ceux qui ressemblent le moins au texte tapé (identique, puis identique aux accents et à la ponctuation près, puis début commun), dans l'ordre. Ex. « passées 40 ans, » → « passé ans, » : `passées` corrigé en « passé », `40` retiré. Une ligne vidée retire tous ses mots. Même nombre de mots ou plus : inchangé (mot par mot, les mots en trop rejoignent le dernier).
- `erreurCorrections` (garde-fous, mêmes refus que l'agent) : « Un même mot ne peut pas être à la fois corrigé et retiré. » et « Tu ne peux pas retirer tous les mots des sous-titres : garde au moins un mot. ». Affiché sous la liste, « Appliquer » désactivé. `tacheCorrection` le revérifie : une tâche fautive ne part pas.
- **Numéros à jour** : `corriger(corrections, { numeroBase, totalMots })` (`useMontageEditeur.js`) relit dans la base `version_courante` et les tâches `en_attente`/`en_cours` du montage juste avant l'insertion (`erreurBase`). Si une autre version est arrivée ou si une autre demande attend (la sienne peut retirer des mots), rien ne part : message clair et rechargement de l'éditeur ; les brouillons de l'ancienne version sont oubliés, on corrige sur les sous-titres relus. Comme avant, une ancienne version affichée est en lecture seule et le panneau est désactivé tant qu'une tâche du montage attend ou tourne.
- `PanneauSousTitres.jsx` : « N mot(s) retiré(s) : les autres mots gardent leur minutage. » sous la liste.
- `montageEditeur.js` : dans le fil, « Correction des sous-titres à la main (1 mot corrigé, 1 mot retiré) » ou « (2 mots retirés) » ; sans retrait, inchangé (« (2 mots) »). `messageErreurEnvoi` rend tel quel un refus du hub (`err.clair`).

Tests : `montageSousTitres.test.js` (37 : retrait sur la ligne, choix du mot retiré, ligne vidée, mot répété, mélange trié par numéro d'origine, garde-fous, tâche fautive, numéros à jour, libellés du fil) et `sousTitres.test.jsx` (13 : retrait permis et compté, tout retirer bloqué). Pas de test SQL : aucune migration.

### Tester à la main (3 points)

Agent réel (ee2a41d ou plus récent) ou en simulation, un montage avec une version.

1. **Retrait** : effacer « euh » d'une ligne : « 1 mot retiré » sous la liste, Appliquer actif. Appliquer : le fil montre « Correction des sous-titres à la main (1 mot retiré) », la tâche a `payload` `{"corrections":[{"mot":…,"supprimer":true}]}`. La version suivante n'a plus le mot dans `sous_titres` et le panneau affiche ses nouvelles lignes.
2. **Garde-fou** : vider toutes les lignes : message rouge « Tu ne peux pas retirer tous les mots… », Appliquer désactivé.
3. **Numéros périmés** : ouvrir le même montage dans deux onglets. Dans le premier, retirer un mot et Appliquer. Dans le second (sans recharger, avant la nouvelle version), corriger un mot et Appliquer : message « Une autre demande vient d'être envoyée… » (ou « Une nouvelle version (vN) est arrivée… »), aucune tâche créée, l'éditeur se recharge.

## Étape 9 : restaurer une version et Terminer (3 oct. 2026)

Toujours derrière `VITE_MONTAGE_VIDEO=true`. **Aucune migration** (le RLS laisse déjà le module créer `restaurer` et `terminer`, et `lien_drive_export` se lit déjà) et **agent inchangé**.

Contrat vérifié dans `video-neo/agent/src/taches.ts` (`restaurer`, `terminer`) et `agent/src/drive.ts` (`cheminExport`, `exporter`) :
- `restaurer` : payload `{ "version": k }`. Refus si k est la version actuelle ou introuvable (le montage garde son statut). L'agent remet les fichiers du commit de la vk sur la branche, fait un commit et **crée la version n+1 identique à la vk** : aperçu recopié (pas de rendu), `sous_titres` de la vk, prompt « Revenir à la version k », réponse « Retour à la version k. ». Rien n'est supprimé, les clips ne changent pas, la session Claude continue (le tour suivant reprend la conversation).
- `terminer` : payload `{}` (comme `npm run essai:terminer`). Rendu HD de la **version actuelle** à la taille de la composition (1080 x 1920 en 9:16, 1080 x 1350 en 4:5, 1080 x 1080 en 1:1), CRF 16, -14 LUFS. Pendant le rendu : `statut='rendu'`, `etape` « Rendu final HD (x %) », `progression` de 1 à 95, puis « Export dans Google Drive ». Copie dans `NEO vidéo/Out/<titre nettoyé>/<titre>_v<n>.mp4` (jamais d'écrasement : refus si le fichier existe, le montage garde son statut). Fin : `statut='termine'`, `lien_drive_export` = ce **chemin** (pas une URL).
- Erreur pendant le rendu ou la copie : tâche et montage en `erreur` avec le message.
- L'agent ne refuse aucune tâche sur un montage `termine` : le verrou après Terminer est une règle du hub.

Hub :
- `src/lib/montageFin.js` : tâches `restaurer` et `terminer`, états des boutons, textes de confirmation, chemin d'export prévu (même règle `nomExport` que l'agent), `lienExport`.
- `ActionConfirmee.jsx` : bouton puis confirmation sur place (ce que ça fait, Annuler, Confirmer), erreur d'envoi affichée.
- `FinMontage.jsx` : `RestaurerVersion` (sous la bande des versions), `BoutonTerminer` (en haut à droite, sous la pastille Mac), `BandeauTermine`, `LienExport`.
- `useMontageEditeur.js` : `lien_drive_export` lu avec le montage ; `restaurer(k)` et `terminer()` créent la tâche (ajoutée tout de suite à l'écran, comme une demande).
- `montageEditeur.js` : dans le fil, « Restaurer la version k », « Terminer et exporter en HD » ; un export réussi s'affiche à sa date avec le chemin dans Drive ; une erreur d'export invite à relancer Terminer.
- `MontageAccueil.jsx` : colonne Google Drive = « Ouvrir dans Drive » (export) puis « Vidéo source ». `lienDriveMontage` ne donne plus que la source.

Décisions :
- **Restaurer** : seulement sur une ancienne version affichée (la version actuelle n'a pas le bouton). Confirmation : « Ça crée une nouvelle version, v(n+1), identique à la vk (…). Les versions v1 à vn restent dans la bande : rien n'est perdu. Les clips ne changent pas. » Désactivé tant qu'une tâche du montage attend ou tourne (même message que le champ de demande). ~~Et pour un montage terminé~~ (retiré, étape 9b).
- **Terminer et exporter** : aucune approbation (la personne qui clique valide). Confirmation : rendu HD de la vN (taille, 30 images/s), dossier `NEO vidéo/Out/<titre>/`, nom du fichier, passage à Terminé. Désactivé sans version et pendant une tâche ; ~~caché une fois terminé~~ (étape 9b : désactivé seulement si la version actuelle est déjà exportée). Pendant le rendu, le lecteur garde l'aperçu avec « Rendu HD pour Google Drive · étape · % » et le fil montre la demande avec la barre habituelle.
- **Erreur d'export** : bandeau rouge et message de l'agent dans le fil (« Tu peux relancer « Terminer et exporter » en haut de la page »). Terminer redevient actif dès que plus rien n'est en cours. Si la vN a déjà été exportée, l'agent refuse (« existe déjà ») : il faut une nouvelle version pour réexporter.
- **Lien** : `lien_drive_export` en URL → lien direct ; en chemin → recherche Drive sur le nom du fichier (étape 9b : `drive.google.com/drive/search?safe=strict&q=<nom>_v<n>.mp4`, encodé, sans guillemets ; l'ancien format avec guillemets ne trouvait rien), chemin affiché dans le bandeau Terminé et en infobulle dans la liste.
- ~~**Après Terminer** : demande, corrections de sous-titres et Restaurer désactivés.~~ Verrou retiré à l'étape 9b. Pas de bouton « Rouvrir » pour l'instant. Il serait simple côté hub (aucune migration, l'agent accepte déjà une tâche sur un montage terminé et le remet en `montage`, puis en `apercu_pret` avec une nouvelle version ; un nouveau Terminer exporte `_v<n+1>.mp4` à côté de l'ancien, sans rien écraser). Mais `lien_drive_export` resterait sur l'ancien export jusqu'au nouveau Terminer, et le statut Terminé disparaîtrait de la liste dès la première demande.

Ce que l'agent devrait ajouter (non bloquant) : écrire dans `lien_drive_export` l'URL du fichier exporté (`https://drive.google.com/file/d/<id>/view`) au lieu du chemin. Sur le Mac, Drive pour ordinateur expose l'id dans l'attribut étendu `com.google.drivefs.item-id#S` du fichier, une fois celui-ci synchronisé (à vérifier sur le Mac). Le hub prend déjà une URL telle quelle.

Tests : `montageFin.test.js` (20 : payloads, états, confirmations, nom du dossier, lien, fil), `fin.test.jsx` (17 : bouton Restaurer absent sur la version actuelle, désactivé pendant une tâche et après Terminer, confirmations, Terminer pendant le rendu et après une erreur, bandeau Terminé, liens de la liste), `montageVideo.test.js` ajusté. Hub : 354 tests qui passent (les 2 fichiers des commissions échouent toujours, photo de référence absente). Build et ESLint (configuration temporaire hors dépôt, sans `react/no-unescaped-entities` que les fichiers existants ne respectent pas) sans remarque. Pas de test SQL : aucune migration.

### Tester à la main (3 points)

1. **Restaurer** (agent en simulation) : sur un montage en v3, afficher v1 : « Restaurer cette version » apparaît (pas sur v3). Cliquer : la confirmation parle de v4 identique à v1. Confirmer : le bouton et le champ se désactivent, puis v4 arrive (même aperçu que v1). SQL : la tâche a `payload` `{"version":1}`.
2. **Terminer réel** sur un petit montage (agent réel, quelques secondes de vidéo) : « Terminer et exporter », confirmer. Le fil montre « Rendu final HD (x %) », puis le montage passe à Terminé : bandeau vert avec le chemin, champ, sous-titres et Restaurer désactivés. Le fichier est dans `NEO vidéo/Out/<titre>/` sur le Mac et dans Drive (web).
3. **Lien** : « Ouvrir dans Drive » (éditeur et liste) ouvre la recherche Drive et le fichier y apparaît (prévoir le délai de synchro de Drive pour ordinateur).

## Étape 9b : lien Drive corrigé et plus de verrou après Terminer (3 oct. 2026)

Toujours derrière `VITE_MONTAGE_VIDEO=true`. **Aucune migration**, **agent inchangé**.

Vérifié côté base : le statut `termine` n'apparaît que dans le CHECK de `video_jobs.statut`. Ni le RLS, ni les triggers (`video_taches_avant_insert` force seulement statut, auteur et erreur), ni les tests SQL ne bloquent une tâche sur un montage terminé. Rien à changer. Côté hub : la liste n'a pas de filtre sur `termine` (le badge vient de `statutMontage`, la section « en cours » de `STATUTS_EN_TRAITEMENT`), l'accueil non plus.

Changements :
- **Lien « Ouvrir dans Drive »** (`lienExport`, éditeur et liste) : `https://drive.google.com/drive/search?safe=strict&q=<nom du fichier encodé>`, sans guillemets (format vérifié par Hugues). Une URL `https://` reste prise telle quelle.
- **Verrou retiré** : `etatEnvoi` (demande), `etatCorrection` (sous-titres), `etatRestaurer` et l'avertissement de sortie avec corrections non envoyées ne regardent plus `termine`. Une nouvelle demande fait repasser le montage en cours (c'est l'agent qui change le statut) ; un nouveau Terminer exporte `_v<n+1>.mp4` à côté de l'ancien.
- **Dernier export** (`BandeauExport`, remplace `BandeauTermine`) : affiché tant que `lien_drive_export` est rempli, quel que soit le statut. « Dernier export : <fichier> », puis « export de la version actuelle (v3) » (vert) ou « export de v3, version actuelle : v4 » (gris), le chemin et « Ouvrir dans Drive ». La colonne Google Drive de la liste garde le lien (elle ne regardait déjà que `lien_drive_export`).
- **Version exportée** (`versionExportee`) : lue dans le nom du fichier (`_v<n>.mp4`). Si l'agent écrit un jour une URL : version actuelle au moment de la dernière tâche `terminer` réussie (versions créées avant elle).
- **Terminer** : toujours visible dès qu'il y a une version. Désactivé pendant une tâche (message de la file), puis si la version actuelle est déjà exportée : « Cette version est déjà exportée, fais un changement pour créer une nouvelle version. » (l'agent refuserait : le fichier existe). La confirmation dit qu'on pourra encore demander des changements et qu'un nouvel export crée un autre fichier.

Tests : `montageFin.test.js` (26 : format du lien sans guillemets, version exportée par le nom ou par la tâche, dernier export actuel ou ancien, Terminer désactivé si déjà exportée, réactivé en v4, Restaurer permis après Terminer), `fin.test.jsx` (19 : bouton Terminer « déjà exportée », actif en v4, bandeau Dernier export dans les deux cas, lien de la liste après retour en cours), `sousTitres.test.jsx`, `montageEditeur.test.js` et `montageSousTitres.test.js` ajustés (plus de verrou). Hub : 363 tests qui passent (les 2 fichiers des commissions échouent toujours, photo de référence absente). Build et ESLint (configuration temporaire hors dépôt) sans remarque.

### Tester à la main (3 points)

1. **Lien** : sur un montage exporté, « Ouvrir dans Drive » (éditeur et liste) ouvre `…/drive/search?safe=strict&q=<nom>_v<n>.mp4` et le fichier apparaît.
2. **Après Terminer** : sur le montage terminé, Terminer est grisé avec « Cette version est déjà exportée… » ; le champ, les sous-titres et Restaurer sont actifs. Envoyer « Musique plus forte » : le montage repasse en cours, puis v<n+1> ; le bandeau dit « export de vN, version actuelle : vN+1 » et la liste garde « Ouvrir dans Drive ».
3. **Nouvel export** : Terminer sur v<n+1> crée `<titre>_v<n+1>.mp4` à côté de l'ancien dans `NEO vidéo/Out/<titre>/` ; le bandeau repasse au vert sur le nouveau fichier.

## Tester la migration en local

Avec un Postgres local vide (jamais un projet Supabase, le script refuse), migrations e et f :

```bash
PGHOST=/chemin/socket PGPORT=5432 PGUSER=postgres supabase/tests/montage_video/run.sh
```

Résultat attendu : `PASS: 191  FAIL: 0` (migrations e, f et 20261003a, puis les templates de départ, puis l'éditeur, puis les clips, puis les templates proposés, puis les variantes). Sur le Mac : `brew install postgresql@17`, puis un Postgres jetable (`initdb`, `pg_ctl ... -o "-k '' -p 54329"`) et `PGHOST=localhost PGPORT=54329`.

## Étape 10a : templates proposés et approbation (3 oct. 2026)

Toujours derrière `VITE_MONTAGE_VIDEO=true`. **Agent inchangé.**

Contrat vérifié dans `video-neo/agent/src/taches.ts` (`enregistrerStyle`) et dans la base :
- Tâche `enregistrer_style`, payload `{ "template_id" }`. L'agent **refuse un template qui n'est pas `approuve`** ; sinon il crée `style/<slug du nom>` depuis le commit de la version `numero_version` (à défaut `version_courante`), demande à Claude le skill et le modèle `_Modele<Nom>.tsx`, rend l'aperçu, puis écrit `reference_video_neo`, `chemin_apercu` (`templates/<id>/apercu.mp4`) et `style_enregistre = true`. Sans `job_id` : refus.
- C'est **la base** qui crée cette tâche quand Hugues passe le statut à `approuve` (trigger `video_templates_approuve`, `job_id` vide, au nom de Hugues). Le RLS interdit à info@ de la créer.
- Seul `is_hugues()` change le statut (trigger `video_templates_avant_update`) ; info@ ne modifie que sa proposition ouverte (politique `video_templates_update`).

**Écart avec la demande initiale** : « proposer → enregistrer le style → aperçu → approuver » n'est pas possible sans changer l'agent (il refuse un template non approuvé, et info@ ne peut pas créer la tâche). Ordre retenu : proposer (aucune tâche) → Hugues regarde **l'aperçu de la version proposée** (`apercus/<job>/v<n>.mp4`) et approuve → la base crée `enregistrer_style` → l'aperçu du template remplace celui de la version. Le template n'entre dans la galerie de l'étape 2 qu'une fois `style_enregistre` vrai.

Migration `20261003d_montage_video_templates_proposes.sql` (additive, se rejoue ; appliquée sur soma-hq le 3 oct. sous le nom `montage_video_templates_proposes`. Vérifié après : 2 colonnes vides, CHECK avec `archive`, trigger `video_templates_decision`, « Pub 0929 » et « Entrevue mythe 0924 » inchangés : `approuve`, `style_enregistre` vrai, `updated_at` d'avant) :
- `video_templates.description` (texte de la proposition) et `motif_refus` (Hugues seulement, vidé à l'insertion depuis le hub).
- CHECK du statut élargi : `propose`, `approuve`, `refuse`, **`archive`**. Un archivé sort de la galerie et ne peut plus servir à un nouveau montage (`video_jobs_avant_insert` exige `approuve`) ; les montages qui l'ont utilisé gardent leur `template_id`, la branche `style/<nom>` reste.
- Trigger `video_templates_decision` (nouveau, rien de modifié) : passages permis depuis le hub `propose → approuve | refuse`, `approuve → archive`, `archive → approuve`. `approuve_par` / `approuve_le` = qui a tranché en dernier et quand (l'archivage remplace donc la date d'approbation).

Hub :
- `src/lib/montageTemplates.js` : validation, ligne insérée (`nom`, `description`, `type_video` = `neo-video-montage`, `job_id`, `numero_version`), état du bouton, statuts affichés (avec la tâche `enregistrer_style`), aperçu (version, puis template), boutons selon l'utilisateur, décisions, tri, messages du fil.
- `TemplatesMontage.jsx` : `ProposerTemplate` (sous la bande des versions), `DecisionTemplate`, `CarteTemplateListe`.
- `MontageTemplates.jsx` : page `/reseaux-sociaux/montage/templates` (accès `montageVideoAccess`), bouton « Templates » sur l'accueil à côté de Configuration (visible aussi pour info@).
- `useMontageTemplates.js` : templates du montage et de l'écran, tâches `enregistrer_style`, temps réel, `proposer`, `decider`.
- `MontageEditeur.jsx` : bouton et entrées du fil ; `filConversation` accepte `autres` (blocs datés).
- `useMontageVideo.js` : galerie de l'étape 2 = `statut = 'approuve'` **et** `style_enregistre`.

Décisions :
- **Version proposée** : celle affichée dans la bande (l'agent enregistre `numero_version`, pas forcément l'actuelle). Bouton désactivé pendant une tâche du montage (même message que le champ) et si cette version a déjà une proposition non refusée.
- **Fil** : « Proposer la vN comme template « X » » à sa date, puis l'état (attente de Hugues, style en préparation / en attente du Mac / erreur de l'agent, dans la galerie, refusé avec motif, archivé). La tâche `enregistrer_style` n'a pas de montage : son avancement est un état, pas une barre (l'agent n'écrit pas de progression pour elle).
- **Approuver** : seulement avec un aperçu de la version disponible. Refuser : motif facultatif (200 caractères). « Retirer de la galerie » (archiver) sur un approuvé, avec confirmation. Pas de bouton pour remettre un archivé (la base le permet).
- **info@** : voit tous les templates et leurs statuts, aucun bouton de décision (et la base refuse de toute façon : tests SQL).

Tests : `montageTemplates.test.js` (20 : validation, payload, bouton, statuts, aperçu, boutons Hugues / info@, décisions, tri, fil), `templates.test.jsx` (15 : formulaire, états désactivés, boutons selon l'utilisateur, liste). `50_tests_templates_proposes.sql` (36 : proposition forcée à `propose` sans tâche ni motif, absente de la galerie, info@ ne peut ni approuver, ni refuser, ni écrire un motif, ni créer `enregistrer_style`, ni archiver ; refus motivé ; approbation → tâche `{ template_id }` ; galerie après `style_enregistre` ; archivage qui garde les montages et bloque les nouveaux ; passages interdits ; hors liste, non connecté). `run.sh` → `PASS: 175  FAIL: 0`. Hub : 398 tests qui passent (les 2 fichiers des commissions échouent toujours, photo de référence absente). Build et ESLint (configuration temporaire hors dépôt) sans remarque.

Pour l'agent (non bloquant) : écrire `etape` / une progression pour `enregistrer_style` (aujourd'hui aucune) permettrait une barre dans l'écran Templates. S'il fallait un aperçu « style enregistré » **avant** l'approbation, l'agent devrait accepter `enregistrer_style` sur un template `propose` et la base laisser info@ créer la tâche.

### Tester à la main (3 points)

1. **Proposer puis approuver (test réel)** : comme info@, dans l'éditeur d'un montage en v2, afficher v2, « Proposer comme template », nom et description, Proposer. Le fil montre la proposition « en attente de l'approbation de Hugues » ; le bouton dit « déjà proposée ». « Nouvelle vidéo » : le template n'est pas dans la galerie. Comme hugues@, Templates : la carte « Proposé », « Voir l'aperçu de la v2 », Approuver. Statut « Approuvé, style en préparation », puis (agent réel, quelques minutes, coûte un appel Claude) « Approuvé », aperçu du template, branche `style/<nom>` dans video-neo ; la carte apparaît dans la galerie de « Nouvelle vidéo ».
2. **Refus et info@** : proposer une autre version, la refuser avec un motif : connecté comme info@, la page Templates montre « Refusé » et le motif, et aucun bouton Approuver, Refuser ou Retirer sur aucune carte (le refus côté base est couvert par les tests SQL).
3. **Archiver** : sur le template approuvé, « Retirer de la galerie », confirmer : « Archivé », disparu de la galerie, le montage qui l'a utilisé s'ouvre toujours normalement.

## Étape 10b : variantes (3 oct. 2026)

Toujours derrière `VITE_MONTAGE_VIDEO=true`. **Agent inchangé** (lu seulement, branche `feat/agent-hub`).

Contrat vérifié dans `video-neo/agent/src/taches.ts` (`variante`), `prompts.ts` (`promptVariante`, `DIMENSIONS`), `clips.ts` (`copierClipsVariante`) et `outils/remotion.ts` :
- Tâche `variante` posée sur le **montage d'origine** (`job_id`), payload `{ "format"?: "4:5" | "1:1", "hook"?: "...", "prompt"?: "consigne" }`, au moins un. Un format égal à celui du montage, sans hook ni consigne, est refusé. Montage sans version : refus.
- L'agent crée un **nouveau montage** `<titre> (variante <étiquette>)` (étiquette `4:5`, `1:1`, `hook` ou `4:5, hook`) avec `format`, `prompt` (la description), `nom_source`, `cree_par` de la tâche, statut `montage`. Il recopie tous les clips (ordre, rôles), les sous-titres, part de la branche de l'original (version actuelle), bifurque la session Claude, **appelle Claude** puis rend la **v1** (aperçu, commit). Le template n'est pas recopié. L'original ne bouge pas. En cas d'échec : la variante passe en erreur et la tâche aussi (« La variante n'a pas pu être créée : … »).
- Aperçu réel : 540 de large, à la taille de la composition, donc 540 x 960, 540 x 675 (4:5) ou 540 x 540 (1:1). En simulation (`--simule`), l'aperçu factice reste 540 x 960 quel que soit le format.
- **Aucun lien vers l'origine n'est écrit** (seulement dans le message du commit git). D'où la migration ci-dessous, que l'agent doit remplir.

Migration `20261003e_montage_video_variantes.sql` (additive, se rejoue ; appliquée sur soma-hq le 3 oct. sous le nom `montage_video_variantes`. Vérifié après : colonne vide sur les 5 montages, trigger `video_jobs_variante` présent à côté des trois d'avant) :
- `video_jobs.variante_de` (uuid, référence `video_jobs`, `ON DELETE SET NULL`) et un index partiel.
- Trigger `video_jobs_variante` (nouveau) : forcé à vide quand le hub insère un montage. Une modification depuis le hub est déjà refusée par `video_jobs_avant_update` (titre seul). L'agent (`service_role`) l'écrit librement.

Hub :
- `src/lib/montageVariantes.js` : types (un seul à la fois, le format actuel du montage n'est pas proposé), validation (hook obligatoire, 500 caractères ; consigne facultative, 1000), payload, titre prévu (même règle que l'agent), état du bouton, variantes d'un montage, cadre du lecteur par format.
- `montageEditeur.js` : texte d'une tâche `variante` dans le fil ; variante faite = demande puis « Variante créée » à sa date ; variante en cours marquée (pas de barre : la progression est sur le nouveau montage).
- `VariantesMontage.jsx` : `CreerVariante` (sous la bande des versions), `LienOrigine`, `ListeVariantes` (éditeur), `LiensVariantes` (liste).
- `LecteurApercu.jsx` : cadre au format du montage (9:16, 4:5, 1:1) pour l'aperçu et l'état de préparation, `object-contain`.
- `useMontageEditeur.js` : `variante_de` lu, variantes du montage (temps réel filtré sur `variante_de`), titre de l'origine, `creerVariante()`.
- `MontageEditeur.jsx` : « Variante de <origine> » sous le titre, « Format 4:5 » à côté de la version, panneau « Variantes (n) », pas de bandeau « Nouvelle version en préparation » pendant une variante (ce lecteur ne change pas).
- `MontageAccueil.jsx` / `useMontageVideo.js` : `variante_de` lu ; sous le titre, « Variante de <origine> » ou « Variante : <liens> ».

Décisions :
- **Version actuelle seulement** : l'agent part de la version actuelle, donc le bouton n'apparaît que lorsqu'elle est affichée. Il est désactivé pendant une tâche du montage (même message que le champ), mais reste actif sur un montage terminé.
- **Titre** : celui de l'agent (`<titre> (variante hook)`), affiché d'avance dans le formulaire. Le hub ne le choisit pas. Deux variantes « hook » du même montage ont le même titre, et on peut les renommer (titre modifiable depuis le hub).
- **Pas de contournement** : tant que l'agent n'écrit pas `variante_de`, la variante apparaît dans la liste comme un montage normal, sans lien. Le hub ne devine pas l'origine par le titre.

**Ce que l'agent doit ajouter** (bloquant pour les liens) : dans `variante`, `creerJob({ …, variante_de: parent.id })` (`Job` : ajouter `variante_de: string | null`), et un test du circuit qui vérifie `v.variante_de === parent.id`. Non bloquant : accepter un titre ou un suffixe (`payload.titre`) pour distinguer deux variantes « hook » ; en simulation, rendre l'aperçu factice au format (`DIMENSIONS[format]` mis à 540 de large).

Tests : `montageVariantes.test.js` (19 : payloads des trois types, validation, types selon le format, titre prévu, états, variantes d'un montage, fil, cadres), `variantes.test.jsx` (17 : formulaire, un seul type coché, hook obligatoire, consigne facultative, 4:5 absent d'un montage 4:5, états désactivés, lecteur 9:16 / 4:5 / 1:1, liens éditeur et liste, fil de l'origine). `60_tests_variantes.sql` (16 : demande hook et 4:5 forcée `en_attente` au nom de info@, `variante_de` forcé à vide depuis le hub et non modifiable, écrit par l'agent, lu par Hugues, renommage permis, hors liste, non connecté, suppression de l'origine qui garde la variante). `run.sh` → `PASS: 191  FAIL: 0`. Hub : 434 tests qui passent (les 2 fichiers des commissions échouent toujours, photo de référence absente). Build et ESLint (configuration temporaire hors dépôt) sans remarque.

### Tester à la main (3 points)

1. **Autre hook (test réel, agent réel, coûte un appel Claude)** : sur un montage en v2 (version actuelle affichée), « Créer une variante », « Autre hook », écrire un hook, Créer. Bouton et champ désactivés (« attend son tour »), le fil montre « Créer une variante (autre hook : « … ») ». SQL : tâche `variante`, `payload` `{"hook":"…"}`. Le nouveau montage `<titre> (variante hook)` apparaît dans la liste et arrive à sa v1 avec la nouvelle ouverture ; l'original reste en v2. Les liens « Variante de » n'apparaîtront qu'une fois l'agent modifié (`variante_de`).
2. **Format 4:5** : même chose avec « Format 4:5 » sans consigne. Dans l'éditeur de la variante, le lecteur est en 4:5 (pas étiré, pas dans un cadre 9:16), avec « Format 4:5 » sous le titre. Sur la variante, « Créer une variante » ne propose plus 4:5.
3. **Liens** (après l'ajout de `variante_de` dans l'agent, ou en SQL sur une variante de test : `update video_jobs set variante_de='<origine>' where id='<variante>';`) : « Variante de <origine> » dans l'éditeur et la liste, panneau « Variantes (1) » dans l'éditeur de l'origine, « Variante : <titre> » sous l'origine dans la liste.
