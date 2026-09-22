import { describe, it, expect } from 'vitest'
import { isEspaceVenteV2 } from './featureFlag'

describe('drapeau VITE_ESPACE_VENTE_V2', () => {
  it('actif seulement à « true »', () => {
    expect(isEspaceVenteV2({ VITE_ESPACE_VENTE_V2: 'true' })).toBe(true)
    expect(isEspaceVenteV2({ VITE_ESPACE_VENTE_V2: ' TRUE ' })).toBe(true)
    expect(isEspaceVenteV2({ VITE_ESPACE_VENTE_V2: 'false' })).toBe(false)
    expect(isEspaceVenteV2({ VITE_ESPACE_VENTE_V2: '1' })).toBe(false)
    expect(isEspaceVenteV2({})).toBe(false)
    expect(isEspaceVenteV2(undefined)).toBe(false)
  })
})
