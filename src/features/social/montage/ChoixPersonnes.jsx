import { PERSONNES } from '../../../lib/montageVideo'

// « Qui est dans la vidéo ? » : choix obligatoire, sans valeur par défaut.
// Il décide de la transcription : Scribe (moi ou l'équipe) ou Whisper sur le
// Mac (une cliente : rien ne part chez ElevenLabs).
export default function ChoixPersonnes({ valeur, onChange, erreur, verrouille }) {
  return (
    <fieldset className="mt-6" aria-describedby={erreur ? 'personnes-erreur' : undefined}>
      <legend className="text-sm font-bold text-[#1a1a1a] mb-2">Qui est dans la vidéo ?</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {PERSONNES.map(p => {
          const choisi = valeur === p.valeur
          return (
            <label
              key={p.valeur}
              className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                choisi ? 'border-[#00bbb1] bg-[#00bbb1]/5' : 'border-gray-200 bg-white hover:border-gray-300'
              } ${verrouille ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                name="personnes"
                value={p.valeur}
                checked={choisi}
                disabled={verrouille}
                onChange={() => onChange(p.valeur)}
                className="mt-1 accent-[#00bbb1]"
              />
              <span>
                <span className="block text-sm font-semibold text-[#1a1a1a]">{p.libelle}</span>
                <span className="block text-xs text-[#6b7280]">{p.aide}</span>
              </span>
            </label>
          )
        })}
      </div>
      {erreur && <p id="personnes-erreur" className="mt-2 text-xs text-red-600">{erreur}</p>}
    </fieldset>
  )
}
