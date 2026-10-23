#!/usr/bin/env node
// Page Adjoint : obtenir le refresh token Gmail de info@neoperformance.ca.
// Ouvre Google dans le navigateur, tu cliques « Autoriser » avec info@, et le script
// affiche le refresh token à poser dans Supabase (GMAIL_INFO_REFRESH_TOKEN).
// Portée gmail.modify seulement : lire et classer, jamais envoyer.
//
// Usage : node scripts/gmail-oauth.mjs <GMAIL_CLIENT_ID> <GMAIL_CLIENT_SECRET>
// (client OAuth de type « Application de bureau », voir docs/adjoint/README.md)
import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'

const [clientId, clientSecret] = process.argv.slice(2)
if (!clientId || !clientSecret) {
  console.error('Usage : node scripts/gmail-oauth.mjs <GMAIL_CLIENT_ID> <GMAIL_CLIENT_SECRET>')
  process.exit(1)
}

const PORTEE = 'https://www.googleapis.com/auth/gmail.modify'
const etat = randomBytes(16).toString('hex')

const serveur = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (url.pathname !== '/') { res.writeHead(404).end(); return }
  const fin = (message) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<p style="font:16px sans-serif;margin:40px">${message}</p>`)
    serveur.close()
  }
  if (url.searchParams.get('state') !== etat) return fin('Réponse inattendue. Relance le script.')
  if (url.searchParams.get('error')) {
    console.error(`\nGoogle a refusé : ${url.searchParams.get('error')}`)
    return fin('Autorisation refusée. Tu peux fermer cet onglet.')
  }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: url.searchParams.get('code'), client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirection, grant_type: 'authorization_code',
    }),
  })
  const j = await r.json()
  if (!j.refresh_token) {
    console.error('\nPas de refresh token reçu :', j.error_description ?? j.error ?? JSON.stringify(j))
    return fin('Pas de refresh token. Regarde le terminal.')
  }
  if (!String(j.scope ?? '').includes('gmail.modify')) console.warn('\nAttention : la portée gmail.modify n’a pas été accordée.')
  console.log('\nC’est fait. Colle cette commande dans le terminal (une seule ligne) :\n')
  console.log(`supabase secrets set --project-ref cbqwrmyctsfdqmenczhm GMAIL_CLIENT_ID=${clientId} GMAIL_CLIENT_SECRET=${clientSecret} GMAIL_INFO_REFRESH_TOKEN=${j.refresh_token}\n`)
  fin('C’est fait. Retourne au terminal, tu peux fermer cet onglet.')
})

let redirection = ''
serveur.listen(0, '127.0.0.1', () => {
  redirection = `http://127.0.0.1:${serveur.address().port}`
  const lien = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId, redirect_uri: redirection, response_type: 'code', scope: PORTEE,
    access_type: 'offline', prompt: 'consent', login_hint: 'info@neoperformance.ca', state: etat,
  })
  console.log('Ouverture de Google. Connecte-toi avec info@neoperformance.ca puis clique « Autoriser ».')
  console.log(`Si rien ne s’ouvre, copie ce lien dans ton navigateur :\n${lien}\n`)
  execFile('open', [lien], () => {})
})
