// Espace de vente v2 : actif seulement si VITE_ESPACE_VENTE_V2 vaut « true ».
// Absent ou « false » : l'app se comporte exactement comme avant.
export function isEspaceVenteV2(env = import.meta.env) {
  return String(env?.VITE_ESPACE_VENTE_V2 ?? '').trim().toLowerCase() === 'true'
}

export const ESPACE_VENTE_V2 = isEspaceVenteV2()
