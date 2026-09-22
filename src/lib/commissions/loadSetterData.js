// Chargement des données brutes du moteur de commissions setters.
// Une seule lecture Supabase partagée par tous les écrans (cache de 60 s) :
// le classement du Dashboard, SetterAdmin et « Ma Paie » ne relisent plus
// chacun les ~4 000 cartes du pipeline Setting.
import { PIPELINE_SETTING_ID, CONSULTATION_CALENDAR_IDS } from './setterCommissions.js';

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
  const [pipelineRes, opps, appts] = await Promise.all([
    supabase.from('ghl_pipelines').select('stages').eq('ghl_id', PIPELINE_SETTING_ID).single(),
    fetchAll(() => supabase
      .from('ghl_opportunities')
      .select('*')
      .eq('pipeline_id', PIPELINE_SETTING_ID)
      .order('id')),
    fetchAll(() => supabase
      .from('ghl_appointments')
      .select('contact_id, start_time, calendar_id')
      .in('calendar_id', CONSULTATION_CALENDAR_IDS)
      .order('id')),
  ]);
  if (pipelineRes.error) throw pipelineRes.error;
  return { stages: pipelineRes.data?.stages ?? [], opps, appts };
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
