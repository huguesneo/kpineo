import Card from '../../shared/Card'
import Badge from '../../shared/Badge'
import { formatCAD, num } from '../../../lib/performanceCalc'

function Cond({ ok, children }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs ${ok ? 'text-emerald-700' : 'text-red-600'}`}>
      <span>{ok ? '✅' : '❌'}</span><span>{children}</span>
    </div>
  )
}

// Carte statut REER de Cloé (conditions KPI réseaux sociaux).
export default function CloeReerCard({ cloe }) {
  if (!cloe) return null

  if (!cloe.configured) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-bold text-[#1a1a1a]">Cloé</h4>
          <Badge variant="warning">Support &amp; réseaux</Badge>
        </div>
        <p className="text-xs font-semibold text-amber-600">Salaire de Cloé non configuré — REER désactivé.</p>
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-bold text-[#1a1a1a]">Cloé</h4>
        <Badge variant="warning">Support &amp; réseaux</Badge>
      </div>
      <div className="space-y-1 mb-3">
        <Cond ok={cloe.plancherAtteint}>Plancher NEO atteint</Cond>
        <Cond ok={cloe.reelsOK}>Reels {cloe.reels}/{cloe.seuilReels}</Cond>
        {cloe.leadsActive
          ? <Cond ok={cloe.leadsOK}>Leads organiques {cloe.leads}/{cloe.seuilLeads}</Cond>
          : <div className="flex items-center gap-1.5 text-xs text-[#9ca3af]"><span>—</span><span>Leads non requis</span></div>}
        <Cond ok={cloe.cotisationOK}>Cotisation {cloe.cotisation > 0 ? formatCAD(cloe.cotisation) : 'aucune'}</Cond>
      </div>
      <div className="pt-2 border-t border-[#f1f5f9]">
        {cloe.eligible ? (
          <p className="text-sm font-bold text-[#00bbb1]">→ NEO verse {formatCAD(cloe.montant)} ce mois</p>
        ) : (
          <>
            <p className="text-sm font-bold text-red-600">→ NEO verse — $ ce mois</p>
            <p className="text-[11px] text-[#9ca3af] mt-0.5">{cloe.raison}</p>
          </>
        )}
      </div>
    </Card>
  )
}
