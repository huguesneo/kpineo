// Envoi d'une vidéo vers Google Drive (dossier Brut), sans dépendance à React
// ni au navigateur : le transport HTTP est injecté (XHR dans le hub, faux
// serveur dans montageUpload.test.js).
//
// Upload résumable de l'API Drive v3 : une session (POST), puis des morceaux
// (PUT avec Content-Range). Le fichier est envoyé tel quel, octet pour octet :
// aucune conversion. Après une coupure, on demande à Drive où il en est
// (PUT « bytes */total ») et on repart de là.

export const TYPES_VIDEO = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
}
const MIMES_ACCEPTES = new Set([...Object.values(TYPES_VIDEO), 'video/m4v'])

export const TAILLE_MAX_VIDEO = 10 * 1024 ** 3 // 10 Go
export const ACCEPT_VIDEO = '.mp4,.mov,.m4v,video/mp4,video/quicktime,video/x-m4v'

// Morceaux de 8 Mio : multiple de 256 Kio, comme l'exige Drive.
export const TAILLE_MORCEAU = 8 * 1024 * 1024
const MULTIPLE_MORCEAU = 256 * 1024

export function extensionDe(nom) {
  const m = /\.([^./\\]+)$/.exec(nom || '')
  return m ? m[1].toLowerCase() : ''
}

export function mimeVideo(nom) {
  return TYPES_VIDEO[extensionDe(nom)] || null
}

// Vérifie un fichier avant l'envoi. Retourne null si tout va bien, sinon le
// message à afficher.
export function validerVideo(fichier, tailleMax = TAILLE_MAX_VIDEO) {
  if (!fichier) return 'Aucun fichier choisi.'
  const ext = extensionDe(fichier.name)
  if (!TYPES_VIDEO[ext]) {
    return `Format non accepté (${ext ? `.${ext}` : 'sans extension'}). Choisis une vidéo .mp4, .mov ou .m4v.`
  }
  if (fichier.type && !MIMES_ACCEPTES.has(fichier.type)) {
    return `Ce fichier ne semble pas être une vidéo (${fichier.type}). Choisis une vidéo .mp4, .mov ou .m4v.`
  }
  if (!fichier.size) return 'Le fichier est vide.'
  if (fichier.size > tailleMax) {
    return `La vidéo pèse ${formatOctets(fichier.size)}, au-delà de la limite de ${formatOctets(tailleMax)}.`
  }
  return null
}

function sansAccents(texte) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/Œ/g, 'OE')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
}

// Titre proposé : le nom d'origine, sans l'extension.
export function titreDepuisNom(nom) {
  return (nom || '').replace(/\.[^./\\]+$/, '').trim() || 'Nouvelle vidéo'
}

function horodatage(date) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}`
}

// Nom du fichier dans Brut : sans espaces, parenthèses, accents ni caractères
// spéciaux, avec la date et l'heure pour que deux vidéos du même nom
// (IMG_1234.MOV) ne se remplacent pas dans le dossier synchronisé du Mac.
export function nomFichierSur(nom, date = new Date()) {
  const ext = extensionDe(nom)
  const base = sansAccents((nom || '').replace(/\.[^./\\]+$/, ''))
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 80) || 'video'
  return `${base}_${horodatage(date)}${ext ? `.${ext}` : ''}`
}

// --- Affichage -------------------------------------------------------------

export function formatOctets(n) {
  if (!Number.isFinite(n) || n < 0) return ''
  if (n < 1024) return `${n} o`
  const unites = ['Ko', 'Mo', 'Go', 'To']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < unites.length - 1) { v /= 1024; i++ }
  const texte = v >= 100 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, '')
  return `${texte.replace('.', ',')} ${unites[i]}`
}

export function formatDuree(secondes) {
  if (!Number.isFinite(secondes) || secondes < 0) return ''
  const s = Math.round(secondes)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) {
    const r = s % 60
    return r ? `${m} min ${r} s` : `${m} min`
  }
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h} h ${rm} min` : `${h} h`
}

// Débit moyen sur une fenêtre glissante (8 s par défaut), en octets/s.
export class CompteurDebit {
  constructor(fenetreMs = 8000) {
    this.fenetreMs = fenetreMs
    this.points = []
  }

  ajouter(t, octets) {
    this.points.push({ t, octets })
    while (this.points.length > 2 && t - this.points[0].t > this.fenetreMs) this.points.shift()
  }

  vider() { this.points = [] }

  debit() {
    if (this.points.length < 2) return null
    const a = this.points[0]
    const b = this.points[this.points.length - 1]
    const dt = (b.t - a.t) / 1000
    if (dt <= 0) return null
    return Math.max(0, (b.octets - a.octets) / dt)
  }
}

export function tempsRestant(reste, debit) {
  if (!debit || debit <= 0 || !Number.isFinite(reste)) return null
  return reste / debit
}

// --- Upload résumable -------------------------------------------------------

export const URL_UPLOAD_DRIVE =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,size,mimeType,parents'

export class ErreurEnvoi extends Error {
  // code : annule | interrompu (reprenable) | acces_dossier | refuse | jeton
  constructor(code, message, { reprenable = false } = {}) {
    super(message)
    this.name = 'ErreurEnvoi'
    this.code = code
    this.reprenable = reprenable
  }
}

// « bytes=0-524287 » → 524288 octets reçus par Drive.
export function octetsRecus(enteteRange) {
  const m = /bytes=(\d+)-(\d+)/.exec(enteteRange || '')
  return m ? Number(m[2]) + 1 : 0
}

function estTemporaire(status) {
  return status === 408 || status === 429 || status >= 500
}

const DELAIS_MS = [1000, 2000, 4000, 8000, 15000, 30000]

// Usage : const envoi = new EnvoiResumable({...}); const fichierDrive = await envoi.envoyer()
// Si envoyer() échoue avec reprenable = true, rappeler envoyer() reprend au
// même endroit (même session Drive).
export class EnvoiResumable {
  constructor({
    fichier, nom, dossierId, mimeType, obtenirJeton, transport,
    tailleMorceau = TAILLE_MORCEAU, onProgression = () => {},
    attendre = (ms) => new Promise(r => setTimeout(r, ms)),
    essaisMax = DELAIS_MS.length,
  }) {
    if (tailleMorceau % MULTIPLE_MORCEAU !== 0) throw new Error('La taille des morceaux doit être un multiple de 256 Kio.')
    this.fichier = fichier
    this.taille = fichier.size
    this.nom = nom
    this.dossierId = dossierId
    this.mimeType = mimeType || mimeVideo(nom) || 'application/octet-stream'
    this.obtenirJeton = obtenirJeton
    this.transport = transport
    this.tailleMorceau = tailleMorceau
    this.onProgression = onProgression
    this.attendre = attendre
    this.essaisMax = essaisMax
    this.session = null
    this.offset = 0
    this.resultat = null
    this.annule = false
    this.controleur = null
  }

  annuler() {
    this.annule = true
    this.controleur?.abort()
  }

  signaler(envoye) {
    this.onProgression({ envoye: Math.min(envoye, this.taille), total: this.taille })
  }

  async requete(options) {
    if (this.annule) throw new ErreurEnvoi('annule', 'Envoi annulé.')
    this.controleur = new AbortController()
    try {
      return await this.transport({ ...options, signal: this.controleur.signal })
    } catch (e) {
      if (this.annule) throw new ErreurEnvoi('annule', 'Envoi annulé.')
      throw e
    } finally {
      this.controleur = null
    }
  }

  async ouvrirSession() {
    const corps = JSON.stringify({ name: this.nom, parents: [this.dossierId], mimeType: this.mimeType })
    for (let essaiJeton = 0; essaiJeton < 2; essaiJeton++) {
      const jeton = await this.obtenirJeton({ forcer: essaiJeton > 0 })
      const rep = await this.requete({
        method: 'POST',
        url: URL_UPLOAD_DRIVE,
        headers: {
          Authorization: `Bearer ${jeton}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': this.mimeType,
          'X-Upload-Content-Length': String(this.taille),
        },
        body: corps,
      })
      if (rep.status === 200 || rep.status === 201) {
        const session = rep.header('Location')
        if (!session) throw new ErreurEnvoi('refuse', "Google Drive n'a pas ouvert la session d'envoi.")
        this.session = session
        this.offset = 0
        this.signaler(0)
        return
      }
      if (rep.status === 401) continue
      if (rep.status === 404) {
        throw new ErreurEnvoi('acces_dossier', "Google Drive ne trouve pas le dossier Brut pour ton compte : il n'est pas partagé avec toi, ou l'accès n'a pas encore été autorisé.")
      }
      if (estTemporaire(rep.status)) throw Object.assign(new Error(`Drive ${rep.status}`), { temporaire: true })
      throw new ErreurEnvoi('refuse', `Google Drive a refusé l'envoi (${rep.status}). ${messageDrive(rep.texte)}`.trim())
    }
    throw new ErreurEnvoi('jeton', 'La connexion à Google a expiré. Reconnecte-toi, puis reprends.', { reprenable: true })
  }

  // Interprète une réponse à un PUT. Retourne true si l'envoi avance.
  lireReponse(rep) {
    if (rep.status === 200 || rep.status === 201) {
      this.resultat = rep.json()
      this.offset = this.taille
      this.signaler(this.taille)
      return true
    }
    if (rep.status === 308) {
      const avant = this.offset
      this.offset = octetsRecus(rep.header('Range'))
      this.signaler(this.offset)
      return this.offset > avant
    }
    if (rep.status === 404 || rep.status === 410) {
      // Session expirée (une semaine) : on recommence depuis le début.
      this.session = null
      this.offset = 0
      return true
    }
    if (estTemporaire(rep.status)) throw Object.assign(new Error(`Drive ${rep.status}`), { temporaire: true })
    throw new ErreurEnvoi('refuse', `Google Drive a refusé l'envoi (${rep.status}). ${messageDrive(rep.texte)}`.trim())
  }

  async demanderPosition() {
    const rep = await this.requete({
      method: 'PUT',
      url: this.session,
      headers: { 'Content-Range': `bytes */${this.taille}` },
      body: null,
    })
    this.lireReponse(rep)
  }

  async envoyerMorceau() {
    const debut = this.offset
    if (debut >= this.taille) {
      // Tout est reçu sans confirmation finale : Drive la donne à la question.
      await this.demanderPosition()
      return !!this.resultat
    }
    const fin = Math.min(debut + this.tailleMorceau, this.taille)
    const rep = await this.requete({
      method: 'PUT',
      url: this.session,
      headers: { 'Content-Range': `bytes ${debut}-${fin - 1}/${this.taille}` },
      body: this.fichier.slice(debut, fin),
      onEnvoi: (n) => this.signaler(debut + n),
    })
    return this.lireReponse(rep)
  }

  async envoyer() {
    this.annule = false
    let essais = 0
    let sansAvancer = 0
    let besoinPosition = !!this.session && !this.resultat
    while (!this.resultat) {
      try {
        if (!this.session) {
          await this.ouvrirSession()
          besoinPosition = false
        } else if (besoinPosition) {
          await this.demanderPosition()
          besoinPosition = false
        } else {
          const avance = await this.envoyerMorceau()
          sansAvancer = avance ? 0 : sansAvancer + 1
          if (sansAvancer >= 3) {
            throw new ErreurEnvoi('refuse', "Google Drive ne confirme pas la réception des morceaux. Réessaie plus tard.", { reprenable: true })
          }
        }
        essais = 0
      } catch (e) {
        if (e instanceof ErreurEnvoi) throw e
        // Coupure réseau ou erreur temporaire de Drive : on attend, puis on
        // demande à Drive combien d'octets il a reçus.
        essais++
        if (essais > this.essaisMax) {
          throw new ErreurEnvoi('interrompu', "La connexion a été coupée trop longtemps. L'envoi reprendra là où il s'est arrêté.", { reprenable: true })
        }
        await this.attendre(DELAIS_MS[Math.min(essais, DELAIS_MS.length) - 1])
        if (this.annule) throw new ErreurEnvoi('annule', 'Envoi annulé.')
        besoinPosition = !!this.session
      }
    }
    return this.resultat
  }
}

// Message d'erreur de l'API Drive (JSON { error: { message } }), s'il existe.
export function messageDrive(texte) {
  try {
    return JSON.parse(texte)?.error?.message || ''
  } catch {
    return ''
  }
}
