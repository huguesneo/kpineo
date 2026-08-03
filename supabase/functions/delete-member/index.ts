import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Promise<Response> | Response): void
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Seul Hugues peut supprimer définitivement un membre.
const ALLOWED_EMAILS = ['hugues@neoperformance.ca']

// Tables portant l'historique d'activité "métier" d'un membre (toutes en FK
// ON DELETE CASCADE vers profiles/auth.users) : on bloque la suppression si l'une
// d'elles contient encore des données, plutôt que de laisser Postgres tout effacer
// en cascade silencieusement.
const ACTIVITY_TABLES: Array<{ table: string; column: string; label: string }> = [
  { table: 'kpi_entries',           column: 'user_id', label: 'Entrées KPI' },
  { table: 'objectives',            column: 'user_id', label: 'Objectifs' },
  { table: 'end_of_day_reports',    column: 'user_id', label: 'Rapports de fin de journée' },
  { table: 'tasks',                 column: 'user_id', label: 'Tâches assignées' },
  { table: 'career_plans',          column: 'user_id', label: 'Plans de carrière' },
  { table: 'transition_plans',      column: 'user_id', label: 'Plans de transition' },
  { table: 'quarterly_bonuses',     column: 'user_id', label: 'Bonis trimestriels' },
  { table: 'schedules',             column: 'user_id', label: 'Horaires' },
  { table: 'schedule_adjustments',  column: 'user_id', label: 'Ajustements d’horaire' },
  { table: 'schedule_overrides',    column: 'user_id', label: 'Horaires modifiés' },
  { table: 'absences',              column: 'user_id', label: 'Absences' },
  { table: 'absence_allowances',    column: 'user_id', label: 'Allocations d’absence' },
  { table: 'overtime_records',      column: 'user_id', label: 'Heures supplémentaires' },
  { table: 'daily_punch_entries',   column: 'user_id', label: 'Pointages' },
  { table: 'pay_period_overrides',  column: 'user_id', label: 'Ajustements de paie' },
  { table: 'pending_changes',       column: 'user_id', label: 'Changements en attente' },
  { table: 'blocked_slots',         column: 'user_id', label: 'Créneaux bloqués' },
  { table: 'sale_call_notes',       column: 'user_id', label: 'Notes d’appels' },
]

// Gamification (points/récompenses) : pas un historique métier critique — on l'efface
// automatiquement avec le membre plutôt que de bloquer la suppression.
const AUTO_DELETE_TABLES: Array<{ table: string; column: string }> = [
  { table: 'points_transactions', column: 'user_id' },
  { table: 'user_points_history', column: 'user_id' },
  { table: 'redemptions',         column: 'user_id' },
  { table: 'user_points',         column: 'user_id' },
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Non autorisé' }, 401)

    // Auth applicative (JWT OFF sur la fonction) : on valide la session Supabase
    // de l'appelant et on refuse quiconque n'est pas dans l'allowlist.
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !caller?.email || !ALLOWED_EMAILS.includes(caller.email.toLowerCase())) {
      return json({ error: 'Accès refusé' }, 403)
    }

    const { memberId } = await req.json() as { memberId?: string }
    if (!memberId) return json({ error: 'memberId requis' }, 400)
    if (memberId === caller.id) return json({ error: 'Impossible de supprimer votre propre compte' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: target, error: targetError } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', memberId)
      .single()
    if (targetError || !target) return json({ error: 'Membre introuvable' }, 404)

    const blocking: string[] = []
    for (const { table, column, label } of ACTIVITY_TABLES) {
      const { count, error } = await admin
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq(column, memberId)
      if (error) {
        console.error(`[delete-member] check ${table} failed:`, error.message)
        continue
      }
      if ((count ?? 0) > 0) blocking.push(label)
    }

    if (blocking.length > 0) {
      return json({
        error: `Impossible de supprimer ${target.full_name} : ce membre a encore des données liées (${blocking.join(', ')}).`,
        blockingTables: blocking,
      }, 409)
    }

    for (const { table, column } of AUTO_DELETE_TABLES) {
      const { error } = await admin.from(table).delete().eq(column, memberId)
      if (error) console.error(`[delete-member] cleanup ${table} failed:`, error.message)
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(memberId)
    if (deleteError) return json({ error: deleteError.message }, 500)

    return json({ success: true })
  } catch (err) {
    console.error('[delete-member] error:', err)
    return json({ error: 'Erreur serveur' }, 500)
  }
})
