import { describe, it, expect, vi, afterEach } from 'vitest'
import { creerEnvoiDiffere, DELAI_ANNULATION_MS } from './envoiDiffere'

// Bogue du 23 oct. : dans le navigateur, window.setTimeout appelé comme méthode d'un
// autre objet lève « Illegal invocation ». Aucun rejet n'est parti. On reproduit la
// règle du navigateur ici (Node ne la vérifie pas).
describe('minuteries du navigateur', () => {
  const vrais = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }
  afterEach(() => { globalThis.setTimeout = vrais.setTimeout; globalThis.clearTimeout = vrais.clearTimeout })

  function commeLeNavigateur() {
    globalThis.setTimeout = function (fn, ms) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation')
      return vrais.setTimeout(fn, ms)
    }
    globalThis.clearTimeout = function (t) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation')
      return vrais.clearTimeout(t)
    }
  }

  it('programmer et annuler ne lèvent pas d’erreur avec les minuteries par défaut', () => {
    commeLeNavigateur()
    const f = creerEnvoiDiffere()
    const annuler = f.programmer({ executer: vi.fn() })
    expect(f.enAttente).toBe(true)
    expect(annuler()).toBe(true)
  })

  it('l’action part vraiment après le délai', async () => {
    commeLeNavigateur()
    const executer = vi.fn().mockResolvedValue({ ok: true })
    creerEnvoiDiffere({ delai: 5 }).programmer({ executer })
    await new Promise(r => vrais.setTimeout(r, 30))
    expect(executer).toHaveBeenCalledTimes(1)
    expect(DELAI_ANNULATION_MS).toBe(6000)
  })
})
