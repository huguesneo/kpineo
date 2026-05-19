import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Promise<Response> | Response): void
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}

// Normalise a PascalCase/mixed-case key to snake_case
// e.g. "Questionnaire_Sexe" → "questionnaire_sexe"
function normalise(key: string): string {
  return key.toLowerCase()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    // Verify webhook secret (Make sends it as header or query param)
    const secret = Deno.env.get('QUIZ_WEBHOOK_SECRET')
    if (secret) {
      const headerSecret = req.headers.get('x-webhook-secret')
      const url = new URL(req.url)
      const querySecret = url.searchParams.get('secret')
      if (headerSecret !== secret && querySecret !== secret) {
        return json({ error: 'Unauthorized' }, 401)
      }
    }

    const body = await req.json() as Record<string, unknown>

    // Extract email — required
    const email = (body.email ?? body.Email ?? body.EMAIL) as string | undefined
    if (!email || typeof email !== 'string') {
      return json({ error: 'email is required' }, 400)
    }

    // Map all known quiz field keys (case-insensitive) to DB columns
    const fieldMap: Record<string, string> = {
      questionnaire_sexe:       'questionnaire_sexe',
      questionnaire_age:        'questionnaire_age',
      questionnaire_energie:    'questionnaire_energie',
      questionnaire_stockage:   'questionnaire_stockage',
      questionnaire_ventre:     'questionnaire_ventre',
      questionnaire_symptomes:  'questionnaire_symptomes',
      questionnaire_objectifs:  'questionnaire_objectifs',
      questionnaire_motivation: 'questionnaire_motivation',
      questionnaire_engagement: 'questionnaire_engagement',
    }

    const row: Record<string, unknown> = {
      email: email.toLowerCase().trim(),
      raw: body,
      updated_at: new Date().toISOString(),
    }

    // Map body keys → DB columns
    for (const [bodyKey, bodyVal] of Object.entries(body)) {
      const normalised = normalise(bodyKey)
      if (normalised in fieldMap) {
        row[fieldMap[normalised]] = bodyVal != null ? String(bodyVal) : null
      }
    }

    // Source if present
    if (body.source ?? body.Source) {
      row.source = String(body.source ?? body.Source)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { error } = await supabase
      .from('quiz_responses')
      .upsert(row, { onConflict: 'email' })

    if (error) {
      console.error('[quiz-webhook] upsert error:', error)
      return json({ error: error.message }, 500)
    }

    console.log(`[quiz-webhook] Saved quiz for ${row.email}`)
    return json({ ok: true })

  } catch (err) {
    console.error('[quiz-webhook] error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
