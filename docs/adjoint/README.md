# Page Adjoint (file d'approbation de Léo)

Branche `feat/adjoint-hub`. Maquette : `docs/maquettes/adjoint-v2.dc.html`.

## Comment ça marche

- Route `/adjoint`, cachée tant que `VITE_ADJOINT_HUB=true` n'est pas posé. Accès : hugues@ et info@ (`peutUtiliserAdjoint`, `supabase/functions/_shared/adjoint.js`). Cloé a le rôle `service_client`, pas `admin` ; Pierre est `admin` : la liste explicite colle à « Cloé et moi ».
- Tout passe par l'edge function `leo-adjoint` (neo-admin), qui lit le projet Clinique avec sa clé service. Rien du projet Clinique ne va dans le front, et le payload est filtré (`payloadPourEcran`).
- Les actions passent par le scénario Make 4860558 « Léo : Actions Slack », **inchangé** : `leo-adjoint` lui envoie le même formulaire que Slack (`payload` = `block_actions`).
  - `envoyer_reponse_courriel` : valeur = id de la ligne. Make envoie `payload.to/cc/subject/html`, puis classe le courriel avec `payload.gmail_message_id` et `payload.label_final`.
  - `creer_recu_commande` : valeur = **numéro de commande** (Make cherche `payload->>commande`, ligne la plus récente).
  - `valider_creneaux` : seulement pour un dossier agenda sans courriel prêt mais avec `payload.slack_texte`.
- Make répond tout de suite, puis poste son accusé à `response_url` = `leo-adjoint-ack?id=…&jeton=…`. L'accusé confirme l'envoi (`payload.hub_execution.confirme_le`, `payload.hub_ack`) et remet `decision = approved_modified` si le texte avait été modifié (Make écrit toujours `approved_as_is`).

### Ce que `leo-adjoint` complète avant d'appeler Make

Make plante après l'envoi si ces champs manquent (constaté dans le journal le 23 oct.) :

- `payload.gmail_message_id` : copié depuis la colonne (seulement 7 dossiers en attente sur 61 l'avaient dans le payload) ;
- `payload.label_final` : s'il n'est pas un id `Label_…`, on prend le libellé le plus utilisé pour la même catégorie ;
- `payload.to` : `contact_email`, sinon `payload.client_courriel`.

S'il manque encore quelque chose, l'action est refusée avant Make, avec la liste de ce qui manque.

### Protections

- Refus si la ligne n'est plus `pending` (traitée dans Slack ou dans le Hub) : message avec l'état réel. Toutes les écritures sont faites avec `decision = 'pending'` comme condition.
- Refus si un envoi Hub est déjà en cours depuis moins de 15 min (`payload.hub_execution` sans `confirme_le`).
- Commande : refus si une ligne plus récente porte le même numéro (Make prendrait celle-là).
- Slack : après chaque décision du Hub, `chat.update` remplace le message par « Traité dans le Hub par … » et retire le bouton. Si le token manque ou si Slack refuse, la décision passe quand même et l'échec est noté dans `payload.hub_slack_erreur`.
- Toast « Annuler » de 6 secondes : l'appel à `leo-adjoint` n'est fait qu'à la fin du délai (`src/lib/adjoint/envoiDiffere.js`). File d'actions : chacune part à la fin de SES 6 secondes, même si Cloé change de dossier ou en décide un autre ; un toast et un « Annuler » par action. Quitter la page pendant le délai : avertissement, puis envoi immédiat.
- `decider` relit la ligne modifiée : 0 ligne ou une décision différente = erreur, jamais un 200. Le front exige `ok: true` et affiche toute erreur en rouge.
- Bogue corrigé le 23 oct. : `horloge.setTimeout(...)` levait « Illegal invocation » dans le navigateur, aucun rejet n'est parti entre 15 h 36 et 15 h 38 (test `envoiDiffere.navigateur.test.js`).

### Journal dans le payload

`hub_decided_by`, `hub_decided_at`, `hub_execution`, `hub_ack`, `hub_rejet`, `hub_traite_main`, `hub_redaction` (consigne et brouillon de Léo), `hub_html_leo` (le html de Léo avant modification), `hub_make_erreur`, `hub_slack_erreur`, `hub_gmail` (classement Gmail sur Rejeter et Déjà traité).

## Le fil Gmail dans le dossier (étape 2, partie 2)

- Le bloc gris est remplacé par le vrai fil Gmail de info@ : op `fil` de `leo-adjoint` (chargée à part, après le dossier). Fil par `gmail_thread_id`, sinon retrouvé par `gmail_message_id`.
- Tout le code Gmail est dans `supabase/functions/_shared/gmail.ts` (jeton, appels API) et `_shared/gmailFil.js` (logique pure, testée : décodage MIME, nettoyage HTML, citations, sens des messages). Aucun jeton Google dans le front.
- Nettoyage : scripts, styles, iframes, formulaires, gestionnaires `on…`, liens `javascript:`, images de suivi (1×1, cachées, services connus) et images `cid:` retirés. Le corps est affiché dans un iframe `sandbox` sans scripts, avec une politique `script-src 'none'` en plus.
- Du plus récent au plus ancien, comme Gmail : le plus récent ouvert, les plus anciens repliés sur une ligne (expéditeur, date, début du texte), dépliables au clic. Messages de info@ à droite (fond teal), ceux de la personne à gauche ; citations « Le … a écrit : » repliées ; pièces jointes listées par nom et taille (pas encore téléchargeables).
- Le résumé de Léo reste en petit sous « Résumé de Léo ». Si Gmail ne répond pas ou si l'accès n'est pas configuré : « Courriel original indisponible » avec la raison, le dossier reste utilisable.
- Dossier sans id Gmail (SMS, etc.) : l'ancien bloc reste.

## Dossiers périmés (étape 2, partie 3)

- `estPerime` (`_shared/adjoint.js`) : dossier `pending` créé il y a plus de 7 jours. Badge « Périmé, à relire » dans la file et le dossier, et un encadré avec le délai.
- Sur un dossier périmé avec un brouillon de Léo (`payload.html`), le bouton principal devient « Relire et modifier » : il ouvre l'édition. Le bouton d'envoi revient ensuite. Les reçus de commande (pas de brouillon) gardent leur bouton.
- Le contrôle est dans l'écran seulement : `leo-adjoint` accepte toujours l'envoi.

## Rejeter et Déjà traité classent dans Gmail (étape 2, partie 4)

- Après la décision dans Supabase, `leo-adjoint` classe le fil dans Gmail : libellé de la catégorie (`payload.label_final` s'il est un id `Label_…`, sinon le plus fréquent pour la catégorie), et retrait de INBOX sur tout le fil (`threads.modify`).
- Résultat dans `payload.hub_gmail` : `{ classe_le, label, thread_id, par }`, ou `{ erreur, le, label, par }`.
- Si Gmail échoue, la décision passe quand même. Le dossier affiche « Non archivé dans Gmail » avec « Réessayer » (op `reclasser`, seulement sur un dossier rejeté ou traité à la main dont le classement a échoué). Une erreur rouge le signale aussi.
- Jamais `Label_137` (« Léo en cours », libellé temporaire de Léo) : s'il est dans `label_final`, on prend le libellé le plus fréquent de la catégorie (hors `Label_137`), et le classement retire aussi `Label_137` du fil. Même règle pour l'envoi par Make (`complementsMake`). Bogue du 23 oct. : 3 fils classés avec `Label_137`, réparés le jour même (`gmail-sync`, body `{ "op": "reparerLibellesTemporaires" }`, appel avec le secret ; trace dans `payload.hub_gmail.repare_le` et `label_avant`).
- Pas de fenêtre de confirmation : Rejeter et Déjà traité partent après 6 secondes, annulables.
- Un seul bandeau en bas à gauche (à droite de la barre latérale) : « 3 actions en cours · Annuler la dernière ». Il disparaît quand tout est parti. Pas de message de succès ; les erreurs restent en rouge au-dessus jusqu'à ce qu'on les ferme.
- Sélection multiple dans la file (cases à cocher, « Tout sélectionner », sauf les courriels pas encore traités par Léo) : « Rejeter la sélection » et « Déjà traité (sélection) », une seule action groupée (op `deciderLot`, 50 dossiers au plus), annulable 6 s. Chaque dossier est vérifié et rapporte son résultat ; ceux qui échouent reviennent dans la file avec une erreur rouge.
- Au 23 oct. : les 78 dossiers en attente ont un id Gmail et un libellé (35 le leur, 43 celui de leur catégorie).
- Pour Léo : un dossier fermé dans le Hub a `payload.hub_decided_by` et `decision` à `rejected` ou `traite_manuellement` ; le classement Gmail est dans `payload.hub_gmail`.

## Historique complet sur la fiche Personne (étape 2, partie 5)

- Une seule ligne du temps, du plus récent au plus ancien (`_shared/historique.js`, `fusionnerLigneDuTemps`), avec filtres par source.
- Sources, chacune chargée à part par l'op `historique` de `leo-adjoint` (`source` = `gmail`, `ghl` ou `app`). Si l'une échoue, les autres s'affichent et une pastille dit « Gmail indisponible » (ou GHL, ou App).
  - **Courriel info@** : fils Gmail où l'adresse est en from, to ou cc (25 plus récents, toutes dates). Clic = le fil complet (op `filGmail`).
  - **SMS GHL** (résumés par jour) et **Courriel GHL** : conversations du contact (cherché par courriel, puis par téléphone), via `_shared/ghl.ts` et `GHL_API_KEY`.
  - **App NEO** : `client_chats` (projet Clinique), un résumé par jour : nombre de messages, sujets (Léo, plan, équipe), début du dernier message. Pas le contenu complet.
  - **Dossiers Léo** : comme avant, clic = le dossier.

## Temps réel : courriels pas encore traités par Léo (étape 2, partie 6)

- Migration `supabase/migrations/20261023b_inbox_messages.sql` (neo-admin) : tables `inbox_messages` et `gmail_sync_etat`, lecture réservée à hugues@ et info@ (RLS), Realtime, et le cron `gmail-sync` chaque minute. Appliquée le 23 oct. 2026 avec l'accord de Hugues.
- Edge function `gmail-sync` (sans vérification JWT, mais protégée par l'en-tête `x-gmail-sync-secret` : secret généré par la base et gardé dans Vault, `gmail_sync_secret`, vérifié par `gmail_sync_secret_ok()`) : lit `users.history` depuis le dernier `historyId` (premier passage ou historyId périmé : INBOX des 3 derniers jours), copie les nouveaux courriels, met à jour les libellés (un courriel archivé ailleurs sort de la file), puis relie chaque courriel « nouveau » à un dossier Léo : même `gmail_message_id`, sinon même fil si le dossier est postérieur (`_shared/gmailSync.js`, `liaisons`).
- Ignorés : expéditeurs `@neoperformance.ca`, hors INBOX, spam, promotions, libellés Blocked, Promotion et wordpress.
- File : en tête de Tout et Courriels, badge « Pas encore traité par Léo », jamais en double avec un dossier de Léo (`courrielsNonTraites`). Mise à jour sans recharger (Realtime sur `inbox_messages`).
- Boutons : « Écrire une réponse », « Demander à Léo de rédiger », « Rejeter », « Déjà traité à la main ». Chacun crée d'abord la ligne dans `leo_service_interactions` (op `creerDepuisCourriel` : channel `courriel`, `decision = 'pending'`, `gmail_message_id`, `gmail_thread_id`, `contact_email`, `payload.to/subject`, `payload.hub_origine = 'hub'`, catégorie « Client actif/Général » pour un client actif, sinon « autre »), puis ouvre le dossier dans ce mode : même chemin Make et classement Gmail que d'habitude.
- **Pour les skills de Léo** : avant de créer une ligne pour un courriel, vérifier qu'aucune ligne de `leo_service_interactions` n'a déjà ce `gmail_message_id`. Si elle existe avec `payload.hub_origine = 'hub'` (ou une décision prise dans le Hub, `payload.hub_decided_by`), le courriel est déjà traité dans le Hub : ne rien créer.

### Nouvelle réponse dans un fil déjà traité

- Un message entrant arrivé après la fermeture d'un dossier du même fil (Hub ou Léo) n'est jamais absorbé par ce dossier : il reste « nouveau » dans la file, badge « Nouvelle réponse », fil complet visible, lien vers le dossier précédent.
- Une action dessus crée une nouvelle ligne (même fil, `hub_origine = 'hub'`, `payload.suite_de` = id de l'ancien dossier, même catégorie). L'ancienne ligne n'est jamais rouverte.
- Un dossier créé dans le Hub pour un message n'absorbe pas les autres messages du fil.
- Bogue du 23 oct. : « Re: test » (1a16a7e69730dca3) avait été relié au dossier 69b4b4be fermé 28 s plus tôt ; remis à « nouveau ».

### Avis de commande WooCommerce

- « [Neo Performance]: Nouvelle commande #… » arrive de info@ vers info@ (libellés `SENT` et `INBOX`). Exception dans `doitIgnorer` : ce n'est pas un courriel interne, c'est une commande.
- gmail-sync lit le corps complet : client et courriel (adresse de facturation) deviennent l'expéditeur de la ligne, `extrait` = « Commande n°… · client · Total … $ ».
- Affiché dans Tout et Commandes (pas dans Courriels), badge « Pas encore traité par Léo », sans boutons de courriel : Léo fait le dossier de commande ; la liaison se fait par `gmail_message_id`.
- Rattrapage du 23 oct. (`history_id` remis à vide, reprise des 3 derniers jours) : commande #8116 entrée.

### Accès Gmail : étapes dans Google Cloud

À faire une fois, connecté avec un compte administrateur de neoperformance.ca.

1. Va sur https://console.cloud.google.com, en haut à gauche clique sur le sélecteur de projet, puis « Nouveau projet ». Nom : `NEO Hub Gmail`. Crée-le et sélectionne-le.
2. Menu ☰ > « API et services » > « Bibliothèque ». Cherche « Gmail API », ouvre-la, clique « Activer ».
3. Menu ☰ > « API et services » > « Écran de consentement OAuth » (ou « Google Auth Platform »). Clique « Commencer ».
   - Nom de l'application : `NEO Hub` ; adresse d'assistance : info@neoperformance.ca.
   - Type d'audience : **Interne** (seuls les comptes neoperformance.ca peuvent autoriser, et l'autorisation n'expire pas après 7 jours).
   - Coordonnées : info@neoperformance.ca. Accepte et crée.
4. Dans le même menu, « Accès aux données » (ou « Champs d'application ») > « Ajouter ou supprimer des champs d'application ». Coche `https://www.googleapis.com/auth/gmail.modify` (tu peux le coller dans « Ajouter manuellement »). Enregistre.
5. « Clients » (ou « Identifiants » > « Créer des identifiants » > « ID client OAuth »). Type d'application : **Application de bureau**. Nom : `NEO Hub local`. Crée. Google affiche l'**ID client** et le **Code secret du client** : garde l'onglet ouvert.
6. Dans un terminal, dans le dossier du projet :
   ```bash
   node scripts/gmail-oauth.mjs <ID client> <Code secret du client>
   ```
   Le navigateur s'ouvre : connecte-toi avec **info@neoperformance.ca** (pas ton adresse), clique « Autoriser ». Le terminal affiche une commande `supabase secrets set …` toute prête.
7. Colle cette commande dans le terminal et lance-la. C'est tout : le fil s'affiche au prochain dossier ouvert, sans redéploiement.

Si l'écran de l'étape 3 ne propose pas « Interne » (compte Gmail hors Workspace) : choisis « Externe », ajoute info@ comme utilisateur test, puis « Publier l'application » ; sinon le jeton expire au bout de 7 jours.

Pour couper l'accès : https://myaccount.google.com/permissions avec info@, retirer « NEO Hub ».

## Secrets (projet neo-admin `cbqwrmyctsfdqmenczhm`)

```bash
supabase secrets set --project-ref cbqwrmyctsfdqmenczhm CLINIQUE_SUPABASE_URL=https://caogpyephqaohnbydvuc.supabase.co CLINIQUE_SERVICE_ROLE_KEY=<clé service du projet Clinique> LEO_ACTIONS_WEBHOOK_URL=https://hook.us1.make.com/wgmhymrnkab5yrmxs8f8k3sp3tpy7j7e SLACK_BOT_TOKEN=<xoxb du bot qui poste les messages de Léo> ANTHROPIC_API_KEY=<clé API Anthropic>
supabase secrets set --project-ref cbqwrmyctsfdqmenczhm GMAIL_CLIENT_ID=<…> GMAIL_CLIENT_SECRET=<…> GMAIL_INFO_REFRESH_TOKEN=<…>   # donné par scripts/gmail-oauth.mjs
```

`SLACK_BOT_TOKEN` doit être le token du bot qui a posté les messages de Léo (celui de la connexion Make) : Slack ne laisse un bot modifier que ses propres messages. Portée requise : `chat:write`.

## Déploiement des fonctions

```bash
supabase functions deploy leo-adjoint --project-ref cbqwrmyctsfdqmenczhm
supabase functions deploy leo-adjoint-ack --project-ref cbqwrmyctsfdqmenczhm --no-verify-jwt
supabase functions deploy gmail-sync --project-ref cbqwrmyctsfdqmenczhm --no-verify-jwt
```

## Migration (projet Clinique)

`docs/adjoint/20261023a_leo_traite_manuellement.clinique.sql` : appliquée le 23 oct. 2026 à 13 h 30. Trace seulement, hors de `supabase/migrations` pour qu'un `db push` sur neo-admin ne la rejoue pas.
