// « Préparer le reçu » : avis de commande WooCommerce (HTML brut) → payload.Line au format
// que Make envoie à QuickBooks. Logique pure, partagée par leo-adjoint et les tests.
// Règles du skill neo-leo-commandes : correspondance seulement par la table
// qbo_produits_map (jamais par ressemblance), prix toujours lus dans la commande,
// carte-cadeau jamais en reçu ordinaire, livraison en ligne 342.
import { extraitTexte } from './gmailFil.js'

export const TAXE_QC = '8'
export const ITEM_LIVRAISON = '342'
export const ECART_TOLERE = 0.1
export const MSG_CARTE_CADEAU = 'Carte-cadeau : à traiter par Cloé'

const texte = (html) => extraitTexte(html ?? '', 100000)
const arrondi = (n) => Math.round(n * 100) / 100

// « 1 234,56 $ » → 1234.56 ; null si aucun nombre
export function montant(v) {
  const m = String(v ?? '').replace(/ /g, ' ').match(/-?\s*\d[\d\s]*(?:[.,]\d{1,2})?/)
  if (!m) return null
  return Number(m[0].replace(/\s/g, '').replace(',', '.'))
}

// Clé de comparaison : sans ™ ® * ni ponctuation, apostrophes droites, minuscules
export const cleProduit = (nom) => String(nom ?? '')
  .replace(/[™®*©]/g, ' ').replace(/[’‘`]/g, "'").toLowerCase()
  .replace(/[^\p{L}\p{N}']+/gu, ' ').replace(/\s+/g, ' ').trim()
const mots = (cle) => new Set(cle.split(' ').filter(Boolean))

// ── Lecture de l'avis ─────────────────────────────────────────────────────
export function lireCommandeWoo(html) {
  const h = String(html ?? '')
  const lignes = []
  for (const tr of h.matchAll(/<tr\b[^>]*class="[^"]*\border_item\b[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cellules = [...tr[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c => texte(c[1]))
    if (cellules.length < 3) continue
    lignes.push({ nom: cellules[0], qte: Number(montant(cellules[1])) || 1, montant: montant(cellules[2]) })
  }
  const pied = {}
  for (const r of h.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi)) {
    pied[texte(r[1]).replace(/\s*:\s*$/, '').toLowerCase()] = texte(r[2])
  }
  const valeur = (re) => Object.entries(pied).find(([k]) => re.test(k))?.[1] ?? null
  const livraisonTexte = valeur(/exp[ée]dition|livraison/)
  const adresse = h.match(/<address\b[^>]*>([\s\S]*?)<\/address>/i)?.[1] ?? ''
  const parts = adresse.split(/<br\s*\/?>/i).map(texte).filter(Boolean)
  const reVille = /^(.*?)\s+([A-Z]{2})\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i
  const villeLigne = parts.find(p => reVille.test(p))
  const [, ville, province, codePostal] = villeLigne?.match(reVille) ?? []
  const nom = parts[0] ?? null
  return {
    numero: h.match(/Commande n°\s*(\d+)/)?.[1] ?? null,
    date: h.match(/<time\b[^>]*datetime="(\d{4}-\d{2}-\d{2})/i)?.[1] ?? null,
    client: {
      nom,
      courriel: parts.find(p => /@/.test(p))?.toLowerCase() ?? null,
      tel: parts.find(p => /^[\d\s().+-]{10,}$/.test(p))?.replace(/\D/g, '') ?? null,
      ligne1: parts[1] && parts[1] !== villeLigne && !/@/.test(parts[1]) ? parts[1] : null,
      ville: ville ?? null, province: province?.toUpperCase() ?? null, codePostal: codePostal?.toUpperCase() ?? null,
    },
    lignes,
    sousTotal: montant(valeur(/^sous-total/)),
    remise: Math.abs(montant(valeur(/^remise/)) ?? 0),
    coupon: valeur(/^coupon/) ?? '',
    livraison: livraisonTexte ? Math.abs(montant(livraisonTexte) ?? 0) : 0,
    tps: montant(valeur(/^tps/)) ?? 0,
    tvq: montant(valeur(/^tvq/)) ?? 0,
    total: montant(valeur(/^total$/)),
    paiement: valeur(/moyen de paiement/),
    carteCadeauPayee: Object.keys(pied).some(k => /carte[- ]cadeau/.test(k)),
  }
}

// ── Correspondance avec qbo_produits_map ──────────────────────────────────
// Le nom de la table doit être le début exact du nom de la ligne (après nettoyage) ; le
// reste est le format affiché par la boutique. Le nom le plus long gagne (Insomnitol
// Chewables avant Insomnitol). Produit à variantes : tous les mots de la variante doivent
// être dans la ligne, sinon on bloque.
export function associerProduit(nom, table) {
  const cle = cleProduit(nom)
  const actifs = (table ?? []).filter(r => r.actif !== false)
  const retire = actifs.find(r => r.type === 'retire' && ` ${cle} `.includes(` ${cleProduit(r.nom_woo)} `))
  if (retire) return { erreur: `Produit sans article QuickBooks : « ${nom} »` }
  const groupes = new Map()
  for (const r of actifs.filter(r => r.type === 'produit')) {
    const k = cleProduit(r.nom_woo)
    if (cle === k || cle.startsWith(`${k} `)) (groupes.get(k) ?? groupes.set(k, []).get(k)).push(r)
  }
  const k = [...groupes.keys()].sort((a, b) => b.length - a.length)[0]
  if (!k) return { erreur: `Produit sans article QuickBooks : « ${nom} »` }
  const rows = groupes.get(k)
  if (!rows.some(r => r.variante)) return { row: rows[0] }
  const presents = mots(cle)
  const candidats = rows.filter(r => r.variante && !r.hors_boutique && (r.mots_variante ?? []).every(m => presents.has(cleProduit(m))))
  if (candidats.length === 1) return { row: candidats[0] }
  return { erreur: `Variante à confirmer : « ${nom} »` }
}

// ── Préparation ───────────────────────────────────────────────────────────
// Renvoie { blocages, patch } : patch complète le payload (Line seulement sans blocage)
export function preparerRecu(c, table, { gmailMessageId = null } = {}) {
  const blocages = []
  if (!c?.lignes?.length) blocages.push('Aucun produit lu dans l’avis de commande')
  const estCarte = (n) => /carte[- ]cadeau/i.test(n)
  if (c?.carteCadeauPayee || c?.lignes?.some(l => estCarte(l.nom))) blocages.push(MSG_CARTE_CADEAU)
  const Line = []
  for (const l of c?.lignes ?? []) {
    if (estCarte(l.nom)) continue
    if (!(l.montant >= 0) || !(l.qte > 0)) { blocages.push(`Prix ou quantité illisible : « ${l.nom} »`); continue }
    const a = associerProduit(l.nom, table)
    if (a.erreur) { blocages.push(a.erreur); continue }
    Line.push({ Amount: l.montant, Qty: l.qte, UnitPrice: arrondi(l.montant / l.qte), ItemRef: a.row.item_ref, Description: l.nom, TaxCodeRef: TAXE_QC })
  }
  if (c?.livraison > 0) {
    const liv = (table ?? []).find(r => r.type === 'livraison' && r.actif !== false)
    Line.push({ Amount: c.livraison, Qty: 1, UnitPrice: c.livraison, ItemRef: liv?.item_ref ?? ITEM_LIVRAISON, Description: 'Frais de livraison', TaxCodeRef: TAXE_QC })
  }
  // Garde-fou : lignes − remise + taxes doit redonner le total du site
  if (!blocages.length && c.total != null) {
    const calcule = arrondi(Line.reduce((s, x) => s + x.Amount, 0) - c.remise + c.tps + c.tvq)
    if (Math.abs(calcule - c.total) > ECART_TOLERE) blocages.push(`Montants incohérents : lignes, remise et taxes donnent ${calcule.toFixed(2)} $, la commande dit ${c.total.toFixed(2)} $`)
  }
  const [prenom, ...famille] = String(c?.client?.nom ?? '').split(/\s+/).filter(Boolean)
  const commun = {
    date_commande: c?.date, client_nom: c?.client?.nom, client_prenom: prenom ?? null, client_famille: famille.join(' ') || null,
    client_courriel: c?.client?.courriel, client_tel: c?.client?.tel,
    adresse_ligne1: c?.client?.ligne1, adresse_ville: c?.client?.ville, adresse_province: c?.client?.province, adresse_code_postal: c?.client?.codePostal,
    rabais_montant: c?.remise ?? 0, coupon: c?.coupon ?? '', frais_livraison: c?.livraison ?? 0,
    tps: c?.tps ?? 0, tvq: c?.tvq ?? 0, total_taxes: arrondi((c?.tps ?? 0) + (c?.tvq ?? 0)), total_woocommerce: c?.total,
    paiement_type: c?.paiement ?? null,
    ...(gmailMessageId ? { gmail_message_id: gmailMessageId } : {}),
  }
  if (blocages.length) return { blocages, patch: { ...commun, blocage: blocages.join(' · ') } }
  const note = `Commande WooCommerce #${c.numero} du ${c.date}${c.coupon ? ` - coupon ${c.coupon} (-${c.remise.toFixed(2)} $)` : ''} - Total site ${c.total.toFixed(2)} $ - Recu prepare dans le Hub`
  return { blocages, patch: { ...commun, note_privee: note, Line, blocage: null } }
}
