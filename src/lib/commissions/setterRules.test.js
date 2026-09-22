// Cas unitaires des règles de paie setters (deux pipelines, bascule C).
import { describe, it, expect } from 'vitest';
import {
  computeSetterCommissions, computeSetterAnomalies, DEFAULT_CONFIG,
  FIELD_SETTER_NOM, FIELD_TYPE_BOOKING, FIELD_DATE_CLOSE,
} from './setterCommissions.js';
import { PIPELINE_SETTING_LEGACY as LEGACY, PIPELINE_SETTING_NOUVEAU as NOUVEAU, SETTER_PIPELINES } from './config.js';

const S = Object.fromEntries(SETTER_PIPELINES.map(p => [p.role, p.stages]));
const STAGES = [
  { id: 'L-book', name: '✅ Lead rencontre book' },
  { id: 'L-show', name: '📆  Show-up Confirmé.' },
  { id: 'L-bonus', name: '💰 bonus vente' },
  { id: 'L-rebook', name: '🥇 rebooking confirmé' },
  { id: S.nouveau.booked, name: '✅ Lead rencontre book' },
  { id: S.nouveau.showup, name: '📆 Show-up Confirmé.' },
  { id: S.nouveau.bonus, name: '💰 bonus vente' },
];
const CFG = { ...DEFAULT_CONFIG, basculeDate: '2026-09-22', testContactIds: ['TEST'] };

let seq = 0;
function card({ pipeline = LEGACY, stage, setter = 'Maude NEO', type = 'Manuel', contact, created, close, stageName }) {
  seq++;
  const customFields = [];
  if (setter != null) customFields.push({ id: FIELD_SETTER_NOM, fieldValueString: setter });
  if (type != null) customFields.push({ id: FIELD_TYPE_BOOKING, fieldValueString: type });
  if (close != null) customFields.push({ id: FIELD_DATE_CLOSE, fieldValueNumber: close });
  return {
    id: seq, ghl_id: `opp${seq}`, pipeline_id: pipeline, pipeline_stage_id: stage, stage_name: stageName ?? '',
    contact_id: contact ?? `c${seq}`, contact_name: `Contact ${seq}`, created_at_ghl: created, raw: { customFields },
  };
}
const rdv = (contact, iso, status = 'showed') => ({ contact_id: contact, start_time: iso, calendar_id: 'DIN6EPtG7eNU3Gf6ZRoC', status });
const run = (opps, appts, start, end, setterName = 'Maude NEO', config = CFG) =>
  computeSetterCommissions({ opps, appts, stages: STAGES, setterName, start, end, config });
const anomalies = (opps, appts, start, end, config = CFG) =>
  computeSetterAnomalies({ opps, appts, stages: STAGES, start, end, config }).map(a => a.code);
const utcMidnight = day => Date.parse(`${day}T00:00:00Z`);

describe('montants par type (nouveau pipeline, après C)', () => {
  for (const [type, montant] of [['Manuel', 40], ['Automatique', 20], ['Rebooking', 20]]) {
    it(`${type} = ${montant} $`, () => {
      const o = card({ pipeline: NOUVEAU, stage: S.nouveau.showup, type, created: '2026-09-22T12:00:00Z' });
      const r = run([o], [rdv(o.contact_id, '2026-09-24T14:00:00Z')], '2026-09-13', '2026-09-26');
      expect(r.totalPay).toBe(montant);
    });
  }

  it('type « aucun » = 0 $ et anomalie', () => {
    const o = card({ pipeline: NOUVEAU, stage: S.nouveau.showup, type: 'aucun', created: '2026-09-22T12:00:00Z' });
    const appts = [rdv(o.contact_id, '2026-09-24T14:00:00Z')];
    expect(run([o], appts, '2026-09-13', '2026-09-26').totalPay).toBe(0);
    expect(anomalies([o], appts, '2026-09-13', '2026-09-26')).toContain('type_inconnu');
  });

  it('type vide = 0 $ et anomalie', () => {
    const o = card({ pipeline: NOUVEAU, stage: S.nouveau.showup, type: null, created: '2026-09-22T12:00:00Z' });
    const appts = [rdv(o.contact_id, '2026-09-24T14:00:00Z')];
    expect(run([o], appts, '2026-09-13', '2026-09-26').totalPay).toBe(0);
    expect(anomalies([o], appts, '2026-09-13', '2026-09-26')).toContain('type_inconnu');
  });
});

describe('bonus vente', () => {
  it('bonus seul dans la période (show-up dans une période précédente)', () => {
    const o = card({ stage: 'L-bonus', stageName: '💰 bonus vente', created: '2026-08-01T12:00:00Z', close: utcMidnight('2026-08-20') });
    const appts = [rdv(o.contact_id, '2026-08-05T14:00:00Z')];
    const r = run([o], appts, '2026-08-16', '2026-08-29');
    expect([r.totalShowups, r.totalBonus]).toEqual([0, 10]);
  });

  it('show-up avant C, vente fermée après C sur le nouveau pipeline : bonus payé une fois', () => {
    const contact = 'cX';
    const legacy = card({ contact, stage: 'L-show', stageName: '📆  Show-up Confirmé.', created: '2026-09-10T12:00:00Z' });
    const neuf = card({ contact, pipeline: NOUVEAU, stage: S.nouveau.bonus, created: '2026-09-10T12:05:00Z', close: utcMidnight('2026-09-24') });
    const appts = [rdv(contact, '2026-09-18T14:00:00Z')];
    const r = run([legacy, neuf], appts, '2026-09-13', '2026-09-26');
    // Show-up du 18 sept. payé par l'ancien (40 $), bonus 10 $ par la carte neuve, show-up neuf non payé (RDV avant C)
    expect([r.totalShowups, r.totalBonus]).toEqual([40, 10]);
  });

  it('deux cartes en bonus vente, même contact et même jour de close : un seul bonus', () => {
    const contact = 'cB';
    const a = card({ contact, stage: 'L-bonus', stageName: '💰 bonus vente', created: '2026-09-01T12:00:00Z', close: utcMidnight('2026-09-24') });
    const b = card({ contact, pipeline: NOUVEAU, stage: S.nouveau.bonus, created: '2026-09-02T12:00:00Z', close: utcMidnight('2026-09-24') });
    const r = run([a, b], [], '2026-09-13', '2026-09-26');
    expect(r.totalBonus).toBe(10);
    expect(anomalies([a, b], [], '2026-09-13', '2026-09-26')).toContain('doublon_contact_close');
  });
});

describe('bascule C', () => {
  it('carte legacy avec RDV avant C : payée', () => {
    const o = card({ stage: 'L-show', stageName: '📆  Show-up Confirmé.', created: '2026-09-10T12:00:00Z' });
    expect(run([o], [rdv(o.contact_id, '2026-09-21T14:00:00Z')], '2026-09-13', '2026-09-26').totalPay).toBe(40);
  });

  it('carte legacy avec RDV après C : 0 $ et anomalie', () => {
    const o = card({ stage: 'L-show', stageName: '📆  Show-up Confirmé.', created: '2026-09-10T12:00:00Z' });
    const appts = [rdv(o.contact_id, '2026-09-23T14:00:00Z')];
    expect(run([o], appts, '2026-09-13', '2026-09-26').totalPay).toBe(0);
    expect(anomalies([o], appts, '2026-09-13', '2026-09-26')).toContain('legacy_rdv_apres_bascule');
  });

  it('carte neuve avec RDV avant C : 0 $ (c\'est l\'ancien pipeline qui paie)', () => {
    const o = card({ pipeline: NOUVEAU, stage: S.nouveau.showup, created: '2026-09-18T12:00:00Z' });
    expect(run([o], [rdv(o.contact_id, '2026-09-21T14:00:00Z')], '2026-09-13', '2026-09-26').totalPay).toBe(0);
  });

  it('RDV à minuit pile le jour de C : nouveau pipeline', () => {
    const contact = 'cM';
    const legacy = card({ contact, stage: 'L-show', stageName: '📆  Show-up Confirmé.', created: '2026-09-10T12:00:00Z' });
    const neuf = card({ contact, pipeline: NOUVEAU, stage: S.nouveau.showup, type: 'Automatique', created: '2026-09-10T12:05:00Z' });
    const r = run([legacy, neuf], [rdv(contact, '2026-09-22T04:00:00Z')], '2026-09-13', '2026-09-26');
    expect(r.totalPay).toBe(20);
  });

  it('même contact, carte legacy et carte neuve sur le même RDV après C : payé une seule fois', () => {
    const contact = 'cD';
    const legacy = card({ contact, stage: 'L-show', stageName: '📆  Show-up Confirmé.', created: '2026-09-22T11:00:00Z' });
    const neuf = card({ contact, pipeline: NOUVEAU, stage: S.nouveau.showup, created: '2026-09-22T11:00:00Z' });
    const r = run([legacy, neuf], [rdv(contact, '2026-09-24T14:00:00Z')], '2026-09-13', '2026-09-26');
    expect(r.totalPay).toBe(40);
  });
});

describe('RDV du nouveau pipeline : règle du cycle', () => {
  it('deux cycles du même contact : chaque carte prend le RDV de son cycle', () => {
    const contact = 'cC';
    const c1 = card({ contact, pipeline: NOUVEAU, stage: S.nouveau.showup, created: '2026-09-22T12:00:00Z' });
    const c2 = card({ contact, pipeline: NOUVEAU, stage: S.nouveau.showup, type: 'Rebooking', created: '2026-10-01T12:00:00Z' });
    const appts = [rdv(contact, '2026-09-24T14:00:00Z'), rdv(contact, '2026-10-05T14:00:00Z')];
    expect(run([c1, c2], appts, '2026-09-13', '2026-09-26').totalPay).toBe(40); // cycle 1 seulement
    expect(run([c1, c2], appts, '2026-09-27', '2026-10-10').totalPay).toBe(20); // cycle 2 seulement
  });

  it('RDV annulé puis RDV « showed » dans le cycle : on prend le showed', () => {
    const o = card({ pipeline: NOUVEAU, stage: S.nouveau.showup, created: '2026-09-22T12:00:00Z' });
    const appts = [rdv(o.contact_id, '2026-09-23T14:00:00Z', 'cancelled'), rdv(o.contact_id, '2026-09-29T14:00:00Z', 'showed')];
    expect(run([o], appts, '2026-09-13', '2026-09-26').totalPay).toBe(0);
    expect(run([o], appts, '2026-09-27', '2026-10-10').totalPay).toBe(40);
  });

  it('aucun showed : premier RDV non annulé, payé et signalé', () => {
    const o = card({ pipeline: NOUVEAU, stage: S.nouveau.showup, created: '2026-09-22T12:00:00Z' });
    const appts = [rdv(o.contact_id, '2026-09-23T14:00:00Z', 'cancelled'), rdv(o.contact_id, '2026-09-24T14:00:00Z', 'confirmed')];
    expect(run([o], appts, '2026-09-13', '2026-09-26').totalPay).toBe(40);
    expect(anomalies([o], appts, '2026-09-13', '2026-09-26')).toContain('rdv_pas_showed');
  });

  it('option « bloquer » : RDV pas showed non payé', () => {
    const o = card({ pipeline: NOUVEAU, stage: S.nouveau.showup, created: '2026-09-22T12:00:00Z' });
    const appts = [rdv(o.contact_id, '2026-09-24T14:00:00Z', 'noshow')];
    expect(run([o], appts, '2026-09-13', '2026-09-26', 'Maude NEO', { ...CFG, rdvNonShowed: 'bloquer' }).totalPay).toBe(0);
  });

  it('show-up sans RDV au calendrier : anomalie', () => {
    const o = card({ pipeline: NOUVEAU, stage: S.nouveau.showup, created: '2026-09-22T12:00:00Z' });
    expect(run([o], [], '2026-09-13', '2026-09-26').totalPay).toBe(0);
  });
});

describe('contacts et étapes', () => {
  it('contact test : exclu et signalé', () => {
    const o = card({ pipeline: NOUVEAU, stage: S.nouveau.showup, contact: 'TEST', created: '2026-09-22T12:00:00Z' });
    const appts = [rdv('TEST', '2026-09-24T14:00:00Z')];
    expect(run([o], appts, '2026-09-13', '2026-09-26').totalPay).toBe(0);
    expect(anomalies([o], appts, '2026-09-13', '2026-09-26')).toContain('contact_test');
  });

  it('carte payable sans setter : signalée', () => {
    const o = card({ pipeline: NOUVEAU, stage: S.nouveau.showup, setter: null, created: '2026-09-22T12:00:00Z' });
    expect(anomalies([o], [rdv(o.contact_id, '2026-09-24T14:00:00Z')], '2026-09-13', '2026-09-26')).toContain('sans_setter');
  });

  it('nouveau pipeline : étape renommée, toujours payée (reconnue par ID)', () => {
    const o = card({ pipeline: NOUVEAU, stage: S.nouveau.showup, created: '2026-09-22T12:00:00Z' });
    const renamed = STAGES.map(s => s.id === S.nouveau.showup ? { ...s, name: 'Présence confirmée' } : s);
    const r = computeSetterCommissions({ opps: [o], appts: [rdv(o.contact_id, '2026-09-24T14:00:00Z')], stages: renamed,
      setterName: 'Maude NEO', start: '2026-09-13', end: '2026-09-26', config: CFG });
    expect(r.totalPay).toBe(40);
  });

  it('legacy « 🥇 rebooking confirmé » = 0 $', () => {
    const o = card({ stage: 'L-rebook', stageName: '🥇 rebooking confirmé', type: 'Rebooking', created: '2026-09-01T12:00:00Z' });
    expect(run([o], [rdv(o.contact_id, '2026-09-18T14:00:00Z')], '2026-09-13', '2026-09-26').totalPay).toBe(0);
  });
});

describe('date de close enregistrée à minuit UTC', () => {
  it('à partir de C : lue comme date de calendrier (24 sept. reste le 24 sept.)', () => {
    const o = card({ pipeline: NOUVEAU, stage: S.nouveau.bonus, created: '2026-09-22T12:00:00Z', close: utcMidnight('2026-09-27') });
    // Le 27 sept. à minuit UTC = 26 sept. 20 h à Montréal : il doit tomber dans la période du 27 sept.
    expect(run([o], [], '2026-09-13', '2026-09-26').totalBonus).toBe(0);
    expect(run([o], [], '2026-09-27', '2026-10-10').totalBonus).toBe(10);
  });

  it('avant C : lecture historique conservée (périodes déjà payées)', () => {
    const o = card({ stage: 'L-bonus', stageName: '💰 bonus vente', created: '2026-08-01T12:00:00Z', close: utcMidnight('2026-08-16') });
    // Historique : 16 août minuit UTC = 15 août 20 h à Montréal → période du 2 au 15 août
    expect(run([o], [], '2026-08-02', '2026-08-15').totalBonus).toBe(10);
    expect(run([o], [], '2026-08-16', '2026-08-29').totalBonus).toBe(0);
  });
});
