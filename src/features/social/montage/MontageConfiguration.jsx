import { useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../../components/layout/Layout'
import Header from '../../../components/layout/Header'
import Card from '../../../components/shared/Card'
import Button from '../../../components/shared/Button'
import { SkeletonLine } from '../../../components/shared/Skeleton'
import { choisirDossierDrive, googlePickerConfigure } from '../../../lib/googlePicker'
import { useDossierBrut } from './useMontageVideo'

// Réglages du module (Hugues seulement) : dossier « NEO vidéo/Brut » où le hub
// déposera les vidéos (phase 2). Avec la portée drive.file, l'app n'a accès à
// ce dossier que s'il a été choisi une fois dans le Google Picker.
export default function MontageConfiguration() {
  const { dossier, loading, error, reload, enregistrer } = useDossierBrut()
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState(null)

  async function choisir() {
    setEnCours(true)
    setMessage(null)
    try {
      const choix = await choisirDossierDrive()
      if (!choix) return
      await enregistrer(choix)
      setMessage(
        choix.nom === 'Brut'
          ? { type: 'ok', texte: 'Dossier Brut enregistré.' }
          : { type: 'attention', texte: `Dossier « ${choix.nom} » enregistré. Attention : il ne s'appelle pas « Brut ». Vérifie que c'est bien NEO vidéo/Brut.` },
      )
    } catch (e) {
      setMessage({ type: 'erreur', texte: e.message || 'Le dossier ne peut pas être enregistré.' })
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Layout>
      <Link to="/reseaux-sociaux/montage" className="inline-flex items-center gap-1 text-sm font-semibold text-[#6b7280] hover:text-[#1a1a1a] mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Retour aux montages
      </Link>
      <Header title="Configuration du montage vidéo" />

      <Card className="p-6 max-w-2xl">
        <h2 className="text-base font-bold text-[#1a1a1a]">Dossier des vidéos brutes</h2>
        <p className="text-sm text-[#6b7280] mt-1">
          Les vidéos déposées dans le hub iront dans ce dossier Google Drive. Choisis le dossier « Brut » qui se trouve dans « NEO vidéo ».
        </p>

        <div className="mt-5 rounded-lg border border-[#e5e7eb] bg-white p-4">
          {loading ? (
            <SkeletonLine className="w-1/2" />
          ) : error ? (
            <div>
              <p className="text-sm font-semibold text-red-700">Impossible de lire la configuration.</p>
              <p className="text-xs text-[#6b7280] mt-1">{error}</p>
              <button onClick={reload} className="mt-2 text-sm font-semibold text-[#00bbb1] hover:underline">Réessayer</button>
            </div>
          ) : dossier ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Dossier Brut configuré : {dossier.nom}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-700">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              Non configuré
            </p>
          )}
        </div>

        {message && (
          <p className={`mt-4 text-sm ${
            message.type === 'ok' ? 'text-emerald-700' : message.type === 'attention' ? 'text-amber-700' : 'text-red-700'
          }`}>
            {message.texte}
          </p>
        )}

        {googlePickerConfigure() ? (
          <Button size="lg" className="mt-5" onClick={choisir} loading={enCours} disabled={loading}>
            {dossier ? 'Choisir un autre dossier' : 'Choisir le dossier dans Google Drive'}
          </Button>
        ) : (
          <p className="mt-5 text-sm text-red-700">
            Google Drive n'est pas configuré : ajoute VITE_GOOGLE_CLIENT_ID et VITE_GOOGLE_API_KEY dans .env.local, puis relance le hub.
          </p>
        )}
      </Card>
    </Layout>
  )
}
