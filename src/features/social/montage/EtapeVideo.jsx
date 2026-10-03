import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../../components/shared/Button'
import { ACCEPT_VIDEO, formatOctets, formatDuree } from '../../../lib/montageUpload'
import { googlePickerConfigure } from '../../../lib/googlePicker'
import { MAX_CLIPS } from '../../../lib/montageClips'
import ListeClips from './ListeClips'

function IconeVideo({ className = 'w-7 h-7' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    </svg>
  )
}

function IconeDrive() {
  return (
    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 3.5h7l6 10.5-3.5 6h-12L2.5 14z M8.5 3.5L15 14.5h6.5 M15.5 3.5L9 14.5 5.5 20" />
    </svg>
  )
}

function Avis({ type = 'info', children }) {
  const styles = {
    info: 'bg-white border-[#e5e7eb] text-[#374151]',
    attention: 'bg-amber-50 border-amber-200 text-amber-800',
    erreur: 'bg-red-50 border-red-200 text-red-700',
    ok: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  }
  return <div className={`rounded-lg border p-4 text-sm ${styles[type]}`}>{children}</div>
}

// Dossier Brut absent de video_config : rien ne peut partir.
export function BrutNonConfigure({ peutConfigurer }) {
  return (
    <Avis type="attention">
      <p className="font-semibold">Le dossier Brut de Google Drive n&apos;est pas encore configuré.</p>
      {peutConfigurer ? (
        <p className="mt-1">
          Choisis-le une fois dans{' '}
          <Link to="/reseaux-sociaux/montage/configuration" className="font-semibold underline">Configuration</Link>
          {' '}(NEO vidéo/Brut), puis reviens ici.
        </p>
      ) : (
        <p className="mt-1">Demande à Hugues de le choisir dans la configuration du module. Tu pourras ensuite déposer ta vidéo.</p>
      )}
    </Avis>
  )
}

function ZoneDepot({ onFichier, onDrive, desactive, ajout }) {
  const input = useRef(null)
  const [survol, setSurvol] = useState(false)

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); if (!desactive) setSurvol(true) }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault()
          setSurvol(false)
          if (desactive) return
          const f = e.dataTransfer.files?.[0]
          if (f) onFichier(f)
        }}
        className={`rounded-xl border-2 border-dashed px-6 ${ajout ? 'py-6' : 'py-12'} text-center transition-colors ${
          survol ? 'border-[#00bbb1] bg-[#00bbb1]/5' : 'border-[#e5e7eb] bg-white'
        }`}
      >
        <div className="w-14 h-14 mx-auto rounded-full bg-[#00bbb1]/10 text-[#00bbb1] flex items-center justify-center mb-4">
          <IconeVideo />
        </div>
        <p className="text-base font-semibold text-[#1a1a1a]">{ajout ? 'Ajouter un clip' : 'Glisse ta vidéo ici'}</p>
        <p className="text-sm text-[#6b7280] mt-1">.mp4, .mov ou .m4v, envoyée telle quelle dans Google Drive (aucune compression)</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Button variant="secondary" onClick={() => input.current?.click()} disabled={desactive}>
            Choisir un fichier
          </Button>
          {googlePickerConfigure() && (
            <Button variant="secondary" onClick={onDrive} disabled={desactive}>
              <IconeDrive />
              Choisir dans Google Drive
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept={ACCEPT_VIDEO}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) onFichier(f)
          }}
        />
      </div>
      <p className="mt-3 text-xs text-[#6b7280] flex gap-2">
        <svg className="w-4 h-4 flex-shrink-0 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
        </svg>
        Sur téléphone, envoie d&apos;abord la vidéo avec l&apos;app Google Drive, puis choisis-la ici : Safari compresse les vidéos de la photothèque.
      </p>
    </div>
  )
}

function BarreEnvoi({ progression, interrompu }) {
  const { envoye, total, debit, reste } = progression
  const pct = total ? Math.floor((envoye / total) * 100) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-2xl font-bold text-[#1a1a1a] tabular-nums">{pct} %</p>
        <p className="text-sm text-[#6b7280] tabular-nums">{formatOctets(envoye)} sur {formatOctets(total)}</p>
      </div>
      <div className="mt-2 h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full transition-all ${interrompu ? 'bg-amber-400' : 'bg-[#00bbb1]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-[#6b7280] tabular-nums">
        {interrompu
          ? 'En pause'
          : debit
            ? `${formatOctets(debit)}/s · ${reste != null ? `environ ${formatDuree(reste)} restantes` : 'calcul du temps restant'}`
            : 'Calcul de la vitesse...'}
      </p>
    </div>
  )
}

// Ajout d'un clip dans Brut : zone de dépôt (fichier ou Picker), envoi
// résumable, copie dans Brut, puis « prêt » (envoi.resultat). Sert à l'étape 1
// et à l'éditeur (ajouter ou remplacer un clip après la v1).
// nbClips : clips déjà là (10 au plus) ; verrouille : plus d'ajout.
export function EnvoiClip({ envoi, nbClips = 0, verrouille, ajout = nbClips > 0 }) {
  const {
    etat, message, fichier, fichierDrive, progression, resultat,
    choisirFichier, demarrer, reprendre, annuler, recommencer, choisirDansDrive, copierDansBrut, autoriserBrut,
  } = envoi
  const [enCours, setEnCours] = useState(false)
  const nomOrigine = fichier?.name || fichierDrive?.nom
  const plein = nbClips >= MAX_CLIPS
  const envoiActif = etat !== 'choix' && etat !== 'erreur' && etat !== 'pret'

  async function avecAttente(fn) {
    setEnCours(true)
    try { await fn() } finally { setEnCours(false) }
  }

  return (
    <>
      {(etat === 'choix' || etat === 'erreur') && !verrouille && (plein ? (
        <p className="text-sm text-[#6b7280]">{MAX_CLIPS} clips au plus : retire un clip pour en ajouter un autre.</p>
      ) : (
        <>
          {etat === 'erreur' && message && <Avis type="erreur">{message}</Avis>}
          <ZoneDepot onFichier={choisirFichier} onDrive={() => avecAttente(choisirDansDrive)} desactive={enCours} ajout={ajout} />
        </>
      ))}

      {envoiActif && nomOrigine && (
        <div className="flex items-center gap-3 rounded-lg border border-[#e5e7eb] bg-white p-4">
          <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-[#00bbb1]/10 text-[#00bbb1] flex items-center justify-center">
            <IconeVideo className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#1a1a1a] truncate">{nomOrigine}</p>
            <p className="text-xs text-[#6b7280]">
              {formatOctets(fichier?.size ?? fichierDrive?.taille)}
              {fichierDrive && !fichier && ' · dans Google Drive'}
            </p>
          </div>
          {etat !== 'envoi' && etat !== 'copie' && etat !== 'verification' && (
            <button onClick={recommencer} className="text-sm font-semibold text-[#6b7280] hover:text-[#1a1a1a]">
              {ajout ? 'Annuler cet ajout' : 'Changer de vidéo'}
            </button>
          )}
        </div>
      )}

      {etat === 'connexion' && (
        <Avis>
          <p>Connecte-toi à Google Drive pour envoyer la vidéo dans le dossier Brut.</p>
          <Button className="mt-3" onClick={() => demarrer()}>Se connecter et envoyer</Button>
        </Avis>
      )}

      {etat === 'verification' && (
        <p className="text-sm text-[#6b7280]">Vérification dans Google Drive...</p>
      )}

      {etat === 'acces' && (
        <Avis type="attention">
          <p>{message}</p>
          <Button className="mt-3" onClick={() => avecAttente(autoriserBrut)} loading={enCours}>
            Autoriser le dossier Brut
          </Button>
        </Avis>
      )}

      {(etat === 'envoi' || etat === 'interrompu') && (
        <div className="rounded-lg border border-[#e5e7eb] bg-white p-4">
          <BarreEnvoi progression={progression} interrompu={etat === 'interrompu'} />
          {etat === 'interrompu' && (
            <p className="mt-3 text-sm text-amber-700">
              {message} La reprise se fera toute seule au retour de la connexion.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            {etat === 'interrompu' && <Button onClick={reprendre}>Reprendre maintenant</Button>}
            <Button variant="secondary" onClick={annuler}>Annuler</Button>
          </div>
        </div>
      )}

      {etat === 'a_copier' && (
        <Avis type="attention">
          <p>
            Cette vidéo n&apos;est pas dans le dossier Brut. Pour le montage, elle doit y être : une copie sera faite
            directement dans Google Drive, sans la retélécharger.
          </p>
          {message && <p className="mt-2 text-red-700">{message}</p>}
          <div className="mt-3 flex flex-wrap gap-3">
            <Button onClick={copierDansBrut}>Copier dans Brut</Button>
            <Button variant="secondary" onClick={recommencer}>Choisir une autre vidéo</Button>
          </div>
        </Avis>
      )}

      {etat === 'copie' && <p className="text-sm text-[#6b7280]">Copie dans le dossier Brut...</p>}

      {etat === 'pret' && resultat && (
        <Avis type="ok">
          <p className="font-semibold">
            {resultat.origine === 'envoi' && 'Vidéo envoyée dans Google Drive.'}
            {resultat.origine === 'copie' && 'Vidéo copiée dans le dossier Brut.'}
            {resultat.origine === 'brut' && 'Cette vidéo est déjà dans le dossier Brut.'}
          </p>
          <p className="mt-1 text-xs break-all">Brut/{resultat.nomSource}</p>
        </Avis>
      )}
    </>
  )
}

// Étape 1, les vidéos : liste ordonnée des clips, et ajout d'un clip par dépôt
// (upload résumable vers Brut) ou choix dans Drive. Un clip prêt dans Brut
// rejoint la liste (MontageNouvelle) et la zone de dépôt revient.
// verrouille : le montage est déjà créé (lancement à réessayer), les clips ne
// changent plus.
export default function EtapeVideo({ envoi, clips = [], actionsClips, erreurClips, verrouille, titre, setTitre, erreurTitre }) {
  const envoiActif = !['choix', 'erreur', 'pret'].includes(envoi.etat)

  return (
    <div className="space-y-5">
      {actionsClips && (
        <ListeClips clips={clips} {...actionsClips} desactive={envoiActif || verrouille} erreur={erreurClips} />
      )}

      <EnvoiClip envoi={envoi} nbClips={clips.length} verrouille={verrouille} />

      {(clips.length > 0 || envoiActif) && (
        <div>
          <label htmlFor="titre-video" className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">Titre de la vidéo</label>
          <input
            id="titre-video"
            type="text"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            maxLength={120}
            className="w-full px-3 py-2.5 border border-[#e5e7eb] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]/30 focus:border-[#00bbb1]"
          />
          {erreurTitre
            ? <p className="mt-1 text-xs text-red-600">{erreurTitre}</p>
            : <p className="mt-1 text-xs text-[#6b7280]">Sert aussi de nom au dossier d&apos;export dans Google Drive (Out).</p>}
        </div>
      )}
    </div>
  )
}
