# Espace de vente v2 : workflows GHL à créer

GHL n'envoie ses événements natifs (`OpportunityStageUpdate`, suppressions…) qu'aux
apps Marketplace : `ghl-webhook` n'a rien reçu en 90 jours. La source fiable, ce sont
les **actions Webhook des workflows**. Ces 3 recettes (workflows 1 à 3) font bouger les écrans v2 en
temps réel (Supabase Realtime est déjà actif sur `ghl_opportunities` et `ghl_appointments`).

## État au 2 oct. 2026 : les workflows 1 à 3 sont créés et fonctionnent

Vérifié dans les journaux de `ghl-webhook` (24 h) : 150 changements d'étape, 25 statuts de
RDV et 23 RDV créés reçus de GHL, tous acceptés (bon secret) ; 2 échecs passagers de
Supabase, rattrapés par la synchro de 30 min. Depuis le 2 oct., la fonction n'écrit plus
les valeurs du payload dans ses journaux (GHL y joint tous les champs du contact).

## Ce qui est déjà en place côté app

- `ghl-webhook` (déployée le 22 sept. 2026, version 9) accepte le payload de workflow :
  les clés de **Custom Data** (`type`, `id`) passent devant les champs natifs.
- `ghl-add-contact-tag` (déployée) pose le tag `app-tentative-faite` quand un setter
  clique « Pas de réponse ».
- Chaque appel reçu écrit une ligne `[GHL Webhook] appel reçu — type: … · id: … · source: workflow`
  dans les logs : Supabase → Edge Functions → `ghl-webhook` → Logs.

## URL commune

```
https://cbqwrmyctsfdqmenczhm.supabase.co/functions/v1/ghl-webhook?secret=VALEUR_DE_GHL_WEBHOOK_SECRET
```

`GHL_WEBHOOK_SECRET` est défini dans Supabase (Edge Functions → Secrets). Sans le bon
`?secret=`, la fonction répond 401 et ne fait rien. Si tu ne connais plus la valeur,
remplace-la par une nouvelle (`supabase secrets set GHL_WEBHOOK_SECRET=...`) et mets
la même dans les 3 workflows ci-dessous.

Méthode : **POST**. Action GHL : **Webhook** (celle qui propose « Custom Data »).
Si tu utilises plutôt **Custom Webhook**, colle le corps JSON indiqué.

---

## Workflow 1 : « Étape d'opportunité modifiée »

- **Déclencheur** : *Pipeline Stage Changed*
  - Filtre : *In pipeline* = `📞 pipeline setting`
  - Ajouter un 2ᵉ déclencheur identique avec *In pipeline* = `🎯 Vente`
- **Action** : Webhook, URL commune
- **Custom Data** :

| Clé | Valeur |
| --- | --- |
| `type` | `OpportunityStageUpdate` |
| `id` | `{{opportunity.id}}` |

Corps JSON (action Custom Webhook) :

```json
{ "customData": { "type": "OpportunityStageUpdate", "id": "{{opportunity.id}}" } }
```

Effet : la carte est relue dans GHL (champs personnalisés compris) et réécrite dans
`ghl_opportunities`. Les files setter et les décisions closeur se recalculent.

## Workflow 2 : « Statut de rendez-vous modifié »

- **Déclencheur** : *Appointment Status*
  - Filtre calendrier : les 3 calendriers découverte (`DIN6EPtG7eNU3Gf6ZRoC`,
    `ucyJmhYKKDDm7U5JmaJ8`, `4227QzeKvFczi5BZyHOC`) et le calendrier décision
    (`BQK4NoyrVNuJA3e1VHDH`)
  - Tous les statuts (confirmé, annulé, show, no-show)
- **Action** : Webhook, URL commune
- **Custom Data** :

| Clé | Valeur |
| --- | --- |
| `type` | `AppointmentUpdate` |
| `id` | `{{appointment.id}}` |

```json
{ "customData": { "type": "AppointmentUpdate", "id": "{{appointment.id}}" } }
```

Si `{{appointment.id}}` n'apparaît pas dans le sélecteur de valeurs, laisse `id` vide :
la fonction prend alors `calendar.appointmentId`, que GHL joint à tout webhook déclenché
par un rendez-vous.

Effet : le RDV est relu (`GET /calendars/events/appointments/{id}`) et réécrit dans
`ghl_appointments`. Les files « À rebooker » / « À confirmer » et l'agenda closeur bougent.

## Workflow 3 : « Rendez-vous créé / annulé »

- **Déclencheur** : *Customer Booked Appointment*, mêmes 4 calendriers
- **Action** : Webhook, URL commune
- **Custom Data** :

| Clé | Valeur |
| --- | --- |
| `type` | `AppointmentCreate` |
| `id` | `{{appointment.id}}` |

```json
{ "customData": { "type": "AppointmentCreate", "id": "{{appointment.id}}" } }
```

Une annulation est un changement de statut : le workflow 2 la couvre. Pour un RDV
**supprimé** (et non annulé), GHL n'a pas de déclencheur de workflow : la ligne reste
dans le cache jusqu'à la prochaine synchro (tâche `ghl-incremental-sync`, toutes les
30 minutes en production). Si un jour un déclencheur existe, envoyer
`{ "customData": { "type": "AppointmentDelete", "id": "…" } }` supprime la ligne.

## Workflow 4 : « Tag app-tentative-faite ajouté → étape suivante » (OBSOLÈTE, ne pas créer)

> Retiré le 2 oct. 2026 : le bouton « Pas de réponse » n'existe plus (GHL enregistre
> lui-même les appels sans réponse). Le tag `app-tentative-faite` n'est plus posé.


L'app ne déplace aucune carte. Quand un setter clique « Pas de réponse », elle écrit
une note (« Tentative n faite depuis l'app par Prénom ») et pose le tag
`app-tentative-faite`. Ce workflow fait le déplacement.

- **Déclencheur** : *Contact Tag* → *Tag Added* = `app-tentative-faite`
- **Actions** :
  1. *If/Else* sur l'étape de l'opportunité dans `📞 pipeline setting` :
     - `🆕 Nouveau lead` → *Update Opportunity* : étape `📞 1 tentative faite`
     - `📞 1 tentative faite` → `📞 2 tentatives faites`
     - `📞 2 tentatives faites` → `📵 3 tentatives faites`
     - `📵 3 tentatives faites` → `🔕 4  tentatives faites`
     - `🔕 4  tentatives faites` → à toi de choisir (ex. `🔇 Jamais joint`)
  2. *Remove Contact Tag* : `app-tentative-faite` (sinon le tag ne se redéclenche plus)

Le déplacement déclenche le workflow 1, qui met l'app à jour.

---

## Test de bout en bout (moins de 10 secondes)

1. Ouvre l'app sur `/mon-espace-v2` en mode « Je sette ».
2. Dans GHL, déplace une carte de `🆕 Nouveau lead` vers `💬 Contact établi`.
3. Dans les 10 secondes, le lead quitte « Lead à appeler » et arrive dans
   « Chaud à relancer », sans recharger la page (Realtime + délai de 2 s).
4. Dans Supabase → Edge Functions → `ghl-webhook` → Logs, une ligne
   `appel reçu — type: OpportunityStageUpdate … source: workflow` confirme l'appel.

Si rien ne bouge : vérifie le `?secret=` (un 401 apparaît dans les logs), puis que
`{{opportunity.id}}` est bien rempli (log `no id`). Sans webhook, l'app relit le cache
toutes les 5 minutes, mais le cache lui-même n'est rafraîchi par la synchro GHL que
toutes les 30 minutes (`ghl-incremental-sync`) : c'est pour ça que les workflows comptent.
