# À faire dans GHL : Setting v2

L'app n'a créé ni modifié aucun workflow GHL. Voici ce qu'il faut faire à la main, dans l'ordre.
Ne touche pas à « App · RDV réservé » ni à « App · RDV statut changé » : rien ci-dessous ne les concerne.

---

## 1. Créer le champ personnalisé `date_rappel` (obligatoire)

L'app l'a cherché le 16 oct. et ne l'a pas trouvé.

1. **Paramètres → Champs personnalisés → Contact → Ajouter un champ**
2. Type : **Date** (Date Picker)
3. Nom : `date_rappel`
4. Vérifier que la clé affichée est exactement **`contact.date_rappel`**
5. Dossier : au choix (ex. « Setting »)

L'app trouvera le champ toute seule au prochain rappel. Il n'y a rien à configurer côté app.

---

## 2. Préparer le contact test (pour tester tout de suite)

Contact : **hugues.pugliese@gmail.com** (id `JGf3wgaguxMzHDdOG4cF`). C'est le seul contact que l'app a le droit de modifier dans GHL tant que l'interrupteur reste éteint.

1. Ajouter un **prénom et un nom** (aujourd'hui il n'y en a pas).
2. Ajouter un **numéro de téléphone** : sans téléphone, le bouton « Appeler » de la fiche GHL n'apparaît pas.
3. Créer une **opportunité** dans le pipeline **« 📞 pipeline setting »**, à l'étape **« 🆕 Nouveau lead »**, pour que le contact apparaisse dans la liste des setters.

> Une fois l'opportunité créée, le contact apparaît dans « Leads à rappeler » dans les 2 minutes (synchronisation GHL). Tu peux aussi ouvrir sa fiche directement :
> `http://localhost:5181/mon-espace-v2?fiche=JGf3wgaguxMzHDdOG4cF`

---

## 3. Pause des relances automatiques avec le tag `rappel-manuel` (obligatoire)

**Pourquoi :** quand un setter met un lead en rappel, l'app pose le tag `rappel-manuel` et remplit le champ `date_rappel`. Elle retire le tag à la date du rappel, ou dès qu'un résultat est enregistré ou qu'un RDV est booké. Pendant la pause, aucun courriel ni SMS automatique ne doit partir. On n'utilise pas le DND, parce que le setter doit pouvoir texter lui-même.

**Dans quels workflows :** tous ceux qui envoient un courriel ou un SMS automatique à un lead qui n'a pas encore de RDV booké. Par exemple :

- les relances de nouveaux leads (post-VSL, quiz, lead magnet) ;
- les SMS envoyés après une tentative d'appel ;
- le nurturing ;
- les relances no-show et annulation.

### A. Filtre du déclencheur, pour ne pas entrer dans le workflow

Dans chacun de ces workflows : **Déclencheur → Ajouter un filtre**.

- `Contact Tags` · **does not include** · `rappel-manuel`

### B. Garde avant chaque envoi, pour sortir du workflow en cours de route

Ajouter juste **avant chaque action « Envoyer un SMS » et « Envoyer un courriel »** :

- Action **If/Else**
  - Branche « En rappel » : condition `Contact Tags` · **includes** · `rappel-manuel`
  - Branche « En rappel » : choisis **une** des deux options ci-dessous
  - Branche « None » (sinon) : l'envoi continue normalement

Pour la branche « En rappel » :

- **Arrêter (recommandé, le plus simple) :** action **« Remove from workflow »** (Retirer du workflow). Quand le setter rappelle, c'est lui qui gère la suite.
- **Attendre :** action **Wait** · type « **Wait for condition / event** » · condition `Contact Tags` **does not include** `rappel-manuel` · délai maximum **14 jours**. Ensuite, retour à l'envoi (Go To l'action d'envoi). Le workflow reprend tout seul quand l'app retire le tag.

Après les modifications : publier le workflow et vérifier l'historique d'exécution avec le contact test (tag posé, envoi bloqué).

---

## 4. LEAD-11 · Appels des setters : vérifications (pas de modification demandée)

- L'app lit maintenant le **journal d'appels GHL toutes les 2 minutes**, en lecture seule. Elle y prend la date, l'heure, la durée et l'utilisateur GHL de chaque appel. Les webhooks actuels ne sont pas nécessaires pour ça.
- Le **nombre** de tentatives affiché vient toujours de l'étape du pipeline, donc de ce que LEAD-11 compte.
- **Après la 4e tentative** (étape « 🔕 4 tentatives faites »), le lead **sort** de la liste de l'app. Vérifie que LEAD-11 et ton nurturing déplacent bien la carte à ce moment-là, comme aujourd'hui.

---

## 5. Tags créés par l'app (rien à faire, pour information)

GHL crée les tags la première fois que l'app les pose :

- `setting-non-qualifie` : posé au résultat « Non qualifié ». En plus, la carte passe à l'étape « 🗑️ Non qualifié », elle est marquée **Perdue** et la raison va dans une note.
- `setting-pas-interesse` : posé au résultat « Pas intéressé ». En plus, la carte passe à l'étape « 🚫 Pas intéressé » et elle est marquée **Perdue** (statut lost).
- `rappel-manuel` : voir le point 3.

Si un workflow se déclenche sur « Opportunité perdue » ou sur l'étape « Non qualifié », il partira aussi quand un setter utilise ces résultats. Vérifie que c'est bien voulu.

---

## 6. Lead qui revient (lead magnet, nouvel opt-in) : vérification

L'app remontre un lead marqué « Pas intéressé », « Non qualifié » ou déjà passé en rencontre **dès que sa carte du pipeline setting change d'étape** après ce résultat.

Vérifie que tes workflows de lead magnet / opt-in, quand le contact a déjà une carte dans « 📞 pipeline setting » :
- **remettent la carte à « 🆕 Nouveau lead »**, avec l'action « Create/Update Opportunity », pipeline setting, étape Nouveau lead ;
- **remettent le statut à « Open »**. Une carte « Pas intéressé » ou « Non qualifié » est en statut Perdue, et sans ce changement elle reste perdue dans GHL même si elle s'affiche dans l'app.

Si le workflow crée plutôt une **nouvelle** carte, ça marche aussi.

---

## 7. Avant d'activer les écritures réelles

L'interrupteur se trouve dans **Mon espace** → carte admin « Non qualifiés par source » → « Activer les écritures réelles ».

À cocher avant d'activer :

- [ ] Le champ `date_rappel` est créé (point 1)
- [ ] Le filtre `rappel-manuel` est ajouté dans tous les workflows de relance (point 3)
- [ ] Tu as testé Non qualifié, Pas intéressé et Mettre en rappel sur le contact test
- [ ] Les 3 utilisateurs GHL inconnus sont reliés à un profil de l'app (voir le compte rendu : sinon, leurs appels n'assignent aucun lead)
