// Chargement des données brutes du moteur de commissions setters.
// Une seule lecture Supabase partagée par tous les écrans (cache de 60 s) :
// le classement du Dashboard, SetterAdmin, « Ma Paie » et le rapport d'anomalies
// ne relisent plus chacun les ~4 000 cartes des pipelines setters.
import { SETTER_PIPELINE_IDS, CONSULTATION_CALENDAR_IDS } from './setterCommissions.js';

const BATCH = 1000;
const TTL_MS = 60_000;
let cache = null; // { at, promise }

async function fetchAll(buildQuery) {
  let rows = [];
  for (let offset = 0; ; offset += BATCH) {
    const { data, error } = await buildQuery().range(offset, offset + BATCH - 1);
    if (error) throw error;
    rows = rows.concat(data ?? []);
    if ((data?.length ?? 0) < BATCH) return rows;
  }
}

async function fetchSetterData(supabase) {
  // Les deux pipelines setters (ancien Setting + nouveau pipeline setting)
  const [pipelineRes, opps, appts] = await Promise.all([
    supabase.from('ghl_pipelines').select('ghl_id, stages').in('ghl_id', SETTER_PIPELINE_IDS),
    fetchAll(() => supabase
      .from('ghl_opportunities')
      .select('*')
      .in('pipeline_id', SETTER_PIPELINE_IDS)
      .order('id')),
    fetchAll(() => supabase
      .from('ghl_appointments')
      .select('contact_id, start_time, calendar_id, status')
      .in('calendar_id', CONSULTATION_CALENDAR_IDS)
      .order('id')),
  ]);
  if (pipelineRes.error) throw pipelineRes.error;
  // Les IDs d'étape sont uniques d'un pipeline à l'autre : une seule liste suffit.
  const stages = (pipelineRes.data ?? []).flatMap(p => p.stages ?? []);
  return { stages, opps, appts };
}

// force = true : ignore le cache (bouton « Actualiser »)
export function loadSetterCommissionData(supabase, { force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.promise;
  const promise = fetchSetterData(supabase);
  const entry = { at: Date.now(), promise };
  cache = entry;
  promise.catch(() => { if (cache === entry) cache = null; });
  return promise;
}

export function clearSetterCommissionCache() { cache = null; }
