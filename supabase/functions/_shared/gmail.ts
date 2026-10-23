// Accès Gmail à info@neoperformance.ca, pour les edge functions seulement.
// OAuth « application de bureau », portée gmail.modify (lecture et classement, pas
// d'envoi : l'envoi reste dans Make). Secrets : GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET,
// GMAIL_INFO_REFRESH_TOKEN (obtenu avec scripts/gmail-oauth.mjs). Aucun jeton Google
// ne sort de la fonction.
import { filEnConversation } from './gmailFil.js'

declare const Deno: { env: { get(key: string): string | undefined } }

// deno-lint-ignore no-explicit-any
type J = any

const API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const DELAI_MS = 15000

export class GmailIndisponible extends Error {}

// Jeton d'accès gardé en mémoire tant que l'instance vit (une heure chez Google)
let cache: { jeton: string; expire: number } | null = null

async function avecDelai(url: string, init: RequestInit = {}) {
  const ctrl = new AbortController()
  const minuteur = setTimeout(() => ctrl.abort(), DELAI_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch (e) {
    throw new GmailIndisponible((e as Error).name === 'AbortError' ? 'Gmail ne répond pas' : (e as Error).message)
  } finally {
    clearTimeout(minuteur)
  }
}

export async function jetonGmail(): Promise<string> {
  if (cache && cache.expire > Date.now() + 60_000) return cache.jeton
  const id = Deno.env.get('GMAIL_CLIENT_ID')
  const secret = Deno.env.get('GMAIL_CLIENT_SECRET')
  const refresh = Deno.env.get('GMAIL_INFO_REFRESH_TOKEN')
  if (!id || !secret || !refresh) throw new GmailIndisponible('accès Gmail pas encore configuré')
  const r = await avecDelai('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.access_token) {
    throw new GmailIndisponible(j.error === 'invalid_grant' ? 'autorisation Gmail expirée ou révoquée' : `jeton Google refusé (${j.error ?? r.status})`)
  }
  cache = { jeton: j.access_token, expire: Date.now() + Number(j.expires_in ?? 3600) * 1000 }
  return cache.jeton
}

export async function gmailGet(chemin: string): Promise<J> {
  const r = await avecDelai(`${API}${chemin}`, { headers: { Authorization: `Bearer ${await jetonGmail()}` } })
  if (r.status === 404) throw new GmailIndisponible('courriel introuvable dans Gmail')
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new GmailIndisponible(j?.error?.message ?? `Gmail ${r.status}`)
  return j
}

// Fil d'un dossier : par l'id du fil, sinon retrouvé par l'id du message
export async function filDuDossier({ threadId, messageId }: { threadId: string | null; messageId: string | null }) {
  let fil = threadId
  if (!fil && messageId) fil = (await gmailGet(`/messages/${encodeURIComponent(messageId)}?format=minimal`)).threadId
  if (!fil) throw new GmailIndisponible('aucun id Gmail sur ce dossier')
  const thread = await gmailGet(`/threads/${encodeURIComponent(fil)}?format=full`)
  return { threadId: fil, messages: filEnConversation(thread) }
}
