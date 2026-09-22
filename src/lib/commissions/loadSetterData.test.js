// Le chemin complet des écrans (chargement paginé → moteur) doit redonner la
// photo de référence. Supabase est simulé avec les données figées de
// scripts/baseline/inputs.json, servies par pages de 1000 comme en vrai.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';
import { loadSetterCommissionData, clearSetterCommissionCache } from './loadSetterData.js';
import { computeSetterCommissions, PIPELINE_SETTING_ID } from './setterCommissions.js';

const BASELINE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../scripts/baseline');
const inputs = JSON.parse(readFileSync(join(BASELINE_DIR, 'inputs.json'), 'utf8'));
const periodFiles = readdirSync(BASELINE_DIR).filter(f => /^\d{4}-\d{2}-\d{2}_/.test(f)).sort();

function fakeSupabase() {
  const calls = { pipelines: 0, opportunities: 0, appointments: 0 };
  const table = {
    ghl_pipelines: () => [{ ghl_id: PIPELINE_SETTING_ID, stages: inputs.stages }],
    ghl_opportunities: () => inputs.opps.map(o => ({ ...o, pipeline_id: PIPELINE_SETTING_ID })),
    ghl_appointments: () => inputs.appts,
  };
  const client = {
    calls,
    from(name) {
      calls[name.replace('ghl_', '')]++;
      let rows = table[name]();
      const q = {
        select() { return q; },
        order() { return q; },
        eq(col, v) { rows = rows.filter(r => r[col] === v); return q; },
        in(col, vs) { rows = rows.filter(r => vs.includes(r[col])); return q; },
        single() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
        range(a, b) { return Promise.resolve({ data: rows.slice(a, b + 1), error: null }); },
      };
      return q;
    },
  };
  return client;
}

describe('chargement + moteur (chemin des écrans)', () => {
  beforeEach(() => clearSetterCommissionCache());

  it('lit toutes les pages', async () => {
    const d = await loadSetterCommissionData(fakeSupabase());
    expect(d.opps.length).toBe(inputs.opps.length);
    expect(d.appts.length).toBe(inputs.appts.length);
    expect(d.stages.length).toBe(inputs.stages.length);
  });

  it('partage une seule lecture entre écrans, sauf si on force', async () => {
    const sb = fakeSupabase();
    await Promise.all([loadSetterCommissionData(sb), loadSetterCommissionData(sb), loadSetterCommissionData(sb)]);
    expect(sb.calls.pipelines).toBe(1);
    await loadSetterCommissionData(sb, { force: true });
    expect(sb.calls.pipelines).toBe(2);
  });

  for (const file of periodFiles) {
    const baseline = JSON.parse(readFileSync(join(BASELINE_DIR, file), 'utf8'));
    const { debut, fin } = baseline.periode;
    it(`${debut} → ${fin} : ${baseline.total_periode} $, setter par setter`, async () => {
      const d = await loadSetterCommissionData(fakeSupabase());
      for (const e of baseline.setters) {
        const r = computeSetterCommissions({ ...d, setterName: e.setter, start: debut, end: fin });
        expect([e.setter, r.totalPay]).toEqual([e.setter, e.total]);
      }
    });
  }
});
