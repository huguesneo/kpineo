// Source de la timeline du hub et liens signés, avec un faux client Supabase (aucun réseau).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { creerSourceHub } from './sourceHub'
import { creerLiens } from './liens'

const JOB = { id: 'j1', titre: 'Cortisol matin' }

// Faux client : tables en mémoire, journal des appels ; filtres eq / in / order / limit suffisants ici
function fauxClient(tables = {}, { signer } = {}) {
  const journal = []
  let id = 0
  const requete = (table) => {
    const q = { table, filtres: [], op: 'select', valeur: null }
    const lignes = () => (tables[table] || []).filter(l => q.filtres.every(([c, v, inn]) => (inn ? v.includes(l[c]) : l[c] === v)))
    const fin = () => {
      journal.push({ table, op: q.op, valeur: q.valeur, filtres: q.filtres })
      if (q.op === 'insert') {
        const l = { id: `n${++id}`, statut: 'en_attente', ...q.valeur }
        ;(tables[table] ||= []).push(l)
        return { data: q.unique ? l : [l], error: null }
      }
      if (q.op === 'update') {
        const ls = lignes()
        ls.forEach(l => Object.assign(l, q.valeur))
        return { data: ls, error: null }
      }
      const ls = lignes()
      return { data: q.unique ? ls[0] || null : ls, error: null }
    }
    const api = {
      select: () => api, eq: (c, v) => { q.filtres.push([c, v]); return api }, in: (c, v) => { q.filtres.push([c, v, true]); return api },
      order: () => api, limit: () => api,
      insert: (v) => { q.op = 'insert'; q.valeur = v; return api },
      update: (v) => { q.op = 'update'; q.valeur = v; return api },
      single: () => { q.unique = true; return Promise.resolve(fin()) },
      maybeSingle: () => { q.unique = true; return Promise.resolve(fin()) },
      then: (ok, ko) => Promise.resolve(fin()).then(ok, ko),
    }
    return api
  }
  return {
    journal,
    tables,
    from: requete,
    rpc: vi.fn(async () => ({ data: 'annulee', error: null })),
    storage: { from: (bucket) => ({ createSignedUrls: vi.fn(async (chemins, duree) => (signer ? signer(bucket, chemins, duree) : { data: chemins.map(c => ({ path: c, signedUrl: `https://s/${bucket}/${c}?t=${duree}`, error: null })), error: null })) }) },
  }
}

const sansAttente = () => Promise.resolve()

describe('liens signés', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('demandés par lot (15 min), servis ensuite sans appel ; prévient les abonnés', async () => {
    const client = fauxClient()
    const appels = []
    client.storage.from = (b) => ({ createSignedUrls: async (c, d) => { appels.push([b, c, d]); return { data: c.map(x => ({ path: x, signedUrl: `u:${x}`, error: null })) } } })
    const liens = creerLiens(client)
    const vu = vi.fn()
    liens.abonner(vu)
    expect(liens.lien('montages/j1/a.png')).toBeUndefined()
    expect(liens.lien('montages/j1/b.png')).toBeUndefined()
    expect(liens.lien('montages/j1/a.png')).toBeUndefined()
    await vi.advanceTimersByTimeAsync(50)
    expect(appels).toEqual([['video-timeline', ['montages/j1/a.png', 'montages/j1/b.png'], 900]])
    expect(vu).toHaveBeenCalledTimes(1)
    expect(liens.lien('montages/j1/a.png')).toBe('u:montages/j1/a.png')
    expect(liens.version()).toBe(1)
  })

  it('renouvelé quand il reste moins de 3 min (l’ancien sert en attendant) ; échec : nouvel essai après 30 s', async () => {
    let t = 0
    let rate = false
    const client = fauxClient({}, { signer: (b, c) => (rate ? { data: null, error: { message: 'refusé' } } : { data: c.map(x => ({ path: x, signedUrl: `u${t}`, error: null })) }) })
    const liens = creerLiens(client, { maintenant: () => t })
    liens.lien('x')
    await vi.advanceTimersByTimeAsync(50)
    expect(liens.lien('x')).toBe('u0')
    t = 13 * 60_000
    expect(liens.lien('x')).toBe('u0')
    await vi.advanceTimersByTimeAsync(50)
    expect(liens.lien('x')).toBe(`u${13 * 60_000}`)
    rate = true
    expect(liens.lien('y')).toBeUndefined()
    await vi.advanceTimersByTimeAsync(50)
    expect(liens.lien('y')).toBeUndefined()
    rate = false
    t += 31_000
    liens.lien('y')
    await vi.advanceTimersByTimeAsync(50)
    expect(liens.lien('y')).toBe(`u${t}`)
  })
})

describe('source du hub', () => {
  const ligne = () => ({
    job_id: 'j1', numero_version: 2, brouillon: null, brouillon_le: null,
    recette: { version: 1, plages: [{ source: 'P1', debut: 0, fin: 5 }], cartes: [] },
    ressources: { proxies: { P1: 'montages/j1/proxy-a.mp4' }, ondes: {} },
  })
  const tables = () => ({
    video_timeline: [ligne()],
    video_versions: [{ job_id: 'j1', numero: 2, chemin_apercu: 'apercus/j1/v2.mp4', reponse_agent: 'Édition de la timeline appliquée.', created_at: '2026-10-15T15:00:00Z' }],
    video_taches: [],
    video_jobs: [{ id: 'j1', etape: 'Aperçu', progression: 50 }],
    video_timeline_requetes: [],
  })

  it('montage : recette publiée (ou brouillon), copies légères en chemins du stockage, aperçu par lien signé', async () => {
    const client = fauxClient(tables())
    const liens = creerLiens(client)
    const s = creerSourceHub({ client, job: JOB, liens })
    const m = await s.montage()
    expect(m).toMatchObject({ brouillon: false, proxies: { P1: 'montages/j1/proxy-a.mp4' }, medias: { apercu: 2 } })
    expect(m.recette.version).toBe(1)
    client.tables.video_timeline[0].brouillon = { version: 1, cartes: [{ type: 'texte' }] }
    expect((await s.montage()).recette.cartes).toHaveLength(1)
    expect(s.lienApercu()).toBeNull()   // demandé, servi au prochain rendu
  })

  it('brouillon : écrit dans video_timeline ; ligne absente (0 ligne touchée) ou trop grand : erreur dite, rien de cassé', async () => {
    const client = fauxClient(tables())
    const onErreur = vi.fn()
    const s = creerSourceHub({ client, job: JOB, liens: creerLiens(client), onErreur })
    expect(await s.sauver({ version: 1 })).toEqual({ sauve: true })
    expect(client.tables.video_timeline[0].brouillon).toEqual({ version: 1 })
    expect(onErreur).toHaveBeenLastCalledWith(null)
    await s.jeter()
    expect(client.tables.video_timeline[0].brouillon).toBeNull()
    client.tables.video_timeline = []
    expect(await s.sauver({ version: 1 })).toEqual({ sauve: false })
    expect(onErreur).toHaveBeenLastCalledWith(expect.stringMatching(/n'existe plus/))
    client.tables.video_timeline = [ligne()]
    await s.sauver({ x: 'a'.repeat(1_000_001) })
    expect(onErreur).toHaveBeenLastCalledWith(expect.stringMatching(/1 Mo/))
  })

  it('appliquer : brouillon sauvé PUIS tâche timeline_appliquer ; suivi jusqu’à la réponse de l’agent', async () => {
    const client = fauxClient(tables())
    const s = creerSourceHub({ client, job: JOB, liens: creerLiens(client) })
    const r = await s.appliquer({ version: 1, cartes: [] })
    expect(r.travail).toMatchObject({ type: 'appliquer', etat: 'en_cours' })
    const ops = client.journal.filter(j => j.op !== 'select').map(j => `${j.op} ${j.table}`)
    expect(ops).toEqual(['update video_timeline', 'insert video_taches'])
    const tache = client.tables.video_taches[0]
    expect(tache).toMatchObject({ job_id: 'j1', type: 'timeline_appliquer', payload: {} })
    expect(s.enCours()).toBe(true)
    // un 2e travail est refusé pendant le premier
    expect((await s.ia({}, 'x')).refus).toMatch(/déjà en cours/)
    tache.statut = 'fait'
    const t = (await s.travail()).travail
    expect(t).toMatchObject({ etat: 'fini', resultat: { reponse: 'Édition de la timeline appliquée.' } })
    expect(s.enCours()).toBe(false)
    expect((await s.travail()).travail).toBeNull()
  })

  it('demander à l’IA : tâche montage depuis_timeline ; refusé si le Mac travaille déjà sur ce montage', async () => {
    const t = tables()
    t.video_taches.push({ id: 'a', job_id: 'j1', type: 'montage', statut: 'en_cours' })
    const client = fauxClient(t)
    const s = creerSourceHub({ client, job: JOB, liens: creerLiens(client) })
    expect((await s.ia({}, 'ajoute une carte')).refus).toMatch(/travaille déjà/)
    client.tables.video_taches[0].statut = 'fait'
    await s.ia({ version: 1 }, ' ajoute une carte ')
    expect(client.tables.video_taches.at(-1)).toMatchObject({ type: 'montage', payload: { prompt: 'ajoute une carte', depuis_timeline: true } })
    // erreur de l'agent → message montré
    client.tables.video_taches.at(-1).statut = 'erreur'
    client.tables.video_taches.at(-1).erreur = 'Écris ce que tu veux changer.'
    expect((await s.travail()).travail).toMatchObject({ etat: 'erreur', resultat: { erreur: 'Écris ce que tu veux changer.' } })
  })

  it('vérifier : une à la fois, seule la dernière recette attend ; réponse ou erreur du Mac', async () => {
    const client = fauxClient(tables())
    const repondre = () => {
      for (const r of client.tables.video_timeline_requetes) {
        if (r.statut === 'en_attente') { r.statut = 'fait'; r.reponse = { etat: { total: r.recette.n } } }
      }
    }
    const s = creerSourceHub({ client, job: JOB, liens: creerLiens(client), attendre: async () => repondre() })
    const [a, b, c] = await Promise.all([s.verifier({ n: 1 }), s.verifier({ n: 2 }), s.verifier({ n: 3 })])
    expect(a).toEqual({ total: 1 })
    expect(b).toEqual({ total: 3 })
    expect(c).toEqual({ total: 3 })
    expect(client.tables.video_timeline_requetes.map(r => r.recette.n)).toEqual([1, 3])   // la 2 n'est jamais envoyée
    expect(client.tables.video_timeline_requetes[0]).toMatchObject({ job_id: 'j1', type: 'verifier' })
    const s2 = creerSourceHub({ client, job: JOB, liens: creerLiens(client), attendre: async () => {
      for (const r of client.tables.video_timeline_requetes) if (r.statut === 'en_attente') { r.statut = 'erreur'; r.erreur = 'Timeline pas encore préparée pour ce montage.' }
    } })
    expect(await s2.verifier({ n: 4 })).toEqual({ erreur_outil: 'Timeline pas encore préparée pour ce montage.' })
  })

  it('modèles : catalogue + index des sons lus par lien signé ; le son garde son vrai nom, servi par sa clé du stockage', async () => {
    const client = fauxClient(tables())
    const fichiers = {
      'hub/catalogue.json': { types: { texte: 'Texte' }, graphiques: [], polices: { 'A.otf': 'hub/polices/A.otf' } },
      'sons/index.json': { sons: [{ fichier: 'musique/Émotion/atlas (1).mp3', categorie: 'musique', duree: 90, chemin: 'sons/musique/Emotion/atlas-1-abcd1234.mp3' }] },
    }
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const chemin = Object.keys(fichiers).find(c => url.includes(c))
      return { ok: Boolean(chemin), json: async () => fichiers[chemin] }
    }))
    const liens = creerLiens(client)
    const s = creerSourceHub({ client, job: JOB, liens })
    const m = await s.modeles()
    expect(m).toMatchObject({ types: { texte: 'Texte' }, polices: { 'A.otf': 'hub/polices/A.otf' } })
    expect(m.sons).toEqual([{ fichier: 'musique/Émotion/atlas (1).mp3', categorie: 'musique', duree: 90, usage: '' }])
    expect(await s.modeles()).toBe(m)   // lu une fois
    s.lienSon('musique/Émotion/atlas (1).mp3')
    await new Promise(ok => setTimeout(ok, 40))
    expect(s.lienSon('musique/Émotion/atlas (1).mp3')).toContain('sons/musique/Emotion/atlas-1-abcd1234.mp3')
    expect(s.lienSon('inconnu.mp3')).toBeUndefined()
    // catalogue absent : message clair (l'agent le publie au démarrage)
    delete fichiers['hub/catalogue.json']
    const s2 = creerSourceHub({ client, job: JOB, liens: creerLiens(client) })
    await expect(s2.modeles()).rejects.toThrow(/Catalogue de la palette absent/)
    vi.unstubAllGlobals()
  })

  it('onde : celle de l’agent si elle existe (musique déjà posée)', async () => {
    const t = tables()
    t.video_timeline[0].ressources.ondes = { 'musique/a.mp3': 'montages/j1/ondes/onde-1.json' }
    const client = fauxClient(t)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ duree: 2, pas: 0.05, pics: [0.5, 1] }) })))
    const s = creerSourceHub({ client, job: JOB, liens: creerLiens(client) })
    await s.montage()
    expect(await s.onde('musique/a.mp3')).toEqual({ duree: 2, pas: 0.05, pics: [0.5, 1] })
    vi.unstubAllGlobals()
  })
})
