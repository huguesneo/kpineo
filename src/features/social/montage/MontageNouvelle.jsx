import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Layout from '../../../components/layout/Layout'
import Header from '../../../components/layout/Header'
import Card from '../../../components/shared/Card'
import Button from '../../../components/shared/Button'
import { SkeletonLine } from '../../../components/shared/Skeleton'
import { useAuth } from '../../../context/AuthContext'
import { canConfigureMontageVideo } from '../../../lib/montageVideoAccess'
import { titreDepuisNom } from '../../../lib/montageUpload'
import { prechargerGoogle, googlePickerConfigure } from '../../../lib/googlePicker'
import {
  validerDirection, validerTitre, nouveauMontage, messageErreurLancement,
} from '../../../lib/montageVideo'
import { useDossierBrut, useTemplatesApprouves, lancerMontage } from './useMontageVideo'
import { useEnvoiVideo } from './useEnvoiVideo'
import EtapeVideo, { BrutNonConfigure } from './EtapeVideo'
import EtapeDirection from './EtapeDirection'

function EnTeteEtape({ numero, titre, fait }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
        fait ? 'bg-[#00bbb1] text-white' : 'bg-[#00bbb1]/10 text-[#00bbb1]'
      }`}>
        {fait ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : numero}
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#00bbb1]">Étape {numero}</p>
        <h2 className="text-lg font-bold text-[#1a1a1a] leading-tight">{titre}</h2>
      </div>
    </div>
  )
}

// Nouvelle vidéo : étape 1 (la vidéo dans Brut) et étape 2 (la direction),
// puis création du montage et de sa tâche « montage ». L'agent fait le reste.
export default function MontageNouvelle() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const brut = useDossierBrut()
  const envoi = useEnvoiVideo(brut.dossier)
  const galerie = useTemplatesApprouves()

  const [titre, setTitre] = useState('')
  const [titreModifie, setTitreModifie] = useState(false)
  const [templateId, setTemplateId] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [tentative, setTentative] = useState(false)
  const [lancement, setLancement] = useState({ enCours: false, erreur: null, jobId: null })

  useEffect(() => { prechargerGoogle() }, [])

  // Titre proposé : le nom d'origine du fichier, tant que la personne ne l'a pas changé.
  const nomOrigine = envoi.fichier?.name || envoi.fichierDrive?.nom
  useEffect(() => {
    if (nomOrigine && !titreModifie) setTitre(titreDepuisNom(nomOrigine))
  }, [nomOrigine, titreModifie])

  const pret = envoi.etat === 'pret' && !!envoi.resultat
  const erreurTitre = validerTitre(titre)
  const erreurDirection = validerDirection({ templateId, prompt })

  async function lancer() {
    setTentative(true)
    if (!pret || erreurTitre || erreurDirection) return
    setLancement(l => ({ ...l, enCours: true, erreur: null }))
    try {
      await lancerMontage(nouveauMontage({
        titre,
        fichierDriveId: envoi.resultat.fichierDriveId,
        nomSource: envoi.resultat.nomSource,
        templateId,
        prompt,
      }), lancement.jobId)
      navigate('/reseaux-sociaux/montage')
    } catch (e) {
      setLancement({ enCours: false, erreur: messageErreurLancement(e), jobId: e?.jobId ?? lancement.jobId })
    }
  }

  const raisonAttente = !pret
    ? (envoi.etat === 'envoi' || envoi.etat === 'interrompu' || envoi.etat === 'copie'
      ? "Attends la fin de l'envoi de la vidéo."
      : "Ajoute d'abord la vidéo à l'étape 1.")
    : null

  return (
    <Layout>
      <Link to="/reseaux-sociaux/montage" className="inline-flex items-center gap-1 text-sm font-semibold text-[#6b7280] hover:text-[#1a1a1a] mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Retour aux montages
      </Link>
      <Header title="Nouvelle vidéo" />

      <div className="max-w-3xl space-y-6">
        <Card className="p-6">
          <EnTeteEtape numero={1} titre="La vidéo" fait={pret} />
          {brut.loading ? (
            <SkeletonLine className="w-1/2" />
          ) : brut.error ? (
            <div className="text-sm text-red-700">
              La configuration du module ne peut pas être lue. {brut.error}{' '}
              <button onClick={brut.reload} className="font-semibold underline">Réessayer</button>
            </div>
          ) : !brut.dossier ? (
            <BrutNonConfigure peutConfigurer={canConfigureMontageVideo(user?.email)} />
          ) : !googlePickerConfigure() ? (
            <p className="text-sm text-red-700">
              Google Drive n&apos;est pas configuré dans le hub : VITE_GOOGLE_CLIENT_ID et VITE_GOOGLE_API_KEY manquent.
            </p>
          ) : (
            <EtapeVideo
              envoi={envoi}
              titre={titre}
              setTitre={(t) => { setTitre(t); setTitreModifie(true) }}
              erreurTitre={tentative || titre ? erreurTitre : null}
            />
          )}
        </Card>

        <Card className="p-6">
          <EnTeteEtape numero={2} titre="La direction" />
          <EtapeDirection
            galerie={galerie}
            templateId={templateId}
            setTemplateId={setTemplateId}
            prompt={prompt}
            setPrompt={setPrompt}
            erreurDirection={erreurDirection}
            afficherErreur={tentative}
          />

          {lancement.erreur && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p>{lancement.erreur}</p>
              <p className="mt-1 text-xs text-red-600">La vidéo reste dans Google Drive : « Réessayer » ne la renvoie pas.</p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Button size="lg" onClick={lancer} loading={lancement.enCours} disabled={!pret}>
              {lancement.erreur ? 'Réessayer' : 'Lancer le montage'}
            </Button>
            {raisonAttente && <p className="text-sm text-[#6b7280]">{raisonAttente}</p>}
          </div>
        </Card>
      </div>
    </Layout>
  )
}
