#!/usr/bin/env node
// Compare les calculs setters encore présents dans l'app avec le moteur
// src/lib/commissions/setterCommissions.js, sur des périodes données.
// LECTURE SEULE (Supabase). Les deux calculs sont recopiés tels quels :
//   - SetterAdmin.jsx, onglet Comparaison (useAllSetterStats) ;
//   - Dashboard.jsx, computeSetterMonthStats (filtre « mois » remplacé par la période,
//     et aussi calculé sur le mois civil comme à l'écran).
// Usage : node scripts/compare-calculs.mjs 2026-08-02:2026-08-15 ...
process.env.TZ = process.env.TZ || 'America/Toronto'; // les écrans utilisent le fuseau du navigateur

import { loadEnv, supabaseClient, fetchAll } from './lib/common.mjs';
import { computeSetterCommissions, PIPELINE_SETTING_ID, CONSULTATION_CALENDAR_IDS } from '../src/lib/commissions/setterCommissions.js';

// ── SetterAdmin.jsx (l. 13-120), copie conforme ─────────────────
const SA = { FIELD_SETTER_NOM: 'II5NrZGZrIScYItkxCi8', FIELD_TYPE_BOOKING: 'YbAB98KAINZM7vzebAKh', FIELD_DATE_CLOSE: 'UPqvJX8MkZ4thsPX2tjV' };
function getFieldById(rawObj, fieldId) {
  if (!rawObj?.customFields || fieldId === 'ID_A_REMPLIR') return null;
  const field = rawObj.customFields.find(f => f.id === fieldId);
  if (!field) return null;
  return field.fieldValueNumber ?? field.fieldValueString ?? field.fieldValueDate ?? null;
}
function setterAdminStats(opps, stagesMap, fullName, startDate, endDate) {
  const start = new Date(startDate + 'T00:00:00');
  const end   = new Date(endDate   + 'T23:59:59');
  const nameLower = (fullName ?? '').toLowerCase();
  let bookedCount = 0, showupCount = 0, wonCount = 0, totalShowups = 0;
  opps.forEach(opp => {
    const raw = opp.raw;
    const setterName = getFieldById(raw, SA.FIELD_SETTER_NOM);
    if (!setterName || String(setterName).toLowerCase() !== nameLower) return;
    const stageName     = (stagesMap[opp.pipeline_stage_id] || opp.stage_name || '').toLowerCase();
    const isShowupStage = stageName.includes('show-up confirm') || stageName.includes('bonus vente');
    const isWonStage    = stageName.includes('bonus vente');
    const typeDeBooking = String(getFieldById(raw, SA.FIELD_TYPE_BOOKING) || '').toLowerCase();
    if (opp.created_at_ghl) {
      const createdDate = new Date(opp.created_at_ghl);
      if (createdDate >= start && createdDate <= end) {
        bookedCount++;
        if (isShowupStage) {
          showupCount++;
          if (typeDeBooking === 'manuel') totalShowups += 40;
          else if (typeDeBooking === 'automatique') totalShowups += 20;
          else if (typeDeBooking === 'rebooking') totalShowups += 20;
        }
      }
    }
    if (isWonStage) {
      const closeDateRaw = getFieldById(raw, SA.FIELD_DATE_CLOSE);
      if (closeDateRaw) {
        const closeDate = new Date(Number(closeDateRaw));
        if (!isNaN(closeDate.getTime()) && closeDate >= start && closeDate <= end) wonCount++;
      }
    }
  });
  return { bookedCount, showupCount, wonCount, totalPay: totalShowups };
}

// ── Dashboard.jsx (l. 562-594), copie conforme ─────────────────
const GHL_STAGE_BOOKED  = 'Lead rencontre book';
const GHL_STAGE_SHOWUP  = 'Show-up Confirmé.';
const GHL_STAGE_BONUS   = 'bonus vente';
const GHL_ALL_STAGES    = [GHL_STAGE_BOOKED, GHL_STAGE_SHOWUP, GHL_STAGE_BONUS];
const GHL_SHOWUP_STAGES = [GHL_STAGE_SHOWUP, GHL_STAGE_BONUS];
function ghlField(rawObj, key) {
  return (rawObj?.customFields ?? []).find(f => f.key === key)?.value ?? null;
}
function dashParseGHLDate(v) {
  if (!v) return null;
  const n = Number(v);
  if (!isNaN(n) && n > 0) { const d = new Date(n > 9_999_999_999 ? n : n * 1000); return isNaN(d.getTime()) ? null : d; }
  const d = new Date(v); return isNaN(d.getTime()) ? null : d;
}
function dashboardStats(ghlOpps, memberFullName, inRange) {
  const nl = memberFullName.trim().toLowerCase();
  const opps = ghlOpps.filter(o =>
    GHL_ALL_STAGES.includes(o.stage_name) &&
    (ghlField(o.raw ?? {}, 'setter__nom') ?? '').trim().toLowerCase() === nl);
  const booked  = opps.filter(o => inRange(o.created_at_ghl));
  const showups = opps.filter(o => GHL_SHOWUP_STAGES.includes(o.stage_name) && inRange(o.created_at_ghl));
  const won     = opps.filter(o => o.stage_name === GHL_STAGE_BONUS && inRange(ghlField(o.raw ?? {}, 'date_de_close')));
  const totalShowups = showups.reduce((s, o) => s + (Number(ghlField(o.raw ?? {}, 'setter__commission_showup')) || 0), 0);
  const totalBonus   = won.reduce((s, o) => s + (Number(ghlField(o.raw ?? {}, 'setter__bonus_vente')) || 0), 0);
  return { bookedCount: booked.length, showupCount: showups.length, wonCount: won.length, totalPay: totalShowups + totalBonus };
}

async function main() {
  const periods = process.argv.slice(2).map(a => { const [s, e] = a.split(':'); return { s, e }; });
  loadEnv();
  const supabase = supabaseClient();
  const { data: profiles } = await supabase.from('profiles').select('full_name, role, secondary_roles').eq('is_active', true);
  const setters = profiles.filter(p => p.role === 'setter' || (p.secondary_roles ?? []).includes('setter')).map(p => p.full_name).sort();
  const { data: pipe } = await supabase.from('ghl_pipelines').select('stages').eq('ghl_id', PIPELINE_SETTING_ID).single();
  const stagesMap = Object.fromEntries((pipe.stages ?? []).map(s => [s.id, s.name]));
  const opps = await fetchAll(() => supabase.from('ghl_opportunities').select('*').eq('pipeline_id', PIPELINE_SETTING_ID).order('id'));
  const appts = await fetchAll(() => supabase.from('ghl_appointments').select('contact_id, start_time, calendar_id').in('calendar_id', CONSULTATION_CALENDAR_IDS).order('id'));

  // Diagnostic Dashboard : ses deux filtres peuvent-ils matcher ?
  const withKey = opps.filter(o => (o.raw?.customFields ?? []).some(f => f.key)).length;
  const stageExact = opps.filter(o => GHL_ALL_STAGES.includes(o.stage_name)).length;
  console.log(`Dashboard : ${withKey} opps ont des customFields avec « key », ${stageExact} opps ont un stage_name exactement égal à ${JSON.stringify(GHL_ALL_STAGES)}.`);

  const rows = [];
  for (const { s, e } of periods) {
    const start = new Date(s + 'T00:00:00'), end = new Date(e + 'T23:59:59');
    const inPeriod = v => { const d = dashParseGHLDate(v); return !!d && d >= start && d <= end; };
    for (const name of setters) {
      const moteur = computeSetterCommissions({ opps, appts, stages: pipe.stages, setterName: name, start: s, end: e });
      const sa = setterAdminStats(opps, stagesMap, name, s, e);
      const db = dashboardStats(opps, name, inPeriod);
      if (!moteur.totalPay && !sa.totalPay && !db.totalPay && !sa.showupCount && !db.showupCount) continue;
      rows.push({
        periode: `${s}→${e}`, setter: name,
        moteur: moteur.totalPay, 'moteur shows': moteur.showupCount, 'moteur ventes': moteur.wonCount,
        admin_comparaison: sa.totalPay, 'admin shows': sa.showupCount, 'admin ventes': sa.wonCount,
        dashboard: db.totalPay, 'dash shows': db.showupCount,
      });
    }
  }
  console.table(rows);

  // Classement Dashboard admin (SetterDashboardRow) : le hook sur le MOIS CIVIL
  const months = [['2026-08-01', '2026-08-31'], ['2026-09-01', '2026-09-30']];
  const monthRows = [];
  for (const [s, e] of months) for (const name of setters) {
    const m = computeSetterCommissions({ opps, appts, stages: pipe.stages, setterName: name, start: s, end: e });
    if (m.totalPay) monthRows.push({ mois: s.slice(0, 7), setter: name, 'classement Dashboard (mois civil)': m.totalPay });
  }
  console.table(monthRows);
}

main().catch(err => { console.error(err); process.exit(1); });
