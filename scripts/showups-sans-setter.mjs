#!/usr/bin/env node
// Show-ups du NOUVEAU pipeline setting (KkPiFjw0ztAXc7z6Ab9c) auxquels il
// manque setter__nom ou le type de booking : ces cartes ne paient rien.
// À relancer quand on veut. LECTURE SEULE.
//
// Usage :
//   node scripts/showups-sans-setter.mjs                 # depuis la bascule
//   node scripts/showups-sans-setter.mjs 2026-09-22      # depuis une date
//   node scripts/showups-sans-setter.mjs 2026-09-22 2026-10-05
//   node scripts/showups-sans-setter.mjs --json          # sortie JSON
//
// « Show-up » = carte à l'étape Show-up Confirmé ou bonus vente du nouveau
// pipeline, datée par son RDV (ou, à défaut, par sa création).

import { loadEnv, supabaseClient, fetchAll, getField } from './lib/common.mjs';
import {
  CONSULTATION_CALENDAR_IDS, FIELD_SETTER_NOM, FIELD_TYPE_BOOKING,
  FLAT_MANUEL, FLAT_CONFIRM, FLAT_REBOOK, zonedDay,
} from '../src/lib/commissions/setterCommissions.js';
import { BASCULE_DATE, PIPELINE_SETTING_NOUVEAU, SETTER_PIPELINES, TEST_CONTACT_IDS } from '../src/lib/commissions/config.js';

const STAGES = SETTER_PIPELINES.find(p => p.id === PIPELINE_SETTING_NOUVEAU).stages;
const MONTANTS = { manuel: FLAT_MANUEL, automatique: FLAT_CONFIRM, rebooking: FLAT_REBOOK };

const args = process.argv.slice(2);
const json = args.includes('--json');
const [debut = BASCULE_DATE, fin = '9999-12-31'] = args.filter(a => !a.startsWith('--'));

loadEnv();
const supabase = supabaseClient();

const opps = await fetchAll(() => supabase
  .from('ghl_opportunities')
  .select('ghl_id, contact_id, contact_name, pipeline_stage_id, stage_name, created_at_ghl')
  .eq('pipeline_id', PIPELINE_SETTING_NOUVEAU)
  .order('id'));

const appts = await fetchAll(() => supabase
  .from('ghl_appointments')
  .select('contact_id, start_time, status')
  .in('calendar_id', CONSULTATION_CALENDAR_IDS)
  .order('id'));

// Les champs vivent dans raw : deuxième lecture ciblée pour ne pas tout charger
const raws = await fetchAll(() => supabase
  .from('ghl_opportunities')
  .select('ghl_id, raw')
  .eq('pipeline_id', PIPELINE_SETTING_NOUVEAU)
  .order('id'));
const rawById = Object.fromEntries(raws.map(r => [r.ghl_id, r.raw]));

const apptsByContact = {};
for (const a of appts) {
  if (!a.contact_id || !a.start_time) continue;
  (apptsByContact[a.contact_id] ??= []).push(a);
}

const test = new Set(TEST_CONTACT_IDS);
const lignes = [];

for (const o of opps) {
  const estShowup = o.pipeline_stage_id === STAGES.showup || o.pipeline_stage_id === STAGES.bonus;
  if (!estShowup || test.has(o.contact_id)) continue;

  const raw = rawById[o.ghl_id];
  const setter = String(getField(raw, FIELD_SETTER_NOM) ?? '').trim();
  const type = String(getField(raw, FIELD_TYPE_BOOKING) ?? '').trim();
  const typeConnu = type.toLowerCase() in MONTANTS;
  if (setter && typeConnu) continue;

  // RDV du cycle : le premier après la création de la carte ; à défaut
  // (RDV pris avant la carte), le plus récent du contact.
  const tous = [...(apptsByContact[o.contact_id] ?? [])].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  const rdv = tous.find(a => new Date(a.start_time) >= new Date(o.created_at_ghl ?? 0)) ?? tous[tous.length - 1] ?? null;

  const jour = zonedDay(new Date(rdv?.start_time ?? o.created_at_ghl));
  if (!jour || jour < debut || jour > fin) continue;

  lignes.push({
    opportunite: o.ghl_id,
    contact: o.contact_name,
    contact_id: o.contact_id,
    etape: o.stage_name,
    jour,
    rdv: rdv?.start_time ?? null,
    statut_rdv: rdv?.status ?? null,
    setter: setter || null,
    type_booking: type || null,
    manque: [!setter && 'setter__nom', !typeConnu && 'type de booking'].filter(Boolean).join(' + '),
    montant_perdu: typeConnu ? MONTANTS[type.toLowerCase()] : 0,
  });
}

lignes.sort((a, b) => a.jour.localeCompare(b.jour));

if (json) {
  console.log(JSON.stringify({ debut, fin, genere_le: new Date().toISOString(), lignes }, null, 2));
} else if (lignes.length === 0) {
  console.log(`Aucun show-up incomplet dans le nouveau pipeline depuis le ${debut}.`);
} else {
  console.log(`${lignes.length} show-up(s) du nouveau pipeline sans setter ou sans type, depuis le ${debut} :\n`);
  console.table(lignes.map(l => ({
    jour: l.jour, contact: l.contact, étape: l.etape, 'statut RDV': l.statut_rdv ?? '—',
    setter: l.setter ?? '—', type: l.type_booking ?? '—', manque: l.manque,
    'perdu si type connu': l.montant_perdu ? `${l.montant_perdu} $` : '—',
  })));
  console.log('\nCes cartes ne paient rien tant que les deux champs ne sont pas remplis.');
}
