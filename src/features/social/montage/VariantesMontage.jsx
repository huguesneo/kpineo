import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../../components/shared/Button'
import Badge from '../../../components/shared/Badge'
import { statutMontage } from '../../../lib/montageVideo'
import { messageErreurEnvoi } from '../../../lib/montageEditeur'
import {
  etatVariante, typesDisponibles, validerVariante, texteConfirmationVariante, HOOK_MAX, CONSIGNE_MAX,
} from '../../../lib/montageVariantes'

const CHAMP = 'w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]/30 focus:border-[#00bbb1]'

// « Créer une variante » sous la bande des versions, sur la version actuelle :
// un seul type à la fois (autre hook, format 4:5, format 1:1). L'agent crée
// un nouveau montage ; ouvertInitial et typeInitial servent aux tests (rendu serveur).
export function CreerVariante({ job, taches, version, onCreer, ouvertInitial = false, typeInitial = 'hook' }) {
  const etat = etatVariante({ job, taches, version })
  const types = typesDisponibles(job)
  const [ouvert, setOuvert] = useState(ouvertInitial)
  const [type, setType] = useState(typeInitial)
  const [texte, setTexte] = useState('')
  const [envoi, setEnvoi] = useState({ enCours: false, erreur: null, fait: false })
  if (!etat.visible) return null
  const typeChoisi = types.some(t => t.cle === type) ? type : 'hook'
  const hook = typeChoisi === 'hook'

  async function creer(e) {
    e.preventDefault()
    const invalide = validerVariante({ type: typeChoisi, texte })
    if (invalide) { setEnvoi({ enCours: false, erreur: invalide, fait: false }); return }
    setEnvoi({ enCours: true, erreur: null, fait: false })
    try {
      await onCreer({ type: typeChoisi, texte })
      setOuvert(false)
      setTexte('')
      setEnvoi({ enCours: false, erreur: null, fait: true })
    } catch (err) {
      setEnvoi({ enCours: false, erreur: messageErreurEnvoi(err), fait: false })
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-[#f0f0f2]">
      {ouvert && !etat.desactive ? (
        <form onSubmit={creer} aria-label={`Créer une variante de la v${version.numero}`} className="rounded-lg border border-[#00bbb1]/40 bg-[#00bbb1]/5 p-3 text-sm space-y-2">
          <p className="font-semibold text-[#1a1a1a]">Créer une variante de la v{version.numero}</p>
          <fieldset>
            <legend className="block text-xs font-semibold text-[#374151] mb-1">Type de variante</legend>
            <div className="flex flex-wrap gap-2">
              {types.map(t => (
                <label key={t.cle} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-sm ${
                  typeChoisi === t.cle ? 'border-[#00bbb1] bg-white font-semibold text-[#1a1a1a]' : 'border-[#e5e7eb] bg-white text-[#374151]'
                }`}>
                  <input
                    type="radio"
                    name="type-variante"
                    value={t.cle}
                    checked={typeChoisi === t.cle}
                    onChange={() => { setType(t.cle); setEnvoi({ enCours: false, erreur: null, fait: false }) }}
                    className="accent-[#00bbb1]"
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="variante-texte" className="block text-xs font-semibold text-[#374151] mb-1">
              {hook
                ? 'Nouveau hook, ou consigne sur l\'accroche'
                : <>Consigne <span className="font-normal text-[#6b7280]">(facultative)</span></>}
            </label>
            <textarea
              id="variante-texte"
              rows={2}
              value={texte}
              maxLength={hook ? HOOK_MAX : CONSIGNE_MAX}
              onChange={(e) => setTexte(e.target.value)}
              className={CHAMP}
              placeholder={hook ? 'Ex. : « Ton cortisol te ment » ou : ouvre sur la question du client' : 'Ex. : garde les sous-titres au centre'}
            />
          </div>
          <p className="text-xs text-[#374151]">{texteConfirmationVariante(job, typeChoisi)}</p>
          {envoi.erreur && <p className="text-xs text-red-600">{envoi.erreur}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOuvert(false)} disabled={envoi.enCours}>Annuler</Button>
            <Button type="submit" size="sm" loading={envoi.enCours}>Créer la variante</Button>
          </div>
        </form>
      ) : (
        <div className="space-y-1">
          <Button type="button" variant="secondary" size="sm" onClick={() => { setOuvert(true); setEnvoi({ enCours: false, erreur: null, fait: false }) }} disabled={etat.desactive}>
            Créer une variante
          </Button>
          {etat.desactive && etat.raison && <p className="text-xs text-[#6b7280]" role="status">{etat.raison}</p>}
          {envoi.fait && !etat.desactive && <p className="text-xs text-emerald-700" role="status">Variante demandée : elle apparaîtra dans « Variantes ».</p>}
        </div>
      )}
    </div>
  )
}

// « Variante de <montage d'origine> » (éditeur et liste). Origine dans la
// corbeille : « (montage supprimé) », le lien ouvre le montage pour le restaurer.
export function LienOrigine({ origine, compact = false }) {
  if (!origine?.id) return null
  return (
    <p className={compact ? 'text-xs text-[#6b7280] mt-0.5' : 'text-sm text-[#6b7280] mt-1'}>
      Variante de{' '}
      <Link to={`/reseaux-sociaux/montage/${origine.id}`} className="font-semibold text-[#00bbb1] hover:underline">
        {origine.titre || 'un autre montage'}
      </Link>
      {origine.supprime && <span data-origine="supprimee"> (montage supprimé)</span>}
    </p>
  )
}

// Liste des variantes du montage d'origine (éditeur).
export function ListeVariantes({ variantes }) {
  if (!variantes?.length) return null
  return (
    <div>
      <h3 className="text-sm font-bold text-[#1a1a1a] mb-2">Variantes ({variantes.length})</h3>
      <ul className="space-y-1.5" aria-label="Variantes de ce montage">
        {variantes.map(v => {
          const statut = statutMontage(v.statut)
          return (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <Link to={`/reseaux-sociaux/montage/${v.id}`} className="font-semibold text-[#1a1a1a] hover:text-[#00bbb1] hover:underline min-w-0 break-words">
                {v.titre}
              </Link>
              <span className="flex items-center gap-2">
                <span className="text-xs text-[#6b7280]">{v.format || '9:16'}</span>
                <Badge variant={statut.variant}>{statut.label}</Badge>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Liste des montages : liens vers les variantes d'un montage d'origine.
export function LiensVariantes({ variantes }) {
  if (!variantes?.length) return null
  return (
    <p className="text-xs text-[#6b7280] mt-0.5">
      {variantes.length > 1 ? `${variantes.length} variantes : ` : 'Variante : '}
      {variantes.map((v, i) => (
        <span key={v.id}>
          {i > 0 && ', '}
          <Link to={`/reseaux-sociaux/montage/${v.id}`} className="font-semibold text-[#00bbb1] hover:underline">{v.titre}</Link>
        </span>
      ))}
    </p>
  )
}
