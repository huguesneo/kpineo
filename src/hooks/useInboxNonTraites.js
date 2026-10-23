import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Courriels de info@ que Léo n'a pas encore traités (table inbox_messages, remplie par
// gmail-sync). Relus à chaque changement (Supabase Realtime), sans recharger la page.
// Tant que la table n'existe pas, la liste reste vide.
export function useInboxNonTraites(actif, surChangement) {
  const [messages, setMessages] = useState([])

  const charger = useCallback(async () => {
    const { data, error } = await supabase.from('inbox_messages')
      .select('gmail_message_id,gmail_thread_id,expediteur,expediteur_nom,sujet,extrait,recu_le,libelles,etat,leo_interaction_id')
      .eq('etat', 'nouveau').is('leo_interaction_id', null).contains('libelles', ['INBOX'])
      .order('recu_le', { ascending: false }).limit(100)
    if (!error) setMessages(data ?? [])
  }, [])

  useEffect(() => {
    if (!actif) return undefined
    charger()
    const canal = supabase.channel('adjoint-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbox_messages' }, () => { charger(); surChangement?.() })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [actif, charger]) // eslint-disable-line react-hooks/exhaustive-deps

  return { messages, recharger: charger }
}
