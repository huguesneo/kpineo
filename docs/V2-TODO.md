# Espace de vente v2 : à faire et décisions qui t'appartiennent

## À faire par l'équipe

- **Liliane : créer les objectifs `daily_calls` et `daily_bookings` dans `objectives`**
  pour chaque setter (scope `individual`, période couvrant les jours visés). Sans eux,
  le bandeau setter affiche le nombre d'appels sans barre de progression, et
  « Objectif à définir » sous les RDV bookés (la maquette montre « / 60 » et « Objectif du jour : 6 »).
- **Hugues : créer les 4 workflows GHL** décrits dans `docs/V2-WEBHOOKS-GHL.md`
  (étape modifiée, statut de RDV, RDV créé, tag `app-tentative-faite`). Sans le
  workflow 4, « Pas de réponse » écrit la note et pose le tag, mais la carte ne change pas d'étape.
- **Objectifs `setter_showup_target` du mois** : il n'en existe aucun pour septembre 2026
  (les deux derniers datent de mai). La tuile « Commission du mois » et la bannière du
  scoreboard n'affichent « il te manque » que si l'objectif du mois existe.
- **Objectif d'équipe `team_cash_target`** : aucun. Le scoreboard affiche « Objectif à définir »
  et pas de repère de rythme. La contrainte `objectives_scope_check` n'accepte que
  `individual` et `clinic` : crée-le en `scope = 'clinic'`, `user_id` nul, période = le mois.

## Bientôt disponible (aucune donnée aujourd'hui)

- **Portrait Léo** : zone « Bientôt disponible » dans la carte « Prochain RDV » du closeur.
  Le badge « Portrait Léo manquant » de la maquette setter n'est pas affiché. Décision à
  prendre : où vit le résumé (champ GHL, table Supabase, questionnaire) ?
- **Nombre de tentatives** : déduit de l'étape du pipeline setting (Nouveau = 0/4 …
  4 tentatives = 4/4). Décision à prendre : un champ GHL « tentatives » fiable, ou on garde l'étape ?
- **« Prochaine action » des décisions** (maquette 02) : aucune donnée structurée ;
  la carte affiche le montant de l'opportunité à la place.
- **« Relance convenue »** (file Chaud à relancer) : aucune date de relance stockée ;
  la colonne montre le dernier changement d'étape.
- **Badge rouge « urgent » sur « Mon espace » dans le menu** (maquette 05) : pas fait,
  pour ne pas charger les files dans le menu à chaque page. Le compteur est sur le
  commutateur « Je sette / Je close ».

## Technique

- **Nouveau contact test « Hugues Pugliese » `7YH2RvXCKE2tFcWH4IPM`** : pas dans
  `TEST_CONTACT_IDS` (`src/lib/commissions/config.js`), donc sa carte apparaît dans la
  file « À appeler » et pourrait compter en commission. À ajouter (hors de cette branche :
  le moteur de commissions n'y est pas modifié).
- Cron `ghl-incremental-sync` : il s'authentifie avec la clé anon publique. Un secret
  dédié fermerait la dernière porte (`sync_incremental` reste appelable avec la clé anon).

- Nettoyer les 227 remarques ESLint des fichiers existants, puis étendre les règles
  complètes à tout `src/` (voir `.eslintrc.cjs`).
- `MetaAds.jsx` est exclu du lint tant qu'il n'est pas nettoyé.
- Quand la v2 sera adoptée : retirer les tâches `setter_shared_tasks`, `ghl-setter-task`
  et l'accordéon `SetterTaskBoard` (non touchés dans cette branche, volontairement).
