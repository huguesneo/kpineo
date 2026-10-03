import { useEffect, useState } from 'react'
import Button from '../../../components/shared/Button'
import { useAuth } from '../../../context/AuthContext'
import { canConfigureMontageVideo } from '../../../lib/montageVideoAccess'
import { titreDepuisNom } from '../../../lib/montageUpload'
import { prechargerGoogle, googlePickerConfigure } from '../../../lib/googlePicker'
import { ROLES_CLIP, phraseAjoutClip, messageErreurClip } from '../../../lib/montageClips'
import { useDossierBrut } from './useMontageVideo'
import { useEnvoiVideo } from './useEnvoiVideo'
import { EnvoiClip, BrutNonConfigure } from './EtapeVideo'

// Choix du rôle, comme à l'étape 1.
export function ChoixRole({ role, onRole, desactive }) {
  return (
    <div className="inline-flex rounded-lg border border-[#e5e7eb] overflow-hidden" role="group" aria-label="Rôle du clip">
      {Object.entries(ROLES_CLIP).map(([r, label]) => (
        <button
          key={r}
          type="button"
          onClick={() => onRole(r)}
          disabled={desactive}
          aria-pressed={role === r}
          className={`px-2.5 py-1.5 text-xs font-semibold ${
            role === r ? 'bg-[#00bbb1] text-white' : 'bg-white text-[#6b7280] hover:bg-gray-50'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// Ajouter (remplace = null) ou remplacer un clip après la v1 : la vidéo va
// dans Brut (envoi ou Picker, comme à l'étape 1), puis le clip est enregistré
// dans video_clips. Aucune ronde ne part : onFini reçoit la phrase à mettre
// dans la demande.
export default function AjoutClip({ remplace, clips, avertissement, onAjouter, onFini, onAnnuler }) {
  const { user } = useAuth()
  const brut = useDossierBrut()
  const envoi = useEnvoiVideo(brut.dossier)
  const [role, setRole] = useState(remplace?.role ?? 'broll')
  const [nom, setNom] = useState('')
  const [enregistrement, setEnregistrement] = useState({ enCours: false, erreur: null })

  useEffect(() => { prechargerGoogle() }, [])

  // Nom proposé : celui du fichier, dès que la vidéo est dans Brut.
  const { etat, resultat } = envoi
  const nomOrigine = envoi.fichier?.name || envoi.fichierDrive?.nom
  useEffect(() => {
    if (etat === 'pret' && resultat) setNom(n => n || titreDepuisNom(nomOrigine || resultat.nomSource))
  }, [etat, resultat, nomOrigine])

  const pret = etat === 'pret' && !!resultat
  const envoiActif = !['choix', 'erreur', 'pret'].includes(etat)

  async function enregistrer() {
    if (!pret || !nom.trim()) return
    setEnregistrement({ enCours: true, erreur: null })
    try {
      const clip = await onAjouter({
        nom,
        role,
        fichierDriveId: resultat.fichierDriveId,
        nomSource: resultat.nomSource,
        remplaceOrdre: remplace?.ordre ?? null,
      })
      onFini(phraseAjoutClip(clip, remplace, clips))
    } catch (e) {
      setEnregistrement({ enCours: false, erreur: messageErreurClip(e) })
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-[#e5e7eb] bg-gray-50 p-3 space-y-3" data-testid="ajout-clip">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#1a1a1a]">
          {remplace ? `Remplacer le clip ${remplace.ordre} « ${remplace.nom} »` : 'Ajouter un clip'}
        </p>
        <ChoixRole role={role} onRole={setRole} desactive={enregistrement.enCours} />
      </div>
      {avertissement && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{avertissement}</p>
      )}

      {brut.loading ? (
        <p className="text-sm text-[#6b7280]">Chargement...</p>
      ) : brut.error ? (
        <p className="text-sm text-red-700">
          La configuration du module ne peut pas être lue. {brut.error}{' '}
          <button onClick={brut.reload} className="font-semibold underline">Réessayer</button>
        </p>
      ) : !brut.dossier ? (
        <BrutNonConfigure peutConfigurer={canConfigureMontageVideo(user?.email)} />
      ) : !googlePickerConfigure() ? (
        <p className="text-sm text-red-700">
          Google Drive n&apos;est pas configuré dans le hub : VITE_GOOGLE_CLIENT_ID et VITE_GOOGLE_API_KEY manquent.
        </p>
      ) : (
        <EnvoiClip envoi={envoi} ajout verrouille={enregistrement.enCours} />
      )}

      {pret && (
        <div>
          <label htmlFor="nom-clip-ajoute" className="block text-xs font-semibold text-[#1a1a1a] mb-1">Nom du clip</label>
          <input
            id="nom-clip-ajoute"
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            maxLength={120}
            className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]/30 focus:border-[#00bbb1]"
          />
          {!nom.trim() && <p className="mt-1 text-xs text-red-600">Donne un nom au clip.</p>}
        </div>
      )}

      {enregistrement.erreur && <p className="text-xs text-red-600">{enregistrement.erreur}</p>}
      <p className="text-xs text-[#6b7280]">
        Le clip est gardé dans le montage, rien n&apos;est effacé. Une phrase est ajoutée à ta demande : rien ne part avant que tu l&apos;envoies.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={enregistrer} disabled={!pret || !nom.trim()} loading={enregistrement.enCours}>
          {remplace ? `Remplacer le clip ${remplace.ordre}` : 'Ajouter ce clip'}
        </Button>
        {!envoiActif && (
          <Button size="sm" variant="secondary" onClick={onAnnuler} disabled={enregistrement.enCours}>Annuler</Button>
        )}
      </div>
    </div>
  )
}
