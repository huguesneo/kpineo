# Espace de vente v2 : plan technique

Branche `feat/espace-vente-v2`, partie de `main` @ `b266251`. Rien n'est retiré :
les nouveaux écrans vivent à côté des anciens, derrière `VITE_ESPACE_VENTE_V2`.

## Fichiers créés

| Fichier | Rôle |
| --- | --- |
| `src/lib/v2/featureFlag.js` | Lecture de `VITE_ESPACE_VENTE_V2` |
| `src/lib/v2/salesConfig.js` | Pipelines, étapes, calendriers, champs, délais (importe `commissions/config.js`) |
| `src/lib/v2/setterFiles.js` (+ test) | Calcul pur des 4 files setter, RDV bookés du jour |
| `src/lib/v2/closerAgenda.js` (+ test) | Prochain RDV, liste du jour, RDV à statuer, décisions |
| `src/lib/v2/scoreboard.js` (+ test) | Classements, rythme, bannières « il te manque » |
| `src/lib/v2/format.js` (+ test) | Heures, dates relatives, montants (fuseau Montréal) |
| `src/hooks/v2/useRealtimeRefetch.js` | Abonnement Realtime + délai de 2 s + secours 5 min |
| `src/hooks/v2/useSetterFiles.js` | Charge opps/RDV, calcule les files |
| `src/hooks/v2/useLeadLocks.js` | Verrou 15 min (`lead_locks`) |
| `src/hooks/v2/useSetterDayStats.js` | Bandeau du jour setter (réutilise `useSetterCommissions`) |
| `src/hooks/v2/useSetterActions.js` | Pas de réponse (note + tag, annulable 8 s), Booké, fiche GHL |
| `src/hooks/v2/useCloserAgenda.js` | Agenda closeur, rapport EOD du jour, statuer, Realtime |
| `src/hooks/v2/useScoreboard.js` | Données du scoreboard |
| `src/components/v2/EnteteEspace.jsx`, `SegmentMode.jsx`, `Replie.jsx` | En-tête, commutateur, blocs repliés |
| `src/components/v2/setter/BandeauJour.jsx`, `FileLeads.jsx` | Bandeau et files setter |
| `src/components/v2/closer/ProchainRdv.jsx`, `ListeAujourdhui.jsx`, `StatuerRdv.jsx`, `MesDecisions.jsx`, `CloserSemaine.jsx` | Écran closeur |
| `src/pages/v2/SetterJournee.jsx` | Setter « Ma journée » (maquette 01) |
| `src/pages/v2/CloseurAgenda.jsx` | Closeur « Mon agenda et mes deals » (maquette 02) |
| `src/pages/v2/MonEspace.jsx` | Commutateur « Je sette / Je close » (maquette 03) |
| `src/pages/v2/Scoreboard.jsx` | Scoreboard d'équipe, `?tv=1` (maquette 04) |
| `supabase/migrations/20260922_v2_lead_locks.sql` | `lead_locks`, `v2_call_attempts`, Realtime |
| `supabase/functions/ghl-add-contact-tag/index.ts` | Ajout du tag `app-tentative-faite` (calquée sur `ghl-add-contact-note`) |
| `.eslintrc.cjs` | Config ESLint (le dépôt n'en avait pas) |
| `docs/V2-*.md` | Plan, décisions, TODO, tests, webhooks GHL |

## Fichiers existants touchés (ajouts seulement)

| Fichier | Endroit | Changement |
| --- | --- | --- |
| `.env.example` | fin du fichier | `VITE_ESPACE_VENTE_V2=true` |
| `src/App.jsx` | imports (après la ligne 29) et routes (après `/reseaux-sociaux`) | routes `/mon-espace-v2` et `/scoreboard`, seulement si le flag est actif |
| `src/components/layout/Sidebar.jsx` | import, `v2Actif`, entrées Closer / Setter / Calendrier, « Mon Espace », « Naturopathe » | flag actif : « Mon espace » vers `/mon-espace-v2` ; Closer/Setter/Calendrier masqués (toujours routables) ; l'ancien « Mon Espace » devient « Mon dossier » s'il menait à `/mon-dossier` ; « Scoreboard » pour admin et resp_vente |
| `.claude/launch.json` | nouvelle entrée | serveur `espace-vente-v2` sur le port 5181 |
| `supabase/functions/ghl-webhook/index.ts` | après le bloc opportunités | payload de workflow (`customData`), types `Appointment*`, log par appel |

Aucun hook existant n'avait besoin d'un nouvel export : les nouveaux hooks
importent ce qui est déjà exporté (`useCloserAppointments`, `saveStatusToEOD`,
`saveRowChangesToEOD`, `fetchAllRows`, `closerFieldMatches`…).

## Données manquantes (état « Bientôt disponible »)

- Portrait Léo (résumé du prospect) : aucune source.
- Nombre de tentatives en champ GHL : déduit de l'étape (`tentative1..4`).
- Objectif d'équipe `team_cash_target` : la contrainte `objectives_scope_check`
  n'accepte pas `scope = 'team'` ; lu en `team` ou `clinic`, sinon « Objectif à définir ».
