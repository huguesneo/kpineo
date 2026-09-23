// Purge des lignes fantômes du cache GHL (fonction pure, testée avec vitest).
// Une ligne est fantôme quand GHL ne la renvoie plus alors que la lecture
// était complète : carte ou rendez-vous supprimé dans GHL.
//
// Garde-fous :
//  - lecture incomplète (erreur GHL, page manquante) : on ne purge rien ;
//  - purge trop large (plus de `ratioMax` des lignes en cache, au-delà de
//    `plancher` lignes) : on ne purge rien, signe d'une réponse GHL tronquée.

export interface DecisionPurge {
  ids: string[]          // ghl_id à supprimer
  bloque: string | null  // raison du blocage, sinon null
}

export function idsAPurger(
  enCache: string[],
  vus: Iterable<string>,
  { complet, ratioMax = 0.3, plancher = 10 }: { complet: boolean; ratioMax?: number; plancher?: number },
): DecisionPurge {
  if (!complet) return { ids: [], bloque: 'lecture GHL incomplète' }
  const vusSet = new Set(vus)
  if (vusSet.size === 0 && enCache.length > 0) return { ids: [], bloque: 'GHL n’a renvoyé aucune ligne' }
  const ids = [...new Set(enCache)].filter(id => id && !vusSet.has(id))
  if (ids.length > plancher && ids.length > enCache.length * ratioMax) {
    return { ids: [], bloque: `purge trop large (${ids.length} sur ${enCache.length})` }
  }
  return { ids, bloque: null }
}

// Découpe en paquets (suppressions .in() de taille raisonnable)
export function paquets<T>(liste: T[], taille = 100): T[][] {
  const out: T[][] = []
  for (let i = 0; i < liste.length; i += taille) out.push(liste.slice(i, i + taille))
  return out
}
