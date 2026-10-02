import { describe, it, expect, vi, afterEach } from 'vitest'
import { examinerFichierDrive, verifierDossierBrut, copierDansDossier, lireFichierDrive } from './googleDrive'
import { videoChoisie } from './googlePicker'

afterEach(() => { vi.unstubAllGlobals() })

function reponse(status, corps = {}) {
  return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(corps) }
}

describe('fichier choisi dans Google Drive', () => {
  const meta = (o) => ({ id: 'f1', name: 'Clip.mov', size: '1000', mimeType: 'video/quicktime', parents: ['autre'], ...o })

  it('vidéo hors de Brut : à copier', () => {
    expect(examinerFichierDrive(meta(), 'brut')).toEqual({
      dansBrut: false, fichier: { id: 'f1', nom: 'Clip.mov', taille: 1000 },
    })
  })

  it('vidéo déjà dans Brut', () => {
    expect(examinerFichierDrive(meta({ parents: ['brut'] }), 'brut').dansBrut).toBe(true)
  })

  it('un .mov rangé en video/mp4 par Drive est accepté', () => {
    expect(examinerFichierDrive(meta({ mimeType: 'video/mp4' }), 'brut').erreur).toBeUndefined()
  })

  it('refuse ce qui n’est pas une vidéo mp4, mov ou m4v', () => {
    expect(examinerFichierDrive(meta({ name: 'doc.pdf', mimeType: 'application/pdf' }), 'brut').erreur).toMatch(/n'est pas une vidéo/)
    expect(examinerFichierDrive(meta({ name: 'a.avi', mimeType: 'video/x-msvideo' }), 'brut').erreur).toMatch(/Format non accepté/)
    expect(examinerFichierDrive(meta({ size: '0' }), 'brut').erreur).toMatch(/vide/)
  })

  it('réponse du Picker', () => {
    expect(videoChoisie({ action: 'picked', docs: [{ id: 'x', name: 'a.mp4', mimeType: 'video/mp4' }] }))
      .toEqual({ id: 'x', nom: 'a.mp4', mimeType: 'video/mp4' })
    expect(videoChoisie({ action: 'cancel' })).toBeNull()
  })
})

describe('appels Drive', () => {
  const jeton = vi.fn(async ({ forcer }) => (forcer ? 'neuf' : 'vieux'))

  it('dossier Brut accessible, introuvable pour ce compte, ou en lecture seule', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(reponse(200, { id: 'b', capabilities: { canAddChildren: true } }))
      .mockResolvedValueOnce(reponse(404, { error: { message: 'File not found' } }))
      .mockResolvedValueOnce(reponse(200, { id: 'b', capabilities: { canAddChildren: false } })))
    expect(await verifierDossierBrut(jeton, 'b')).toEqual({ ok: true })
    expect(await verifierDossierBrut(jeton, 'b')).toEqual({ ok: false, raison: 'acces' })
    expect(await verifierDossierBrut(jeton, 'b')).toEqual({ ok: false, raison: 'lecture_seule' })
  })

  it('copie côté Drive dans Brut, sous le nom sûr', async () => {
    const f = vi.fn().mockResolvedValue(reponse(200, { id: 'copie', name: 'Clip_2026.mov' }))
    vi.stubGlobal('fetch', f)
    const res = await copierDansDossier(jeton, 'f1', 'brut', 'Clip_2026.mov')
    expect(res.id).toBe('copie')
    const [url, init] = f.mock.calls[0]
    expect(url).toMatch(/\/files\/f1\/copy\?supportsAllDrives=true/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ name: 'Clip_2026.mov', parents: ['brut'] })
  })

  it('jeton expiré (401) : redemande un jeton une fois', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(reponse(401))
      .mockResolvedValueOnce(reponse(200, { id: 'f1' }))
    vi.stubGlobal('fetch', f)
    await lireFichierDrive(jeton, 'f1')
    expect(f.mock.calls.map(c => c[1].headers.Authorization)).toEqual(['Bearer vieux', 'Bearer neuf'])
  })

  it('réseau coupé : erreur claire et reprenable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const e = await lireFichierDrive(jeton, 'f1').catch(x => x)
    expect(e.reprenable).toBe(true)
    expect(e.message).toMatch(/ne répond pas/)
  })
})
