import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Promise<Response> | Response): void
}

const VALID_TYPES = new Set(['no_show', 'annulation', 'confirmation_rdv', 'nouveau_lead'])

const TYPE_LABELS: Record<string, string> = {
  no_show:         'No-show',
  annulation:      'Annulation',
  confirmation_rdv: 'Confirmation RDV',
  nouveau_lead:    'Nouveau lead',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  // GHL always expects a 200 — ack immediately, log errors
  const ack = (msg?: string) =>
    new Response(JSON.stringify({ ok: true, msg }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  try {
    // Validate task type from query param
    const url  = new URL(req.url)
    const type = url.searchParams.get('type') ?? ''
    if (!VALID_TYPES.has(type)) {
      console.error(`[ghl-setter-task] Type invalide: "${type}"`)
      return ack('invalid type')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase    = createClient(supabaseUrl, serviceKey)

    // Parse GHL webhook body
    // GHL sends merged values (variables already resolved)
    // Expected body: { client_name, client_phone, client_email, appointment_date, closer_name }
    let body: Record<string, unknown> = {}
    try {
      body = await req.json()
      console.log('[ghl-setter-task] Body reçu:', JSON.stringify(body))
    } catch {
      console.warn('[ghl-setter-task] Body JSON invalide — tâche créée sans données client')
    }

    // GHL nests the resolved workflow values under `customData`.
    // Merge customData over the top-level so our keys take priority,
    // then fall back to GHL's native payload fields.
    const root = body as Record<string, unknown>
    const cd   = (root.customData ?? {}) as Record<string, string>
    const b    = { ...root, ...cd } as Record<string, string>

    const calendar = (root.calendar ?? {}) as Record<string, string>
    const ghlUser  = (root.user ?? {}) as Record<string, string>

    const clientName = b.client_name || b.contact_name || b.full_name || b.name ||
      (b.first_name && b.last_name ? `${b.first_name} ${b.last_name}` : (b.first_name || b.last_name || ''))
    const clientPhone     = b.client_phone || b.phone || ''
    const clientEmail     = b.client_email || b.email || ''
    const appointmentDate = b.appointment_date || calendar.startTime || b.start_time || b.appointmentStartTime || b.startTime || ''
    const closerName      = b.closer_name || b.user_name || b.assigned_user_name ||
      (ghlUser.firstName && ghlUser.lastName ? `${ghlUser.firstName} ${ghlUser.lastName}` : (ghlUser.firstName || ghlUser.lastName || ''))
    const contactUrl      = b.contact_url || b.contact_link || b.contactUrl || ''
    const contactId       = b.contact_id || b.contactId || ''

    // When a client cancels (annulation), any still-pending "Confirmation RDV"
    // task for that same client is now obsolete — remove it automatically.
    // Match on contact_id OR email so it works even if one identifier is missing
    // on the older confirmation task.
    {
      const ors: string[] = []
      if (contactId)   ors.push(`contact_id.eq.${contactId}`)
      if (clientEmail) ors.push(`client_email.eq.${clientEmail}`)
      if (type === 'annulation' && ors.length > 0) {
        const { error: cleanupErr, count } = await supabase
          .from('setter_shared_tasks')
          .delete({ count: 'exact' })
          .eq('type', 'confirmation_rdv')
          .eq('is_completed', false)
          .or(ors.join(','))
        if (cleanupErr) console.error('[ghl-setter-task] Erreur cleanup confirmation_rdv:', cleanupErr.message)
        else console.log(`[ghl-setter-task] Confirmation RDV supprimées: ${count ?? 0} (contact_id=${contactId}, email=${clientEmail})`)
      }
    }

    // Build a readable title
    const label = TYPE_LABELS[type]
    const title = clientName
      ? `${label} — ${clientName}`
      : label

    const { error } = await supabase
      .from('setter_shared_tasks')
      .insert({
        type,
        title,
        client_name:      clientName      || null,
        client_phone:     clientPhone     || null,
        client_email:     clientEmail     || null,
        appointment_date: appointmentDate || null,
        closer_name:      closerName      || null,
        contact_url:      contactUrl      || null,
        contact_id:       contactId       || null,
        is_completed:     false,
      })

    if (error) {
      console.error('[ghl-setter-task] Erreur insert:', error.message)
      return ack('db error')
    }

    console.log(`[ghl-setter-task] Tâche créée: type=${type} client="${clientName}"`)
    return ack('created')

  } catch (err) {
    console.error('[ghl-setter-task] Erreur inattendue:', err)
    return ack('unexpected error')
  }
})
