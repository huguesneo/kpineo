// ─── Show automatique, côté serveur ────────────────────────────
// Appelée chaque minute par pg_cron (migration 20260930_show_auto_cron.sql).
// Passe en « show » les rendez-vous terminés dont la fiche de qualification
// (sale_call_notes) a au moins 6 champs remplis, même si plus personne n'a
// l'écran d'appel ouvert. Mêmes garde-fous que peutPasserEnShowAuto
// (src/pages/SaleCallScript.jsx) : jamais par-dessus un statut déjà choisi,
// pas avant la fin prévue, plus rien 8 h après.
// Ne reçoit aucune donnée : un appel de trop ne fait qu'avancer ce que la
// minute suivante ferait de toute façon. Le changement de statut passe par
// ghl-update-appointment, qui refuse lui-même tout show avant la fin prévue.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Promise<Response> | Response): void
}

const CHAMPS_MIN     = 6
const APRES_MS       = 8 * 3_600_000
// L'écran d'appel ouvert s'en charge à la seconde près ; on lui laisse la
// première minute pour ne pas envoyer deux fois la note dans GHL.
const DELAI_MS       = 60_000
const DUREE_DEFAUT   = 60
const STATUTS_LIBRES = [null, '', 'new', 'pending', 'confirmed']

// Même ordre et mêmes libellés courts que QUAL_FIELDS / formatNoteForGHL
const QUAL_FIELDS: [string, string][] = [
  ['reference',     'Référence client'],
  ['source',        "D'où provient-il ? Comment a-t-il entendu parler de nous ?"],
  ['objectif',      'Objectif principal'],
  ['pourquoi',      'Pourquoi cet objectif est-il si important pour toi en ce moment ?'],
  ['depuis',        'Depuis combien de temps cherches-tu à atteindre cet objectif ?'],
  ['deja_essaye',   "Qu'as-tu déjà essayé jusqu'à maintenant ?"],
  ['problematique', 'Problématique actuelle'],
  ['solution',      'Solution idéale'],
  ['note',          'Note supplémentaire'],
]

type Appt = {
  ghl_id: string; contact_id: string | null; contact_name: string | null
  assigned_user_id: string | null; start_time: string; end_time: string | null
  status: string | null; raw: Record<string, unknown> | null
}

function finMs(a: Appt) {
  const fin = a.end_time ? new Date(a.end_time).getTime() : NaN
  if (!isNaN(fin)) return fin
  const duree = Number(a.raw?.duration ?? a.raw?.durationMinutes) || DUREE_DEFAUT
  return new Date(a.start_time).getTime() + duree * 60_000
}

function champsRemplis(q: Record<string, unknown>) {
  return QUAL_FIELDS.filter(([k]) => String(q?.[k] ?? '').trim()).length
}

const dateLocale = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }) // yyyy-MM-dd

function noteGHL(a: Appt, q: Record<string, unknown>) {
  const date = new Date(a.start_time).toLocaleDateString('fr-CA', {
    timeZone: 'America/Toronto', day: 'numeric', month: 'long', year: 'numeric',
  })
  const lignes = [`--- Sale Call ${date} ---`]
  for (const [k, label] of QUAL_FIELDS) {
    const v = String(q?.[k] ?? '').trim()
    if (v) lignes.push(`${label} : ${v}`)
  }
  return lignes.join('\n')
}

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(url, serviceKey)
  const maintenant = Date.now()

  // Rendez-vous commencés dans les ~10 dernières heures
  const { data: appts, error } = await supabase
    .from('ghl_appointments')
    .select('ghl_id, contact_id, contact_name, assigned_user_id, start_time, end_time, status, raw')
    .gte('start_time', new Date(maintenant - APRES_MS - 2 * 3_600_000).toISOString())
    .lte('start_time', new Date(maintenant).toISOString())
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  const candidats = ((appts ?? []) as Appt[]).filter(a => {
    if (!STATUTS_LIBRES.includes(a.status)) return false
    const fin = finMs(a)
    return maintenant >= fin + DELAI_MS && maintenant <= fin + APRES_MS
  })
  if (candidats.length === 0) return new Response(JSON.stringify({ traites: 0 }))

  const { data: notes } = await supabase
    .from('sale_call_notes')
    .select('appointment_ghl_id, user_id, qualification')
    .in('appointment_ghl_id', candidats.map(a => a.ghl_id))

  const resultats: Record<string, string> = {}
  for (const a of candidats) {
    const note = (notes ?? []).find(n => n.appointment_ghl_id === a.ghl_id)
    const q = (note?.qualification ?? {}) as Record<string, unknown>
    if (champsRemplis(q) < CHAMPS_MIN) continue

    const res = await fetch(`${url}/functions/v1/ghl-update-appointment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        appointmentId: a.ghl_id,
        contactId:     a.contact_id ?? undefined,
        status:        'show',
        note:          noteGHL(a, q),
      }),
    })
    if (!res.ok) {
      resultats[a.ghl_id] = `erreur ${res.status}: ${(await res.text()).slice(0, 200)}`
      console.error(`[show-auto] ${a.ghl_id}: ${resultats[a.ghl_id]}`)
      continue
    }

    // Ligne du rapport de fin de journée : celui du closeur assigné, sinon
    // de la personne qui a rempli la fiche (comme l'écran d'appel).
    let userId = note?.user_id ?? null
    if (a.assigned_user_id) {
      const { data: p } = await supabase
        .from('profiles').select('id').eq('ghl_user_id', a.assigned_user_id).maybeSingle()
      if (p?.id) userId = p.id
    }
    if (userId) await ligneEODShow(supabase, userId, a)

    resultats[a.ghl_id] = 'show'
    console.log(`[show-auto] ${a.ghl_id} (${a.contact_name}) → show`)
  }

  return new Response(JSON.stringify({ traites: Object.keys(resultats).length, resultats }))
})

// Même logique que saveRowChangesToEOD (src/hooks/useCloserEOD.js)
async function ligneEODShow(supabase: ReturnType<typeof createClient>, userId: string, a: Appt) {
  const reportDate = dateLocale(a.start_time)
  const { data: existant } = await supabase
    .from('end_of_day_reports').select('*')
    .eq('user_id', userId).eq('role', 'closer').eq('report_date', reportDate)
    .maybeSingle()

  const doc  = (existant?.data ?? {}) as Record<string, unknown>
  const rows = (doc.rows ?? []) as Record<string, unknown>[]
  const idx  = rows.findIndex(r => r.ghl_appointment_id === a.ghl_id)
  const nouvelles = idx >= 0
    ? rows.map((r, i) => i === idx ? { ...r, status: 'show' } : r)
    : [...rows, {
        ghl_appointment_id: a.ghl_id,
        contact_name: a.contact_name || '', contact_id: a.contact_id || '',
        start_time: a.start_time || '', end_time: a.end_time || '',
        status: 'show', is_closed: null, rdv_decision: null, feedback: '',
        action_plan: '', objection_principale: '', objection_reason: '',
      }].sort((x, y) => new Date(String(x.start_time)).getTime() - new Date(String(y.start_time)).getTime())

  const data = { ...doc, rows: nouvelles }
  const now  = new Date().toISOString()
  if (existant) {
    await supabase.from('end_of_day_reports').update({ data, submitted_at: now }).eq('id', existant.id)
  } else {
    await supabase.from('end_of_day_reports').insert({
      user_id: userId, report_date: reportDate, role: 'closer', data, submitted_at: now,
    })
  }
}
