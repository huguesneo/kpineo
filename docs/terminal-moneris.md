# Terminal de paiement Moneris

Page `/terminal` (closeurs, admin, resp_vente). Le paiement par lien client a été retiré (non approuvé par Moneris).
Cachée tant que `VITE_TERMINAL_MONERIS` n'est pas `true`.

## Fonctionnement

1. Le closeur crée la vente : client, produit QuickBooks (fixe le nombre de versements), montant total, fréquence, date du 1er prélèvement.
2. La carte est saisie dans le champ hébergé par Moneris (Hosted Tokenization), par le closeur ou par le client via le lien (7 jours, usage unique, 5 essais max).
3. 1er prélèvement aujourd'hui : débit + carte enregistrée (`MERCHANT_INITIATED`). Début futur : validation sans débit + carte enregistrée.
4. `moneris-charge-due` (pg_cron, chaque jour 10 h) prélève les versements dus. Refus : nouvel essai 3 jours plus tard, 3 essais max, alerte Slack.
5. Chaque paiement réussi est envoyé au webhook Make, qui crée le reçu de vente QuickBooks (produit + champ « closers ») et l'envoie au client. Sans ce reçu, la vente n'apparaît pas dans les commissions.

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
