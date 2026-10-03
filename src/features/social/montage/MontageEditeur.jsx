import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Layout from '../../../components/layout/Layout'
import Card from '../../../components/shared/Card'
import Badge from '../../../components/shared/Badge'
import { isAgentEnLigne, statutMontage, STATUTS_EN_TRAITEMENT } from '../../../lib/montageVideo'
import {
  jobIdValide, etatEnvoi, filConversation, versionAffichee, dernierNumero, tacheActive,
} from '../../../lib/montageEditeur'
import { etatCorrection, correctionsAEnvoyer } from '../../../lib/montageSousTitres'
import { useAgentStatus } from './useMontageVideo'
import { useMontageEditeur, useNoms, useUrlApercu, useConfirmerSortie } from './useMontageEditeur'
import PastilleMac from './PastilleMac'
import LecteurApercu, { EtatProgression } from './LecteurApercu'
import FilConversation from './FilConversation'
import BandeVersions from './BandeVersions'
import ClipsMontage from './ClipsMontage'
import ZoneDemande from './ZoneDemande'
import PanneauSousTitres from './PanneauSousTitres'

function Retour() {
  return (
    <Link to="/reseaux-sociaux/montage" className="inline-flex items-center gap-1 text-sm font-semibold text-[#6b7280] hover:text-[#1a1a1a] mb-4">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
      Retour aux montages
    </Link>
  )
}

function Message({ titre, texte, action }) {
  return (
    <Layout>
      <Retour />
      <Card className="p-8 text-center">
        <p className="text-base font-semibold text-[#1a1a1a]">{titre}</p>
        <p className="text-sm text-[#6b7280] mt-1">{texte}</p>
        {action && <div className="mt-4">{action}</div>}
      </Card>
    </Layout>
  )
}

export default function MontageEditeur() {
  const { jobId } = useParams()
  if (!jobIdValide(jobId)) {
    return <Message titre="Montage introuvable" texte="L'adresse de ce montage n'est pas valide." />
  }
  return <Editeur key={jobId} jobId={jobId} />
}

function Editeur({ jobId }) {
  const { job, versions, taches, clips, loading, error, introuvable, direct, reload, envoyer, corriger } = useMontageEditeur(jobId)
  const agent = useAgentStatus()
  const enLigne = !agent.error && isAgentEnLigne(agent.status?.dernier_signal, agent.maintenant)
  const noms = useNoms([job?.cree_par, ...versions.map(v => v.auteur), ...taches.map(t => t.cree_par)])

  // Version choisie dans la bande (null = suivre la dernière). Quand une
  // nouvelle version arrive, le lecteur passe dessus.
  const [numeroChoisi, setNumeroChoisi] = useState(null)
  const dernier = dernierNumero(versions)
  const dernierVu = useRef(null)
  useEffect(() => {
    if (loading) return
    if (dernierVu.current !== null && dernier > dernierVu.current) setNumeroChoisi(null)
    dernierVu.current = dernier
  }, [dernier, loading])

  const version = versionAffichee(versions, numeroChoisi)
  const apercu = useUrlApercu(version?.chemin_apercu)
  const dernierRenouvellement = useRef(0)
  function erreurChargement() {
    // Une URL expirée ou coupée : on en redemande une, au plus toutes les 10 s.
    if (Date.now() - dernierRenouvellement.current < 10000) return
    dernierRenouvellement.current = Date.now()
    apercu.renouveler()
  }

  // Corrections de sous-titres pas encore envoyées, pour une version donnée
  // (seule la version actuelle se corrige ; une nouvelle version les oublie).
  const [brouillons, setBrouillons] = useState({ numero: null, textes: {} })
  const [saut, setSaut] = useState(null)
  const versionCourante = versions.find(v => v.numero === job?.version_courante)
  const textesCourants = brouillons.numero === job?.version_courante ? brouillons.textes : {}
  const nonEnvoyees = job?.statut !== 'termine' && correctionsAEnvoyer(versionCourante?.sous_titres, textesCourants).modifiees > 0
  useConfirmerSortie(nonEnvoyees)

  const modifierSousTitre = useCallback((cle, texte) => {
    setBrouillons(prev => {
      const numero = job?.version_courante ?? null
      const textes = prev.numero === numero ? prev.textes : {}
      return { numero, textes: { ...textes, [cle]: texte } }
    })
  }, [job?.version_courante])
  const annulerSousTitres = useCallback(() => setBrouillons({ numero: null, textes: {} }), [])
  const appliquerSousTitres = useCallback(async (corrections) => {
    await corriger(corrections)
    setBrouillons({ numero: null, textes: {} })
  }, [corriger])
  const sauter = useCallback((secondes) => setSaut({ secondes, tour: Date.now() }), [])

  if (loading && !job) {
    return <Message titre="Chargement du montage..." texte="Un instant." />
  }
  if (error && !job) {
    return (
      <Message
        titre="Impossible de charger le montage"
        texte={`Vérifie ta connexion, puis réessaie. Détail : ${error}`}
        action={<button onClick={reload} className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-white border border-gray-200 hover:bg-gray-50 text-gray-700">Réessayer</button>}
      />
    )
  }
  if (introuvable || !job) {
    return <Message titre="Montage introuvable" texte="Ce montage n'existe plus ou ton compte n'y a pas accès." />
  }

  const statut = statutMontage(job.statut)
  const etat = etatEnvoi({ job, taches })
  const messages = filConversation({ versions, taches })
  const enPreparation = version && (STATUTS_EN_TRAITEMENT.includes(job.statut) || tacheActive(taches))

  return (
    <Layout>
      <Retour />

      {/* En haut : titre, statut, Mac en ligne */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[#1a1a1a] break-words">{job.titre}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <Badge variant={statut.variant}>{statut.label}</Badge>
            {job.version_courante > 0 && <span className="text-xs text-[#6b7280]">Version actuelle : v{job.version_courante}</span>}
          </div>
        </div>
        <PastilleMac {...agent} compacte />
      </div>

      {!agent.loading && !enLigne && (
        <Card className="p-4 mb-4 border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-800">
            {agent.error ? 'Impossible de savoir si le Mac de montage est en ligne.' : 'Le Mac de montage est hors ligne, ta demande sera traitée à son retour.'}
          </p>
        </Card>
      )}

      {job.statut === 'erreur' && (
        <Card className="p-4 mb-4 border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-800">Le montage est en erreur</p>
          <p className="text-sm text-red-700 mt-0.5 whitespace-pre-wrap">{job.erreur || "L'agent a signalé une erreur sans message."}</p>
          <p className="text-xs text-red-600 mt-1">
            {job.version_courante > 0
              ? 'Les versions déjà faites restent disponibles. Tu peux renvoyer une demande dans le fil.'
              : 'Tu peux relancer le montage depuis le fil, avec ou sans précision.'}
          </p>
        </Card>
      )}

      {direct === false && (
        <p className="text-xs text-[#6b7280] mb-4">La mise à jour en direct est interrompue : la page se rafraîchit toutes les 3 s.</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-4 lg:gap-6">
        {/* Lecteur (au centre) */}
        <Card className="p-4 lg:col-start-1 lg:row-start-1">
          {enPreparation && (
            <div className="mb-3 rounded-lg bg-[#00bbb1]/5 border border-[#00bbb1]/30 px-3 py-2 text-xs text-[#374151]">
              <span className="font-semibold text-[#00bbb1]">Nouvelle version en préparation</span>
              {STATUTS_EN_TRAITEMENT.includes(job.statut)
                ? <> · {job.etape || statut.label} · {job.progression ?? 0} %</>
                : <> · en attente de l'agent</>}
            </div>
          )}
          {version ? (
            <>
              <LecteurApercu numero={version.numero} url={apercu.url} erreur={apercu.erreur} onErreurChargement={erreurChargement} saut={saut} />
              <p className="text-center text-xs text-[#6b7280] mt-2">
                Version {version.numero}{version.numero === job.version_courante ? ' (actuelle)' : ''}
              </p>
            </>
          ) : (
            <EtatProgression job={job} enLigne={enLigne} />
          )}
        </Card>

        {/* Bande des versions, sous-titres, puis les clips (sous le lecteur) */}
        {(versions.length > 0 || clips.length > 0) && (
          <div className="space-y-4 lg:col-start-1 lg:row-start-2">
            {versions.length > 0 && (
              <Card className="p-3">
                <BandeVersions
                  versions={versions}
                  numeroAffiche={version?.numero}
                  versionCourante={job.version_courante}
                  onChoisir={setNumeroChoisi}
                />
              </Card>
            )}
            {version && (
              <Card className="p-4">
                <PanneauSousTitres
                  key={version.numero}
                  version={version}
                  etat={etatCorrection({ job, taches, version })}
                  brouillons={brouillons.numero === version.numero ? brouillons.textes : {}}
                  onModifier={modifierSousTitre}
                  onAnnuler={annulerSousTitres}
                  onAppliquer={appliquerSousTitres}
                  onSauter={sauter}
                />
              </Card>
            )}
            {clips.length > 0 && (
              <Card className="p-4">
                <ClipsMontage clips={clips} />
              </Card>
            )}
          </div>
        )}

        {/* Fil de conversation (à droite) */}
        <Card className="flex flex-col lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:max-h-[calc(100vh-12rem)]">
          <h2 className="text-base font-bold text-[#1a1a1a] px-4 pt-4 pb-2">Conversation</h2>
          <div className="flex-1 overflow-y-auto px-4 py-2 min-h-[200px] max-h-[60vh] lg:max-h-none">
            <FilConversation messages={messages} noms={noms} job={job} />
          </div>
          <div className="border-t border-[#e5e7eb] p-4">
            <ZoneDemande etat={etat} enLigne={enLigne} onEnvoyer={envoyer} />
          </div>
        </Card>
      </div>
    </Layout>
  )
}
