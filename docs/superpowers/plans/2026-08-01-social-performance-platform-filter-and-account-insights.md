# Filtre plateforme + insights de compte (réseaux sociaux) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un filtre par plateforme sur le tableau scoré de l'onglet Performance, et remplacer les cartes de comptes basées sur `ghlGetStats` (qui ne retournent rien) par un nombre d'abonnés réel lu depuis `social_accounts.followers_count`, alimenté par un sync quotidien des insights de compte Meta (Instagram + Facebook).

**Architecture:** Le filtre plateforme est purement client-side (aucune nouvelle requête). Les insights de compte sont ajoutés comme une étape supplémentaire dans `social-sync-meta` (la même fonction Edge existante, pas une nouvelle), qui upsert dans `social_account_snapshots` et met à jour `social_accounts.followers_count`. Le front lit ces données via une extension de `useSocialPerformance`.

**Tech Stack:** React (Vite), Supabase (Postgres + Edge Functions Deno), Meta Graph API v19.0.

## Constat préalable (étape 0 — déjà vérifié)

```sql
SELECT platform, count(*) FROM social_publications GROUP BY platform;
-- résultat : instagram=50. facebook=0, tiktok=0 (absents du résultat).
```

**Facebook et TikTok sont à zéro publications.** Ce n'est pas un bug du filtre à construire : c'est que le sync Facebook n'a jamais tourné (aucune ligne `facebook` dans `social_accounts` avant ce plan — vérifié par `SELECT * FROM social_accounts`, qui ne contenait qu'une ligne Instagram) et que TikTok n'a pas d'intégration API du tout. Confirmé côté GHL (`social-media-posting_get-account`) : le compte Facebook « Neo Performance - Naturopathe » existe et est connecté (`originId: 1581741725486806`, `hasStatisticsPermissions: true`), il n'a simplement jamais été ajouté à la table d'analytique `social_accounts`. Le compte TikTok connecté (`originId` de type `openId` TikTok, pas un ID Graph API Meta) confirme qu'il n'a pas sa place dans `social-sync-meta`, qui n'appelle que l'API Meta.

Ce plan :
- ajoute la ligne `social_accounts` Facebook manquante (Tâche 1) pour que le sync Facebook puisse exister,
- étend `social-sync-meta` pour les insights de compte Instagram + Facebook (Tâche 2-3),
- ne touche pas au sync média Instagram existant (matching GHL, scoring) — hors scope,
- laisse TikTok sans compte `social_accounts` — hors scope tant que son intégration API n'existe pas (le roadmap le mentionne comme phase à part).

## Global Constraints

- Pas de framework de tests dans ce repo (`package.json` : `dev`/`build`/`lint`/`preview` seulement, aucun fichier `*.test.*`) — la vérification de chaque tâche se fait par requête SQL, appel `curl`/MCP, ou test manuel dans le navigateur, pas par suite de tests automatisée. Ne pas introduire de framework de tests dans ce plan.
- Toute Edge Function doit être déployée avec `verify_jwt: false` — l'auth se fait dans le code (mémoire projet : « Edge functions : verify_jwt OFF »).
- `social-sync-meta` est LA fonction à étendre — ne pas créer de nouvelle Edge Function pour les insights de compte.
- TikTok doit rester visible dans l'UI même sans données (onglet visible, cartes affichant un état neutre) — ne jamais le masquer ni le faire planter.
- Le filtre plateforme est 100 % client-side sur les données déjà chargées par `useSocialPerformance` — aucune nouvelle requête réseau pour Partie 1.

---

## File Structure

- Modify: `supabase/migrations/20260801_social_account_facebook_seed.sql` (nouveau fichier) — insère la ligne `social_accounts` Facebook manquante.
- Modify: `supabase/functions/social-sync-meta/index.ts` — ajoute la récupération des insights de compte (Instagram + Facebook) et l'upsert `social_account_snapshots` + mise à jour `followers_count`.
- Modify: `src/hooks/useSocialPlanner.js` — étend `useSocialPerformance` pour aussi charger `social_accounts` (id, platform, followers_count).
- Modify: `src/pages/ReseauxSociaux.jsx` — ajoute les onglets de plateforme au-dessus du tableau scoré (`PerformanceView`/`ScoredTable`), et remplace les cartes `ghlGetStats` par une lecture de `followers_count`.

---

### Task 1: Seed du compte Facebook dans `social_accounts`

**Files:**
- Create: `supabase/migrations/20260801_social_account_facebook_seed.sql`

**Interfaces:**
- Produces: une ligne `social_accounts` avec `platform='facebook'`, `external_id='1581741725486806'` (Facebook Page ID natif, confirmé via GHL `social-media-posting_get-account` → `originId` du compte `platform: "facebook"`), consommée par la Tâche 2 (sync insights de compte) et la Tâche 5 (cartes front).

- [ ] **Step 1: Écrire la migration**

```sql
-- ============================================================================
-- Seed du compte Facebook dans social_accounts — manquant jusqu'ici, ce qui
-- explique que social_publications n'ait jamais eu de ligne 'facebook' :
-- le sync n'avait aucun compte Facebook à interroger.
-- external_id = Page ID Meta natif (confirmé via GHL social-media-posting
-- accounts : originId du compte platform=facebook = 1581741725486806).
-- ============================================================================

INSERT INTO public.social_accounts (platform, external_id, handle, display_name, timezone, is_active)
VALUES ('facebook', '1581741725486806', 'neoperformance', 'Neo Performance - Naturopathe', 'America/Toronto', true)
ON CONFLICT (platform, external_id) DO NOTHING;
```

- [ ] **Step 2: Appliquer la migration via MCP Supabase**

Utiliser `mcp__bacb9641-002b-4cbb-8dca-03fd7e27f0d0__apply_migration` avec `project_id = cbqwrmyctsfdqmenczhm`, `name = social_account_facebook_seed`, et le contenu SQL ci-dessus.

- [ ] **Step 3: Vérifier**

```sql
SELECT platform, external_id, display_name, followers_count FROM social_accounts ORDER BY platform;
```
Attendu : deux lignes, `facebook` (followers_count NULL, pas encore syncé) et `instagram`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260801_social_account_facebook_seed.sql
git commit -m "Ajoute le compte Facebook manquant dans social_accounts"
```

---

### Task 2: Généraliser `fetchInsights` pour les nœuds de compte (pas seulement les médias)

**Files:**
- Modify: `supabase/functions/social-sync-meta/index.ts:64-96` (fonction `fetchInsights`)

**Interfaces:**
- Consumes: `metaUrl(path, params)` défini en haut du fichier (`supabase/functions/social-sync-meta/index.ts:10-14`).
- Produces: `fetchNodeInsights(nodeId: string, metrics: string[], extraParams: Record<string,string>): Promise<{ data: Record<string, unknown> | null, metrics: string[], error: string | null }>` — utilisée par la Tâche 3. `fetchInsights(mediaId, metrics)` reste utilisable telle quelle (devient un appel à `fetchNodeInsights(mediaId, metrics, {})`), donc le flux média Instagram existant (lignes 359-388) n'a pas besoin d'être touché.

- [ ] **Step 1: Remplacer `fetchInsights` par une version générique + un wrapper média**

Dans `supabase/functions/social-sync-meta/index.ts`, remplacer les lignes 64-96 par :

```typescript
/** Récupère les insights d'un nœud Graph API (média ou compte). Si l'API rejette
 *  une métrique (code 100), on retire les métriques nommées dans le message
 *  d'erreur et on réessaie une fois. */
async function fetchNodeInsights(nodeId: string, metrics: string[], extraParams: Record<string, string> = {}) {
  const call = async (list: string[]) => {
    const res = await fetch(metaUrl(`/${nodeId}/insights`, { metric: list.join(','), ...extraParams }))
    const txt = await res.text()
    let json: Record<string, unknown> = {}
    try { json = JSON.parse(txt) } catch { /* réponse non JSON */ }
    return { ok: res.ok, status: res.status, txt, json }
  }

  let attempt = await call(metrics)
  if (attempt.ok) return { data: attempt.json, metrics, error: null as string | null }

  // Message d'erreur Meta — on ne logue jamais l'URL (elle contient le token).
  const err = (attempt.json.error as Record<string, unknown> | undefined) ?? {}
  const message = String(err.message ?? attempt.txt).slice(0, 400)
  const rejected = metrics.filter(m => message.includes(m))
  const retryList = metrics.filter(m => !rejected.includes(m))

  if (retryList.length === 0 || rejected.length === 0) {
    return { data: null, metrics, error: `insights ${nodeId}: ${message}` }
  }

  console.warn(`insights ${nodeId}: retrait de [${rejected.join(',')}] — ${message}`)
  attempt = await call(retryList)
  if (attempt.ok) return { data: attempt.json, metrics: retryList, error: null }

  const err2 = (attempt.json.error as Record<string, unknown> | undefined) ?? {}
  return { data: null, metrics: retryList, error: `insights ${nodeId}: ${String(err2.message ?? attempt.txt).slice(0, 400)}` }
}

async function fetchInsights(mediaId: string, metrics: string[]) {
  return fetchNodeInsights(mediaId, metrics)
}
```

Cette version diffère de l'originale sur un point : l'ancien code retombait sur `BASE_METRICS.filter(...)` quand rien n'était explicitement nommé dans le message d'erreur, un choix qui n'a de sens que pour les métriques média. Pour un nœud générique, retirer simplement les métriques nommées est plus sûr (pas de présupposé sur ce qu'est un « repli raisonnable » pour un compte).

- [ ] **Step 2: Vérifier que le fichier est toujours valide TypeScript/Deno**

```bash
cd "supabase/functions/social-sync-meta" && deno check index.ts
```
Si `deno` n'est pas installé localement, passer cette étape — la vérification se fera au déploiement (Tâche 4).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/social-sync-meta/index.ts
git commit -m "social-sync-meta: généralise fetchInsights aux nœuds de compte"
```

---

### Task 3: Insights de compte Instagram + Facebook dans `social-sync-meta`

**Files:**
- Modify: `supabase/functions/social-sync-meta/index.ts` — ajoute une étape avant le retour final (après l'étape 6 « Matching », avant l'étape 7 « Horodatage »).

**Interfaces:**
- Consumes: `fetchNodeInsights` (Tâche 2), `supabase` client déjà instancié en haut du `Deno.serve` (`supabase/functions/social-sync-meta/index.ts:200-203`), `num()` déjà défini (ligne 58-62).
- Produces: une ligne `social_account_snapshots` par compte actif Instagram/Facebook et par jour (upsert sur `account_id, snapshot_date`), et `social_accounts.followers_count` à jour à chaque passage. Consommé par la Tâche 5 (front) via `useSocialPerformance`.

- [ ] **Step 1: Ajouter les fonctions de récupération par plateforme**

Insérer avant `Deno.serve(async (req) => {` (juste après la définition de `scoreCandidate`, ligne 195) :

```typescript
// ============================================================================
// Insights de compte (Instagram + Facebook) — une fois par passage.
// Le nœud IG expose followers_count comme champ direct (pas une métrique
// insights) ; Facebook aussi via le champ Page. Les vraies "insights" ne
// couvrent que reach/profile_views/non-follower share.
// ============================================================================

type AccountRow = { id: string; platform: string; external_id: string }

async function fetchFollowerCount(nodeId: string): Promise<number | null> {
  const res = await fetch(metaUrl(`/${nodeId}`, { fields: 'followers_count' }))
  if (!res.ok) return null
  const json = await res.json().catch(() => ({})) as { followers_count?: unknown }
  return num(json.followers_count)
}

async function fetchInstagramAccountSnapshot(account: AccountRow) {
  const nodeId = account.external_id
  const followers = await fetchFollowerCount(nodeId)

  const { data: basic, error: basicErr } = await fetchNodeInsights(
    nodeId, ['reach', 'profile_views'], { period: 'day', metric_type: 'total_value' },
  )
  const { data: breakdown, error: breakdownErr } = await fetchNodeInsights(
    nodeId, ['reach'], { period: 'day', metric_type: 'total_value', breakdown: 'follow_type' },
  )

  const rows = (basic?.data as InsightValue[] | undefined) ?? []
  const byName: Record<string, number | null> = {}
  for (const row of rows) {
    if (!row.name) continue
    const tv = (row as unknown as { total_value?: { value?: unknown } }).total_value
    byName[row.name] = num(tv?.value ?? row.values?.[0]?.value)
  }

  let nonFollowerShare: number | null = null
  const bRows = (breakdown?.data as InsightValue[] | undefined) ?? []
  const reachRow = bRows.find(r => r.name === 'reach') as unknown as
    { total_value?: { breakdowns?: { results?: { dimension_values?: string[]; value?: number }[] }[] } } | undefined
  const results = reachRow?.total_value?.breakdowns?.[0]?.results ?? []
  if (results.length) {
    let follower = 0, nonFollower = 0
    for (const r of results) {
      const dim = (r.dimension_values ?? [])[0]
      const v = num(r.value) ?? 0
      if (dim === 'FOLLOWER') follower += v
      else if (dim === 'NON_FOLLOWER') nonFollower += v
    }
    if (follower + nonFollower > 0) nonFollowerShare = nonFollower / (follower + nonFollower)
  }

  return {
    followers,
    reach: byName['reach'] ?? null,
    profile_views: byName['profile_views'] ?? null,
    non_follower_view_share: nonFollowerShare,
    error: basicErr ?? breakdownErr,
    raw: { basic: basic ?? null, breakdown: breakdown ?? null },
  }
}

async function fetchFacebookAccountSnapshot(account: AccountRow) {
  const nodeId = account.external_id
  const followers = await fetchFollowerCount(nodeId)

  const { data: basic, error: basicErr } = await fetchNodeInsights(
    nodeId, ['page_impressions_unique', 'page_views_total'], { period: 'day' },
  )
  const rows = (basic?.data as InsightValue[] | undefined) ?? []
  const byName: Record<string, number | null> = {}
  for (const row of rows) {
    if (!row.name) continue
    byName[row.name] = num(row.values?.[0]?.value)
  }

  // Meta n'expose pas d'équivalent "part de vues non-abonnés" pour les Pages.
  return {
    followers,
    reach: byName['page_impressions_unique'] ?? null,
    profile_views: byName['page_views_total'] ?? null,
    non_follower_view_share: null,
    error: basicErr,
    raw: { basic: basic ?? null },
  }
}
```

- [ ] **Step 2: Brancher l'étape dans `Deno.serve`**

Dans `supabase/functions/social-sync-meta/index.ts`, insérer ce bloc entre l'étape 6 (matching, se termine ligne 507) et l'étape 7 (horodatage, ligne 509-512) :

```typescript
    // 6.5. Insights de compte — Instagram + Facebook, une fois par passage --
    try {
      const { data: acctRows, error: acctErr } = await supabase
        .from('social_accounts')
        .select('id, platform, external_id')
        .in('platform', ['instagram', 'facebook'])
        .eq('is_active', true)
      if (acctErr) throw new Error(`social_accounts (insights compte): ${acctErr.message}`)

      const today = new Date().toISOString().slice(0, 10)

      for (const acct of (acctRows ?? []) as AccountRow[]) {
        const snap = acct.platform === 'instagram'
          ? await fetchInstagramAccountSnapshot(acct)
          : await fetchFacebookAccountSnapshot(acct)

        if (snap.error) errors.push(`compte ${acct.platform}: ${snap.error}`)

        const { error: upsertErr } = await supabase.from('social_account_snapshots').upsert({
          account_id: acct.id,
          snapshot_date: today,
          followers: snap.followers,
          reach: snap.reach,
          views: null,
          non_follower_view_share: snap.non_follower_view_share,
          profile_views: snap.profile_views,
          raw: snap.raw,
        }, { onConflict: 'account_id,snapshot_date' })
        if (upsertErr) errors.push(`snapshot compte ${acct.platform}: ${upsertErr.message}`)

        if (snap.followers != null) {
          const { error: followErr } = await supabase.from('social_accounts')
            .update({ followers_count: snap.followers })
            .eq('id', acct.id)
          if (followErr) errors.push(`followers_count ${acct.platform}: ${followErr.message}`)
        }
      }
    } catch (e) {
      errors.push(`insights compte: ${e instanceof Error ? e.message : String(e)}`)
    }

```

Cette étape est indépendante de la boucle média Instagram existante (étapes 2-6, spécifiques au compte Instagram unique récupéré à l'étape 1) : elle relit tous les comptes actifs `instagram`/`facebook` par elle-même, donc elle continue de fonctionner même si l'étape 1 échoue.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/social-sync-meta/index.ts
git commit -m "social-sync-meta: ajoute les insights de compte Instagram + Facebook"
```

---

### Task 4: Déployer `social-sync-meta` et vérifier en conditions réelles

**Files:** aucun (déploiement + vérification uniquement).

**Interfaces:**
- Consumes: le code final de `supabase/functions/social-sync-meta/index.ts` (Tâches 2-3).

- [ ] **Step 1: Lire le fichier final et le déployer**

Lire `supabase/functions/social-sync-meta/index.ts` en entier, puis appeler `mcp__bacb9641-002b-4cbb-8dca-03fd7e27f0d0__deploy_edge_function` avec `project_id = cbqwrmyctsfdqmenczhm`, `name = social-sync-meta`, `verify_jwt = false` (la fonction avait déjà `verify_jwt` désactivé — cohérent avec la consigne du projet), `entrypoint_path = index.ts`, et le contenu du fichier.

- [ ] **Step 2: Déclencher un passage manuel et lire les logs**

```bash
curl -s -X POST 'https://cbqwrmyctsfdqmenczhm.supabase.co/functions/v1/social-sync-meta' \
  -H 'Content-Type: application/json' -d '{}'
```

Utiliser `mcp__bacb9641-002b-4cbb-8dca-03fd7e27f0d0__get_logs` (service `edge-function`) si la réponse contient des erreurs dans `errors[]` pour diagnostiquer (ex. métrique rejetée, permission manquante sur le token pour la Page Facebook).

- [ ] **Step 3: Vérifier en base**

```sql
SELECT sa.platform, sa.followers_count, s.snapshot_date, s.followers, s.reach, s.profile_views, s.non_follower_view_share
FROM social_accounts sa
LEFT JOIN social_account_snapshots s ON s.account_id = sa.id AND s.snapshot_date = CURRENT_DATE
WHERE sa.platform IN ('instagram','facebook');
```

Attendu : `followers_count` non NULL pour les deux lignes. Si Facebook échoue avec une erreur de permission Graph API sur le token, documenter cette erreur précise dans le rapport final (ce n'est pas un problème de code mais de scope du token Meta — hors scope de correction dans ce plan, mais à signaler).

- [ ] **Step 4: Commit**

Rien à committer (déploiement + vérification). Passer à la tâche suivante.

---

### Task 5: `useSocialPerformance` — charger `social_accounts` (followers_count)

**Files:**
- Modify: `src/hooks/useSocialPlanner.js:118-146` (`useSocialPerformance`)

**Interfaces:**
- Produces: `perf.analyticsAccounts` — tableau de `{ id, platform, followers_count }`, consommé par la Tâche 7 (cartes de comptes).

- [ ] **Step 1: Étendre le hook**

Dans `src/hooks/useSocialPlanner.js`, remplacer la fonction `useSocialPerformance` (lignes 118-146) par :

```javascript
export function useSocialPerformance() {
  const [publications, setPublications] = useState([])
  const [scores, setScores] = useState([])
  const [accountSnapshots, setAccountSnapshots] = useState([])
  const [analyticsAccounts, setAnalyticsAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    const [pubs, scr, snaps, accts] = await Promise.all([
      supabase.from('social_publications').select('*').order('published_at', { ascending: false }),
      supabase.from('social_post_scores').select('*'),
      supabase.from('social_account_snapshots').select('*').order('snapshot_date', { ascending: false }).limit(120),
      supabase.from('social_accounts').select('id, platform, followers_count'),
    ])
    const err = pubs.error ?? scr.error ?? snaps.error ?? accts.error
    if (err) setError(err.message)
    else {
      setError(null)
      setPublications(pubs.data ?? [])
      setScores(scr.data ?? [])
      setAccountSnapshots(snaps.data ?? [])
      setAnalyticsAccounts(accts.data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { refetch() }, [refetch])

  return { publications, scores, accountSnapshots, analyticsAccounts, loading, error, refetch }
}
```

- [ ] **Step 2: Vérifier avec le linter**

```bash
npx eslint src/hooks/useSocialPlanner.js
```
Attendu : aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSocialPlanner.js
git commit -m "useSocialPerformance: charge aussi social_accounts (followers_count)"
```

---

### Task 6: Filtre par plateforme sur le tableau scoré (Partie 1)

**Files:**
- Modify: `src/pages/ReseauxSociaux.jsx:1478-1652` (`PerformanceView`)

**Interfaces:**
- Consumes: `PLATFORM_META` (déjà défini, ligne 119-124), `perf.publications` (pour compter par plateforme), `accounts` (comptes GHL, prop déjà reçue par `PerformanceView`, pour le nom du compte entre parenthèses), `rows` (déjà calculé via `buildPerfRows`, ligne 1499-1502, chaque ligne a `r.platform`).
- Produces: un état local `platformTab` dans `PerformanceView`, et une liste `filteredRows` passée à `ScoredTable` à la place de `rows`.

- [ ] **Step 1: Ajouter la constante des onglets et l'état**

Dans `src/pages/ReseauxSociaux.jsx`, juste avant `function PerformanceView(...)` (ligne 1478), ajouter :

```javascript
const PLATFORM_TABS = ['instagram', 'facebook', 'tiktok']
```

Dans `PerformanceView`, après la ligne `const [detail, setDetail] = useState(null)` (ligne 1482), ajouter :

```javascript
  const [platformTab, setPlatformTab] = useState('tous')
```

- [ ] **Step 2: Filtrer les lignes et calculer les comptes par onglet**

Remplacer le bloc `rows` (lignes 1499-1502) par :

```javascript
  const rows = useMemo(
    () => buildPerfRows(perf.publications, perf.scores, posts),
    [perf.publications, perf.scores, posts],
  )

  const rowCountsByPlatform = useMemo(() => {
    const counts = {}
    for (const r of rows) counts[r.platform] = (counts[r.platform] ?? 0) + 1
    return counts
  }, [rows])

  const filteredRows = useMemo(
    () => (platformTab === 'tous' ? rows : rows.filter(r => r.platform === platformTab)),
    [rows, platformTab],
  )

  const accountNameByPlatform = useMemo(() => {
    const map = {}
    for (const a of accounts) if (!map[a.platform]) map[a.platform] = a.name
    return map
  }, [accounts])
```

- [ ] **Step 3: Ajouter la barre d'onglets au-dessus du tableau et brancher `filteredRows`**

Dans le JSX, juste avant le bloc `{/* Tableau scoré */}` (ligne 1627), ajouter :

```jsx
      {/* Filtre par plateforme */}
      <div className="flex items-center gap-1 bg-white rounded-xl border border-[#e5e7eb] p-1 w-fit">
        <button
          onClick={() => setPlatformTab('tous')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            platformTab === 'tous' ? 'bg-[#00bbb1] text-white' : 'text-[#6b7280] hover:text-[#1a1a1a]'
          }`}
        >
          Tous <span className="opacity-70">({rows.length})</span>
        </button>
        {PLATFORM_TABS.map(p => {
          const meta = PLATFORM_META[p] ?? { label: p }
          const accountName = accountNameByPlatform[p]
          return (
            <button
              key={p}
              onClick={() => setPlatformTab(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                platformTab === p ? 'bg-[#00bbb1] text-white' : 'text-[#6b7280] hover:text-[#1a1a1a]'
              }`}
            >
              {meta.label}{accountName ? ` (${accountName})` : ''} <span className="opacity-70">({rowCountsByPlatform[p] ?? 0})</span>
            </button>
          )
        })}
      </div>

```

Puis, dans le bloc `{/* Tableau scoré */}` existant, remplacer la ligne :

```javascript
          : <ScoredTable rows={rows} onRowClick={setDetail} />}
```

par :

```javascript
          : <ScoredTable rows={filteredRows} onRowClick={setDetail} />}
```

- [ ] **Step 4: Vérifier que `ScoredTable` gère déjà le cas vide**

Relire `ScoredTable` (`src/pages/ReseauxSociaux.jsx:1418-1476`) : la ligne 1469-1471 affiche déjà `Aucune publication mesurée pour l'instant.` quand `sorted` est vide. Aucun changement requis ici — l'onglet TikTok (0 publications) affichera ce message automatiquement, ce qui correspond à la demande (« Aucune publication synchronisée » — reformuler ce message précis n'est pas nécessaire, le message existant remplit déjà ce rôle et reste cohérent avec le reste de l'UI ; ne pas dupliquer un second message spécifique à TikTok).

- [ ] **Step 5: Test manuel dans le navigateur**

Lancer le serveur de dev (`preview_start` avec la config `.claude/launch.json`), naviguer vers `/reseaux-sociaux`, onglet Performances. Vérifier :
- L'onglet « Tous » affiche les 50 publications Instagram.
- L'onglet « Facebook » affiche 0 lignes et le message « Aucune publication mesurée pour l'instant. » sans planter.
- L'onglet « TikTok » affiche 0 lignes, même message, onglet toujours visible et cliquable.
- Le compte accolé à chaque label (`Instagram (neoperformance)`, etc.) correspond aux comptes réels retournés par `useSocialAccounts`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ReseauxSociaux.jsx
git commit -m "Ajoute le filtre par plateforme au tableau scoré de l'onglet Performance"
```

---

### Task 7: Cartes de comptes — abonnés réels + vélocité (Parties 2-3, branchement front)

**Files:**
- Modify: `src/pages/ReseauxSociaux.jsx:1478-1652` (`PerformanceView`)
- Modify: `src/pages/ReseauxSociaux.jsx:1-11` (imports — retirer `ghlGetStats` si plus utilisé ailleurs dans le fichier)

**Interfaces:**
- Consumes: `perf.analyticsAccounts` (Tâche 5), `accounts` (comptes GHL, pour avatar/nom/plateforme des cartes — inchangé), `PLATFORM_META`.

- [ ] **Step 1: Vérifier que `ghlGetStats` n'est utilisé nulle part ailleurs dans le fichier**

```bash
grep -n "ghlGetStats" "src/pages/ReseauxSociaux.jsx"
```
Si le seul usage est dans `PerformanceView` (ligne 1490), il pourra être retiré de l'import à l'étape finale.

- [ ] **Step 2: Remplacer le state et l'effet `ghlGetStats` par une lecture de `analyticsAccounts`**

Dans `PerformanceView`, supprimer les lignes suivantes (état + effet `ghlGetStats`, lignes 1479-1497) :

```javascript
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [detail, setDetail] = useState(null)

  const socialAccounts = useMemo(() => accounts.filter(a => a.platform !== 'google'), [accounts])

  useEffect(() => {
    if (!socialAccounts.length) return
    let cancelled = false
    setLoading(true)
    ghlGetStats(socialAccounts.map(a => a.profileId)).then(res => {
      if (cancelled) return
      if (!res.ok) setError(res.error)
      else setStats(res.data)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [socialAccounts])
```

Remplacer par :

```javascript
  const [detail, setDetail] = useState(null)
  const [platformTab, setPlatformTab] = useState('tous')

  const socialAccounts = useMemo(() => accounts.filter(a => a.platform !== 'google'), [accounts])

  const analyticsByPlatform = useMemo(() => {
    const map = {}
    for (const a of perf.analyticsAccounts) map[a.platform] = a
    return map
  }, [perf.analyticsAccounts])
```

(`platformTab` était déjà ajouté à la Tâche 6 — si les deux tâches sont exécutées dans l'ordre, ne pas le déclarer deux fois. Le bloc ci-dessus suppose que ce fichier est modifié une seule fois avec le résultat des Tâches 6 et 7 combinées.)

- [ ] **Step 3: Retirer `statsByAccount` (lignes 1533-1543) — plus utilisé**

Supprimer entièrement ce bloc :

```javascript
  const statsByAccount = useMemo(() => {
    if (!stats) return {}
    const results = stats.results ?? stats
    const map = {}
    if (Array.isArray(results)) {
      for (const r of results) map[r.profileId ?? r.accountId ?? r.id ?? r.platform] = r
    } else if (typeof results === 'object') {
      Object.assign(map, results)
    }
    return map
  }, [stats])
```

- [ ] **Step 4: Retirer le bloc d'erreur `error` (lignes 1553-1558) — c'était l'erreur GHL stats, qui n'existe plus**

Supprimer :

```jsx
      {error && (
        <Card className="p-4 border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-700">Statistiques indisponibles : {error}</p>
          <p className="text-xs text-amber-600 mt-1">La clé API GHL n'a peut-être pas le scope statistiques. Les comptes et la publication fonctionnent quand même.</p>
        </Card>
      )}
```

Garder le bloc `accountsError` juste au-dessus (c'est l'erreur de connexion GHL elle-même, toujours pertinente).

- [ ] **Step 5: Remplacer le contenu de chaque carte de compte (lignes 1560-1598)**

Remplacer le bloc `{/* Cartes par compte */}` par :

```jsx
      {/* Cartes par compte */}
      <div className="grid grid-cols-3 gap-4">
        {socialAccounts.map(a => {
          const meta = PLATFORM_META[a.platform] ?? { label: a.platform, color: '#9ca3af' }
          const analytics = analyticsByPlatform[a.platform]
          return (
            <Card key={a.id} className="p-5">
              <div className="flex items-center gap-3 mb-3">
                {a.avatar
                  ? <img src={a.avatar} alt={a.name} className="w-10 h-10 rounded-full object-cover border border-[#e5e7eb]" />
                  : <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: meta.color }}>{meta.label[0]}</div>}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#1a1a1a] truncate">{a.name}</p>
                  <p className="text-xs font-semibold" style={{ color: meta.color }}>{meta.label}</p>
                </div>
                <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" title="Connecté" />
              </div>
              {a.platform === 'tiktok' ? (
                <p className="text-xs text-[#9ca3af]">Pas encore connecté aux insights.</p>
              ) : analytics?.followers_count != null ? (
                <div className="bg-[#f9fafb] rounded-lg px-2.5 py-1.5 w-fit">
                  <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide">Abonnés</p>
                  <p className="text-sm font-black text-[#1a1a1a]">{analytics.followers_count.toLocaleString('fr-CA')}</p>
                </div>
              ) : (
                <p className="text-xs text-[#9ca3af]">En attente du premier sync.</p>
              )}
            </Card>
          )
        })}
        {!socialAccounts.length && !accountsError && (
          <Card className="p-5 col-span-3"><p className="text-sm text-[#9ca3af]">Chargement des comptes connectés…</p></Card>
        )}
      </div>
```

- [ ] **Step 6: Retirer l'import `ghlGetStats` s'il n'est plus utilisé ailleurs**

Si le `grep` de l'étape 1 confirme un usage unique, dans `src/pages/ReseauxSociaux.jsx:7-11`, retirer `ghlGetStats,` de la liste d'imports :

```javascript
import {
  useSocialPosts, useSocialIdeas, useSocialHooks, useSocialAccounts, useGhlPosts,
  useSocialPerformance, useSocialSnapshots,
  ghlCreatePost, ghlUpdatePost, ghlDeletePost, uploadSocialMedia,
} from '../hooks/useSocialPlanner'
```

- [ ] **Step 7: Vérifier avec le linter**

```bash
npx eslint src/pages/ReseauxSociaux.jsx
```
Attendu : aucune erreur (en particulier, pas de variable `stats`/`loading`/`error`/`statsByAccount` non utilisée résiduelle).

- [ ] **Step 8: Test manuel dans le navigateur (après un run du cron/sync de la Tâche 4)**

Recharger `/reseaux-sociaux`, onglet Performances. Vérifier :
- La carte Instagram affiche un nombre d'abonnés réel (pas « Chargement des stats… », qui n'existe plus).
- La carte Facebook affiche un nombre d'abonnés réel si la Tâche 4 a réussi pour Facebook, sinon « En attente du premier sync. » — jamais d'erreur JS ni de crash.
- La carte TikTok affiche « Pas encore connecté aux insights. »
- Le KPI « Vélocité d'abonnés · 7 j » (déjà câblé sur `perf.accountSnapshots`, code inchangé) affiche une valeur dès qu'il y a au moins deux relevés à 7 jours d'écart — sinon il continue d'afficher « Pas encore de relevé de compte. », comportement déjà correct.

- [ ] **Step 9: Commit**

```bash
git add src/pages/ReseauxSociaux.jsx
git commit -m "Remplace les cartes de comptes ghlGetStats par les abonnés réels (social_accounts)"
```

---

## Self-Review

**Couverture du spec :**
- Étape 0 (vérification préalable + rapport) → section « Constat préalable » + Tâche 4 Step 3.
- Partie 1 (onglets plateforme, filtre client-side, compte entre parenthèses, TikTok visible même vide) → Tâche 6.
- Partie 2 (extension `social-sync-meta`, pas nouvelle fonction, insights compte IG+FB, upsert `social_account_snapshots`, `followers_count` à jour) → Tâches 1-4.
- Partie 3 (cartes IG/FB avec abonnés réels, vélocité 7j depuis snapshots, TikTok neutre) → Tâches 5, 7.
- Vérification attendue (comptage par plateforme documenté, cartes IG/FB réelles après cron, TikTok neutre, filtre sans crash à 0 résultat) → couverte respectivement par la section « Constat préalable », Tâche 7 Step 8, Tâche 6 Step 5.

**Placeholders :** aucun — chaque étape de code contient le code réel à écrire, pas de "TODO"/"gérer les erreurs".

**Cohérence des types/noms :** `analyticsAccounts` (Tâche 5) → `perf.analyticsAccounts` (Tâche 7) → `analyticsByPlatform` (Tâche 7). `fetchNodeInsights` (Tâche 2) → utilisé par `fetchInstagramAccountSnapshot`/`fetchFacebookAccountSnapshot` (Tâche 3). `AccountRow` (Tâche 3) cohérent entre déclaration et usage dans la boucle `Deno.serve`.

**Risque connu à signaler à Hugues (pas un gap du plan, une inconnue externe) :** le token `META_ACCESS_TOKEN` existant a manifestement les droits sur le compte Instagram (déjà utilisé en production). Ses droits sur la Page Facebook (`page_impressions_unique`, `page_views_total`, `followers_count`) n'ont pas pu être vérifiés avant déploiement — GHL indique `hasStatisticsPermissions: true` côté GHL, ce qui n'implique pas que le token Meta *distinct* utilisé par `social-sync-meta` ait le même accès. La Tâche 4 est conçue pour révéler ce problème proprement (`last_sync_error` peuplé, pas de crash) plutôt que de le supposer résolu.
