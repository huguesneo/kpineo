import { useEffect, useState } from 'react'
import Modal from '../../../components/shared/Modal'
import { SkeletonLine } from '../../../components/shared/Skeleton'
import { urlSigneeApercu } from './useMontageVideo'

function CarteTemplate({ template, choisi, onChoisir, onApercu }) {
  return (
    <div
      className={`rounded-xl border-2 bg-white p-4 transition-colors ${
        choisi ? 'border-[#00bbb1] bg-[#00bbb1]/5' : 'border-[#e5e7eb] hover:border-[#00bbb1]/40'
      }`}
    >
      <button type="button" onClick={onChoisir} className="w-full text-left" aria-pressed={choisi}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-[#1a1a1a]">{template.nom}</p>
          <span className={`w-5 h-5 flex-shrink-0 rounded-full border-2 flex items-center justify-center ${
            choisi ? 'border-[#00bbb1] bg-[#00bbb1]' : 'border-gray-300'
          }`}>
            {choisi && (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
          </span>
        </div>
        <p className="text-xs text-[#6b7280] mt-1">{template.type_video}</p>
      </button>
      {template.chemin_apercu ? (
        <button type="button" onClick={onApercu} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#00bbb1] hover:underline">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86A1 1 0 008 5.14z" /></svg>
          Voir l&apos;aperçu
        </button>
      ) : (
        <p className="mt-3 text-xs text-[#9ca3af]">Aperçu pas encore disponible</p>
      )}
    </div>
  )
}

function ApercuTemplate({ template, onClose }) {
  const [url, setUrl] = useState(null)
  const [erreur, setErreur] = useState(null)
  const chemin = template?.chemin_apercu

  // Une URL signée (1 h) est demandée à l'ouverture, pour ce template seulement.
  useEffect(() => {
    setUrl(null)
    setErreur(null)
    if (!chemin) return
    let annule = false
    urlSigneeApercu(chemin)
      .then((u) => { if (!annule) setUrl(u) })
      .catch((e) => { if (!annule) setErreur(e.message || "L'aperçu ne peut pas être chargé.") })
    return () => { annule = true }
  }, [chemin])

  return (
    <Modal isOpen={!!template} onClose={onClose} title={template ? `Aperçu : ${template.nom}` : ''}>
      <div className="flex justify-center">
        {erreur ? (
          <p className="text-sm text-red-700 py-8">{erreur}</p>
        ) : url ? (
          <video src={url} controls autoPlay playsInline className="max-h-[65vh] aspect-[9/16] rounded-lg bg-black" />
        ) : (
          <div className="w-48 aspect-[9/16] rounded-lg bg-gray-100 animate-pulse" />
        )}
      </div>
    </Modal>
  )
}

// Étape 2, la direction : template approuvé et/ou prompt.
export default function EtapeDirection({ galerie, templateId, setTemplateId, prompt, setPrompt, erreurDirection, afficherErreur }) {
  const { templates, loading, error, reload } = galerie
  const [apercu, setApercu] = useState(null)
  const promptObligatoire = !templateId

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-[#1a1a1a] mb-2">Template</p>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[0, 1, 2].map(i => <div key={i} className="rounded-xl border border-[#e5e7eb] bg-white p-4"><SkeletonLine className="w-2/3" /></div>)}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Les templates ne peuvent pas être chargés. {error}{' '}
            <button onClick={reload} className="font-semibold underline">Réessayer</button>
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-[#e5e7eb] bg-white px-6 py-8 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#00bbb1]/10 text-[#00bbb1] flex items-center justify-center mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-[#1a1a1a]">Aucun template pour l&apos;instant, décris ce que tu veux</p>
            <p className="text-xs text-[#6b7280] mt-1">Les styles approuvés par Hugues apparaîtront ici.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map(t => (
              <CarteTemplate
                key={t.id}
                template={t}
                choisi={templateId === t.id}
                onChoisir={() => setTemplateId(templateId === t.id ? null : t.id)}
                onApercu={() => setApercu(t)}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <label htmlFor="prompt-montage" className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">
          Ce que tu veux{' '}
          <span className="font-normal text-[#6b7280]">{promptObligatoire ? '(obligatoire sans template)' : '(optionnel)'}</span>
        </label>
        <textarea
          id="prompt-montage"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Ex. : coupe les silences, ajoute des sous-titres dynamiques et une carte d'appel à l'action à la fin."
          className={`w-full px-3 py-2.5 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]/30 focus:border-[#00bbb1] ${
            afficherErreur && erreurDirection ? 'border-red-300' : 'border-[#e5e7eb]'
          }`}
        />
        {afficherErreur && erreurDirection && <p className="mt-1 text-xs text-red-600">{erreurDirection}</p>}
      </div>

      <ApercuTemplate template={apercu} onClose={() => setApercu(null)} />
    </div>
  )
}
