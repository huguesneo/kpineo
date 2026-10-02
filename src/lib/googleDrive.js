// Appels à l'API Google Drive v3 depuis le navigateur (portée drive.file) pour
// le module Montage vidéo. Le jeton vient de obtenirJetonDrive (googlePicker.js).

import { ErreurEnvoi, messageDrive, validerVideo, mimeVideo } from './montageUpload'

const API = 'https://www.googleapis.com/drive/v3'

// Transport XHR pour EnvoiResumable : suit la progression de chaque morceau
// (fetch ne la donne pas) et lit les en-têtes Location et Range de Drive.
export function transportXhr({ method, url, headers = {}, body = null, onEnvoi, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    if (onEnvoi) xhr.upload.onprogress = (e) => onEnvoi(e.loaded)
    xhr.onload = () => resolve({
      status: xhr.status,
      header: (nom) => xhr.getResponseHeader(nom),
      texte: xhr.responseText,
      json: () => JSON.parse(xhr.responseText),
    })
    xhr.onerror = () => reject(new TypeError('Connexion perdue'))
    xhr.ontimeout = () => reject(new TypeError('Délai dépassé'))
    if (signal) {
      if (signal.aborted) { reject(new DOMException('Annulé', 'AbortError')); return }
      signal.addEventListener('abort', () => { xhr.abort(); reject(new DOMException('Annulé', 'AbortError')) })
    }
    xhr.send(body)
  })
}

async function appel(obtenirJeton, method, chemin, corps) {
  for (let essai = 0; essai < 2; essai++) {
    const jeton = await obtenirJeton({ forcer: essai > 0 })
    let rep
    try {
      rep = await fetch(`${API}${chemin}`, {
        method,
        headers: {
          Authorization: `Bearer ${jeton}`,
          ...(corps ? { 'Content-Type': 'application/json; charset=UTF-8' } : {}),
        },
        body: corps ? JSON.stringify(corps) : undefined,
      })
    } catch {
      throw new ErreurEnvoi('interrompu', 'Google Drive ne répond pas. Vérifie ta connexion, puis réessaie.', { reprenable: true })
    }
    if (rep.status === 401) continue
    const texte = await rep.text()
    if (rep.ok) return texte ? JSON.parse(texte) : null
    const err = new ErreurEnvoi(rep.status === 404 ? 'introuvable' : 'refuse',
      `Google Drive a refusé la demande (${rep.status}). ${messageDrive(texte)}`.trim())
    err.status = rep.status
    throw err
  }
  throw new ErreurEnvoi('jeton', 'La connexion à Google a expiré. Reconnecte-toi, puis réessaie.', { reprenable: true })
}

const CHAMPS_FICHIER = 'id,name,size,mimeType,parents'

export function lireFichierDrive(obtenirJeton, id) {
  return appel(obtenirJeton, 'GET', `/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=${CHAMPS_FICHIER}`)
}

// L'app voit-elle le dossier Brut avec ce compte ? Avec drive.file, il faut que
// la personne ait choisi ce dossier une fois dans le Picker (et qu'il soit
// partagé avec elle). Retourne { ok } ou { ok: false, raison }.
export async function verifierDossierBrut(obtenirJeton, dossierId) {
  try {
    const d = await appel(obtenirJeton, 'GET',
      `/files/${encodeURIComponent(dossierId)}?supportsAllDrives=true&fields=id,name,trashed,capabilities(canAddChildren)`)
    if (d.trashed) return { ok: false, raison: 'corbeille' }
    if (d.capabilities && d.capabilities.canAddChildren === false) return { ok: false, raison: 'lecture_seule' }
    return { ok: true }
  } catch (e) {
    if (e.code === 'introuvable') return { ok: false, raison: 'acces' }
    throw e
  }
}

// Copie côté Drive (aucun retéléchargement) d'un fichier choisi dans le Picker.
export function copierDansDossier(obtenirJeton, id, dossierId, nom) {
  return appel(obtenirJeton, 'POST',
    `/files/${encodeURIComponent(id)}/copy?supportsAllDrives=true&fields=${CHAMPS_FICHIER}`,
    { name: nom, parents: [dossierId] })
}

// Fichier choisi dans le Picker : est-ce une vidéo acceptée, et est-il déjà
// dans Brut ? Retourne { erreur } ou { dansBrut, fichier }.
export function examinerFichierDrive(meta, dossierBrutId) {
  const fichier = { name: meta?.name || '', size: Number(meta?.size || 0), type: meta?.mimeType || '' }
  // Drive range parfois un .mov en video/mp4 : l'extension décide, le type
  // doit seulement être une vidéo.
  if (fichier.type && !fichier.type.startsWith('video/')) {
    return { erreur: `« ${fichier.name} » n'est pas une vidéo. Choisis une vidéo .mp4, .mov ou .m4v.` }
  }
  const erreur = validerVideo({ ...fichier, type: mimeVideo(fichier.name) || fichier.type })
  if (erreur) return { erreur }
  return {
    dansBrut: (meta.parents || []).includes(dossierBrutId),
    fichier: { id: meta.id, nom: fichier.name, taille: fichier.size },
  }
}

export const MESSAGES_DOSSIER_BRUT = {
  acces: "Ton compte Google n'a pas encore accès au dossier Brut dans le hub. Clique sur « Autoriser le dossier Brut » et choisis NEO vidéo/Brut. S'il n'apparaît pas, demande à Hugues de te le partager.",
  lecture_seule: "Ton compte Google peut voir le dossier Brut sans pouvoir y déposer de fichier. Demande à Hugues de te le partager en modification.",
  corbeille: "Le dossier Brut configuré est dans la corbeille de Google Drive. Demande à Hugues de choisir le bon dossier dans Configuration.",
}
