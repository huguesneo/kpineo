// Google Picker pour choisir un dossier Drive (portée drive.file : l'app ne
// voit que ce que l'utilisateur choisit). Aucun secret : connexion OAuth dans
// le navigateur (Google Identity Services), clé API restreinte au domaine.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const MIME_DOSSIER = 'application/vnd.google-apps.folder'

// Le numéro du projet Google Cloud est le début du client ID. Le Picker en a
// besoin (setAppId) pour donner à l'app l'accès au dossier choisi.
export function numeroProjet(clientId) {
  const m = /^(\d+)-/.exec(clientId || '')
  return m ? m[1] : null
}

export function googlePickerConfigure() {
  return !!(CLIENT_ID && API_KEY)
}

// Réponse du Picker → { id, nom } du dossier, ou null (annulé, pas un dossier).
export function dossierChoisi(data) {
  if (!data || data.action !== 'picked') return null
  const doc = (data.docs || [])[0]
  if (!doc?.id || doc.mimeType !== MIME_DOSSIER) return null
  return { id: doc.id, nom: doc.name || 'Dossier sans nom' }
}

const scripts = {}
function chargerScript(src) {
  if (!scripts[src]) {
    scripts[src] = new Promise((resolve, reject) => {
      const el = document.createElement('script')
      el.src = src
      el.async = true
      el.onload = resolve
      el.onerror = () => {
        delete scripts[src]
        reject(new Error('Impossible de charger les outils Google. Vérifie ta connexion.'))
      }
      document.head.appendChild(el)
    })
  }
  return scripts[src]
}

function jetonDrive() {
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (rep) => {
        if (rep.error) reject(new Error('Connexion à Google refusée ou annulée.'))
        else resolve(rep.access_token)
      },
      error_callback: () => reject(new Error('Connexion à Google refusée ou annulée.')),
    })
    client.requestAccessToken({ prompt: '' })
  })
}

// Ouvre le Picker sur les dossiers. Résout { id, nom } ou null si annulé.
export async function choisirDossierDrive() {
  if (!googlePickerConfigure()) {
    throw new Error('VITE_GOOGLE_CLIENT_ID et VITE_GOOGLE_API_KEY manquent dans la configuration du hub.')
  }
  await Promise.all([
    chargerScript('https://accounts.google.com/gsi/client'),
    chargerScript('https://apis.google.com/js/api.js'),
  ])
  await new Promise((resolve, reject) => {
    window.gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('Impossible de charger Google Picker.')) })
  })
  const jeton = await jetonDrive()
  const picker = window.google.picker

  return new Promise((resolve) => {
    const vue = new picker.DocsView(picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes(MIME_DOSSIER)
    const builder = new picker.PickerBuilder()
      .addView(vue)
      .setOAuthToken(jeton)
      .setDeveloperKey(API_KEY)
      .setLocale('fr')
      .setTitle('Choisis le dossier « NEO vidéo/Brut »')
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve(dossierChoisi(data))
        else if (data.action === picker.Action.CANCEL) resolve(null)
      })
    const appId = numeroProjet(CLIENT_ID)
    if (appId) builder.setAppId(appId)
    builder.build().setVisible(true)
  })
}

// --- Phase 2 : vidéos ---------------------------------------------------------

const MIMES_VIDEO_PICKER = 'video/mp4,video/quicktime,video/x-m4v'
let jetonMemorise = null // { valeur, expire }

// Jeton Drive gardé en mémoire jusqu'à une minute avant son expiration (1 h),
// pour ne pas redemander la connexion à chaque appel. `forcer` en demande un
// nouveau (après un refus 401 de Drive).
export async function obtenirJetonDrive({ forcer = false } = {}) {
  if (!googlePickerConfigure()) {
    throw new Error('VITE_GOOGLE_CLIENT_ID et VITE_GOOGLE_API_KEY manquent dans la configuration du hub.')
  }
  if (!forcer && jetonMemorise && jetonMemorise.expire > Date.now() + 60_000) return jetonMemorise.valeur
  await chargerScript('https://accounts.google.com/gsi/client')
  const rep = await new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (r.error) reject(new Error('Connexion à Google refusée ou annulée.'))
        else resolve(r)
      },
      error_callback: () => reject(new Error('Connexion à Google refusée ou annulée.')),
    })
    client.requestAccessToken({ prompt: '' })
  })
  jetonMemorise = { valeur: rep.access_token, expire: Date.now() + Number(rep.expires_in || 3600) * 1000 }
  return jetonMemorise.valeur
}

// Réponse du Picker → { id, nom, mimeType } de la vidéo, ou null.
export function videoChoisie(data) {
  if (!data || data.action !== 'picked') return null
  const doc = (data.docs || [])[0]
  if (!doc?.id) return null
  return { id: doc.id, nom: doc.name || 'Vidéo sans nom', mimeType: doc.mimeType || '' }
}

// Ouvre le Picker sur les vidéos (Mon disque et Partagés avec moi).
// Résout { id, nom, mimeType } ou null si annulé.
export async function choisirVideoDrive() {
  const jeton = await obtenirJetonDrive()
  await chargerScript('https://apis.google.com/js/api.js')
  await new Promise((resolve, reject) => {
    window.gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('Impossible de charger Google Picker.')) })
  })
  const picker = window.google.picker

  return new Promise((resolve) => {
    const vue = new picker.DocsView(picker.ViewId.DOCS)
      .setMimeTypes(MIMES_VIDEO_PICKER)
      .setIncludeFolders(true)
    const builder = new picker.PickerBuilder()
      .addView(vue)
      .setOAuthToken(jeton)
      .setDeveloperKey(API_KEY)
      .setLocale('fr')
      .setTitle('Choisis la vidéo à monter')
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve(videoChoisie(data))
        else if (data.action === picker.Action.CANCEL) resolve(null)
      })
    const appId = numeroProjet(CLIENT_ID)
    if (appId) builder.setAppId(appId)
    builder.build().setVisible(true)
  })
}

// Charge les scripts Google à l'ouverture de l'écran : le clic sur « Choisir
// dans Google Drive » ouvre alors la connexion sans délai (Safari bloque les
// fenêtres ouvertes trop longtemps après le clic).
export function prechargerGoogle() {
  if (!googlePickerConfigure()) return
  chargerScript('https://accounts.google.com/gsi/client').catch(() => {})
  chargerScript('https://apis.google.com/js/api.js').catch(() => {})
}
