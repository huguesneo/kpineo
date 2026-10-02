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
