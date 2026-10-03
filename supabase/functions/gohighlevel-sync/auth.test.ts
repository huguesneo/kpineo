import { describe, it, expect } from 'vitest'
import { estAppelCron, verdictAcces, jetonBearer, roleDuJwt } from './auth'

const jwt = (payload: object) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.signature`
const ANON = jwt({ iss: 'supabase', ref: 'cbqwrmyctsfdqmenczhm', role: 'anon' })
const UTILISATEUR = jwt({ sub: 'u1', role: 'authenticated' })

describe('accès à gohighlevel-sync', () => {
  it('le cron (clé anon) ne peut lancer que sync_incremental', () => {
    expect(estAppelCron({ jeton: ANON, action: 'sync_incremental' })).toBe(true)
    for (const action of ['sync_opportunities', 'sync_appointments', 'sync_contacts', 'test']) {
      expect(estAppelCron({ jeton: ANON, action })).toBe(false)
    }
  })

  it('un jeton utilisateur ou invalide n’est pas le cron', () => {
    expect(estAppelCron({ jeton: UTILISATEUR, action: 'sync_incremental' })).toBe(false)
    expect(estAppelCron({ jeton: 'autre', action: 'sync_incremental' })).toBe(false)
    expect(estAppelCron({ jeton: '', action: 'sync_incremental' })).toBe(false)
    expect(estAppelCron({ jeton: 'a.@@@.c', action: 'sync_incremental' })).toBe(false)
  })

  it('roleDuJwt lit le claim role', () => {
    expect(roleDuJwt(ANON)).toBe('anon')
    expect(roleDuJwt(UTILISATEUR)).toBe('authenticated')
    expect(roleDuJwt('pas-un-jwt')).toBe(null)
  })

  it('clé anon + action de purge : refusé (401, pas d’utilisateur)', () => {
    const appelCron = estAppelCron({ jeton: ANON, action: 'sync_opportunities' })
    expect(verdictAcces({ appelCron, utilisateur: false, role: null })).toEqual({ ok: false, status: 401, error: expect.any(String) })
  })

  it('utilisateur connecté : admin et resp_vente seulement', () => {
    expect(verdictAcces({ appelCron: false, utilisateur: true, role: 'admin' })).toEqual({ ok: true })
    expect(verdictAcces({ appelCron: false, utilisateur: true, role: 'resp_vente' })).toEqual({ ok: true })
    for (const role of ['setter', 'closer', 'naturopathe', null]) {
      expect(verdictAcces({ appelCron: false, utilisateur: true, role })).toMatchObject({ ok: false, status: 403 })
    }
  })

  it('jetonBearer', () => {
    expect(jetonBearer('Bearer abc')).toBe('abc')
    expect(jetonBearer('bearer  abc ')).toBe('abc')
    expect(jetonBearer(null)).toBe('')
  })
})
