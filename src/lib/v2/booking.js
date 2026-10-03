// Bouton « Prendre un rendez-vous » de l'écran setter : ouvre la rencontre
// découverte (calendrier closeurs), comme le Centre de vente, avec
//  - booking_source=manuel_<prénom du setter> : GHL attribue le booking au
//    setter (type « Manuel »), c'est ce qui paie le show-up ;
//  - le lead prérempli (prénom, nom, courriel, téléphone).

// « Cloé NEO » → « cloe »
export function prenomCle(fullName) {
  return String(fullName ?? '').trim().split(/\s+/)[0]
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Clé booking_source du setter connecté, ou null s'il n'est pas dans la liste
// du Centre de vente (le RDV ne lui serait pas attribué)
export function cleBookingSetter(fullName, setters) {
  const cle = `manuel_${prenomCle(fullName)}`
  return (setters ?? []).some(s => s.key === cle) ? cle : null
}

// « Marie-Ève Tremblay Gagnon » → { prenom: 'Marie-Ève', nom: 'Tremblay Gagnon' }
export function decouperNom(nomComplet) {
  const mots = String(nomComplet ?? '').trim().split(/\s+/).filter(Boolean)
  return { prenom: mots[0] ?? '', nom: mots.slice(1).join(' ') }
}

export function lienPrendreRdv({ base, cleSetter, lead }) {
  const p = new URLSearchParams()
  if (cleSetter) p.set('booking_source', cleSetter)
  const { prenom, nom } = decouperNom(lead?.nom === 'Sans nom' ? '' : lead?.nom)
  if (prenom) p.set('first_name', prenom)
  if (nom) p.set('last_name', nom)
  if (lead?.email) p.set('email', lead.email)
  if (lead?.telephone) p.set('phone', lead.telephone)
  const qs = p.toString()
  return qs ? `${base}?${qs}` : base
}
