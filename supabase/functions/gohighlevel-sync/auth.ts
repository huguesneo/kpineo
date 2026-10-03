// Qui peut appeler gohighlevel-sync (fonction pure, testée avec vitest).
//
// - Le cron (trigger_ghl_incremental_sync, toutes les 30 min) s'authentifie avec
//   la clé anon (JWT legacy, différent de la variable SUPABASE_ANON_KEY). Cette clé est publique (elle est dans le bundle de l'app) : elle
//   n'ouvre donc QUE l'action du cron, sync_incremental, qui ne purge rien.
// - Toute autre action (test, sync_contacts, sync_opportunities et
//   sync_appointments avec leurs purges) exige un utilisateur connecté dont le
//   rôle est admin ou resp_vente.

export const ROLES_AUTORISES = ['admin', 'resp_vente']
export const ACTION_CRON = 'sync_incremental'

export function jetonBearer(authHeader: string | null): string {
  return String(authHeader ?? '').replace(/^Bearer\s+/i, '').trim()
}

// Rôle porté par un JWT Supabase (claim « role »), sans vérifier la signature :
// c'est la passerelle Supabase qui la vérifie (verify_jwt activé sur cette
// fonction — ne jamais la déployer avec --no-verify-jwt).
export function roleDuJwt(jeton: string): string | null {
  const morceaux = jeton.split('.')
  if (morceaux.length !== 3) return null
  try {
    const b64 = morceaux[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)))
    return typeof json?.role === 'string' ? json.role : null
  } catch {
    return null
  }
}

// Appel du cron : clé anon du projet (JWT signé de rôle « anon ») et action du cron uniquement
export function estAppelCron({ jeton, action }: { jeton: string; action: string }): boolean {
  return !!jeton && roleDuJwt(jeton) === 'anon' && action === ACTION_CRON
}

export type Verdict = { ok: true } | { ok: false; status: 401 | 403; error: string }

// role : rôle du profil de l'utilisateur connecté (null si aucun utilisateur valide)
export function verdictAcces({ appelCron, utilisateur, role }: {
  appelCron: boolean; utilisateur: boolean; role: string | null
}): Verdict {
  if (appelCron) return { ok: true }
  if (!utilisateur) return { ok: false, status: 401, error: 'Non autorisé : connexion requise' }
  if (!role || !ROLES_AUTORISES.includes(role)) {
    return { ok: false, status: 403, error: 'Accès réservé aux rôles admin et resp_vente' }
  }
  return { ok: true }
}
