import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { fmtRdvAvecHeure } from '../../../lib/v2/format'

// Notes du lead pour le closeur (écran d'appel) : notes GHL du contact (dont
// celles des setters, ajoutées depuis la fiche du hub ou dans GHL) et notes
// gardées dans l'app seulement (setting_notes sans envoi GHL). Les notes
// « Sale Call » du closeur lui-même sont masquées : il les a dans son formulaire.
export default function NotesSetter({ contactId }) {
  const [notes, setNotes] = useState(null)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    if (!contactId) return undefined
    let annule = false
    Promise.all([
      supabase.functions.invoke('setting-fiche', { body: { contactId, notesSeulement: true } }),
      supabase.from('setting_notes').select('id, texte, cree_le, user_id, ghl_note_id, profiles(full_name)')
        .eq('contact_id', contactId).is('ghl_note_id', null),
    ]).then(([fiche, app]) => {
      if (annule) return
      if (fiche.error) setErreur('Notes GHL indisponibles')
      const ghl = (fiche.data?.notes ?? [])
        .filter(n => !String(n.texte ?? '').trimStart().startsWith('--- Sale Call'))
        .map(n => ({ id: n.id, texte: n.texte, date: n.date, par: n.par }))
      const locales = (app.data ?? []).map(n => ({ id: n.id, texte: n.texte, date: n.cree_le, par: n.profiles?.full_name ?? null, local: true }))
      setNotes([...ghl, ...locales].sort((a, b) => String(b.date).localeCompare(String(a.date))))
    })
    return () => { annule = true }
  }, [contactId])

  if (!contactId) return null
  if (notes == null && !erreur) return <p className="text-sm text-[#9ca3af]">Chargement des notes…</p>
  if (erreur && !notes?.length) return <p className="text-sm text-[#b45309]">{erreur}</p>
  if (!notes.length) return <p className="text-sm italic text-[#9ca3af]">Aucune note du setter</p>
  return (
    <ul className="flex flex-col gap-2">
      {notes.map(n => (
        <li key={n.id} className="text-sm bg-[#fffbeb] rounded-lg px-3 py-2">
          <p className="text-[11px] text-[#92400e]">
            {fmtRdvAvecHeure(n.date)}{n.par ? ` · ${n.par}` : ''}{n.local ? ' · dans l’app seulement' : ''}
          </p>
          <p className="whitespace-pre-wrap break-words text-[#1a1a1a]">{n.texte}</p>
        </li>
      ))}
    </ul>
  )
}
