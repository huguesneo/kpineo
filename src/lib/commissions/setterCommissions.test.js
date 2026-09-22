// Non-régression : le moteur doit redonner EXACTEMENT la photo de référence
// (scripts/baseline/), validée contre les paies réellement versées.
// Tolérance : 0 $, ligne par ligne et par setter.
//
// Les fichiers de scripts/baseline/ contiennent des noms de clients et ne sont
// pas versionnés : les générer avec scripts/baseline-commissions.mjs.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { computeSetterCommissions, zonedDate } from './setterCommissions.js';

const BASELINE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../scripts/baseline');

if (!existsSync(join(BASELINE_DIR, 'inputs.json'))) {
  throw new Error(`Photo de référence absente (${BASELINE_DIR}). Lancer scripts/baseline-commissions.mjs.`);
}

const inputs = JSON.parse(readFileSync(join(BASELINE_DIR, 'inputs.json'), 'utf8'));
const periodFiles = readdirSync(BASELINE_DIR).filter(f => /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();

// Champs comparés pour chaque ligne (la colonne « fantôme » vient de l'audit, pas du moteur)
const lineKey = l => ({
  opportunite: l.opportunite,
  contact: l.contact,
  etape: l.etape,
  type_booking: l.type_booking,
  date_rdv_retenu: l.date_rdv_retenu,
  source_date_rdv: l.source_date_rdv,
  date_de_close: l.date_de_close,
  montant_showup: l.montant_showup,
  bonus: l.bonus,
  total: l.total,
});
const byOpp = (a, b) => a.opportunite.localeCompare(b.opportunite);

describe('photo de référence', () => {
  it('contient au moins une période', () => {
    expect(periodFiles.length).toBeGreaterThan(0);
  });

  for (const file of periodFiles) {
    const baseline = JSON.parse(readFileSync(join(BASELINE_DIR, file), 'utf8'));
    const { debut, fin } = baseline.periode;

    describe(`${debut} → ${fin}`, () => {
      for (const expected of baseline.setters) {
        it(`${expected.setter} : ${expected.total} $`, () => {
          const r = computeSetterCommissions({
            opps: inputs.opps, appts: inputs.appts, stages: inputs.stages,
            setterName: expected.setter, start: debut, end: fin,
          });

          expect(r.totalPay).toBe(expected.total);
          expect({
            manuelCount: r.manuelCount, autoCount: r.autoCount, rebookingCount: r.rebookingCount,
            showupCount: r.showupCount, wonCount: r.wonCount,
            commissionManuel: r.commissionManuel, commissionAuto: r.commissionAuto,
            commissionRebook: r.commissionRebook, totalBonus: r.totalBonus,
            totalShowups: r.totalShowups, totalPay: r.totalPay,
          }).toEqual(expected.compteurs_app);
          expect(r.lignes.map(lineKey).sort(byOpp)).toEqual(expected.lignes.map(lineKey).sort(byOpp));
          expect(r.lignesShowupZero.map(lineKey).sort(byOpp))
            .toEqual((expected.lignes_showup_a_zero ?? []).map(lineKey).sort(byOpp));
        });
      }

      it(`total de la période : ${baseline.total_periode} $`, () => {
        const total = baseline.setters.reduce((s, e) => s + computeSetterCommissions({
          opps: inputs.opps, appts: inputs.appts, stages: inputs.stages,
          setterName: e.setter, start: debut, end: fin,
        }).totalPay, 0);
        expect(total).toBe(baseline.total_periode);
      });
    });
  }
});

describe('bornes de période sur America/Toronto', () => {
  it('heure avancée (EDT, UTC-4)', () => {
    expect(zonedDate('2026-08-16').toISOString()).toBe('2026-08-16T04:00:00.000Z');
    expect(zonedDate('2026-08-29', '23:59:59').toISOString()).toBe('2026-08-30T03:59:59.000Z');
  });
  it('heure normale (EST, UTC-5)', () => {
    expect(zonedDate('2026-12-01').toISOString()).toBe('2026-12-01T05:00:00.000Z');
  });
  it('jour du passage à l\'heure normale (1er nov. 2026)', () => {
    expect(zonedDate('2026-11-01').toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(zonedDate('2026-11-01', '23:59:59').toISOString()).toBe('2026-11-02T04:59:59.000Z');
  });
});
