// =============================================================================
// naturoXlsxImport.js — Parse un export QuickBooks « Sommaire des suivis par
// client - Naturopathes » (.xlsx), un fichier par naturopathe.
// Particularité : QuickBooks exporte les montants comme des formules avec une
// valeur en cache à 0 → on lit les littéraux dans <f>, pas dans <v>.
// Aucune dépendance : lecture ZIP + DecompressionStream natif du navigateur.
// =============================================================================

const MONTHS_FR = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
}
const MONTHS_ABBR = {
  janv: 1, févr: 2, fevr: 2, avr: 4, juil: 7, sept: 9, oct: 10, nov: 11, déc: 12, dec: 12,
}

const NATURO_NAMES = ['thibault', 'brice', 'jessica', 'tamara']

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Blob([bytes]).stream().pipeThrough(ds)
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

// Lecture minimale d'un ZIP via le central directory.
async function readZipFile(arrayBuffer, wantedName) {
  const u8 = new Uint8Array(arrayBuffer)
  const dv = new DataView(arrayBuffer)

  // Trouver l'End Of Central Directory (signature 0x06054b50)
  let eocd = -1
  for (let i = u8.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Fichier xlsx invalide (ZIP introuvable).')

  const cdCount = dv.getUint16(eocd + 10, true)
  const cdOffset = dv.getUint32(eocd + 16, true)

  let p = cdOffset
  for (let n = 0; n < cdCount; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break
    const method = dv.getUint16(p + 10, true)
    const compSize = dv.getUint32(p + 20, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const commentLen = dv.getUint16(p + 32, true)
    const localOffset = dv.getUint32(p + 42, true)
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen))

    if (name === wantedName) {
      const lNameLen = dv.getUint16(localOffset + 26, true)
      const lExtraLen = dv.getUint16(localOffset + 28, true)
      const dataStart = localOffset + 30 + lNameLen + lExtraLen
      const comp = u8.subarray(dataStart, dataStart + compSize)
      let raw
      if (method === 0) raw = comp
      else if (method === 8) raw = await inflateRaw(comp)
      else throw new Error('Compression xlsx non supportée (' + method + ').')
      return new TextDecoder('utf-8').decode(raw)
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  return null
}

function detectPeriodFromStrings(strings) {
  for (const s of strings) {
    const lc = s.toLowerCase()
    const ym = lc.match(/(20\d{2})/)
    if (!ym) continue
    const year = Number(ym[1])
    for (const [name, n] of Object.entries(MONTHS_FR)) {
      if (lc.includes(name)) return { year, month: n }
    }
    for (const [abbr, n] of Object.entries(MONTHS_ABBR)) {
      if (lc.includes(abbr + '.') || lc.includes(abbr + ' ')) return { year, month: n }
    }
  }
  return null
}

function guessNaturoFromName(fileName) {
  const lc = (fileName || '').toLowerCase()
  return NATURO_NAMES.find(n => lc.includes(n)) || null
}

// Parse un fichier xlsx (ArrayBuffer). Retourne { ok, error, year, month, total, clientCount, naturoGuess }
export async function parseNaturoXlsx(arrayBuffer, fileName = '') {
  let sharedXml, sheetXml
  try {
    sharedXml = await readZipFile(arrayBuffer, 'xl/sharedStrings.xml')
    sheetXml = await readZipFile(arrayBuffer, 'xl/worksheets/sheet1.xml')
  } catch (e) {
    return { ok: false, error: e.message }
  }
  if (!sheetXml) return { ok: false, error: 'Feuille de calcul introuvable dans le fichier.' }

  const strings = []
  if (sharedXml) {
    const re = /<t[^>]*>([\s\S]*?)<\/t>/g
    let m
    while ((m = re.exec(sharedXml))) strings.push(m[1])
  }

  const period = detectPeriodFromStrings(strings)

  // Somme de la colonne B (cellules feuille = montants par client).
  // QuickBooks exporte chaque montant comme une formule littérale (<f>651.26</f>)
  // avec une valeur en cache à 0 → on additionne les formules numériques.
  // Les totaux sont des formules SUM(...) → non numériques → ignorés.
  // On ne retombe sur les valeurs en cache <v> que si AUCUNE formule numérique
  // n'est présente (autre style d'export), pour éviter de compter des cellules
  // résiduelles non nulles.
  let formulaTotal = 0, formulaCount = 0
  let cacheTotal = 0, cacheCount = 0
  const cellRe = /<c r="B\d+"[^>]*>([\s\S]*?)<\/c>/g
  let cm
  while ((cm = cellRe.exec(sheetXml))) {
    const inner = cm[1]
    const fm = inner.match(/<f>([\s\S]*?)<\/f>/)
    if (fm) {
      if (/^-?\d+(\.\d+)?$/.test(fm[1].trim())) { formulaTotal += parseFloat(fm[1]); formulaCount++ }
      continue // formule non numérique (ex: SUM total) → ignorée
    }
    const vm = inner.match(/<v>([\s\S]*?)<\/v>/)
    if (vm) {
      const v = parseFloat(vm[1])
      if (Number.isFinite(v) && v !== 0) { cacheTotal += v; cacheCount++ }
    }
  }
  const total = formulaCount > 0 ? formulaTotal : cacheTotal
  const clientCount = formulaCount > 0 ? formulaCount : cacheCount

  return {
    ok: true,
    year: period?.year ?? null,
    month: period?.month ?? null,
    total: Math.round(total * 100) / 100,
    clientCount,
    naturoGuess: guessNaturoFromName(fileName),
  }
}
