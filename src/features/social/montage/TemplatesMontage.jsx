import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../../components/shared/Button'
import Badge from '../../../components/shared/Badge'
import {
  etatProposer, validerProposition, NOM_MAX, DESCRIPTION_MAX, MOTIF_MAX,
  statutTemplate, tacheStyle, cheminApercuTemplate, actionsTemplate, dateTemplate, messageErreurTemplate,
} from '../../../lib/montageTemplates'
import { dateFr } from './PastilleMac'

const CHAMP = 'w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]/30 focus:border-[#00bbb1]'

// « Proposer comme template » sous la bande des versions : la version
// affichée devient une proposition (nom, description). Hugues l'approuvera
// dans l'écran Templates ; ouvertInitial sert aux tests (rendu serveur).
export function ProposerTemplate({ job, taches, version, templates, onProposer, ouvertInitial = false }) {
  const etat = etatProposer({ job, taches, version, templates })
  const [ouvert, setOuvert] = useState(ouvertInitial)
  const [nom, setNom] = useState('')
  const [description, setDescription] = useState('')
  const [envoi, setEnvoi] = useState({ enCours: false, erreur: null, fait: null })
  if (!etat.visible) return null

  async function proposer(e) {
    e.preventDefault()
    const invalide = validerProposition({ nom, description })
    if (invalide) { setEnvoi({ enCours: false, erreur: invalide, fait: null }); return }
    setEnvoi({ enCours: true, erreur: null, fait: null })
    try {
      const t = await onProposer({ numero: version.numero, nom, description })
      setOuvert(false)
      setNom('')
      setDescription('')
      setEnvoi({ enCours: false, erreur: null, fait: t?.nom || nom.trim() })
    } catch (err) {
      setEnvoi({ enCours: false, erreur: messageErreurTemplate(err), fait: null })
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-[#f0f0f2]">
      {ouvert && !etat.desactive ? (
        <form onSubmit={proposer} aria-label={`Proposer la v${version.numero} comme template`} className="rounded-lg border border-[#00bbb1]/40 bg-[#00bbb1]/5 p-3 text-sm space-y-2">
          <p className="font-semibold text-[#1a1a1a]">Proposer la v{version.numero} comme template</p>
          <p className="text-xs text-[#374151]">
            Hugues verra l&apos;aperçu de cette version dans l&apos;écran Templates. S&apos;il l&apos;approuve, le Mac enregistre le style
            et le template apparaît dans « Nouvelle vidéo ».
          </p>
          <div>
            <label htmlFor="template-nom" className="block text-xs font-semibold text-[#374151] mb-1">Nom du template</label>
            <input id="template-nom" value={nom} maxLength={NOM_MAX} onChange={(e) => setNom(e.target.value)} className={CHAMP} placeholder="Ex. : Entrevue rythmée" />
          </div>
          <div>
            <label htmlFor="template-description" className="block text-xs font-semibold text-[#374151] mb-1">
              Description courte <span className="font-normal text-[#6b7280]">(optionnelle)</span>
            </label>
            <textarea id="template-description" rows={2} value={description} maxLength={DESCRIPTION_MAX} onChange={(e) => setDescription(e.target.value)} className={CHAMP} placeholder="Quand l'utiliser, ce qui le distingue." />
          </div>
          {envoi.erreur && <p className="text-xs text-red-600">{envoi.erreur}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOuvert(false)} disabled={envoi.enCours}>Annuler</Button>
            <Button type="submit" size="sm" loading={envoi.enCours}>Proposer</Button>
          </div>
        </form>
      ) : (
        <div className="space-y-1">
          <Button type="button" variant="secondary" size="sm" onClick={() => { setOuvert(true); setEnvoi({ enCours: false, erreur: null, fait: null }) }} disabled={etat.desactive}>
            Proposer comme template
          </Button>
          {etat.desactive && etat.raison && <p className="text-xs text-[#6b7280]" role="status">{etat.raison}</p>}
          {envoi.fait && !etat.desactive && <p className="text-xs text-emerald-700" role="status">Template « {envoi.fait} » proposé.</p>}
        </div>
      )}
    </div>
  )
}

// Décision de Hugues : Approuver, Refuser (motif facultatif), Archiver.
// Rien n'est rendu pour info@ (actionsTemplate) ; la base refuse de toute façon.
export function DecisionTemplate({ template, email, apercuPret, onDecider, refusOuvertInitial = false }) {
  const actions = actionsTemplate({ template, email, apercuPret })
  const [refus, setRefus] = useState(refusOuvertInitial)
  const [archive, setArchive] = useState(false)
  const [motif, setMotif] = useState('')
  const [envoi, setEnvoi] = useState({ enCours: false, erreur: null })
  if (!actions.approuver && !actions.refuser && !actions.archiver) return null

  async function decider(action) {
    setEnvoi({ enCours: true, erreur: null })
    try {
      await onDecider(template.id, action, motif)
      setEnvoi({ enCours: false, erreur: null })
      setRefus(false)
      setArchive(false)
    } catch (err) {
      setEnvoi({ enCours: false, erreur: messageErreurTemplate(err) })
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {actions.approuver && !refus && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => decider('approuver')} disabled={actions.approuverDesactive} loading={envoi.enCours}>Approuver</Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setRefus(true)} disabled={envoi.enCours}>Refuser</Button>
        </div>
      )}
      {actions.approuverDesactive && <p className="text-xs text-[#6b7280]" role="status">L&apos;aperçu de la version proposée n&apos;est pas disponible : impossible d&apos;approuver sans le voir.</p>}
      {actions.refuser && refus && (
        <div role="alertdialog" aria-label={`Refuser « ${template.nom} »`} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm space-y-2">
          <label htmlFor={`motif-${template.id}`} className="block text-xs font-semibold text-red-800">
            Motif <span className="font-normal">(facultatif, visible par la personne qui l&apos;a proposé)</span>
          </label>
          <input id={`motif-${template.id}`} value={motif} maxLength={MOTIF_MAX} onChange={(e) => setMotif(e.target.value)} className={CHAMP} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setRefus(false)} disabled={envoi.enCours}>Annuler</Button>
            <Button type="button" variant="danger" size="sm" onClick={() => decider('refuser')} loading={envoi.enCours}>Refuser</Button>
          </div>
        </div>
      )}
      {actions.archiver && (archive ? (
        <div role="alertdialog" aria-label={`Archiver « ${template.nom} »`} className="rounded-lg border border-gray-200 bg-[#f9fafb] p-3 text-sm">
          <p className="text-[#374151]">
            Le template sort de la galerie de « Nouvelle vidéo ». Les montages qui l&apos;ont déjà utilisé ne changent pas,
            et son style reste enregistré dans video-neo.
          </p>
          <div className="flex flex-wrap justify-end gap-2 mt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setArchive(false)} disabled={envoi.enCours}>Annuler</Button>
            <Button type="button" size="sm" onClick={() => decider('archiver')} loading={envoi.enCours}>Archiver</Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={() => setArchive(true)}>Retirer de la galerie</Button>
      ))}
      {envoi.erreur && <p className="text-xs text-red-600">{envoi.erreur}</p>}
    </div>
  )
}

// Une ligne de l'écran Templates.
export function CarteTemplateListe({ template, titreMontage, versions, taches, noms = {}, email, onApercu, onDecider, refusOuvertInitial }) {
  const statut = statutTemplate(template, tacheStyle(taches, template.id))
  const chemin = cheminApercuTemplate(template, versions)
  const apercuTemplate = template.style_enregistre && template.chemin_apercu
  return (
    <li className="rounded-xl border border-[#e5e7eb] bg-white p-4" data-statut={statut.cle}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#1a1a1a] break-words">{template.nom}</p>
          {template.description && <p className="text-sm text-[#374151] mt-0.5 break-words">{template.description}</p>}
        </div>
        <Badge variant={statut.variant}>{statut.label}</Badge>
      </div>
      {statut.detail && <p className={`text-xs mt-2 break-words ${statut.erreur ? 'text-red-600' : 'text-[#6b7280]'}`}>{statut.detail}</p>}
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-[#9ca3af]">Proposé par</dt>
        <dd className="text-[#374151]">{noms[template.propose_par] || template.propose_par || '—'}</dd>
        <dt className="text-[#9ca3af]">Date</dt>
        <dd className="text-[#374151]">{dateFr(dateTemplate(template))}</dd>
        <dt className="text-[#9ca3af]">Montage</dt>
        <dd className="text-[#374151] break-words">
          {template.job_id
            ? <Link to={`/reseaux-sociaux/montage/${template.job_id}`} className="hover:text-[#00bbb1] hover:underline">{titreMontage || 'Montage'}{template.numero_version ? ` (v${template.numero_version})` : ''}</Link>
            : 'Template de départ'}
        </dd>
      </dl>
      {chemin ? (
        <button type="button" onClick={() => onApercu({ ...template, chemin_apercu: chemin })} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#00bbb1] hover:underline">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86A1 1 0 008 5.14z" /></svg>
          {apercuTemplate ? "Voir l'aperçu du template" : `Voir l'aperçu de la v${template.numero_version ?? '?'}`}
        </button>
      ) : (
        <p className="mt-3 text-xs text-[#9ca3af]">Aperçu pas encore disponible</p>
      )}
      <DecisionTemplate template={template} email={email} apercuPret={!!chemin} onDecider={onDecider} refusOuvertInitial={refusOuvertInitial} />
    </li>
  )
}
