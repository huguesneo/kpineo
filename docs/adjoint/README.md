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
- Toast « Annuler » de 6 secondes : l'appel à `leo-adjoint` n'est fait qu'à la fin du délai (`src/lib/adjoint/envoiDiffere.js`).

### Journal dans le payload

`hub_decided_by`, `hub_decided_at`, `hub_execution`, `hub_ack`, `hub_rejet`, `hub_traite_main`, `hub_redaction` (consigne et brouillon de Léo), `hub_html_leo` (le html de Léo avant modification), `hub_make_erreur`, `hub_slack_erreur`.

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
```

## Migration (projet Clinique)

`docs/adjoint/20261023a_leo_traite_manuellement.clinique.sql` : appliquée le 23 oct. 2026 à 13 h 30. Trace seulement, hors de `supabase/migrations` pour qu'un `db push` sur neo-admin ne la rejoue pas.
