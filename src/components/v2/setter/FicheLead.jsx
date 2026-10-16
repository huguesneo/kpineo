import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { lienFicheGHL } from '../../../lib/v2/salesConfig'
import { fmtRdvAvecHeure } from '../../../lib/v2/format'
import {
  avertissementAppelRecent, fmtDureeAppel, prenom, rappelParDefaut, SEUIL_APPEL_S,
} from '../../../lib/v2/settingV2'
import { actionSetting } from '../../../hooks/v2/useSettingV2'
import BoutonResultat from './BoutonResultat'

// Ouvre la fiche GHL du contact dans une fenêtre à part (pas un iframe) : le
// setter appelle avec le téléphone GHL, ce qui garde le compte des tentatives
// de LEAD-11. Vérifié le 16 oct. 2026 : la fiche contact GHL affiche le bouton
// « Appeler : +1… » (composeur GHL). L'API GHL ne permet pas de lancer l'appel.
export function ouvrirAppelGhl(contactId) {
  const w = window.open(lienFicheGHL(contactId), 'neo-appel-ghl', 'popup=yes,width=1180,height=860')
  w?.focus?.()
}

function dateHeureLocale(d) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const ICONES = { appel: '📞', sms: '💬', courriel: '✉️' }

function Section({ titre, children, extra = null, tour }) {
  return (
    <section data-tour={tour} className="border-t border-[#f0f0f0] pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">{titre}</h3>
        {extra}
      </div>
      {children}
    </section>
  )
}

function FormRappel({ lead, onFait }) {
  const [quand, setQuand] = useState(() => dateHeureLocale(rappelParDefaut()))
  const [note, setNote] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)
  async function enregistrer() {
    setEnvoi(true); setErreur(null)
    try {
      const r = await actionSetting({
        action: 'rappel', contactId: lead.contactId, opportunityId: lead.opportunityId,
        contactNom: lead.nom, rappelLe: new Date(quand).toISOString(), note,
      })
      onFait?.(r)
    } catch (e) { setErreur(e.message) } finally { setEnvoi(false) }
  }
  return (
    <div className="bg-[#f5f3ff] border border-[#ddd6fe] rounded-xl p-3 flex flex-col gap-2">
      <label className="text-xs font-semibold text-[#5b21b6]">Date et heure du rappel
        <input type="datetime-local" value={quand} onChange={e => setQuand(e.target.value)}
          className="mt-1 w-full px-2.5 py-2 text-sm border border-[#ddd6fe] rounded-lg bg-white" />
      </label>
      <label className="text-xs font-semibold text-[#5b21b6]">Note courte
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Ex. rappeler après 17 h, veut en parler à son conjoint"
          className="mt-1 w-full px-2.5 py-2 text-sm border border-[#ddd6fe] rounded-lg bg-white" />
      </label>
      <p className="text-[11px] text-[#6d28d9]">Pendant la pause, le tag <b>rappel-manuel</b> bloque les courriels et SMS automatiques (filtre à ajouter dans les workflows GHL).</p>
      {erreur && <p className="text-xs text-[#b91c1c]">{erreur}</p>}
      <div className="flex justify-end">
        <button disabled={envoi || !quand} onClick={enregistrer}
          className="px-3 py-2 text-xs font-bold rounded-lg bg-[#6d28d9] text-white disabled:opacity-50">
          {envoi ? 'Enregistrement…' : 'Mettre en rappel'}
        </button>
      </div>
    </div>
  )
}

// Fiche pop-up du lead (sans quitter la page). setting : useSettingV2.
export default function FicheLead({ lead, userId, estAdmin, setting, onClose, onRdv, onResultat }) {
  const [fiche, setFiche] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [rappelOuvert, setRappelOuvert] = useState(false)
  const [message, setMessage] = useState(null)
  const [now] = useState(() => Date.now())
  const [nouvelleNote, setNouvelleNote] = useState('')
  const [envoiNote, setEnvoiNote] = useState(false)
  // Notes ajoutées dans l'app et pas envoyées dans GHL (écritures désactivées)
  const [notesApp, setNotesApp] = useState([])

  useEffect(() => {
    if (!lead) return undefined
    let annule = false
    setFiche(null); setErreur(null); setRappelOuvert(false); setMessage(null)
    setNotesApp([]); setNouvelleNote('')
    // Lead fictif de la démo guidée : rien n'est lu ni écrit sur le serveur
    if (lead.demo) {
      setFiche(lead.ficheDemo)
      return () => { annule = true }
    }
    supabase.from('setting_notes').select('*').eq('contact_id', lead.contactId).is('ghl_note_id', null)
      .order('cree_le', { ascending: false }).then(({ data }) => { if (!annule) setNotesApp(data ?? []) })
    supabase.functions.invoke('setting-fiche', { body: { contactId: lead.contactId } }).then(async ({ data, error }) => {
      if (annule) return
      if (error) {
        let msg = error.message
        try { msg = (await error.context.json()).error ?? msg } catch { /* */ }
        setErreur(msg)
      } else setFiche(data)
    })
    document.body.style.overflow = 'hidden'
    const echap = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', echap)
    return () => { annule = true; document.body.style.overflow = ''; window.removeEventListener('keydown', echap) }
  }, [lead, onClose])

  if (!lead) return null
  const noms = lead.demo ? { ...setting.nomsParId, ...lead.nomsDemo } : setting.nomsParId
  const appels = lead.demo ? lead.appelsDemo : (setting.appelsParContact.get(lead.contactId) ?? [])
  const avert = avertissementAppelRecent(appels, userId, noms, now)
  const proprio = lead.demo ? { user_id: userId } : setting.proprietes.get(lead.contactId)
  const rappel = lead.demo ? null : setting.tousRappelsParContact.get(lead.contactId)
  const c = fiche?.contact
  const nom = c?.nom || lead.nom
  const tentatives = appels.filter(a => a.sortant !== false)
  const conversations = appels.filter(a => (a.duree ?? 0) >= SEUIL_APPEL_S)

  async function reassigner(cible) {
    try {
      await actionSetting({ action: 'reassigner', contactId: lead.contactId, userId: cible || null })
      setMessage(cible ? `Lead assigné à ${prenom(noms[cible])}` : 'Lead remis dans la liste commune')
    } catch (e) { setMessage(e.message) }
  }
  async function ajouterNote() {
    const texte = nouvelleNote.trim()
    if (!texte) return
    setEnvoiNote(true)
    try {
      const r = await actionSetting({ action: 'note', contactId: lead.contactId, texte })
      setNouvelleNote('')
      setNotesApp(n => [r.note, ...n])
      setMessage(r.reel ? 'Note ajoutée dans GHL' : 'Note gardée dans l’app (écritures GHL désactivées pour ce contact)')
    } catch (e) { setMessage(e.message) } finally { setEnvoiNote(false) }
  }
  async function liberer() {
    if (!window.confirm(`Rendre ${nom} disponible aux autres setters ? Le lead retourne dans la liste commune et ses rappels sont annulés.`)) return
    try {
      await actionSetting({ action: 'liberer', contactId: lead.contactId })
      setMessage('Lead remis dans la liste commune : tous les setters peuvent le voir')
    } catch (e) { setMessage(e.message) }
  }
  async function terminerRappel(action) {
    try {
      await actionSetting({ action, contactId: lead.contactId, rappelId: rappel.id })
      setMessage(action === 'rappel_fait' ? 'Rappel marqué fait' : 'Rappel annulé')
    } catch (e) { setMessage(e.message) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-label={`Fiche de ${nom}`}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div data-tour="fiche" className="relative bg-white sm:rounded-2xl shadow-2xl w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden">
        {avert && (
          <div className="px-4 py-2.5 bg-[#fef3c7] border-b border-[#fde68a] text-sm font-semibold text-[#92400e]">⚠️ {avert}</div>
        )}
        <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3 border-b border-[#e5e7eb]">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-[#1a1a1a] truncate">{lead.chaud && '🔥 '}{nom}</h2>
            <p className="text-xs text-[#6b7280]">
              {[c?.telephone ?? lead.telephone, c?.courriel ?? lead.email].filter(Boolean).join(' · ') || (fiche ? 'Aucune coordonnée' : 'Chargement…')}
            </p>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-4 sm:px-5 py-3 flex flex-wrap gap-2 border-b border-[#f0f0f0]">
          <button data-tour="fiche-appeler" onClick={() => ouvrirAppelGhl(lead.contactId)}
            title="Ouvre la fiche GHL dans une fenêtre à part : clique sur le téléphone GHL pour appeler (les tentatives restent comptées par LEAD-11)"
            className="inline-flex items-center gap-1.5 px-4 h-11 rounded-lg bg-[#1a1a1a] text-white text-sm font-bold hover:bg-black">
            📞 Appeler
          </button>
          <div className="min-w-[140px]" data-tour="fiche-resultat">
            <BoutonResultat lead={lead} onRdv={onRdv} pleineLargeur
              onTermine={(l, r) => { setMessage(r.reel ? 'Résultat enregistré dans GHL' : 'Résultat enregistré dans l’app (écritures GHL désactivées pour ce contact)'); onResultat?.(l, r) }} />
          </div>
          <button data-tour="fiche-rappel" onClick={() => setRappelOuvert(o => !o)}
            className="inline-flex items-center gap-1.5 px-4 h-11 rounded-lg border border-[#ddd6fe] text-[#6d28d9] text-sm font-bold hover:bg-[#f5f3ff]">
            ⏰ Mettre en rappel
          </button>
          {proprio && (proprio.user_id === userId || estAdmin) && (
            <button data-tour="fiche-liberer" onClick={liberer}
              title="Le lead retourne dans la liste commune : tous les setters peuvent le voir et l'appeler"
              className="inline-flex items-center gap-1.5 px-4 h-11 rounded-lg border border-[#e5e7eb] text-[#4b5563] text-sm font-bold hover:bg-[#f9fafb]">
              👥 Rendre disponible aux autres setters
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 pb-5">
          {message && <p className="mt-3 text-sm font-semibold text-[#047857] bg-[#ecfdf5] rounded-lg px-3 py-2">{message}</p>}
          {rappelOuvert && <div className="mt-3"><FormRappel lead={lead} onFait={r => { setRappelOuvert(false); setMessage(r.reel ? 'Rappel créé (tag rappel-manuel posé dans GHL)' : 'Rappel créé dans l’app (écritures GHL désactivées pour ce contact)') }} /></div>}
          {erreur && <p className="mt-3 text-sm text-[#b91c1c]">Fiche GHL indisponible : {erreur}</p>}

          <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
            {[
              ['Âge', c?.age != null ? `${c.age} ans` : '—'],
              ['Source', c?.source || lead.source || '—'],
              ['Entré le', lead.creeLe || c?.creeLe ? fmtRdvAvecHeure(lead.creeLe || c?.creeLe, now) : '—'],
              ['Appels', `${tentatives.length} sortant(s) · ${conversations.length} conversation(s)`],
              ['Setter assigné', proprio ? prenom(noms[proprio.user_id]) || '—' : 'Liste commune'],
              ['Rappel', rappel ? fmtRdvAvecHeure(rappel.rappel_le, now) : '—'],
            ].map(([k, v]) => (
              <div key={k}><dt className="text-[11px] font-bold uppercase text-[#9ca3af]">{k}</dt><dd className="text-[#1a1a1a] truncate" title={v}>{v}</dd></div>
            ))}
          </dl>

          {rappel && (rappel.user_id === userId || estAdmin) && (
            <div className="mt-3 flex items-center gap-2 text-sm bg-[#f5f3ff] rounded-lg px-3 py-2">
              <span className="flex-1 text-[#5b21b6]">⏰ {fmtRdvAvecHeure(rappel.rappel_le, now)}{rappel.note ? ` · ${rappel.note}` : ''}</span>
              <button onClick={() => terminerRappel('rappel_fait')} className="text-xs font-bold text-[#047857]">Fait</button>
              <button onClick={() => terminerRappel('rappel_annuler')} className="text-xs font-bold text-[#6b7280]">Annuler</button>
            </div>
          )}

          {estAdmin && (
            <Section titre="Assignation (admin)">
              <select value={proprio?.user_id ?? ''} onChange={e => reassigner(e.target.value)}
                className="w-full sm:w-72 px-2.5 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white">
                <option value="">Liste commune (personne)</option>
                {setting.setters.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </Section>
          )}

          <Section titre={`Appels (${appels.length})`} tour="fiche-appels">
            {appels.length === 0 ? <p className="text-sm text-[#9ca3af]">Aucun appel dans le journal des 31 derniers jours.</p> : (
              <ul className="text-sm divide-y divide-[#f3f4f6]">
                {appels.map((a, i) => (
                  <li key={a.id} className="py-1.5 flex gap-3 items-center">
                    <span className="w-6 text-[#9ca3af]">{appels.length - i}</span>
                    <span className="flex-1 flex items-center gap-2 min-w-0">
                      {fmtRdvAvecHeure(a.appele_le, now)}
                      {a.sortant === false && <span className="text-[10px] font-bold uppercase text-[#0891b2]">Entrant</span>}
                      {(a.duree ?? 0) >= SEUIL_APPEL_S && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#f0f9ff] text-[#0369a1]">💬 Conversation</span>}
                    </span>
                    <span className="w-24 text-right">{fmtDureeAppel(a.duree)}</span>
                    <span className="w-28 truncate text-right text-[#6b7280]">{prenom(noms[a.user_id]) || 'Inconnu'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section titre="Historique (appels, SMS, courriels)">
            {!fiche && !erreur && <p className="text-sm text-[#9ca3af]">Chargement…</p>}
            {fiche?.avertissementPortee && <p className="text-sm text-[#b45309]">{fiche.avertissementPortee}</p>}
            {fiche && fiche.historique.length === 0 && !fiche.avertissementPortee && <p className="text-sm text-[#9ca3af]">Aucun échange.</p>}
            <ul className="flex flex-col gap-1.5">
              {(fiche?.historique ?? []).slice(0, 60).map(h => (
                <li key={h.id} className={`text-sm rounded-lg px-3 py-2 ${h.sortant ? 'bg-[#f9fafb]' : 'bg-[#ecfeff]'}`}>
                  <div className="flex items-center gap-2 text-[11px] text-[#6b7280]">
                    <span>{ICONES[h.type]} {h.sortant ? 'Envoyé' : 'Reçu'}</span>
                    <span>· {fmtRdvAvecHeure(h.date, now)}</span>
                    {h.par && <span>· {h.par}</span>}
                    {h.type === 'appel' && <span>· {fmtDureeAppel(h.duree)}{h.statut ? ` · ${h.statut}` : ''}</span>}
                  </div>
                  {h.texte && <p className="text-[#1a1a1a] whitespace-pre-wrap break-words mt-0.5">{h.texte}</p>}
                </li>
              ))}
            </ul>
          </Section>

          {(fiche?.formulaire ?? []).length > 0 && (
            <Section titre="Formulaire de réservation">
              <dl className="flex flex-col gap-1.5 text-sm">
                {fiche.formulaire.map(f => (
                  <div key={f.libelle}><dt className="text-[11px] font-bold text-[#9ca3af]">{f.libelle}</dt><dd className="whitespace-pre-wrap break-words">{f.valeur}</dd></div>
                ))}
              </dl>
            </Section>
          )}

          <Section titre="Notes" tour="fiche-notes">
            <div className="flex flex-col gap-2 mb-2">
              <textarea value={nouvelleNote} onChange={e => setNouvelleNote(e.target.value)} rows={2} maxLength={2000}
                placeholder="Ajouter une note (elle va aussi dans GHL)"
                className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:border-[#00bbb1] resize-y" />
              <div className="flex justify-end">
                <button disabled={envoiNote || !nouvelleNote.trim()} onClick={ajouterNote}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[#1a1a1a] text-white disabled:opacity-40">
                  {envoiNote ? 'Envoi…' : 'Ajouter la note'}
                </button>
              </div>
            </div>
            {notesApp.length > 0 && (
              <ul className="flex flex-col gap-1.5 mb-1.5">
                {notesApp.map(n => (
                  <li key={n.id} className="text-sm bg-[#f9fafb] border border-dashed border-[#e5e7eb] rounded-lg px-3 py-2">
                    <p className="text-[11px] text-[#6b7280]">{fmtRdvAvecHeure(n.cree_le, now)} · {prenom(noms[n.user_id])} · dans l’app seulement</p>
                    <p className="whitespace-pre-wrap break-words">{n.texte}</p>
                  </li>
                ))}
              </ul>
            )}
            {(fiche?.notes ?? []).length === 0 ? (notesApp.length ? null : <p className="text-sm text-[#9ca3af]">{fiche ? 'Aucune note.' : '…'}</p>) : (
              <ul className="flex flex-col gap-1.5">
                {fiche.notes.map(n => (
                  <li key={n.id} className="text-sm bg-[#fffbeb] rounded-lg px-3 py-2">
                    <p className="text-[11px] text-[#92400e]">{fmtRdvAvecHeure(n.date, now)}{n.par ? ` · ${n.par}` : ''}</p>
                    <p className="whitespace-pre-wrap break-words">{n.texte}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <p className="mt-4 text-xs text-[#9ca3af]">
            <a href={lienFicheGHL(lead.contactId)} target="_blank" rel="noopener noreferrer" className="underline">Ouvrir dans GHL</a>
          </p>
        </div>
      </div>
    </div>
  )
}
