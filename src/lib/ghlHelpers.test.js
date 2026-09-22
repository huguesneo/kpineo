import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
const { isSaleInScope, GHL_PIPELINE_CLOSER, GHL_PIPELINE_VENTE, GHL_FIELD_DATE_CLOSE } = await import('./ghlHelpers.js')

const sale = (pipeline_id, day) => ({
  pipeline_id,
  stage_name: '🏆 Gagné',
  raw: { customFields: day ? [{ id: GHL_FIELD_DATE_CLOSE, fieldValueNumber: Date.parse(`${day}T00:00:00Z`) }] : [] },
})

describe('ventes closeurs : une seule lecture par vente (bascule 2026-09-22)', () => {
  it('avant la bascule : ancien pipeline seulement', () => {
    expect(isSaleInScope(sale(GHL_PIPELINE_CLOSER, '2026-09-21'))).toBe(true)
    expect(isSaleInScope(sale(GHL_PIPELINE_VENTE, '2026-09-21'))).toBe(false)
  })
  it('à partir de la bascule : pipeline Vente seulement', () => {
    expect(isSaleInScope(sale(GHL_PIPELINE_CLOSER, '2026-09-22'))).toBe(false)
    expect(isSaleInScope(sale(GHL_PIPELINE_VENTE, '2026-09-22'))).toBe(true)
  })
  it('sans date de close : reste visible (contrôle d\'hygiène)', () => {
    expect(isSaleInScope(sale(GHL_PIPELINE_CLOSER, null))).toBe(true)
    expect(isSaleInScope(sale(GHL_PIPELINE_VENTE, null))).toBe(true)
  })
})
