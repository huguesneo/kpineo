// Rattrapage unique : met la valeur avant taxes payée au terminal et le closeur
// sur la carte 🎯 Vente de chaque client qui a au moins un paiement réussi.
// JWT obligatoire, admin ou superviseur du terminal seulement.
//   { appliquer: false } (défaut) : aperçu, rien n'est écrit
//   { appliquer: true }           : écrit dans GHL

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { syncVenteGhl, type ResultatVente } from '../_shared/venteGhl.ts'
import { isSupervisorEmail } from '../_shared/terminalAttribution.js'

declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Promise<Response> | Response): void }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  // Clé service (lancement depuis le poste de l'admin) ou utilisateur admin / superviseur.
  // La passerelle vérifie la signature du JWT (déployée AVEC vérification JWT) : le rôle lu ici est fiable.
  let role = ''
  try { role = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role ?? '' } catch { /* pas un JWT */ }
  if (role !== 'service_role') {
    const { data: { user } } = jwt ? await db.auth.getUser(jwt) : { data: { user: null } }
    if (!user) return json({ error: 'Non autorisé' }, 401)
    const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'admin' && !isSupervisorEmail(user.email)) return json({ error: 'Réservé à l’admin' }, 403)
  }

  let appliquer = false
  try { appliquer = (await req.json() as Record<string, unknown>).appliquer === true } catch { /* aperçu */ }

  const { data: payes } = await db.from('payment_installments').select('payment_plans!inner(client_email, removed_at)').eq('status', 'paid')
  const courriels = [...new Set(((payes ?? []) as { payment_plans: { client_email: string; removed_at: string | null } }[])
    .filter(r => !r.payment_plans.removed_at && r.payment_plans.client_email)
    .map(r => r.payment_plans.client_email.trim().toLowerCase()))]

  const resultats: ResultatVente[] = []
  for (const c of courriels) {
    try { resultats.push(await syncVenteGhl(db, c, { appliquer })) } catch (e) { resultats.push({ client: c, courriel: c, carte: null, valeur: 0, closer: null, ecrit: false, erreur: String(e) }) }
  }
  return json({ appliquer, total: resultats.length, ecrits: resultats.filter(r => r.ecrit).length, resultats })
})
