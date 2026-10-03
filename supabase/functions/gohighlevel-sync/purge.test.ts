import { describe, it, expect } from 'vitest'
import { idsAPurger, paquets } from './purge'

describe('purge du cache GHL', () => {
  const cache = Array.from({ length: 100 }, (_, i) => `id${i}`)

  it('purge les lignes absentes de la réponse GHL complète', () => {
    const vus = cache.filter(id => !['id3', 'id7'].includes(id))
    expect(idsAPurger(cache, vus, { complet: true })).toEqual({ ids: ['id3', 'id7'], bloque: null })
  })

  it('ne purge rien si la lecture GHL est incomplète', () => {
    const r = idsAPurger(cache, cache.slice(0, 50), { complet: false })
    expect(r.ids).toEqual([])
    expect(r.bloque).toMatch(/incomplète/)
  })

  it('ne purge rien si GHL ne renvoie aucune ligne', () => {
    expect(idsAPurger(cache, [], { complet: true }).bloque).toMatch(/aucune/)
  })

  it('bloque une purge trop large (réponse tronquée)', () => {
    const r = idsAPurger(cache, cache.slice(0, 60), { complet: true })
    expect(r.ids).toEqual([])
    expect(r.bloque).toMatch(/trop large \(40 sur 100\)/)
  })

  it('accepte une petite purge même au-delà du ratio (sous le plancher)', () => {
    const petit = ['a', 'b', 'c', 'd']
    expect(idsAPurger(petit, ['a'], { complet: true }).ids).toEqual(['b', 'c', 'd'])
  })

  it('ignore les ids vides et les doublons, et ne touche pas aux lignes vues', () => {
    expect(idsAPurger(['x', 'x', '', 'y'], ['y'], { complet: true }).ids).toEqual(['x'])
  })

  it('paquets', () => {
    expect(paquets([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})
