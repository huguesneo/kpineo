import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { fmtRdvAvecHeure } from '../../../lib/v2/format'
import { trierRappels } from '../../../lib/v2/settingV2'

const ETATS = {
  retard: { libelle: 'En retard', couleur: '#b91c1c', bg: '#fef2f2' },
  aujourdhui: { libelle: 'Aujourd’hui', couleur: '#b45309', bg: '#fffbeb' },
  avenir: { libelle: 'À venir', couleur: '#6d28d9', bg: '#f5f3ff' },
}

function Carte({ titre, couleur, compteur, children, droite = null, tour }) {
  return (
    <section data-tour={tour} className="bg-[#fcfcfd] border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden" aria-label={titre}>
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-[#f0f0f0] flex-wrap">
        <span className="w-2 h-2 rounded-full" style={{ background: couleur }} />
        <h2 className="text-[15px] font-bold text-[#1a1a1a]">{titre}</h2>
        {compteur != null && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#f3f4f6] text-[#4b5563]">{compteur}</span>}
        {droite && <div className="ml-auto">{droite}</div>}
      </div>
      {children}
    </section>
  )
}

// « Mes rappels » : en retard (rouge), aujourd'hui, puis à venir
export function MesRappels({ rappels, now, onOuvrir }) {
  const liste = trierRappels(rappels, now)
  return (
    <Carte titre="Mes rappels" couleur="#6d28d9" compteur={liste.length} tour="mes-rappels">
      {liste.length === 0 ? (
        <p className="py-5 px-4 text-center text-[13px] text-[#6b7280]">Aucun rappel. Dans la fiche d’un lead : « Mettre en rappel ».</p>
      ) : liste.map(r => {
        const e = ETATS[r.etat]
        return (
          <button key={r.id} onClick={() => onOuvrir({ contactId: r.contact_id, opportunityId: r.opportunity_id, nom: r.contact_nom ?? 'Lead' })}
            className="w-full text-left flex items-center gap-3 px-4 py-2.5 border-t border-[#f3f4f6] hover:bg-[#f9fafb]">
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap" style={{ background: e.bg, color: e.couleur }}>{e.libelle}</span>
            <span className="text-sm font-semibold text-[#1a1a1a] truncate">{r.contact_nom ?? 'Lead'}</span>
            <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: e.couleur }}>{fmtRdvAvecHeure(r.rappel_le, now)}</span>
            <span className="text-[13px] text-[#6b7280] truncate flex-1">{r.note}</span>
            {r.ghl_simule && <span title="Tag non posé dans GHL (écritures GHL désactivées pour ce contact)" className="text-[10px] font-bold text-[#9ca3af] uppercase">simulé</span>}
          </button>
        )
      })}
    </Carte>
  )
}

const LIB_TACHE = { rappel_du: 'Rappel dû', inactif_2j: 'Sans action', no_show: 'No-show', annulation: 'Annulation' }

// « Mes tâches du jour » : tâches automatiques (rappel dû, lead sans action,
// no-show / annulation à relancer). Clic = fiche du lead.
export function MesTaches({ taches, userId, now, onOuvrir, onFaite }) {
  const miennes = taches.filter(t => t.user_id === userId)
  const equipe = taches.filter(t => !t.user_id)
  const ligne = t => (
    <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-[#f3f4f6]">
      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#f3f4f6] text-[#4b5563] whitespace-nowrap">{LIB_TACHE[t.type]}</span>
      <button onClick={() => onOuvrir({ contactId: t.contact_id, nom: t.contact_nom ?? 'Lead' })} className="text-left min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#1a1a1a] truncate hover:underline">{t.titre}</p>
        {t.detail && <p className="text-xs text-[#6b7280] truncate">{t.detail}</p>}
      </button>
      <span className="text-xs text-[#9ca3af] whitespace-nowrap hidden sm:inline">{fmtRdvAvecHeure(t.due_le, now)}</span>
      <button onClick={() => onFaite(t.id)} className="text-xs font-bold text-[#047857] px-2 py-1 rounded-lg hover:bg-[#ecfdf5]">Fait</button>
    </div>
  )
  return (
    <Carte titre="Mes tâches du jour" couleur="#00bbb1" compteur={miennes.length} tour="mes-taches">
      {miennes.length === 0 && <p className="py-5 px-4 text-center text-[13px] text-[#6b7280]">Rien à faire pour l’instant.</p>}
      {miennes.map(ligne)}
      {equipe.length > 0 && (
        <details className="border-t border-[#f0f0f0]">
          <summary className="px-4 py-2.5 text-xs font-bold text-[#6b7280] cursor-pointer">Tâches d’équipe sans setter ({equipe.length})</summary>
          {equipe.map(ligne)}
        </details>
      )}
    </Carte>
  )
}

// Admin : compteur « Non qualifiés par source (30 derniers jours) » et
// interrupteur des écritures GHL réelles.
export function PanneauAdminSetting({ ecrituresReelles, onChange }) {
  const [lignes, setLignes] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [envoi, setEnvoi] = useState(false)

  const charger = useCallback(async () => {
    const { data, error } = await supabase.rpc('setting_nq_par_source', { p_jours: 30 })
    if (error) setErreur(error.message); else { setErreur(null); setLignes(data ?? []) }
  }, [])
  useEffect(() => { charger() }, [charger])

  const total = (lignes ?? []).reduce((n, l) => n + Number(l.nb), 0)
  const parCanal = (lignes ?? []).reduce((m, l) => ({ ...m, [l.canal]: (m[l.canal] ?? 0) + Number(l.nb) }), {})

  async function basculer() {
    const cible = !ecrituresReelles
    const ok = window.confirm(cible
      ? 'Activer les écritures GHL réelles ? Les résultats, rappels et tags s’appliqueront à TOUS les leads dans GHL.'
      : 'Désactiver les écritures GHL réelles ? Seul le contact test sera modifié dans GHL.')
    if (!ok) return
    setEnvoi(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('setting_config')
      .update({ valeur: cible, maj_le: new Date().toISOString(), maj_par: user?.id })
      .eq('cle', 'ecritures_ghl_reelles')
    setEnvoi(false)
    if (error) window.alert(error.message); else onChange?.()
  }

  return (
    <Carte titre="Non qualifiés par source (30 derniers jours)" couleur="#1a1a1a" compteur={lignes ? total : null} tour="admin-nq"
      droite={<span className="text-[11px] font-bold uppercase text-[#9ca3af]">Admin</span>}>
      <div className="px-4 py-3">
        {erreur && <p className="text-sm text-[#b91c1c]">{erreur}</p>}
        {!lignes && !erreur && <p className="text-sm text-[#9ca3af]">Chargement…</p>}
        {lignes && (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.entries(parCanal).map(([canal, nb]) => (
                <span key={canal} className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#f3f4f6] text-[#1a1a1a]">{canal} : {nb}</span>
              ))}
            </div>
            {lignes.length === 0 ? <p className="text-sm text-[#6b7280]">Aucun non qualifié sur 30 jours.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-[10px] uppercase text-[#9ca3af] text-left"><th className="py-1 font-bold">Canal</th><th className="font-bold">Source (cycle_utm_source)</th><th className="font-bold text-right">Nb</th></tr></thead>
                <tbody>
                  {lignes.map(l => (
                    <tr key={`${l.canal}-${l.source}`} className="border-t border-[#f3f4f6]">
                      <td className="py-1.5 text-[#4b5563]">{l.canal}</td><td className="truncate max-w-[240px]">{l.source}</td><td className="text-right font-bold">{l.nb}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
        <div className="mt-4 pt-3 border-t border-[#f0f0f0] flex items-center gap-3 flex-wrap">
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${ecrituresReelles ? 'bg-[#fef2f2] text-[#b91c1c]' : 'bg-[#ecfdf5] text-[#047857]'}`}>
            Écritures GHL : {ecrituresReelles ? 'RÉELLES (tous les leads)' : 'contact test seulement'}
          </span>
          <button disabled={envoi} onClick={basculer} className="text-xs font-semibold underline text-[#6b7280] hover:text-[#1a1a1a] disabled:opacity-50">
            {ecrituresReelles ? 'Revenir au contact test' : 'Activer les écritures réelles'}
          </button>
        </div>
      </div>
    </Carte>
  )
}
