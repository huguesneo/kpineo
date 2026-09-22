# Espace de vente v2 : décisions prises seul

Une ligne par décision : contexte → choix (alternative écartée).

1. Maquettes Claude Design inaccessibles (`/design-login` ne peut pas tourner dans une session non interactive) → écrans construits à partir de la description du prompt et du style existant (Tailwind, `shared/Card`, `Button`, `Badge`) ; à ajuster une fois les maquettes relues (alternative : s'arrêter et attendre, exclu par la règle 7).
2. `npm run lint` échouait sur `main` (aucune config ESLint) → ajout de `.eslintrc.cjs` : règles complètes sur `src/**/v2/**`, seulement les règles des hooks sur l'existant, `MetaAds.jsx` exclu (alternative : corriger les 227 remarques des fichiers existants, interdit par la règle 4).
3. Les tests ont besoin de `.env` et de `scripts/baseline/` (non versionnés) → copiés depuis le dépôt principal et un autre worktree, non commités.
4. « Appels faits aujourd'hui » : les notes GHL ne sont pas conservées dans Supabase → nouvelle table `v2_call_attempts` alimentée par le bouton « Appelé, pas de réponse » (alternative : `kpi_entries.daily_calls`, qui mélangerait saisie manuelle et automatique).
5. Objection obligatoire : la logique existante l'exige quand `is_closed === false` → le bouton statuer propose Show vendu / Show pas vendu / No-show / Annulé ; « Show pas vendu » exige l'objection (alternative : l'exiger aussi pour no-show et annulé, ce que `useCloserEOD` ne fait pas).
6. Semaine du closeur : `WeekView` + `AppointmentDrawer` + `BlockSlotModal` (création de blocages) ; modifier ou supprimer un blocage existant renvoie vers `/calendrier` (alternative : recopier toute la gestion des récurrences de `CloserCalendar.jsx`).
7. Objectif d'équipe : `scope = 'team'` refusé par la contrainte de `objectives` → lecture de `type = 'team_cash_target'` en `team` ou `clinic`, sans migrer la contrainte (alternative : modifier la contrainte, touche une table existante).
8. « Il te manque X $ » closeur : `QuarterlyPanel` dépend de QuickBooks par membre → objectif `quarterly_revenue` du trimestre moins le cash du trimestre dans `closer_payment_tracking` (prénom en minuscules) (alternative : appeler `quickbooks-member-revenue` depuis le scoreboard).
9. « Il te manque » setter : même calcul que `showupsMissing` (objectif `setter_showup_target` du mois − show-ups du moteur de commissions), affiché en show-ups et en $ du bonus mensuel.
10. « Booké » : ouvre la page publique du calendrier closeurs `https://api.leadconnectorhq.com/widget/booking/ucyJmhYKKDDm7U5JmaJ8` (alternative : réserver dans l'app, hors périmètre).
11. File « À confirmer » : RDV à venir sur les calendriers découverte, statut `new` ou `confirmed`, dont la carte Vente est en `rdvBooke` ; si la carte n'est pas encore synchronisée, le RDV est gardé (alternative : l'écarter, au risque de rater des confirmations).
12. Source chaude : source contenant « VS », « VSL » ou « quiz » (insensible à la casse) ; les sources réelles sont « Optin VS » et « Site web - Guide… ».
13. Accès au scoreboard : ajout des rôles secondaires (un naturopathe qui close y a accès) en plus de `admin`, `resp_vente`, `closer`, `setter`.
