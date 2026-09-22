# Espace de vente v2 : tests

22 septembre 2026, branche `feat/espace-vente-v2`.

## Automatiques

| Commande | Résultat |
| --- | --- |
| `npm test` | 121 tests verts : les 95 existants + 26 nouveaux (`src/lib/v2/*.test.js`) |
| `npm run lint` | 0 erreur, 0 avertissement (config `.eslintrc.cjs` ajoutée, voir décision 2) |
| `npm run build` | OK (avertissement habituel de taille de bundle, déjà présent sur `main`) |

## Drapeau à `false` (ou absent)

- `isEspaceVenteV2` testé : seul « true » active la v2.
- Lecture du code : avec le drapeau inactif, `App.jsx` ne déclare ni `/mon-espace-v2`
  ni `/scoreboard` (elles retombent sur `/dashboard` comme toute URL inconnue), et dans
  `Sidebar.jsx` `v2Actif` vaut `false`. Chaque condition retrouve alors sa forme
  d'origine (`!false && …`, libellé « Mon Espace »), et l'entrée Scoreboard est masquée.
  Menu et routes sont identiques à `main`.
- Les pages `Setter`, `Closer`, `CloserCalendar`, `CentreVente`, `SaleCallScript`,
  `Taches` ne sont pas modifiées (`git diff main --stat` ne les liste pas).

## Données réelles (script lecture seule, mêmes fonctions que les écrans)

Exécuté le 22 sept. 2026 vers 19 h 45 (heure de Montréal), clé service, sans aucune écriture.

| Vérification | Résultat |
| --- | --- |
| Files setter (partagées) | À rebooker 2 · À confirmer 0 · Lead à appeler 81 · Chaud à relancer 11 (compteur du commutateur : 92) |
| À confirmer = 0 | Confirmé par SQL : les 3 RDV découverte des prochaines 24 h ont déjà leur carte Vente en « ✅ RDV confirmé » |
| Contact test « Hugues » | Apparaissait dans À rebooker : **corrigé** (exclusion de `TEST_CONTACT_IDS`) |
| Kassy (setter seule) | RDV bookés aujourd'hui 1 · show-ups du mois 0 · commission 0 $ · appels depuis l'app 0 |
| Vicky (double rôle), côté setter | Show-ups du mois 7 · commission 230 $ |
| Vicky, côté closeur | 9 RDV aujourd'hui, **4 à statuer** (épinglés) · prochain RDV le 24 sept. · 0 décision |
| Hugues (admin + closeur) | Aucun RDV sur 8 jours · 0 décision (les deux modes, voir décision 26) |
| Scoreboard | Cash du mois 29 221 $ · ventes Maude 11, Pascal 7, Vicky 7, Thibault 4, Cloé 2, Brice 1 (5 ventes sans closeur **retirées** du classement) · show-ups Maude 18, Vicky 7, Pascal 6, Brice 1 |
| Objectifs | Aucun `daily_calls`, `daily_bookings`, `setter_showup_target` (sept.), `team_cash_target` : états « Objectif à définir » attendus |
| `ghl-webhook` | Déployée (v9), répond 401 sans secret |

## Dans le navigateur

Voir la section suivante, remplie après connexion.
