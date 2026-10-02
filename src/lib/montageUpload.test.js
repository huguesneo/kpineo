import { describe, it, expect } from 'vitest'
import {
  nomFichierSur, titreDepuisNom, validerVideo, mimeVideo, formatOctets, formatDuree,
  CompteurDebit, tempsRestant, octetsRecus, EnvoiResumable, ErreurEnvoi, URL_UPLOAD_DRIVE,
} from './montageUpload'

const KIO = 1024
const DATE = new Date(2026, 9, 2, 14, 5)

describe('nom de fichier sûr', () => {
  it('retire espaces, parenthèses et accents, garde l’extension en minuscules', () => {
    expect(nomFichierSur('Été au chalet (version 2).MOV', DATE)).toBe('Ete_au_chalet_version_2_2026-10-02_1405.mov')
  })

  it('caractères spéciaux et ligatures', () => {
    expect(nomFichierSur("Cœur & âme : l'œuf #3.mp4", DATE)).toBe('Coeur_ame_l_oeuf_3_2026-10-02_1405.mp4')
  })

  it('nom vide ou sans lettres : « video »', () => {
    expect(nomFichierSur('(((  ))).m4v', DATE)).toBe('video_2026-10-02_1405.m4v')
    expect(nomFichierSur('', DATE)).toBe('video_2026-10-02_1405')
  })

  it('garde les tirets et soulignés, coupe les noms très longs', () => {
    expect(nomFichierSur('IMG_1234-a.mp4', DATE)).toBe('IMG_1234-a_2026-10-02_1405.mp4')
    const long = nomFichierSur(`${'a'.repeat(200)}.mp4`, DATE)
    expect(long).toBe(`${'a'.repeat(80)}_2026-10-02_1405.mp4`)
  })

  it('le titre proposé garde le nom d’origine sans l’extension', () => {
    expect(titreDepuisNom('Été au chalet (version 2).MOV')).toBe('Été au chalet (version 2)')
    expect(titreDepuisNom('.mp4')).toBe('Nouvelle vidéo')
  })
})

describe('validation de la vidéo', () => {
  const f = (name, size, type = '') => ({ name, size, type })

  it('accepte mp4, mov et m4v', () => {
    expect(validerVideo(f('a.mp4', 10, 'video/mp4'))).toBeNull()
    expect(validerVideo(f('a.MOV', 10, 'video/quicktime'))).toBeNull()
    expect(validerVideo(f('a.m4v', 10, 'video/x-m4v'))).toBeNull()
    expect(validerVideo(f('a.mov', 10, ''))).toBeNull() // type inconnu du navigateur
  })

  it('refuse les autres formats, les fichiers vides et trop lourds', () => {
    expect(validerVideo(null)).toMatch(/Aucun fichier/)
    expect(validerVideo(f('a.avi', 10))).toMatch(/Format non accepté \(\.avi\)/)
    expect(validerVideo(f('photo', 10))).toMatch(/sans extension/)
    expect(validerVideo(f('a.mp4', 10, 'image/jpeg'))).toMatch(/ne semble pas être une vidéo/)
    expect(validerVideo(f('a.mp4', 0))).toMatch(/vide/)
    expect(validerVideo(f('a.mp4', 2000), 1000)).toMatch(/au-delà de la limite/)
  })

  it('type MIME envoyé à Drive selon l’extension', () => {
    expect(mimeVideo('a.MOV')).toBe('video/quicktime')
    expect(mimeVideo('a.mp4')).toBe('video/mp4')
    expect(mimeVideo('a.avi')).toBeNull()
  })
})

describe('affichage de la progression', () => {
  it('tailles et durées en français', () => {
    expect(formatOctets(512)).toBe('512 o')
    expect(formatOctets(1536)).toBe('1,5 Ko')
    expect(formatOctets(3.2 * 1024 ** 3)).toBe('3,2 Go')
    expect(formatDuree(42)).toBe('42 s')
    expect(formatDuree(150)).toBe('2 min 30 s')
    expect(formatDuree(3600 + 600)).toBe('1 h 10 min')
  })

  it('débit sur une fenêtre glissante et temps restant', () => {
    const c = new CompteurDebit(8000)
    expect(c.debit()).toBeNull()
    c.ajouter(0, 0)
    c.ajouter(1000, 1_000_000)
    c.ajouter(2000, 2_000_000)
    expect(c.debit()).toBe(1_000_000)
    // Les vieux points sortent de la fenêtre : un débit plus récent compte seul.
    c.ajouter(12000, 2_000_000)
    c.ajouter(13000, 6_000_000)
    expect(c.debit()).toBe(4_000_000)
    expect(tempsRestant(8_000_000, 4_000_000)).toBe(2)
    expect(tempsRestant(100, 0)).toBeNull()
  })

  it('en-tête Range de Drive', () => {
    expect(octetsRecus('bytes=0-524287')).toBe(524288)
    expect(octetsRecus(null)).toBe(0)
  })
})

// --- Faux serveur Drive ------------------------------------------------------

// Comparaison directe (toEqual sur des centaines de milliers d'octets est très lent).
function memesOctets(recu, attendu) {
  if (recu.length !== attendu.length) return false
  for (let i = 0; i < recu.length; i++) if (recu[i] !== attendu[i]) return false
  return true
}

function faitFichier(taille) {
  const octets = new Uint8Array(taille)
  for (let i = 0; i < taille; i++) octets[i] = (i * 31 + 7) % 251
  return {
    size: taille,
    octets,
    slice: (a, b) => ({ octets: octets.slice(a, b), size: b - a }),
  }
}

// Imite l'API Drive : session, morceaux, Range, coupures programmées.
function fauxDrive({ coupures = {}, partiel = {}, expire = new Set(), initStatus = [] } = {}) {
  const etat = { sessions: 0, recu: null, total: 0, requetes: [], jetons: [], putNo: 0, fini: null }
  const rep = (status, { headers = {}, corps = '' } = {}) => ({
    status,
    header: (n) => headers[n] ?? null,
    texte: corps,
    json: () => JSON.parse(corps),
  })
  const transport = async ({ method, url, headers, body, onEnvoi }) => {
    etat.requetes.push({ method, url, range: headers['Content-Range'] })
    if (method === 'POST') {
      etat.jetons.push(headers.Authorization)
      const forcer = initStatus.shift()
      if (forcer) return rep(forcer)
      const meta = JSON.parse(body)
      etat.meta = meta
      etat.sessions++
      etat.total = Number(headers['X-Upload-Content-Length'])
      etat.recu = []
      return rep(200, { headers: { Location: `https://upload/session-${etat.sessions}` } })
    }
    if (url !== `https://upload/session-${etat.sessions}`) return rep(404)
    const range = /bytes (\*|(\d+)-(\d+))\/(\d+)/.exec(headers['Content-Range'])
    const reponseEtat = () => (etat.recu.length === etat.total
      ? rep(200, { corps: JSON.stringify({ id: 'drive-123', name: etat.meta.name }) })
      : rep(308, { headers: etat.recu.length ? { Range: `bytes=0-${etat.recu.length - 1}` } : {} }))
    if (range[1] === '*') return reponseEtat()
    etat.putNo++
    if (expire.has(etat.putNo)) { etat.sessions++; return rep(404) }
    if (coupures[etat.putNo] === 0) return rep(503)
    const debut = Number(range[2])
    if (debut !== etat.recu.length) return rep(400)
    let octets = body.octets
    if (partiel[etat.putNo] !== undefined) octets = octets.slice(0, partiel[etat.putNo])
    for (const o of octets) etat.recu.push(o)
    onEnvoi?.(octets.length)
    if (partiel[etat.putNo] !== undefined) throw new TypeError('Failed to fetch')
    return reponseEtat()
  }
  return { etat, transport }
}

function nouvelEnvoi(fichier, drive, opts = {}) {
  const progression = []
  const attentes = []
  const envoi = new EnvoiResumable({
    fichier,
    nom: 'Clip_2026-10-02_1405.mov',
    dossierId: 'brut-1',
    obtenirJeton: async ({ forcer }) => (forcer ? 'jeton-neuf' : 'jeton'),
    transport: drive.transport,
    tailleMorceau: 256 * KIO,
    onProgression: (p) => progression.push(p.envoye),
    attendre: async (ms) => { attentes.push(ms) },
    ...opts,
  })
  return { envoi, progression, attentes }
}

describe('upload résumable (faux serveur Drive)', () => {
  it('découpe en morceaux de 256 Kio et envoie le fichier tel quel dans Brut', async () => {
    const fichier = faitFichier(600 * KIO)
    const drive = fauxDrive()
    const { envoi, progression } = nouvelEnvoi(fichier, drive)
    const res = await envoi.envoyer()

    expect(res).toEqual({ id: 'drive-123', name: 'Clip_2026-10-02_1405.mov' })
    expect(drive.etat.meta).toEqual({ name: 'Clip_2026-10-02_1405.mov', parents: ['brut-1'], mimeType: 'video/quicktime' })
    expect(drive.etat.requetes[0].url).toBe(URL_UPLOAD_DRIVE)
    expect(drive.etat.requetes.slice(1).map(r => r.range)).toEqual([
      `bytes 0-262143/${600 * KIO}`,
      `bytes 262144-524287/${600 * KIO}`,
      `bytes 524288-614399/${600 * KIO}`,
    ])
    expect(memesOctets(drive.etat.recu, fichier.octets)).toBe(true)
    expect(progression.at(-1)).toBe(600 * KIO)
    expect(progression).toEqual([...progression].sort((a, b) => a - b))
  })

  it('après une coupure au milieu d’un morceau, demande la position et reprend sans renvoyer ce qui est reçu', async () => {
    const fichier = faitFichier(768 * KIO)
    const drive = fauxDrive({ partiel: { 2: 100 * KIO } }) // le 2e morceau coupe après 100 Kio
    const { envoi, attentes } = nouvelEnvoi(fichier, drive)
    await envoi.envoyer()

    const ranges = drive.etat.requetes.slice(1).map(r => r.range)
    expect(ranges).toEqual([
      `bytes 0-262143/${768 * KIO}`,
      `bytes 262144-524287/${768 * KIO}`,
      `bytes */${768 * KIO}`,
      `bytes 364544-626687/${768 * KIO}`, // reprend à 256 + 100 Kio
      `bytes 626688-786431/${768 * KIO}`,
    ])
    expect(attentes).toEqual([1000])
    expect(memesOctets(drive.etat.recu, fichier.octets)).toBe(true)
  })

  it('erreur 503 de Drive : nouvel essai après une pause', async () => {
    const fichier = faitFichier(300 * KIO)
    const drive = fauxDrive({ coupures: { 1: 0 } })
    const { envoi, attentes } = nouvelEnvoi(fichier, drive)
    await envoi.envoyer()
    expect(attentes).toEqual([1000])
    expect(memesOctets(drive.etat.recu, fichier.octets)).toBe(true)
  })

  it('coupure trop longue : erreur « interrompu » reprenable, puis reprise au même endroit', async () => {
    const fichier = faitFichier(512 * KIO)
    const drive = fauxDrive()
    // Le réseau tombe juste après le premier morceau et ne revient pas.
    let reseauCoupe = false
    const transport = async (req) => {
      if (reseauCoupe) throw new TypeError('Failed to fetch')
      return drive.transport(req)
    }
    const { envoi, attentes } = nouvelEnvoi(fichier, drive, {
      transport,
      essaisMax: 2,
      onProgression: (p) => { if (p.envoye >= 256 * KIO) reseauCoupe = true },
    })
    const erreur = await envoi.envoyer().catch(e => e)
    expect(erreur).toBeInstanceOf(ErreurEnvoi)
    expect(erreur.code).toBe('interrompu')
    expect(erreur.reprenable).toBe(true)
    const sessions = drive.etat.sessions

    expect(attentes).toEqual([1000, 2000])
    reseauCoupe = false
    envoi.onProgression = () => {}
    const res = await envoi.envoyer()
    expect(res.id).toBe('drive-123')
    expect(drive.etat.sessions).toBe(sessions) // même session, pas de nouvel envoi complet
    expect(memesOctets(drive.etat.recu, fichier.octets)).toBe(true)
  })

  it('session expirée (404) : nouvelle session et envoi complet', async () => {
    const fichier = faitFichier(512 * KIO)
    const drive = fauxDrive({ expire: new Set([2]) })
    const { envoi } = nouvelEnvoi(fichier, drive)
    await envoi.envoyer()
    expect(drive.etat.requetes.filter(r => r.method === 'POST')).toHaveLength(2)
    expect(memesOctets(drive.etat.recu, fichier.octets)).toBe(true)
  })

  it('jeton expiré à l’ouverture (401) : redemande un jeton une fois', async () => {
    const drive = fauxDrive({ initStatus: [401] })
    const { envoi } = nouvelEnvoi(faitFichier(10 * KIO), drive)
    await envoi.envoyer()
    expect(drive.etat.jetons).toEqual(['Bearer jeton', 'Bearer jeton-neuf'])
  })

  it('dossier Brut inaccessible (404 à l’ouverture) : erreur acces_dossier', async () => {
    const drive = fauxDrive({ initStatus: [404] })
    const { envoi } = nouvelEnvoi(faitFichier(10 * KIO), drive)
    const e = await envoi.envoyer().catch(x => x)
    expect(e.code).toBe('acces_dossier')
  })

  it('Annuler arrête l’envoi', async () => {
    const fichier = faitFichier(1024 * KIO)
    const drive = fauxDrive()
    const { envoi } = nouvelEnvoi(fichier, drive, {
      onProgression: (p) => { if (p.envoye >= 256 * KIO) envoi.annuler() },
    })
    const e = await envoi.envoyer().catch(x => x)
    expect(e.code).toBe('annule')
    expect(drive.etat.recu.length).toBeLessThan(fichier.size)
  })

  it('refuse une taille de morceau qui n’est pas un multiple de 256 Kio', () => {
    expect(() => nouvelEnvoi(faitFichier(10), fauxDrive(), { tailleMorceau: 1000 })).toThrow(/256 Kio/)
  })
})
