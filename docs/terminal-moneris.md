# Terminal de paiement Moneris

Page `/terminal` (closeurs, admin, resp_vente) et page publique `/payer/:token` (lien client).
Cachée tant que `VITE_TERMINAL_MONERIS` n'est pas `true`.

## Fonctionnement

1. Le closeur crée la vente : client, produit QuickBooks (fixe le nombre de versements), montant total, fréquence, date du 1er prélèvement.
2. La carte est saisie dans le champ hébergé par Moneris (Hosted Tokenization), par le closeur ou par le client via le lien (7 jours, usage unique, 5 essais max).
3. 1er prélèvement aujourd'hui : débit + carte enregistrée (`MERCHANT_INITIATED`). Début futur : validation sans débit + carte enregistrée.
4. `moneris-charge-due` (pg_cron, chaque jour 10 h) prélève les versements dus. Refus : nouvel essai 3 jours plus tard, 3 essais max, alerte Slack.
5. Chaque paiement réussi est envoyé au webhook Make, qui crée le reçu de vente QuickBooks (produit + champ « closers ») et l'envoie au client. Sans ce reçu, la vente n'apparaît pas dans les commissions.

## Closeur, setter, naturopathe (migration `20261007a`)

Trois menus obligatoires avant « Entrer la carte » / « Envoyer le lien » (« Aucun » permis pour le setter et la naturopathe).

- hugues@ et info@ choisissent le closeur. Les autres closeurs sont inscrits eux-mêmes (menu verrouillé, vérifié par le serveur).
- Listes (`profiles`, comptes actifs, sans compte de test) : closeurs = rôle principal ou secondaire `closer`, setters = `setter`, naturopathes = `naturopathe`.
- Préremplissage (action `attribution`, lecture seule dans GHL, d'après le courriel du client) : closeur et setter de la carte GHL (champs closeur et `setter__nom`), naturopathe = personne du RDV d'évaluation. Un menu changé à la main n'est plus écrasé.
- La vente garde `closer_id` / `closer_name` (closeur choisi), `created_by` (qui a saisi), `setter_id` / `setter_name`, `therapist_id` / `therapist_name`, `attribution_confirmed_at`.
- Reçu QuickBooks : champs « closers », « Setter », « Thérapeute » en prénoms avec majuscule ; « Aucun » = champ vide. Plus de recherche GHL au 1er reçu quand `attribution_confirmed_at` est rempli.
- Ce que lisent les chiffres : commissions closeurs = champ « closers » des reçus (closeur du 1er versement figé dans `closer_payment_tracking`) ; plan de carrière = « closers », « Setter », « Thérapeute » ; commissions setters = cartes GHL (pas le reçu).
- TRANSITION : `create_plan` sans aucun des trois champs (ancien hub) garde l'ancien comportement. À retirer dès que le hub avec les menus est en ligne.

## Bouton « Annuler » (liste des ventes)

Un seul bouton, trois choix, chacun avec une confirmation. Les choix qui ne s'appliquent pas sont grisés avec la raison.

| Choix | Qui | Effet |
|---|---|---|
| Annuler le paiement (`stop_payments`) | hugues@, info@ | Abonnement Moneris annulé, versements à venir « annulé », vente toujours active avec le badge « Prélèvements arrêtés » (`payments_stopped_at` / `_by`). Rien dans GHL. |
| Annuler le programme (`cancel_plan`) | hugues@, info@ | Comme avant : abonnement annulé, programme annulé, tag GHL `statut-client-annuler`. |
| Retirer (`remove_plan`) | le closeur de la vente, hugues@, info@ | Seulement si 0 $ encaissé, aucun reçu envoyé et aucun paiement en cours (sinon : « faire un remboursement »). Annule l'abonnement Moneris s'il y en a un (carte validée sans débit), fait expirer le lien client, met la vente « annulée » et la cache des listes. Raison obligatoire ; `removed_at` / `_by` / `_reason`. Jamais effacée. Pas de tag GHL. |

Un reçu QuickBooks ne peut pas exister pour une vente retirée : il n'est créé qu'après un paiement réussi.

Fonctions à redéployer après un changement de `_shared/ghl.ts`, `_shared/terminal.ts` ou `_shared/terminalAttribution.js` : `moneris-terminal`, `moneris-pay-link`, `moneris-webhook`.

## Configuration

Netlify (variables publiques) :

| Variable | Test | Production |
|---|---|---|
| `VITE_TERMINAL_MONERIS` | `true` | `true` |
| `VITE_MONERIS_HT_URL` | `https://esqa.moneris.com/HPPtoken/index.php` | `https://www3.moneris.com/HPPtoken/index.php` |
| `VITE_MONERIS_HT_PROFILE_ID` | profil ht… du MRC de test | profil ht… du MRC de production |

Supabase > Edge Functions > Secrets :

| Secret | Valeur |
|---|---|
| `MONERIS_API_BASE` | `https://api.sb.moneris.io` (test) / `https://api.moneris.io` (prod) |
| `MONERIS_CLIENT_ID` / `MONERIS_CLIENT_SECRET` | application « portail neo » du portail développeur |
| `MONERIS_MERCHANT_ID` | MID 13 chiffres (test : `0030137014487`) |
| `MONERIS_CRON_SECRET` | chaîne aléatoire, aussi mise dans le cron |
| `MAKE_PAYMENT_WEBHOOK_URL` | webhook Make du reçu QuickBooks |
| `SLACK_PAYMENTS_WEBHOOK_URL` | optionnel, alertes de refus |

Déploiement des fonctions : `moneris-terminal` avec vérification JWT, `moneris-pay-link` et `moneris-charge-due` sans (`--no-verify-jwt`).
Le cron est dans la migration `20261001_terminal_moneris.sql`, commenté : l'activer après les tests.

## Données envoyées à Make (par paiement réussi)

`installment_id` (clé unique, pour éviter les doublons), `client_first_name`, `client_last_name`, `client_email`, `client_phone`,
`product_name`, `closer_name`, `amount`, `installment_number`, `installments_count`, `paid_date`, `card_last4`, `moneris_payment_id`.

## Cartes de test Moneris (sandbox)

Visa `4242424242424242`, Mastercard `5454545454545454`, n'importe quelle date future et CVC.
Le montant en cents détermine la réponse du simulateur (voir « Penny Value Simulator » dans la doc Moneris).
