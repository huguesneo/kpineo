// Configuration des écrans de vente v2 (setter, closeur, scoreboard).
// Les nouveaux écrans lisent uniquement ce fichier : aucun ID GHL en dur ailleurs.
// Les pipelines et la date de bascule viennent du moteur de commissions
// (src/lib/commissions/config.js) : on les réexporte, on ne les recopie pas.
import {
  BASCULE_DATE, PIPELINE_SETTING_LEGACY, PIPELINE_SETTING_NOUVEAU,
  PIPELINE_CLOSER_LEGACY, PIPELINE_CLOSER_VENTE, STAGE_VENTE_EN_DECISION,
} from '../commissions/config'

export { BASCULE_DATE as DATE_BASCULE, PIPELINE_SETTING_LEGACY, PIPELINE_CLOSER_LEGACY }

export const GHL_LOCATION_ID = 'YG2spvWJqnD75L3V95UJ'

export const PIPELINE_SETTING = {
  id: PIPELINE_SETTING_NOUVEAU,            // 📞 pipeline setting
  stages: {
    nouveau:         '5e98eb57-e85a-4e9c-8657-b7e1a66cd80b',
    chaudRelancer:   '8251ffae-ea6a-4bcf-8e9a-86feebc4449b',
    tentative1:      '74b49788-5c9d-4c72-a3e1-6161f4424e86',
    tentative2:      '20e227e1-6320-496e-9927-650d12f23261',
    tentative3:      '5acf7aa4-393f-46b6-a214-369985df04b3',
    tentative4:      'c42460d3-8c8f-4cec-b21b-0824d32fa53a',
    contactEtabli:   '0a3237b7-6878-4a45-bd3e-3013908ee257',
    rencontreBook:   'c6768b21-9141-46af-b5f0-29b6b4921157',
    showupConfirme:  '357ba28e-c664-4a6b-a4f1-1d190d83f0a1',
    bonusVente:      '340d1e9e-7d22-4ec0-83fc-9b9b464c457a',
    rencontreAnnulee:'0150502d-c8e9-409f-8723-ac373adea3fa',
    noShow:          '2db2e4c1-57b8-4f65-9a0b-6fc645cc9b2d',
    jamaisJoint:     '6774ff8c-6742-49cf-9f49-54197006e8fd',
    nonQualifie:     '7d0ce220-cb62-45e8-8484-3392ce774061',
    annule:          '702d23af-6004-4717-b79a-bafd587b4bd5',
  },
}

export const PIPELINE_VENTE = {
  id: PIPELINE_CLOSER_VENTE,               // 🎯 Vente
  stages: {
    rdvBooke:        'a1680bac-3bb9-454b-9399-c142b5a6836c',
    rdvConfirme:     'ee232e24-5b79-4caa-b6be-3b9ca9f81524',
    rdvPresente:     '3e325e4c-6f5b-47bf-943d-f3b9f367827a',
    rdvDecisionBooke:'030e5601-0124-49ea-b446-109cf9d39cb0',
    enDecision:      STAGE_VENTE_EN_DECISION,
    gagne:           '4f98e25e-237a-403d-9060-3ab7b2e8d7f9',
    noShow:          '76456a7c-1390-4897-8add-de48d469b6ba',
    annule:          'd5b2c051-b93e-4e4a-938e-bd3dad9cef1b',
    perdu:           '04ff37b5-6ba0-4fe6-beab-7f2179667d59',
    nonQualifie:     'e983de4b-15e5-4be3-9538-67a919bbc34d',
  },
}

// Étape du pipeline setting → numéro de la prochaine tentative
export const TENTATIVE_PAR_ETAPE = {
  [PIPELINE_SETTING.stages.nouveau]:    1,
  [PIPELINE_SETTING.stages.tentative1]: 2,
  [PIPELINE_SETTING.stages.tentative2]: 3,
  [PIPELINE_SETTING.stages.tentative3]: 4,
  [PIPELINE_SETTING.stages.tentative4]: 5,
}

export const CALENDARS = {
  decouvertePublic:   'DIN6EPtG7eNU3Gf6ZRoC',
  decouverteCloseurs: 'ucyJmhYKKDDm7U5JmaJ8',
  decouverteLegacy:   '4227QzeKvFczi5BZyHOC',
  decision:           'BQK4NoyrVNuJA3e1VHDH',
}
export const CALENDARS_DECOUVERTE = [
  CALENDARS.decouvertePublic, CALENDARS.decouverteCloseurs, CALENDARS.decouverteLegacy,
]

// Lien de réservation du calendrier closeurs (bouton « Booké »)
export const LIEN_BOOKING_CLOSEURS = `https://api.leadconnectorhq.com/widget/booking/${CALENDARS.decouverteCloseurs}`

export const FIELDS = {
  closer:         'JSltN3nE7nm4cUjuGxTs',
  dateClose:      'UPqvJX8MkZ4thsPX2tjV',
  setterNom:      'II5NrZGZrIScYItkxCi8',
  typeBooking:    'YbAB98KAINZM7vzebAKh',
  datePrincipale: 'mv0GU9HmvkCrkGVUSaqR',
}

export const DELAIS = {
  rebookerHeures: 72,
  confirmerHeures: 24,
  aStatuerHeures: 2,
  decisionOrangeHeures: 72,
  decisionRougeJours: 7,
  verrouMinutes: 15,
  debounceRealtimeMs: 2000,
  refetchSecoursMs: 5 * 60 * 1000,
}

// Tag posé par « Appelé, pas de réponse » ; un workflow GHL avance la carte
// puis retire le tag (voir docs/V2-WEBHOOKS-GHL.md).
export const TAG_TENTATIVE_FAITE = 'app-tentative-faite'

// Sources considérées « chaudes » dans la file À appeler
export const SOURCES_CHAUDES = [/\bvsl?\b/i, /quiz/i]

export function lienFicheGHL(contactId) {
  return `https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/contacts/detail/${contactId}`
}
