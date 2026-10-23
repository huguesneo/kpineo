import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { creerEnvoiDiffere, DELAI_ANNULATION_MS } from './envoiDiffere'

describe('envoi différé avec Annuler', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('rien ne part avant 6 secondes, puis l’action part une fois', async () => {
    const f = creerEnvoiDiffere()
    const executer = vi.fn().mockResolvedValue('ok')
    const surSucces = vi.fn()
    f.programmer({ executer, surSucces })
    await vi.advanceTimersByTimeAsync(DELAI_ANNULATION_MS - 1)
    expect(executer).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(executer).toHaveBeenCalledTimes(1)
    expect(surSucces).toHaveBeenCalledWith('ok')
    expect(f.enAttente).toBe(false)
  })

  it('Annuler empêche réellement l’appel', async () => {
    const f = creerEnvoiDiffere()
    const executer = vi.fn()
    const surAnnulation = vi.fn()
    const annuler = f.programmer({ executer, surAnnulation })
    await vi.advanceTimersByTimeAsync(3000)
    expect(annuler()).toBe(true)
    await vi.advanceTimersByTimeAsync(10000)
    expect(executer).not.toHaveBeenCalled()
    expect(surAnnulation).toHaveBeenCalledTimes(1)
    expect(annuler()).toBe(false)
  })

  it('trop tard pour annuler une fois partie', async () => {
    const f = creerEnvoiDiffere()
    const executer = vi.fn()
    const annuler = f.programmer({ executer })
    await vi.advanceTimersByTimeAsync(DELAI_ANNULATION_MS)
    expect(annuler()).toBe(false)
    expect(executer).toHaveBeenCalledTimes(1)
  })

  it('une deuxième action fait partir la première tout de suite', async () => {
    const f = creerEnvoiDiffere()
    const a = vi.fn()
    const b = vi.fn()
    f.programmer({ executer: a })
    f.programmer({ executer: b })
    await vi.advanceTimersByTimeAsync(0)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(DELAI_ANNULATION_MS)
    expect(b).toHaveBeenCalledTimes(1)
    expect(a).toHaveBeenCalledTimes(1)
  })

  it('vider() en quittant la page envoie ce qui attend', async () => {
    const f = creerEnvoiDiffere()
    const executer = vi.fn()
    f.programmer({ executer })
    f.vider()
    await vi.advanceTimersByTimeAsync(0)
    expect(executer).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(DELAI_ANNULATION_MS)
    expect(executer).toHaveBeenCalledTimes(1)
  })

  it('une erreur passe à surErreur', async () => {
    const f = creerEnvoiDiffere()
    const surErreur = vi.fn()
    f.programmer({ executer: () => Promise.reject(new Error('Make')), surErreur })
    await vi.advanceTimersByTimeAsync(DELAI_ANNULATION_MS)
    expect(surErreur).toHaveBeenCalledWith(expect.objectContaining({ message: 'Make' }))
  })
})
