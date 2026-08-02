import { useMemo, useState } from 'react'
import Card from '../../../components/shared/Card'
import ParcoursDrawer from './ParcoursDrawer'
import { fmtInt, fmtPct, fmtDate, platformMeta } from '../../../lib/socialFormat'

// ============================================================================
// Rendez-vous — ce que le contenu a rapporté
//
// Le rapprochement se fait par code : ghl_contacts.utm_content_last porte le
// tracking_code du contenu. La règle est le DERNIER lien cliqué avant la
// réservation — c'est elle qui décide du boni, donc elle est écrite à l'écran
// et chaque ligne s'ouvre sur le parcours détaillé du contact.
//
// Le chiffre reste un plancher. Quelqu'un qui voit un Reel, y repense trois
// semaines plus tard et cherche « NEO » sur Google sera attribué à Google : le
// contenu aura fait le travail sans en recevoir le crédit.
// ============================================================================

function Kpi({ label, value, sub, accent = false }) {
  return (
    <Card className="p-5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[#6b7280]">{label}</div>
      <div className={`text-[28px] font-bold mt-2 leading-none tabular-nums ${accent ? 'text-[#009e95]' : 'text-[#1a1a1a]'}`}>
        {value}
      </div>
      <div className="text-xs text-[#6b7280] mt-1.5">{sub}</div>
    </Card>
  )
}

export default function RendezVous({ posts, attribution, loading, onPostClick }) {
  // Ouvrir le parcours plutôt que le formulaire : sur cet écran, on cherche à
  // vérifier d'où viennent les rendez-vous, pas à retoucher le contenu.
  const [parcours, setParcours] = useState(null)
  const rows = useMemo(() => {
    const byPost = new Map(attribution.map(a => [a.post_id, a]))
    return posts
      .map(p => ({ post: p, stats: byPost.get(p.id) ?? null }))
      // Un contenu jamais publié n'a rien pu rapporter : il encombrerait la vue.
      .filter(r => r.post.status === 'publie' || (r.stats?.contacts ?? 0) > 0)
      .sort((a, b) => {
        const diff = (b.stats?.rdv_honores ?? 0) - (a.stats?.rdv_honores ?? 0)
        if (diff) return diff
        return (b.stats?.contacts ?? 0) - (a.stats?.contacts ?? 0)
      })
  }, [posts, attribution])

  const totals = useMemo(() => attribution.reduce((acc, a) => ({
    contacts: acc.contacts + Number(a.contacts ?? 0),
    pris: acc.pris + Number(a.rdv_pris ?? 0),
    honores: acc.honores + Number(a.rdv_honores ?? 0),
    noshow: acc.noshow + Number(a.rdv_noshow ?? 0),
    ventes: acc.ventes + Number(a.ventes ?? 0),
    valeur: acc.valeur + Number(a.valeur ?? 0),
  }), { contacts: 0, pris: 0, honores: 0, noshow: 0, ventes: 0, valeur: 0 }), [attribution])

  const tracked = rows.filter(r => (r.stats?.contacts ?? 0) > 0).length

  if (loading) {
    return <Card className="p-10 text-center text-sm text-[#9ca3af]">Chargement de l'attribution…</Card>
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-4">
        <p className="text-sm text-[#1a1a1a]">
          Un rendez-vous revient au contenu dont le lien a été cliqué en <b>dernier</b> avant la
          réservation. Clique une ligne pour voir le parcours de chaque personne et vérifier.
        </p>
        <p className="text-xs text-[#9ca3af] mt-1">
          Ces chiffres restent un plancher. Quelqu'un qui voit ta vidéo aujourd'hui et réserve dans
          trois semaines après une recherche Google sera attribué à Google — ton contenu aura fait
          le travail sans en recevoir le crédit.
        </p>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Contacts créés" value={fmtInt(totals.contacts)} sub="depuis un lien tracé" />
        <Kpi label="Rendez-vous pris" value={fmtInt(totals.pris)} sub="rencontres découverte" />
        <Kpi
          label="Rendez-vous honorés" value={fmtInt(totals.honores)} accent
          sub={totals.pris ? `${fmtPct((totals.honores / totals.pris) * 100, 0)} des rendez-vous pris` : 'aucun rendez-vous'}
        />
        <Kpi
          label="Ventes" value={fmtInt(totals.ventes)}
          sub={totals.valeur ? `${fmtInt(totals.valeur)} $ attribués` : 'aucune vente attribuée'}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-base font-bold text-[#1a1a1a]">
            Par contenu <span className="text-sm font-semibold text-[#9ca3af]">({rows.length})</span>
          </h3>
          <p className="text-xs text-[#6b7280] mt-0.5">
            {tracked > 0
              ? `${tracked} contenu${tracked > 1 ? 's ont' : ' a'} déjà rapporté au moins un contact.`
              : 'Aucun contact attribué pour l\'instant — c\'est normal tant que les liens tracés ne sont pas en ligne.'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-[#fafafb]">
              <tr>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">Contenu</th>
                <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">Code</th>
                <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">Contacts</th>
                <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">RDV pris</th>
                <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">Honorés</th>
                <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">No-show</th>
                <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">Ventes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0f2]">
              {rows.map(({ post, stats }) => {
                const vide = !stats || Number(stats.contacts) === 0
                return (
                  <tr
                    key={post.id}
                    onClick={() => (vide ? onPostClick(post) : setParcours(post))}
                    className="cursor-pointer hover:bg-[#fafafb] transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="text-sm font-semibold text-[#1a1a1a] truncate max-w-[320px]">{post.title}</div>
                      <div className="text-[11px] text-[#9ca3af] mt-0.5 flex items-center gap-1.5">
                        {(post.platforms ?? []).map(p => (
                          <span key={p} className="w-1.5 h-1.5 rounded-full" style={{ background: platformMeta(p).color }} />
                        ))}
                        {post.published_at ? fmtDate(post.published_at) : 'non publié'}
                        {post.dm_keyword && <span className="ml-1 font-semibold text-[#6b7280]">{post.dm_keyword}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <code className="text-[11px] text-[#9ca3af]">{post.tracking_code}</code>
                    </td>
                    <td className={`px-3 py-3 text-right text-sm tabular-nums ${vide ? 'text-[#d1d5db]' : 'font-semibold text-[#1a1a1a]'}`}>
                      {vide ? '—' : fmtInt(stats.contacts)}
                    </td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums text-[#6b7280]">
                      {vide ? '—' : fmtInt(stats.rdv_pris)}
                    </td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums">
                      {vide || !Number(stats.rdv_honores)
                        ? <span className="text-[#d1d5db]">—</span>
                        : <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-[#00bbb1]/10 text-[#009e95]">
                            {fmtInt(stats.rdv_honores)}
                          </span>}
                    </td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums text-[#6b7280]">
                      {vide ? '—' : fmtInt(stats.rdv_noshow)}
                    </td>
                    <td className="px-5 py-3 text-right text-sm tabular-nums text-[#6b7280]">
                      {vide || !Number(stats.ventes)
                        ? '—'
                        : `${fmtInt(stats.ventes)} · ${fmtInt(stats.valeur)} $`}
                    </td>
                  </tr>
                )
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-[#9ca3af]">
                    Aucun contenu publié dans le pipeline.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {parcours && <ParcoursDrawer post={parcours} onClose={() => setParcours(null)} />}
    </div>
  )
}
