// Adjoint, temps réel : copie dans inbox_messages (neo-admin) les courriels arrivés dans
// la boîte de réception de info@, puis les relie aux dossiers de Léo (projet Clinique).
// Appelée chaque minute par pg_cron. Ne lit que les changements depuis le dernier
// historyId de Gmail. Premier passage (ou historyId périmé) : les courriels des 3
// derniers jours encore dans INBOX.
// Déploiement : supabase functions deploy gmail-sync --no-verify-jwt
// Protégée par un secret : en-tête x-gmail-sync-secret, comparé au secret gardé dans
// Vault (gmail_sync_secret_ok, clé service seulement). Sans lui : 401, rien n'est lu.
// Réponse : des compteurs seulement, jamais de contenu.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { gmailApi, GmailIndisponible, classerFil } from '../_shared/gmail.ts'
import { ligneInbox, changementsHistorique, liaisons } from '../_shared/gmailSync.js'
import { idsGmail, libellePlusFrequent, LIBELLES_TEMPORAIRES } from '../_shared/gmailFil.js'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Promise<Response> | Response): void
}
// deno-lint-ignore no-explicit-any
type J = any

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const INTERVALLE_MIN_MS = 30_000

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const jeton = req.headers.get('x-gmail-sync-secret') ?? ''
  const { data: autorise, error: errAuth } = jeton ? await admin.rpc('gmail_sync_secret_ok', { jeton }) : { data: false, error: null }
  if (errAuth) console.error('gmail-sync secret', errAuth.message)
  if (autorise !== true) return json({ error: 'Non autorisé' }, 401)
  const corps = await req.json().catch(() => ({}))
  if (corps?.op === 'reparerLibellesTemporaires') return reparerLibellesTemporaires()
  const { data: etat } = await admin.from('gmail_sync_etat').select('*').eq('id', 1).maybeSingle()
  if (etat?.derniere_sync && Date.now() - Date.parse(etat.derniere_sync) < INTERVALLE_MIN_MS) return json({ ok: true, saute: true })
  const noter = (maj: J) => admin.from('gmail_sync_etat').upsert({ id: 1, derniere_sync: new Date().toISOString(), ...maj })

  try {
    // Table des libellés (id → nom), pour reconnaître le bruit filtré par Léo
    let table: Record<string, string> = etat?.libelles ?? {}
    if (!Object.keys(table).length || !etat?.history_id) {
      const l = await gmailApi('/labels')
      table = Object.fromEntries((l.labels ?? []).map((x: J) => [x.id, x.name]))
    }

    const lire = async (id: string) => {
      try { return await gmailApi(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`) } catch { return null }
    }
    let ids: string[] = []
    let libellesMaj = new Map<string, string[]>()
    let historyId: string | null = etat?.history_id ?? null
    let reprise = !historyId

    if (historyId) {
      try {
        let page: string | undefined
        const tout: J[] = []
        let dernier = historyId
        do {
          const r = await gmailApi(`/history?startHistoryId=${historyId}&historyTypes=messageAdded&historyTypes=labelAdded&historyTypes=labelRemoved&maxResults=500${page ? `&pageToken=${page}` : ''}`)
          tout.push(...(r.history ?? []))
          dernier = r.historyId ?? dernier
          page = r.nextPageToken
        } while (page)
        const c = changementsHistorique(tout)
        ids = c.ajoutes
        libellesMaj = c.libelles
        historyId = dernier
      } catch (e) {
        // historyId trop ancien (404) : on repart des 3 derniers jours
        if (!(e instanceof GmailIndisponible) || !/introuvable|not found/i.test((e as Error).message)) throw e
        reprise = true
      }
    }
    if (reprise) {
      historyId = (await gmailApi('/profile')).historyId
      const r = await gmailApi(`/messages?q=${encodeURIComponent('in:inbox newer_than:3d')}&maxResults=200`)
      ids = (r.messages ?? []).map((m: J) => m.id)
    }

    // Nouveaux courriels
    const metas = (await Promise.all(ids.slice(0, 200).map(lire))).filter(Boolean)
    const lignes = metas.map(m => ligneInbox(m, table)).filter(Boolean)
    if (lignes.length) {
      const { error } = await admin.from('inbox_messages').upsert(lignes.map(l => ({ ...l, maj_le: new Date().toISOString() })), { onConflict: 'gmail_message_id', ignoreDuplicates: true })
      if (error) throw error
    }
    // Libellés changés (archivé ailleurs, classé par Léo) sur des courriels déjà copiés
    for (const [id, labels] of libellesMaj) {
      if (ids.includes(id)) continue
      await admin.from('inbox_messages').update({ libelles: labels, maj_le: new Date().toISOString() }).eq('gmail_message_id', id)
    }

    // Liaison aux dossiers de Léo : par message, sinon par fil (dossier postérieur)
    const { data: nouveaux } = await admin.from('inbox_messages').select('gmail_message_id,gmail_thread_id,recu_le,leo_interaction_id')
      .eq('etat', 'nouveau').is('leo_interaction_id', null).gte('recu_le', new Date(Date.now() - 30 * 86400000).toISOString()).limit(500)
    let lies = 0
    if (nouveaux?.length) {
      const clinique = createClient(Deno.env.get('CLINIQUE_SUPABASE_URL')!, Deno.env.get('CLINIQUE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
      const msg = nouveaux.map(n => `"${n.gmail_message_id}"`).join(',')
      const fils = [...new Set(nouveaux.map(n => `"${n.gmail_thread_id}"`))].join(',')
      const { data: leo, error } = await clinique.from('leo_service_interactions').select('id,gmail_message_id,gmail_thread_id,created_at,payload')
        .or(`gmail_message_id.in.(${msg}),gmail_thread_id.in.(${fils})`).limit(1000)
      if (error) throw error
      for (const l of liaisons(nouveaux, leo ?? [])) {
        await admin.from('inbox_messages').update({ leo_interaction_id: l.leo_interaction_id, etat: l.etat, maj_le: new Date().toISOString() })
          .eq('gmail_message_id', l.gmail_message_id).eq('etat', 'nouveau')
        lies++
      }
    }

    await noter({ history_id: historyId, libelles: table, derniere_erreur: null })
    return json({ ok: true, reprise, nouveaux: lignes.length, lus: metas.length, lies })
  } catch (e) {
    console.error('gmail-sync', e)
    await noter({ derniere_erreur: (e as Error).message }).catch(() => {})
    return json({ ok: false, erreur: (e as Error).message }, 500)
  }
})

// Réparation ponctuelle (appel manuel avec le secret, body { op: 'reparerLibellesTemporaires' }) :
// fils classés par le Hub avec Label_137 (« Léo en cours », temporaire). On retire
// Label_137 et on pose le libellé le plus fréquent de la catégorie. Compteurs seulement.
async function reparerLibellesTemporaires() {
  const clinique = createClient(Deno.env.get('CLINIQUE_SUPABASE_URL')!, Deno.env.get('CLINIQUE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: lignes, error } = await clinique.from('leo_service_interactions')
    .select('id,category,gmail_thread_id,gmail_message_id,payload')
    .in('payload->hub_gmail->>label', LIBELLES_TEMPORAIRES).limit(100)
  if (error) return json({ ok: false, erreur: error.message }, 500)
  const parCategorie = new Map<string, string | null>()
  const resultats: J[] = []
  for (const row of lignes ?? []) {
    if (!parCategorie.has(row.category)) {
      const { data } = await clinique.from('leo_service_interactions').select('label:payload->>label_final')
        .eq('category', row.category).like('payload->>label_final', 'Label\\_%').order('created_at', { ascending: false }).limit(300)
      parCategorie.set(row.category, libellePlusFrequent((data ?? []).map((r: J) => r.label)))
    }
    const label = parCategorie.get(row.category) ?? null
    const avant = row.payload?.hub_gmail ?? {}
    try {
      const ids = idsGmail(row)
      const fil = await classerFil({ ...ids, threadId: avant.thread_id || ids.threadId }, label)
      const hubGmail = { ...avant, label, thread_id: fil, repare_le: new Date().toISOString(), label_avant: avant.label }
      await clinique.from('leo_service_interactions').update({ payload: { ...row.payload, hub_gmail: hubGmail } }).eq('id', row.id)
      resultats.push({ id: row.id, fil, label })
    } catch (e) {
      resultats.push({ id: row.id, erreur: (e as Error).message })
    }
  }
  return json({ ok: true, repares: resultats })
}
