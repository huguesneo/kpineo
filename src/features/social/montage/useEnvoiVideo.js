import { useCallback, useEffect, useRef, useState } from 'react'
import {
  EnvoiResumable, CompteurDebit, ErreurEnvoi, validerVideo, nomFichierSur, mimeVideo, tempsRestant,
} from '../../../lib/montageUpload'
import {
  transportXhr, verifierDossierBrut, lireFichierDrive, copierDansDossier, examinerFichierDrive, MESSAGES_DOSSIER_BRUT,
} from '../../../lib/googleDrive'
import {
  obtenirJetonDrive, jetonDriveEnMemoire, choisirVideoDrive, choisirDossierDrive,
} from '../../../lib/googlePicker'

// États de l'étape 1 :
//   choix        rien de choisi
//   connexion    fichier choisi, il faut un clic pour se connecter à Google
//   verification vérification du dossier Brut ou du fichier Drive
//   acces        le compte Google ne voit pas le dossier Brut
//   envoi        envoi en cours (progression, débit, temps restant)
//   interrompu   coupure : reprise automatique au retour du réseau, ou bouton
//   a_copier     vidéo choisie dans Drive hors de Brut : proposer la copie
//   copie        copie côté Drive en cours
//   erreur       message, retour au choix
//   pret         la vidéo est dans Brut : { fichierDriveId, nomSource }
export function useEnvoiVideo(dossierBrut) {
  const [etat, setEtat] = useState('choix')
  const [message, setMessage] = useState(null)
  const [fichier, setFichier] = useState(null)        // fichier local
  const [fichierDrive, setFichierDrive] = useState(null) // { id, nom, taille } choisi dans Drive
  const [progression, setProgression] = useState({ envoye: 0, total: 0, debit: null, reste: null })
  const [resultat, setResultat] = useState(null)
  const envoiRef = useRef(null)
  const compteur = useRef(new CompteurDebit())
  const dernierAffichage = useRef(0)
  const etatRef = useRef(etat)
  etatRef.current = etat

  const brutId = dossierBrut?.id

  const echec = useCallback((e) => {
    if (e?.code === 'annule') return
    if (e?.code === 'acces_dossier') {
      setEtat('acces')
      setMessage(MESSAGES_DOSSIER_BRUT.acces)
      return
    }
    if (e instanceof ErreurEnvoi && e.reprenable) {
      setEtat('interrompu')
      setMessage(e.message)
      return
    }
    setEtat('erreur')
    setMessage(e?.message || "L'envoi n'a pas abouti.")
  }, [])

  const accesBrutOk = useCallback(async () => {
    const v = await verifierDossierBrut(obtenirJetonDrive, brutId)
    if (v.ok) return true
    setEtat('acces')
    setMessage(MESSAGES_DOSSIER_BRUT[v.raison])
    return false
  }, [brutId])

  const surProgression = useCallback(({ envoye, total }) => {
    const t = Date.now()
    compteur.current.ajouter(t, envoye)
    // Au plus 4 rafraîchissements par seconde.
    if (envoye < total && t - dernierAffichage.current < 250) return
    dernierAffichage.current = t
    const debit = compteur.current.debit()
    setProgression({ envoye, total, debit, reste: tempsRestant(total - envoye, debit) })
  }, [])

  const lancerEnvoi = useCallback(async (envoi) => {
    setEtat('envoi')
    setMessage(null)
    compteur.current.vider()
    try {
      const res = await envoi.envoyer()
      setResultat({ fichierDriveId: res.id, nomSource: res.name, origine: 'envoi' })
      setEtat('pret')
      envoiRef.current = null
    } catch (e) {
      echec(e)
    }
  }, [echec])

  // Démarre (ou redémarre après « acces ») l'envoi du fichier local.
  const demarrer = useCallback(async (f = fichier) => {
    if (!f || !brutId) return
    setEtat('verification')
    setMessage(null)
    try {
      await obtenirJetonDrive()
      if (!(await accesBrutOk())) return
    } catch (e) {
      echec(e)
      return
    }
    const nom = nomFichierSur(f.name)
    const envoi = new EnvoiResumable({
      fichier: f,
      nom,
      dossierId: brutId,
      mimeType: mimeVideo(f.name),
      obtenirJeton: obtenirJetonDrive,
      transport: transportXhr,
      onProgression: surProgression,
    })
    envoiRef.current = envoi
    setProgression({ envoye: 0, total: f.size, debit: null, reste: null })
    await lancerEnvoi(envoi)
  }, [fichier, brutId, accesBrutOk, echec, surProgression, lancerEnvoi])

  const choisirFichier = useCallback((f) => {
    const erreur = validerVideo(f)
    setFichierDrive(null)
    setResultat(null)
    if (erreur) {
      setFichier(null)
      setEtat('erreur')
      setMessage(erreur)
      return
    }
    setFichier(f)
    // Après un glisser-déposer, la fenêtre de connexion Google serait bloquée :
    // sans jeton en mémoire, on attend un clic.
    if (jetonDriveEnMemoire()) demarrer(f)
    else {
      setEtat('connexion')
      setMessage(null)
    }
  }, [demarrer])

  const reprendre = useCallback(() => {
    if (envoiRef.current) lancerEnvoi(envoiRef.current)
    else demarrer()
  }, [lancerEnvoi, demarrer])

  const recommencer = useCallback(() => {
    envoiRef.current?.annuler()
    envoiRef.current = null
    setFichier(null)
    setFichierDrive(null)
    setResultat(null)
    setMessage(null)
    setEtat('choix')
  }, [])

  // Annuler : coupe l'envoi. Une session Drive inachevée ne crée aucun
  // fichier (elle expire d'elle-même).
  const annuler = recommencer

  // Reprise automatique quand le réseau revient.
  useEffect(() => {
    const enLigne = () => { if (etatRef.current === 'interrompu') reprendre() }
    window.addEventListener('online', enLigne)
    return () => window.removeEventListener('online', enLigne)
  }, [reprendre])

  // Avertit avant de quitter la page pendant un envoi.
  useEffect(() => {
    if (etat !== 'envoi' && etat !== 'interrompu' && etat !== 'copie') return
    const avant = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', avant)
    return () => window.removeEventListener('beforeunload', avant)
  }, [etat])

  useEffect(() => () => envoiRef.current?.annuler(), [])

  // « Choisir dans Google Drive » : une vidéo déjà dans Drive.
  const choisirDansDrive = useCallback(async () => {
    setMessage(null)
    try {
      const choix = await choisirVideoDrive()
      if (!choix) return
      setFichier(null)
      setResultat(null)
      setEtat('verification')
      const meta = await lireFichierDrive(obtenirJetonDrive, choix.id)
      const examen = examinerFichierDrive(meta, brutId)
      if (examen.erreur) {
        setEtat('erreur')
        setMessage(examen.erreur)
        return
      }
      setFichierDrive(examen.fichier)
      if (examen.dansBrut) {
        setResultat({ fichierDriveId: examen.fichier.id, nomSource: examen.fichier.nom, origine: 'brut' })
        setEtat('pret')
      } else {
        setEtat('a_copier')
      }
    } catch (e) {
      echec(e)
    }
  }, [brutId, echec])

  const copierDansBrut = useCallback(async () => {
    if (!fichierDrive) return
    setEtat('copie')
    setMessage(null)
    try {
      if (!(await accesBrutOk())) return
      const copie = await copierDansDossier(obtenirJetonDrive, fichierDrive.id, brutId, nomFichierSur(fichierDrive.nom))
      setResultat({ fichierDriveId: copie.id, nomSource: copie.name, origine: 'copie' })
      setEtat('pret')
    } catch (e) {
      if (e?.code === 'interrompu') {
        setEtat('a_copier')
        setMessage(e.message)
      } else echec(e)
    }
  }, [fichierDrive, brutId, accesBrutOk, echec])

  // « Autoriser le dossier Brut » : la personne choisit Brut dans le Picker,
  // ce qui donne à l'app (drive.file) l'accès à ce dossier pour son compte.
  const autoriserBrut = useCallback(async () => {
    setMessage(null)
    try {
      const choix = await choisirDossierDrive()
      if (!choix) {
        setMessage(MESSAGES_DOSSIER_BRUT.acces)
        return
      }
      if (choix.id !== brutId) {
        setMessage(`Le dossier choisi (« ${choix.nom} ») n'est pas le dossier Brut configuré. Choisis NEO vidéo/Brut.`)
        return
      }
      if (fichierDrive && !fichier) await copierDansBrut()
      else await demarrer()
    } catch (e) {
      echec(e)
    }
  }, [brutId, fichier, fichierDrive, copierDansBrut, demarrer, echec])

  return {
    etat, message, fichier, fichierDrive, progression, resultat,
    choisirFichier, demarrer, reprendre, annuler, recommencer, choisirDansDrive, copierDansBrut, autoriserBrut,
  }
}
