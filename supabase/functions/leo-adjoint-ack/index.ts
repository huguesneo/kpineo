// Accusé de Make pour une action lancée depuis la page Adjoint (response_url).
// Le scénario « Léo : Actions Slack » poste ici son message de fin, comme il le
// ferait à Slack ; sans cette adresse, son étape response_url planterait.
// Publique (Make n'a pas de JWT) : déployer avec --no-verify-jwt. N'écrit que si
// l'id et le jeton correspondent à l'envoi en cours (payload.hub_execution) ;
// répond toujours 200 pour que Make finisse proprement.
//
// À la réception : hub_ack (message de Make), hub_execution.confirme_le, et
// decision = approved_modified si le texte avait été modifié (Make écrit toujours
// approved_as_is).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Promise<Response> | Response): void
}

const ok = () => new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok()
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id') ?? ''
    const jeton = url.searchParams.get('jeton') ?? ''
    if (!/^[0-9a-f-]{36}$/i.test(id) || !jeton) return ok()

    const brut = await req.text()
    let texte = brut
    try {
      const j = JSON.parse(brut)
      texte = String(j?.text ?? brut)
    } catch { /* texte brut */ }

    const urlClinique = Deno.env.get('CLINIQUE_SUPABASE_URL')
    const cleClinique = Deno.env.get('CLINIQUE_SERVICE_ROLE_KEY')
    if (!urlClinique || !cleClinique) return ok()
    const db = createClient(urlClinique, cleClinique, { auth: { persistSession: false } })

    const { data: row } = await db.from('leo_service_interactions').select('id,decision,decided_at,payload').eq('id', id).maybeSingle()
    const execution = row?.payload?.hub_execution
    if (!row || !execution || execution.jeton !== jeton) return ok()

    const le = new Date().toISOString()
    const acks = Array.isArray(row.payload.hub_ack) ? row.payload.hub_ack : []
    const patch: Record<string, unknown> = {
      payload: {
        ...row.payload,
        hub_ack: [...acks, { le, texte: texte.slice(0, 2000) }].slice(-5),
        hub_execution: { ...execution, confirme_le: execution.confirme_le ?? le },
      },
    }
    if (!row.decided_at) patch.decided_at = le
    if (execution.modifie && row.decision !== 'pending') patch.decision = 'approved_modified'
    await db.from('leo_service_interactions').update(patch).eq('id', id)
    return ok()
  } catch (e) {
    console.error('leo-adjoint-ack', e)
    return ok()
  }
})
