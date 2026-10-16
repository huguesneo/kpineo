// Contenu fictif utilisé seulement pendant la démo guidée, quand l'écran n'a
// rien de réel à montrer (liste vide, pas de rencontre pour un setter).
// Rien de tout ça n'est enregistré ni envoyé dans GHL.

const H = 3_600_000

export const ID_COLLEGUE_DEMO = 'demo-collegue'

// Lead fictif pour les listes et la fiche
export function leadFictif(userId, now = Date.now(), { variante = 'rappeler' } = {}) {
  const iso = t => new Date(t).toISOString()
  const base = {
    demo: true,
    key: `demo:${variante}`,
    contactId: `demo-${variante}`,
    opportunityId: null,
    nom: 'Marie Exemple (démo)',
    email: 'marie.exemple@exemple.com',
    telephone: '+1 514 555-0199',
    source: 'Optin VS',
    sourceChaude: true,
    creeLe: iso(now - 50 * H),
    ageHeures: 50,
    chaud: false,
    etape: variante === 'nouveau' ? '🆕 Nouveau lead' : '📞 2 tentatives faites',
    tentative: variante === 'nouveau' ? 1 : 3,
    stageId: null,
    changementEtape: iso(now - 26 * H),
    closeur: null,
    setter: null,
    prochainRdv: null,
    rdvRef: null,
  }
  return {
    ...base,
    nomsDemo: { [ID_COLLEGUE_DEMO]: 'Vicky (démo)', [userId]: 'Toi' },
    appelsDemo: variante === 'nouveau' ? [] : [
      { id: 'demo-a2', contact_id: base.contactId, user_id: ID_COLLEGUE_DEMO, sortant: true, statut: 'completed', duree: 134, appele_le: iso(now - 3 * H) },
      { id: 'demo-a1', contact_id: base.contactId, user_id: userId, sortant: true, statut: 'no-answer', duree: null, appele_le: iso(now - 26 * H) },
    ],
    ficheDemo: {
      contact: {
        id: base.contactId, nom: base.nom, telephone: base.telephone, courriel: base.email,
        age: 52, source: 'Optin VS', creeLe: base.creeLe, tags: [],
      },
      formulaire: [{ libelle: 'Information complémentaire', valeur: 'Disponible les soirs de semaine après 17 h.' }],
      historique: [
        { id: 'demo-h3', type: 'sms', sortant: false, date: iso(now - 2 * H), par: null, texte: 'Oui, rappelle-moi jeudi en fin de journée svp !' },
        { id: 'demo-h2', type: 'appel', sortant: true, date: iso(now - 3 * H), par: 'Vicky (démo)', duree: 134, statut: 'completed', texte: null },
        { id: 'demo-h1', type: 'courriel', sortant: true, date: iso(now - 40 * H), par: 'Automatisation', texte: 'Ta vidéo sur le métabolisme et le stress' },
      ],
      notes: [
        { id: 'demo-n1', texte: 'Veut perdre 15 lb avant l’été. Fatiguée l’après-midi. En parler à son conjoint.', date: iso(now - 3 * H), par: 'Vicky (démo)' },
      ],
      conversationId: null,
      avertissementPortee: null,
    },
  }
}

// Rencontre fictive pour la partie closeur de la démo
export const RENCONTRE_FICTIVE = {
  nom: 'Marie Exemple (démo)',
  type: 'Rencontre de décision',
  quand: 'Jeudi 13 h 00',
  notesSetter: [
    { par: 'Vicky (démo)', quand: 'mar. 15 h 54', texte: 'Veut perdre 15 lb avant l’été. Fatiguée l’après-midi. En parler à son conjoint.' },
    { par: 'Vicky (démo)', quand: 'mer. 10 h 12', texte: 'Conjoint d’accord pour la rencontre. Budget à valider.' },
  ],
  decouverte: 'mardi 13 octobre (Thibault)',
  qualification: [
    ['Objectif principal', 'Perdre 15 lb et retrouver de l’énergie'],
    ['Pourquoi maintenant', 'Mariage de sa fille en juin'],
    ['Déjà essayé', 'Weight Watchers, jeûne intermittent'],
    ['Problématique', 'Coups de fatigue à 15 h, fringales le soir'],
    ['Solution idéale', 'Un plan simple, suivi chaque semaine'],
  ],
}
