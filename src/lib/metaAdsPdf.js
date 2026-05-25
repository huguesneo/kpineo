import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const TEAL = [0, 187, 177]
const DARK = [26, 26, 26]
const GREY = [107, 114, 128]
const GREEN = [16, 185, 129]

const fmt = (n, d = 0) => (n == null || Number.isNaN(Number(n))) ? '—' : Number(n).toLocaleString('fr-CA', { minimumFractionDigits: d, maximumFractionDigits: d })
const cad = (n) => (n == null || n === '') ? '—' : `${fmt(n, 2)} $`
const roasStr = (r) => r > 0 ? `${fmt(r, 2)}x` : '—'

export function generateMetaAdsReport({ periodStart, periodEnd, level, revModel, totals, rows }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 40

  const levelLabel = level === 'campaign' ? 'Par campagne' : 'Par ad'
  const modelLabel = revModel === 'ltv' ? 'Nouveaux clients' : 'Tous les clients'

  // ── Bandeau d'en-tête ──
  doc.setFillColor(...TEAL)
  doc.rect(0, 0, W, 64, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
  doc.text('NEO Performance', M, 30)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11)
  doc.text('Rapport de performance publicitaire Meta', M, 48)
  doc.setFontSize(9)
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-CA')}`, W - M, 38, { align: 'right' })

  // ── Ligne d'info (période / vue / modèle) ──
  doc.setFillColor(247, 248, 250)
  doc.rect(0, 64, W, 24, 'F')
  doc.setTextColor(...GREY); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text(
    `Période : ${periodStart}  au  ${periodEnd}        Vue : ${levelLabel}        Modèle : ${modelLabel}`,
    M, 79,
  )

  // ── Cartes résumé (profitabilité) ──
  let y = 106
  const cards = [
    ['ROAS réel', roasStr(totals.roas), TEAL],
    ['Revenu', cad(totals.revenue), GREEN],
    ['Dépenses pub', cad(totals.spend), DARK],
    [totals.profit >= 0 ? 'Profit net' : 'Perte nette', cad(Math.abs(totals.profit)), totals.profit >= 0 ? GREEN : [239, 68, 68]],
    ['Ratio LTV:CAC', totals.ltvCacRatio > 0 ? `${fmt(totals.ltvCacRatio, 1)} : 1` : '—', totals.ltvCacRatio >= 3 ? GREEN : [245, 158, 11]],
  ]
  const cardW = (W - 2 * M - 4 * 12) / 5
  cards.forEach(([label, value, color], i) => {
    const x = M + i * (cardW + 12)
    doc.setDrawColor(229, 231, 235); doc.setFillColor(252, 252, 253)
    doc.roundedRect(x, y, cardW, 56, 6, 6, 'FD')
    doc.setTextColor(...GREY); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
    doc.text(label.toUpperCase(), x + 10, y + 18)
    doc.setTextColor(...color); doc.setFontSize(16)
    doc.text(String(value), x + 10, y + 42)
  })

  // ── Funnel ──
  y += 78
  doc.setTextColor(...DARK); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text("Entonnoir d'acquisition", M, y)
  y += 8
  const funnel = [
    ['Leads', fmt(totals.leads), `CPL ${totals.cpl > 0 ? cad(totals.cpl) : '—'}`],
    ['Réservations', fmt(totals.reservations), `CPR ${totals.cpr > 0 ? cad(totals.cpr) : '—'}`],
    ['RDV tenus', fmt(totals.attended), `CPA ${totals.cpa > 0 ? cad(totals.cpa) : '—'}`],
    ['Clients payants', fmt(totals.clients), `CAC ${totals.cac > 0 ? cad(totals.cac) : '—'}`],
  ]
  const fW = (W - 2 * M - 3 * 12) / 4
  funnel.forEach(([label, count, sub], i) => {
    const x = M + i * (fW + 12)
    doc.setDrawColor(229, 231, 235); doc.setFillColor(255, 255, 255)
    doc.roundedRect(x, y, fW, 48, 6, 6, 'FD')
    doc.setTextColor(...GREY); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
    doc.text(label.toUpperCase(), x + 10, y + 16)
    doc.setTextColor(...DARK); doc.setFontSize(15)
    doc.text(String(count), x + 10, y + 34)
    doc.setTextColor(...GREY); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text(sub, x + fW - 10, y + 34, { align: 'right' })
  })

  // ── Tableau détaillé ──
  y += 66
  const body = rows.map(r => [
    r.name,
    cad(r.spend),
    fmt(r.leads),
    r.cpl > 0 ? cad(r.cpl) : '—',
    fmt(r.reservations),
    fmt(r.attended),
    fmt(r.clients),
    cad(r.revenue),
    roasStr(r.roas),
  ])
  // total row
  const foot = [[
    'TOTAL', cad(totals.spend), fmt(totals.leads), totals.cpl > 0 ? cad(totals.cpl) : '—',
    fmt(totals.reservations), fmt(totals.attended), fmt(totals.clients), cad(totals.revenue), roasStr(totals.roas),
  ]]

  autoTable(doc, {
    startY: y,
    head: [[level === 'campaign' ? 'Campagne' : 'Ad', 'Dépenses', 'Leads', 'CPL', 'Résa', 'RDV tenus', 'Clients', 'Revenu', 'ROAS']],
    body,
    foot,
    margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, overflow: 'ellipsize' },
    headStyles: { fillColor: DARK, textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
    footStyles: { fillColor: [249, 250, 251], textColor: DARK, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
      5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' },
    },
    alternateRowStyles: { fillColor: [250, 250, 252] },
    didDrawPage: () => {
      const page = doc.internal.getCurrentPageInfo().pageNumber
      doc.setFontSize(8); doc.setTextColor(...GREY); doc.setFont('helvetica', 'normal')
      doc.text(`NEO Performance — Rapport Meta Ads · page ${page}`, M, doc.internal.pageSize.getHeight() - 16)
    },
  })

  const fileName = `Rapport_Meta_${level}_${periodStart}_${periodEnd}.pdf`
  doc.save(fileName)
}
