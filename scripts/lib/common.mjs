// Outils partagés par les scripts d'audit (lecture seule).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

export const LOCATION_ID = 'YG2spvWJqnD75L3V95UJ';
export const GHL_BASE = 'https://services.leadconnectorhq.com';
export const GHL_VERSION = '2021-07-28';

// Charge le premier .env trouvé en remontant depuis le dossier courant
// (un worktree vit sous .claude/worktrees/ du dépôt principal, qui a le .env).
// Les variables déjà définies dans l'environnement ont priorité.
export function loadEnv() {
  let dir = resolve(process.cwd());
  const file = process.env.ENV_FILE;
  let path = file && existsSync(file) ? file : null;
  while (!path) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) { path = candidate; break; }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (path) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, '');
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  }
  return path;
}

export function supabaseClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY introuvables (.env ou environnement).');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Lit une requête Supabase page par page (1000 lignes max par appel).
export async function fetchAll(buildQuery, batch = 1000) {
  let rows = [];
  for (let offset = 0; ; offset += batch) {
    const { data, error } = await buildQuery().range(offset, offset + batch - 1);
    if (error) throw error;
    rows = rows.concat(data ?? []);
    if ((data?.length ?? 0) < batch) return rows;
  }
}

// Source de vérité unique : le moteur de l'app.
export { getField, parseGHLDate } from '../../src/lib/commissions/setterCommissions.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Client GHL en GET uniquement, limité en débit.
// Limite GHL : 100 requêtes / 10 s par location. On vise ~5 req/s,
// on ralentit quand X-RateLimit-Remaining baisse, et on réessaie sur 429 / 5xx.
export function ghlClient(apiKey, { minIntervalMs = 200 } = {}) {
  if (!apiKey) throw new Error('GHL_API_KEY manquante (jeton Private Integration de la location).');
  let last = 0;
  let requests = 0;
  async function get(path) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const wait = last + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      requests++;
      const res = await fetch(`${GHL_BASE}${path}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}`, Version: GHL_VERSION, Accept: 'application/json' },
      });
      const remaining = Number(res.headers.get('x-ratelimit-remaining'));
      if (!isNaN(remaining) && remaining < 10) await sleep(2000);
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep((retryAfter > 0 ? retryAfter * 1000 : 2000) * (attempt + 1));
        continue;
      }
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    }
    throw new Error(`GHL ${path} : échec après 6 tentatives`);
  }
  return { get, count: () => requests };
}
