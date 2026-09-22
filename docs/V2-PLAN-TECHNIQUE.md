# Espace de vente v2 : plan technique

Branche `feat/espace-vente-v2`, partie de `main` @ `b266251`. Rien n'est retiré :
les nouveaux écrans vivent à côté des anciens, derrière `VITE_ESPACE_VENTE_V2`.

## Fichiers créés

| Fichier | Rôle |
| --- | --- |
| `src/lib/v2/featureFlag.js` | Lecture de `VITE_ESPACE_VENTE_V2` |
| `src/lib/v2/salesConfig.js` | Pipelines, étapes, calendriers, champs, délais (importe `commissions/config.js`) |
| `src/lib/v2/setterFiles.js` (+ test) | Calcul pur des 4 files setter |
| `src/lib/v2/closerDecisions.js` (+ test) | Âge et couleur des décisions, RDV « à statuer » |
| `src/lib/v2/scoreboard.js` (+ test) | Agrégats du scoreboard |
| `src/hooks/v2/useRealtimeRefetch.js` | Abonnement Realtime + debounce 2 s + secours 5 min |
| `src/hooks/v2/useSetterFiles.js` | Charge opps/RDV, calcule les files |
| `src/hooks/v2/useLeadLocks.js` | Verrou 15 min (`lead_locks`) |
| `src/hooks/v2/useSetterDayStats.js` | Bandeau du jour setter |
| `src/hooks/v2/useCloserAgenda.js` | RDV, décisions, setter lié, Realtime |
| `src/hooks/v2/useScoreboard.js` | Données du scoreboard |
| `src/components/v2/*` | Cartes, files, bandeau, onglets, segment |
| `src/pages/v2/SetterJournee.jsx` | Setter « Ma journée » |
| `src/pages/v2/CloseurAgenda.jsx` | Closeur « Mon agenda et mes deals » |
| `src/pages/v2/MonEspace.jsx` | Commutateur « Je sette / Je close » |
| `src/pages/v2/Scoreboard.jsx` | Scoreboard d'équipe (`?tv=1`) |
| `supabase/migrations/20260922_v2_lead_locks.sql` | `lead_locks`, `v2_call_attempts`, Realtime |
| `supabase/functions/ghl-add-contact-tag/index.ts` | Ajout d'un tag à un contact (calquée sur `ghl-add-contact-note`) |
| `.eslintrc.cjs` | Config ESLint (le dépôt n'en avait pas) |
| `docs/V2-*.md` | Plan, décisions, TODO, tests, webhooks GHL |

## Fichiers existants touchés (ajouts seulement)

| Fichier | Endroit | Changement |
| --- | --- | --- |
| `.env.example` | fin du fichier | `VITE_ESPACE_VENTE_V2=true` |
| `src/App.jsx` | imports (après la ligne 29) et routes (après `/reseaux-sociaux`, ligne 115) | routes `/mon-espace-v2` et `/scoreboard`, seulement si le flag est actif |
| `src/components/layout/Sidebar.jsx` | entrées Closer / Setter / Calendrier (lignes 263-302) et « Mon Espace » (ligne 316) | flag actif : entrée « Mon espace » vers `/mon-espace-v2`, entrée « Scoreboard », Closer/Setter/Calendrier masqués (toujours routables) |
| `supabase/functions/ghl-webhook/index.ts` | après le bloc opportunités | payload de workflow (`customData`), types `Appointment*`, log par appel |

Aucun hook existant n'avait besoin d'un nouvel export : les nouveaux hooks
importent ce qui est déjà exporté (`useCloserAppointments`, `saveStatusToEOD`,
`saveRowChangesToEOD`, `fetchAllRows`, `closerFieldMatches`…).

## Données manquantes (état « Bientôt disponible »)

- Portrait Léo (résumé du prospect) : aucune source.
- Nombre de tentatives en champ GHL : déduit de l'étape (`tentative1..4`).
- Objectif d'équipe `team_cash_target` : la contrainte `objectives_scope_check`
  n'accepte pas `scope = 'team'` ; lu en `team` ou `clinic`, sinon « Objectif à définir ».
- Maquettes Claude Design : non importées (voir `V2-DECISIONS.md`).
