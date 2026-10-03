// Préremplissage du terminal Moneris après la prise d'une rencontre d'évaluation.
// Règles de Hugues (2 oct. 2026) :
//  - « Programme d'optimisation métabolique » (+ variantes) → Forfait 15 semaines NEO - N paiement(s)
//      « plus 10% »            → rabais de 10 % (sur tous les versements)
//      « plus garanti »        → ajout garantie coché
//      « plus 10% & garanti »  → les deux
//  - « À la carte » → Évaluation naturopathie (1 paiement)
//  - « Payer aujourd'hui » toujours coché
//  - 3 versements : 2e prélèvement = date de l'évaluation + 5 semaines, puis aux 5 semaines
//    5 versements : 2e prélèvement = date de l'évaluation + 3 semaines, puis aux 3 semaines

const SEMAINES_PAR_VERSEMENTS = { 3: 5, 5: 3 }

function jourMontreal(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso))
}

function plusJours(jour, n) {
  const [a, m, j] = jour.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10)
}

// « 1234 rue Principale » → { numero: '1234', rue: 'rue Principale' }
export function decouperAdresse(ligne) {
  const s = String(ligne ?? '').trim()
  const m = s.match(/^(\d+[A-Za-z]?)[\s,]+(.+)$/)
  return m ? { numero: m[1], rue: m[2].trim() } : { numero: '', rue: s }
}

// Province GHL (« QC », « Québec », « Quebec »…) → code du terminal
export function codeProvince(valeur) {
  const v = String(valeur ?? '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const noms = {
    quebec: 'QC', qc: 'QC', ontario: 'ON', on: 'ON', 'nouveau-brunswick': 'NB', nb: 'NB',
    'nouvelle-ecosse': 'NS', ns: 'NS', 'ile-du-prince-edouard': 'PE', pe: 'PE',
    'terre-neuve-et-labrador': 'NL', nl: 'NL', manitoba: 'MB', mb: 'MB', saskatchewan: 'SK', sk: 'SK',
    alberta: 'AB', ab: 'AB', 'colombie-britannique': 'BC', 'british columbia': 'BC', bc: 'BC',
    yukon: 'YT', yt: 'YT', 'territoires du nord-ouest': 'NT', nt: 'NT', nunavut: 'NU', nu: 'NU',
  }
  return noms[v] ?? 'QC'
}

// forfait, nbPaiements ('1' | '3' | '5'), dateEvaluation (ISO), client : champs du formulaire
// Retourne les champs du formulaire du terminal, ou null si le forfait n'a pas de produit.
export function prefillTerminal({ forfait, nbPaiements, dateEvaluation, client = {} }) {
  const f = String(forfait ?? '')
  const n = Number(nbPaiements) || 1
  const base = {
    clientFirstName: client.prenom ?? '', clientLastName: client.nom ?? '',
    clientEmail: client.courriel ?? '', clientPhone: client.telephone ?? '',
    clientStreetNumber: client.numero ?? '', clientStreetName: client.rue ?? '', clientUnit: client.app ?? '',
    clientCity: client.ville ?? '', clientProvince: client.province || 'QC', clientPostalCode: client.codePostal ?? '',
    payToday: true, addTraining: false,
  }

  if (f === 'À la carte') {
    return { ...base, productName: 'Évaluation naturopathie', addGuarantee: false, discountType: 'percent', discountValue: '', chargeDate: '' }
  }
  if (!f.startsWith("Programme d'optimisation métabolique")) return null

  const produit = n === 1 ? 'Forfait 15 semaines NEO - 1 paiement' : `Forfait 15 semaines NEO - ${n} paiements`
  const semaines = SEMAINES_PAR_VERSEMENTS[n]
  return {
    ...base,
    productName: produit,
    addGuarantee: /garanti/i.test(f),
    discountType: 'percent',
    discountValue: /10\s*%/.test(f) ? '10' : '',
    frequencyUnit: 'WEEK',
    frequencyInterval: semaines ?? 2,
    chargeDate: semaines && dateEvaluation ? plusJours(jourMontreal(dateEvaluation), semaines * 7) : '',
  }
}
