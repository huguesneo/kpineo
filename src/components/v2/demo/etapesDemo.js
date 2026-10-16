// Contenu des démos guidées « Mise à jour importante » (Setting v2, oct. 2026).
// Chaque étape éclaire un élément réel de l'écran (data-tour="…").

export const ANNONCE_SETTER = 'setting-v2-setter'
export const ANNONCE_CLOSEUR = 'setting-v2-closeur'

export const POINTS_SETTER = [
  'La fiche du lead s’ouvre dans l’app : appels, SMS, courriels, notes',
  'Bouton « Résultat » : prendre RDV, non qualifié, pas intéressé',
  'Tes leads t’appartiennent dès que tu leur as parlé',
  '« Mettre en rappel » : le lead t’attend et les relances s’arrêtent',
  'Liste triée toute seule : qui rappeler en premier',
]

export const POINTS_CLOSEUR = [
  'Les notes du setter sont dans l’écran d’appel',
  'Rencontre de décision : la fiche de la découverte est déjà remplie',
]

const t = nom => `[data-tour="${nom}"]`

// ctx : { ouvrirFicheExemple, fermerFiche, ouvrirCloseurFictif, fermerCloseurFictif }
export function etapesSetter(ctx) {
  return [
    {
      chapitre: 'Bienvenue', cible: null,
      titre: 'Ta nouvelle journée de setting',
      texte: [
        'Tu n’as presque plus besoin d’aller dans GHL : tout se fait ici.',
        'On fait le tour ensemble en 2 minutes. Utilise Suivant (ou la flèche →).',
      ],
    },
    {
      chapitre: 'Menu', cible: t('menu-mon-espace'),
      titre: 'Le compteur de tâches du jour',
      texte: 'Le chiffre sur « Mon espace » = tes tâches du jour : rappels arrivés, leads à relancer, no-shows et annulations.',
    },
    {
      chapitre: 'Tâches', cible: t('mes-taches'),
      titre: 'Mes tâches du jour',
      texte: [
        'L’app crée ces tâches pour toi. Clique sur une tâche : la fiche du lead s’ouvre.',
        'Quand une tâche arrive à échéance, une notification apparaît en bas à droite, même si tu es sur une autre page.',
      ],
    },
    {
      chapitre: 'Rappels', cible: t('mes-rappels'),
      titre: 'Mes rappels',
      texte: 'Les leads que tu dois rappeler, triés par date : en retard (rouge), aujourd’hui, à venir. Personne d’autre ne les voit.',
    },
    {
      chapitre: 'Mes leads', cible: t('mes-leads'),
      titre: 'Mes leads : ils sont à toi',
      texte: [
        'Dès que tu as parlé à un lead (appel de 60 s ou plus, ou « Contact établi »), il t’appartient : il disparaît de la liste des autres setters.',
        'Il reste à toi tant que tu ne le rends pas disponible.',
      ],
    },
    {
      chapitre: 'Nouveaux leads', cible: t('nouveaux'),
      titre: 'Nouveaux leads',
      texte: 'Les leads jamais contactés : 🔥 chauds en tête, puis du plus ancien au plus récent, avec la date d’opt-in.',
    },
    {
      chapitre: 'À rappeler', cible: t('a-rappeler'),
      titre: 'Leads à rappeler : l’ordre est fait pour toi',
      texte: [
        '« Prêt à rappeler » en haut : dernière tentative il y a 24 h ou plus, celui qui attend depuis le plus longtemps d’abord.',
        '« En attente » grisé en bas, avec le temps restant. Il remonte tout seul, sans recharger la page.',
      ],
    },
    {
      chapitre: 'À rappeler', cible: t('a-rappeler-tentatives'),
      titre: 'Les tentatives, en un coup d’œil',
      texte: 'Les pastilles = nombre de tentatives, puis quand et par qui (ex. « hier 14 h 32 · Vicky »). Après la 4e tentative, le lead sort de la liste.',
    },
    {
      chapitre: 'Résultat', cible: t('a-rappeler-resultat'),
      titre: 'Un seul bouton : Résultat',
      texte: [
        '📅 Prendre rendez-vous : ouvre le calendrier, lead prérempli.',
        '🗑️ Non qualifié : avec la raison (âge, hors cible, mauvais numéro, autre).',
        '🚫 Pas intéressé : le lead a été joint et ne veut pas de RDV.',
        'GHL est mis à jour tout seul (étape, tag, note).',
      ],
    },
    {
      chapitre: 'Fiche', cible: t('fiche'),
      avant: async () => { ctx.ouvrirFicheExemple() },
      titre: 'Clique sur un nom : la fiche s’ouvre',
      texte: 'Tout sur le lead, sans quitter la page : coordonnées, source, date d’entrée, setter assigné, rappel prévu.',
    },
    {
      chapitre: 'Fiche', cible: t('fiche-appeler'),
      titre: 'Appeler',
      texte: 'Ouvre la fiche GHL dans une fenêtre à part : clique sur le téléphone GHL pour appeler. Tes tentatives restent comptées comme avant.',
    },
    {
      chapitre: 'Fiche', cible: t('fiche-rappel'),
      titre: 'Mettre en rappel',
      texte: [
        'Le lead dit « rappelle-moi jeudi » ? Choisis la date, l’heure et une note.',
        'Le lead va dans « Mes rappels », et les courriels et SMS automatiques s’arrêtent jusqu’au rappel. Tu peux quand même lui texter.',
      ],
    },
    {
      chapitre: 'Fiche', cible: t('fiche-liberer'),
      titre: 'Rendre disponible aux autres setters',
      texte: 'Tu ne peux pas t’en occuper ? Un clic, et le lead retourne dans la liste commune pour toute l’équipe.',
    },
    {
      chapitre: 'Fiche', cible: t('fiche-appels'),
      titre: 'Les appels et l’historique',
      texte: [
        'Chaque appel avec la date, la durée et qui a appelé (« 💬 Conversation » si 60 s ou plus).',
        'Si quelqu’un d’autre a appelé dans les 24 dernières heures, un avertissement jaune s’affiche en haut : écoute l’appel avant de rappeler.',
      ],
    },
    {
      chapitre: 'Fiche', cible: t('fiche-notes'),
      titre: 'Les notes',
      texte: 'Écris une note ici : elle va aussi dans GHL, et le closeur la verra dans son écran d’appel.',
      // la fiche se referme avant la suite
    },
    {
      chapitre: 'Fiche', cible: null,
      avant: async () => { ctx.fermerFiche() },
      titre: 'Les leads fictifs « (démo) »',
      texte: 'Si une liste était vide, un lead « Marie Exemple (démo) » a servi d’exemple. Il disparaît à la fin : rien n’a été enregistré.',
      siFictif: true,
    },
  ]
}

export function etapesCloseur() {
  return [
    {
      chapitre: 'Bienvenue', cible: null,
      titre: 'Du nouveau dans ton écran d’appel',
      texte: 'Deux nouveautés pour arriver mieux préparé à tes rencontres.',
    },
    {
      chapitre: 'Notes du setter', cible: t('closeur-notes-setter'),
      titre: 'Les notes du setter',
      texte: 'Tout ce que le setter a noté sur ce lead (dans le hub ou dans GHL) est ici, avant ta fiche.',
    },
    {
      chapitre: 'Décision', cible: t('closeur-qualification'),
      titre: 'Rencontre de décision : déjà rempli',
      texte: [
        'Pour une rencontre de décision, ta fiche reprend ce qui a été noté à la découverte : objectif, problématique, solution…',
        'Tu complètes ou tu modifies : rien de ce que tu as déjà écrit n’est écrasé.',
      ],
    },
  ]
}

// Partie closeur dans la démo de « Mon espace » : sur un écran d'appel fictif
// (le setter qui close aussi n'a pas forcément de rencontre à montrer)
export function etapesCloseurFictif(ctx) {
  return [
    {
      chapitre: 'Closeur', cible: null,
      avant: async () => { ctx.fermerFiche?.(); ctx.ouvrirCloseurFictif() },
      titre: 'Côté closeur : ton écran d’appel',
      texte: 'Voici un exemple fictif de rencontre, pour te montrer les nouveautés quand tu closes.',
    },
    {
      chapitre: 'Closeur', cible: t('demo-closeur-notes'),
      titre: 'Les notes du setter',
      texte: 'Tout ce que le setter a noté sur le lead (dans le hub ou dans GHL) est ici, avant ta fiche.',
    },
    {
      chapitre: 'Closeur', cible: t('demo-closeur-qualif'),
      titre: 'Rencontre de décision : déjà rempli',
      texte: [
        'Ta fiche reprend ce qui a été noté à la rencontre découverte : objectif, problématique, solution…',
        'Tu complètes ou tu modifies : rien de ce que tu as déjà écrit n’est écrasé.',
      ],
    },
  ]
}

// Démo complète de « Mon espace » selon les rôles de la personne
export function etapesDemo({ setter, closeur, fictifUtilise }, ctx) {
  const etapes = []
  if (setter) etapes.push(...etapesSetter(ctx).filter(e => !e.siFictif || fictifUtilise))
  if (closeur) etapes.push(...etapesCloseurFictif(ctx))
  etapes.push({
    chapitre: 'C’est parti', cible: null,
    avant: async () => { ctx.fermerFiche?.(); ctx.fermerCloseurFictif?.() },
    titre: 'C’est tout !',
    texte: [
      'Pour revoir cette démo : lien « Revoir la démo des nouveautés » en bas de Mon espace.',
      'Une question ? Parles-en à Hugues ou à Lyliane.',
    ],
  })
  return etapes
}
