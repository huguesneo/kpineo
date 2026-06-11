import { useState } from 'react'
import Card from '../../shared/Card'
import Button from '../../shared/Button'

// Carte admin : lier un compte + afficher/cacher l'espace REER + publier.
export default function AccessCard({ naturoKey, label, data }) {
  const { params, naturoProfiles = [], saveReerVisibility, linkNaturoAccount, publishNaturoSnapshots } = data
  const visible = !!params[`reer_visible_${naturoKey}`]
  const linked = naturoProfiles.find(p => p.perf_naturo_key === naturoKey)
  const [publishing, setPublishing] = useState(false)

  if (!saveReerVisibility) return null

  async function handlePublish() {
    setPublishing(true)
    await publishNaturoSnapshots?.()
    setPublishing(false)
  }

  return (
    <Card className="p-4">
      <h4 className="text-sm font-bold text-[#1a1a1a] mb-3">Accès de {label} à son espace REER</h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        <div>
          <label className="text-xs font-semibold text-[#6b7280] block mb-1">Compte lié</label>
          <select
            value={linked?.id || ''}
            onChange={e => linkNaturoAccount(naturoKey, e.target.value || null)}
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
          >
            <option value="">— Aucun compte —</option>
            {naturoProfiles.map(p => (
              <option key={p.id} value={p.id}>{p.full_name} ({p.email})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-[#6b7280] block mb-1">Afficher le REER</label>
          <button
            onClick={() => saveReerVisibility(naturoKey, !visible)}
            disabled={!linked}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 ${visible ? 'bg-[#00bbb1]/10 text-[#00bbb1]' : 'bg-gray-100 text-[#6b7280]'}`}
          >
            <span className={`w-9 h-5 rounded-full relative transition-colors ${visible ? 'bg-[#00bbb1]' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${visible ? 'left-4' : 'left-0.5'}`} />
            </span>
            {visible ? 'Affiché' : 'Caché'}
          </button>
        </div>
        <div>
          <Button variant="secondary" size="sm" onClick={handlePublish} loading={publishing}>
            Publier les données
          </Button>
        </div>
      </div>
      {!linked && <p className="text-xs text-amber-600 mt-2">Lie d'abord un compte pour pouvoir activer l'affichage.</p>}
      {linked && visible && <p className="text-xs text-emerald-600 mt-2">✅ {linked.full_name} voit son espace Performance &amp; REER.</p>}
    </Card>
  )
}
