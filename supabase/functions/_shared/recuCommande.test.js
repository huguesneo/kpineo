import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { lireCommandeWoo, associerProduit, preparerRecu, cleProduit, montant, MSG_CARTE_CADEAU } from './recuCommande.js'

// La vraie table : lue dans la migration (contenu repris du skill neo-leo-commandes)
function tableDeLaMigration() {
  const sql = readFileSync(new URL('../../migrations/20261023c_qbo_produits_map.sql', import.meta.url), 'utf8')
  const valeur = (v) => {
    v = v.trim()
    if (v === 'null') return null
    if (v === 'true' || v === 'false') return v === 'true'
    if (v === "'{}'") return []
    if (v.startsWith('array[')) return [...v.matchAll(/'((?:[^']|'')*)'/g)].map(m => m[1].replace(/''/g, "'"))
    return v.slice(1, -1).replace(/''/g, "'")
  }
  return sql.split('\n').filter(l => /^\s{2}\('/.test(l)).map(l => {
    const champs = [...l.trim().replace(/^\(|\),?$/g, '').matchAll(/array\[[^\]]*\]::text\[\]|'(?:[^']|'')*'|null|true|false/g)].map(m => valeur(m[0]))
    const [nom_woo, variante, mots_variante, article_qbo, item_ref, type, hors_boutique] = champs
    return { nom_woo, variante, mots_variante, article_qbo, item_ref, type, hors_boutique, actif: true }
  })
}
const TABLE = tableDeLaMigration()

// Structure réelle des avis WooCommerce (#8110 et #8116, 21 et 23 oct. 2026)
const ligne = (nom, qte, prix) => `<tr class="order_item"><td class="td">\n\t\t\t${nom}\t\t</td><td class="td">\n\t\t\t${qte}\t\t</td><td class="td"><span class="woocommerce-Price-amount amount">${prix} <span class="woocommerce-Price-currencySymbol">$</span></span></td></tr>`
const pied = (lib, val) => `<tr><th class="td" scope="row" colspan="2">${lib}</th><td class="td">${val}</td></tr>`
const prix = (v) => `<span class="woocommerce-Price-amount amount">${v} <span class="woocommerce-Price-currencySymbol">$</span></span>`
const avis = ({ numero, lignes, pieds, adresse }) => `<h1>Nouvelle commande: n°${numero}</h1><p>Vous avez reçu la commande suivante de X :</p>`
  + `<h2><a class="link" href="#">[Commande n°${numero}]</a> (<time datetime="2026-10-21T12:55:26-04:00">octobre 21, 2026</time>)</h2>`
  + `<table class="td"><thead><tr><th class="td">Produit</th><th class="td">Quantité</th><th class="td">Prix</th></tr></thead><tbody>${lignes.join('')}</tbody><tfoot>${pieds.join('')}</tfoot></table>`
  + `<table id="addresses"><tr><td><h2>Adresse de facturation</h2><address class="address">${adresse}</address></td></tr></table>`

const AVIS_8110 = avis({
  numero: '8110',
  lignes: [ligne('Metagenics UltraFlora® Women’s - 30 capsules', 1, '42,75'), ligne('Evo Lab - StressEase', 1, '86,99'), ligne('Designs for health TriMag Night', 1, '95,45')],
  pieds: [pied('Sous-total:', prix('225,19')), pied('Remise:', `-${prix('22,52')}`), pied('Coupons:', '<span class="used-coupon">bienvenue10</span>'), pied('TPS:', prix('10,13')), pied('TVQ:', prix('20,22')), pied('Moyen de paiement:', 'Moneris'), pied('Total:', prix('233,02'))],
  adresse: "\n\t\t\t\tArianna Sanchez<br>3840<br>l'Assomption QC J5W 4T1\t\t<br><a href=\"tel:5148306058\">5148306058</a>\t\t<br>saharasanchez@hotmail.com\t\t",
})
const AVIS_8116 = avis({
  numero: '8116',
  lignes: [ligne('Evo Lab - Gluco Support', 1, '62,99'), ligne('Designs for health Sensitol', 1, '109,25')],
  pieds: [pied('Sous-total:', prix('172,24')), pied('Remise:', `-${prix('14,20')}`), pied('Coupons:', 'neo-client-auto-13'), pied('TPS:', prix('7,90')), pied('TVQ:', prix('15,76')), pied('Moyen de paiement:', 'Moneris'), pied('Total:', prix('181,70'))],
  adresse: 'Cassandra Monzon<br>12006 Av Savard<br>Montreal Nord QC H1H3N2<br><a href="tel:4185736043">(418) 573-6043</a><br>monzon.cassy@gmail.com',
})

describe('table qbo_produits_map (migration)', () => {
  it('reprend les tables du skill : 89 produits dont 16 variantes, livraison, 14 retirés', () => {
    expect(TABLE.filter(r => r.type === 'produit')).toHaveLength(89)
    expect(TABLE.filter(r => r.variante)).toHaveLength(16)
    expect(TABLE.find(r => r.type === 'livraison').item_ref).toBe('342')
    expect(TABLE.filter(r => r.type === 'retire')).toHaveLength(14)
  })
})

describe('lecture de l’avis', () => {
  it('#8110 : lignes, pied, client et adresse', () => {
    const c = lireCommandeWoo(AVIS_8110)
    expect(c.numero).toBe('8110')
    expect(c.date).toBe('2026-10-21')
    expect(c.lignes).toEqual([
      { nom: 'Metagenics UltraFlora® Women’s - 30 capsules', qte: 1, montant: 42.75 },
      { nom: 'Evo Lab - StressEase', qte: 1, montant: 86.99 },
      { nom: 'Designs for health TriMag Night', qte: 1, montant: 95.45 },
    ])
    expect(c).toMatchObject({ remise: 22.52, coupon: 'bienvenue10', livraison: 0, tps: 10.13, tvq: 20.22, total: 233.02, paiement: 'Moneris', carteCadeauPayee: false })
    expect(c.client).toEqual({ nom: 'Arianna Sanchez', courriel: 'saharasanchez@hotmail.com', tel: '5148306058', ligne1: '3840', ville: "l'Assomption", province: 'QC', codePostal: 'J5W 4T1' })
  })
  it('montants et clés', () => {
    expect(montant('1 234,56 $')).toBe(1234.56)
    expect(montant('-22,52 $')).toBe(-22.52)
    expect(cleProduit('Designs for health - Sensitol™')).toBe(cleProduit('Designs for health Sensitol'))
  })
})

describe('correspondance des produits', () => {
  it('noms de la boutique différents de la table : ponctuation et ™ ignorés', () => {
    expect(associerProduit('Designs for health TriMag Night', TABLE).row.item_ref).toBe('228')
    expect(associerProduit('Metagenics UltraFlora® Women’s - 30 capsules', TABLE).row.item_ref).toBe('193')
    expect(associerProduit('Designs for health Insomnitol Chewables™', TABLE).row.item_ref).toBe('206')
    expect(associerProduit('Designs for health - CoQnol™ 200', TABLE).row.item_ref).toBe('368')
  })
  it('variantes : lues dans la ligne, sinon bloqué ; bœuf 850 g par défaut, saveur obligatoire', () => {
    expect(associerProduit('Designs for health DigestZymes™ - 180 capsules', TABLE).row.item_ref).toBe('76')
    expect(associerProduit('Designs for health DigestZymes™ - 90 capsules', TABLE).row.item_ref).toBe('6')
    expect(associerProduit('Designs for health DigestZymes™', TABLE).erreur).toMatch(/^Variante à confirmer/)
    expect(associerProduit('ATP LAB Protéine de bœuf suprême - Chocolat', TABLE).row.item_ref).toBe('68')
    expect(associerProduit('ATP LAB Protéine de bœuf suprême', TABLE).erreur).toMatch(/^Variante à confirmer/)
  })
  it('produit inconnu ou en voie de retrait : jamais le plus proche', () => {
    expect(associerProduit('Designs for health - Q-Evail™ 100', TABLE).erreur).toBe('Produit sans article QuickBooks : « Designs for health - Q-Evail™ 100 »')
    expect(associerProduit('Evo Lab - Nouveau produit', TABLE).erreur).toMatch(/^Produit sans article QuickBooks/)
  })
})

describe('préparation du reçu', () => {
  it('#8110 : mêmes lignes que celles que Léo a faites (ItemRef 193, 1010000022, 228)', () => {
    const { blocages, patch } = preparerRecu(lireCommandeWoo(AVIS_8110), TABLE, { gmailMessageId: '1a15f63b82f3b269' })
    expect(blocages).toEqual([])
    expect(patch.Line).toEqual([
      { Amount: 42.75, Qty: 1, UnitPrice: 42.75, ItemRef: '193', Description: 'Metagenics UltraFlora® Women’s - 30 capsules', TaxCodeRef: '8' },
      { Amount: 86.99, Qty: 1, UnitPrice: 86.99, ItemRef: '1010000022', Description: 'Evo Lab - StressEase', TaxCodeRef: '8' },
      { Amount: 95.45, Qty: 1, UnitPrice: 95.45, ItemRef: '228', Description: 'Designs for health TriMag Night', TaxCodeRef: '8' },
    ])
    expect(patch).toMatchObject({ rabais_montant: 22.52, coupon: 'bienvenue10', tps: 10.13, tvq: 20.22, total_taxes: 30.35, total_woocommerce: 233.02, client_prenom: 'Arianna', client_famille: 'Sanchez', gmail_message_id: '1a15f63b82f3b269', blocage: null })
  })
  it('#8116 : Gluco Support et Sensitol, prix de la commande', () => {
    const { blocages, patch } = preparerRecu(lireCommandeWoo(AVIS_8116), TABLE)
    expect(blocages).toEqual([])
    expect(patch.Line.map(l => [l.ItemRef, l.Amount])).toEqual([['394', 62.99], ['209', 109.25]])
  })
  it('quantité > 1 : Amount = total de la ligne, UnitPrice = Amount ÷ Qty ; livraison en ligne 342', () => {
    const c = lireCommandeWoo(avis({ numero: '1', lignes: [ligne('Evo Lab - Magnesium Glycinate', 2, '105,98')],
      pieds: [pied('Expédition:', `${prix('15,00')} via Postes Canada`), pied('TPS:', prix('6,05')), pied('TVQ:', prix('12,07')), pied('Total:', prix('139,10'))], adresse: 'A B' }))
    const { blocages, patch } = preparerRecu(c, TABLE)
    expect(blocages).toEqual([])
    expect(patch.Line).toEqual([
      { Amount: 105.98, Qty: 2, UnitPrice: 52.99, ItemRef: '1010000041', Description: 'Evo Lab - Magnesium Glycinate', TaxCodeRef: '8' },
      { Amount: 15, Qty: 1, UnitPrice: 15, ItemRef: '342', Description: 'Frais de livraison', TaxCodeRef: '8' },
    ])
  })
  it('carte-cadeau (achat ou paiement) : pas de lignes, à traiter par Cloé', () => {
    const achat = lireCommandeWoo(avis({ numero: '2', lignes: [ligne('Carte-cadeau – Suppléments - 360 $', 1, '360,00')], pieds: [pied('Total:', prix('300,00'))], adresse: 'A' }))
    expect(preparerRecu(achat, TABLE)).toMatchObject({ blocages: [MSG_CARTE_CADEAU], patch: { blocage: MSG_CARTE_CADEAU } })
    expect(preparerRecu(achat, TABLE).patch.Line).toBeUndefined()
    const paiement = lireCommandeWoo(avis({ numero: '3', lignes: [ligne('Evo Lab - Omega 3', 1, '50,00')], pieds: [pied('Total:', prix('57,49')), pied('Payé par carte-cadeau (•••• LMDS) :', prix('57,49'))], adresse: 'A' }))
    expect(preparerRecu(paiement, TABLE).blocages).toEqual([MSG_CARTE_CADEAU])
  })
  it('produit sans article : bloqué, message nommant le produit', () => {
    const c = lireCommandeWoo(avis({ numero: '4', lignes: [ligne('Evo Lab - Omega 3', 1, '50,00'), ligne('Designs for health - HistaEze™', 1, '40,00')], pieds: [pied('Total:', prix('103,49'))], adresse: 'A' }))
    const r = preparerRecu(c, TABLE)
    expect(r.blocages).toEqual(['Produit sans article QuickBooks : « Designs for health - HistaEze™ »'])
    expect(r.patch.Line).toBeUndefined()
  })
  it('garde-fou : total recalculé différent du site de plus de 10 ¢', () => {
    const c = lireCommandeWoo(avis({ numero: '5', lignes: [ligne('Evo Lab - Omega 3', 1, '50,00')], pieds: [pied('TPS:', prix('2,50')), pied('TVQ:', prix('4,99')), pied('Total:', prix('70,00'))], adresse: 'A' }))
    expect(preparerRecu(c, TABLE).blocages[0]).toMatch(/^Montants incohérents/)
  })
})
