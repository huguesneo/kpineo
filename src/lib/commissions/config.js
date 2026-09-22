// Configuration des commissions setters et des pipelines GHL.
// Tout ce qui peut changer sans toucher aux règles est ici.

// ── Date de bascule C ────────────────────────────────────────────
// Jour où les workflows LEAD ont été publiés et les legacy #2 à #6 dépubliés.
// Minuit, heure de Montréal. Un RDV avant C est payé par l'ancien pipeline
// Setting, un RDV à partir de C par le nouveau.
export const BASCULE_DATE = '2026-09-22';

// ── Show-up dont le RDV retenu n'est pas « showed » ─────────────
// 'signaler' : on paie et la ligne sort dans le rapport d'anomalies.
// 'bloquer'  : on ne paie pas (la ligne sort aussi dans le rapport).
export const RDV_NON_SHOWED = 'signaler';

// ── Contacts test (jamais payés) ─────────────────────────────────
// Tous les contacts « Hugues Pugliese » connus au 22 sept. 2026 (cartes,
// RDV et tâches setters). Aucune suppression dans GHL : on les exclut ici.
export const TEST_CONTACT_IDS = [
  // Cartes du nouveau pipeline setting
  'tq8qpfQh84Xp6XBnHFLV', '5r3RXE1FyTQIRbtOYk1u', 'CriMj3z4GE7c2MVuuHFa', 'ANKcwymC6hzhqRjmYmto',
  // RDV découverte ou tâches setters sans carte à ce jour
  'BenxF3OD6k1dABAaEmTQ', 'bKYGQgrNX6GOkbPNrmNj', 'cAMWHyqq7dArYtYyqTdm', 'CbSLnMUHBJb79lP7AjqT',
  'GJLlfsFbP0JaZAU9UVvm', 'i8PvKLcEmrtpDZbCgt1h', 'm1n7Jqfz91ZPnTd4gOIf', 'NAssoDWVZ0T98WPAnzYT',
  'NUKGaTslBlD7fUcwHuhu', 'TNA7FhpfUsUlEUgXSJd4', 'VWvEuWePurCN2q4jIpJU', 'yfJkozUVxtr75lPOUHhw',
  'z5qUD1w3UrZRByR2dEGF', 'VfZ3vtuCbvhQA9coxG2q', 'z0uaDKWwvog41UZvEHfM',
];

// ── Pipelines setters ────────────────────────────────────────────
// legacy : étapes reconnues par morceau de nom (comportement historique,
//          conservé pour ne pas changer les périodes déjà payées).
// nouveau : étapes reconnues par ID (un renommage ne coupe plus la paie).
export const PIPELINE_SETTING_LEGACY = '3C5ggTxPoWBmiFAPlCKn';
export const PIPELINE_SETTING_NOUVEAU = 'KkPiFjw0ztAXc7z6Ab9c';

export const SETTER_PIPELINES = [
  {
    id: PIPELINE_SETTING_LEGACY,
    role: 'legacy',
    label: 'Setting (ancien)',
    match: 'name',
    stages: {
      booked:    'lead rencontre book',
      showup:    'show-up confirm',
      bonus:     'bonus vente',
      cancelled: 'rencontre annul',
      noshow:    'no show',
    },
  },
  {
    id: PIPELINE_SETTING_NOUVEAU,
    role: 'nouveau',
    label: 'Pipeline setting (nouveau)',
    match: 'id',
    stages: {
      booked:    'c6768b21-9141-46af-b5f0-29b6b4921157', // ✅ Lead rencontre book
      showup:    '357ba28e-c664-4a6b-a4f1-1d190d83f0a1', // 📆 Show-up Confirmé.
      bonus:     '340d1e9e-7d22-4ec0-83fc-9b9b464c457a', // 💰 bonus vente
      cancelled: '0150502d-c8e9-409f-8723-ac373adea3fa', // 🔴 rencontre annulé
      noshow:    '2db2e4c1-57b8-4f65-9a0b-6fc645cc9b2d', // 👻 no show
    },
  },
];

// ── Pipelines closeurs ───────────────────────────────────────────
// Même date C : un événement avant C se lit dans l'ancien pipeline
// « Rencontre découverte », à partir de C dans le pipeline « 🎯 Vente ».
export const PIPELINE_CLOSER_LEGACY = 'YPTruORTl0LOSdS2vWJS';
export const PIPELINE_CLOSER_VENTE  = 'pc4eWgm1TOfZgMgqh6Gv';
export const CLOSER_PIPELINES = [PIPELINE_CLOSER_LEGACY, PIPELINE_CLOSER_VENTE];
export const STAGE_VENTE_EN_DECISION = '513ec2f0-bdf5-4a92-a4a2-e0dfbc778a16'; // 🤔 En décision
