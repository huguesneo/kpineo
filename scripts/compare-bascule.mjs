#!/usr/bin/env node
// Étape 9 : compare l'ancien calcul (moteur figé avant la bascule, pipeline
// Setting seul) et le nouveau (deux pipelines, date C), sur les données
// Supabase du moment, ligne par ligne. LECTURE SEULE.
//
// Usage : node scripts/compare-bascule.mjs 2026-09-13:2026-09-26 [autres périodes]
import { loadEnv, supabaseClient } from './lib/common.mjs';
import { computeSetterCommissions as ancien } from './lib/moteur-avant-bascule.mjs';
import { computeSetterCommissions as nouveau, computeSetterAnomalies, PIPELINE_SETTING_ID } from '../src/lib/commissions/setterCommissions.js';
import { loadSetterCommissionData } from '../src/lib/commissions/loadSetterData.js';

const periods = process.argv.slice(2).map(a => { const [s, e] = a.split(':'); return { s, e }; });
if (!periods.length) { console.error('Ex. : node scripts/compare-bascule.mjs 2026-09-13:2026-09-26'); process.exit(1); }

loadEnv();
const supabase = supabaseClient();
const data = await loadSetterCommissionData(supabase, { force: true });
const legacyOnly = { ...data, opps: data.opps.filter(o => o.pipeline_id === PIPELINE_SETTING_ID) };

const { data: profiles } = await supabase.from('profiles').select('full_name, role, secondary_roles').eq('is_active', true);
const setters = profiles.filter(p => p.role === 'setter' || (p.secondary_roles ?? []).includes('setter')).map(p => p.full_name).sort();
console.log(`${data.opps.length} cartes (${legacyOnly.opps.length} ancien pipeline), ${data.appts.length} RDV, ${setters.length} setters.`);

const key = l => l.opportunite;
const fmt = l => `${l.contact} · ${l.etape} · ${l.type_booking ?? '—'} · RDV ${l.date_rdv_retenu?.slice(0, 16) ?? '—'} · ${l.montant_showup}+${l.bonus} $`;

for (const { s, e } of periods) {
  console.log(`\n══ ${s} → ${e} ══`);
  const rows = [];
  for (const name of setters) {
    const a = ancien({ ...legacyOnly, setterName: name, start: s, end: e });
    const n = nouveau({ ...data, setterName: name, start: s, end: e });
    if (!a.totalPay && !n.totalPay) continue;
    rows.push({ setter: name, ancien: a.totalPay, nouveau: n.totalPay, ecart: n.totalPay - a.totalPay });
    const A = new Map(a.lignes.map(l => [key(l), l]));
    const N = new Map(n.lignes.map(l => [key(l), l]));
    for (const [k, l] of A) {
      const m = N.get(k);
      if (!m) console.log(`  ${name} − retirée : ${fmt(l)}  [${n.lignesShowupZero.find(z => z.opportunite === k)?.anomalies?.join(', ') ?? 'voir anomalies'}]`);
      else if (m.total !== l.total) console.log(`  ${name} ≠ changée  : ${fmt(l)}  →  ${m.montant_showup}+${m.bonus} $`);
    }
    for (const [k, l] of N) if (!A.has(k)) console.log(`  ${name} + ajoutée : ${fmt(l)} (${l.pipeline})`);
  }
  console.table(rows);
  const anomalies = computeSetterAnomalies({ ...data, start: s, end: e });
  const byCode = anomalies.reduce((acc, x) => ({ ...acc, [x.libelle]: (acc[x.libelle] ?? 0) + 1 }), {});
  console.log('Anomalies :', Object.keys(byCode).length ? byCode : 'aucune');
}
