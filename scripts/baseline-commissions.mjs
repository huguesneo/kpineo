#!/usr/bin/env node
// Photo de référence des commissions setters, pour chaque setter actif.
// Calcul : src/lib/commissions/setterCommissions.js (reprise à l'identique de
// src/hooks/useSetterCommissions.js, fuseau America/Toronto).
//
// LECTURE SEULE : lit Supabase, n'écrit que dans le dossier de sortie.
//
// Usage :
//   node scripts/baseline-commissions.mjs [--out dossier] 2026-08-02:2026-08-15 2026-08-16:2026-08-29 ...
// Sorties (dossier par défaut : scripts/baseline/) :
//   - AAAA-MM-JJ_AAAA-MM-JJ.json par période (détail ligne par ligne) ;
//   - inputs.json : les données d'entrée utilisées (opps, RDV, étapes, setters),
//     réduites aux champs dont le calcul a besoin. Sert au test de non-régression.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, supabaseClient, fetchAll } from './lib/common.mjs';
import {
  computeSetterCommissions, TIMEZONE, PIPELINE_SETTING_ID, CONSULTATION_CALENDAR_IDS,
  FIELD_SETTER_NOM, FIELD_TYPE_BOOKING, FIELD_DATE_CLOSE, FIELD_DATE_PRINCIPALE,
} from '../src/lib/commissions/setterCommissions.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIELDS_USED = new Set([FIELD_SETTER_NOM, FIELD_TYPE_BOOKING, FIELD_DATE_CLOSE, FIELD_DATE_PRINCIPALE]);

function parseArgs(argv) {
  let outDir = join(here, 'baseline');
  const periods = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') { outDir = resolve(argv[++i]); continue; }
    const m = argv[i].match(/^(\d{4}-\d{2}-\d{2})[:_](\d{4}-\d{2}-\d{2})$/);
    if (!m) throw new Error(`Argument invalide « ${argv[i]} » (attendu AAAA-MM-JJ:AAAA-MM-JJ ou --out dossier)`);
    periods.push({ startDate: m[1], endDate: m[2] });
  }
  if (!periods.length) throw new Error('Aucune période. Ex. : node scripts/baseline-commissions.mjs 2026-09-01:2026-09-15');
  return { outDir, periods };
}

function loadFantomes() {
  const path = join(here, 'audit', 'fantomes.json');
  if (!existsSync(path)) return null;
  const json = JSON.parse(readFileSync(path, 'utf8'));
  return { ids: new Set((json.fantomes ?? []).map(f => f.ghl_id)), genereLe: json.genere_le };
}

// Garde seulement ce que le moteur lit (réduit le fichier et les données personnelles).
function compactOpp(o) {
  return {
    id: o.id,
    ghl_id: o.ghl_id,
    contact_id: o.contact_id,
    contact_name: o.contact_name,
    pipeline_stage_id: o.pipeline_stage_id,
    stage_name: o.stage_name,
    created_at_ghl: o.created_at_ghl,
    raw: { customFields: (o.raw?.customFields ?? []).filter(cf => FIELDS_USED.has(cf.id)) },
  };
}

async function main() {
  const { outDir, periods } = parseArgs(process.argv.slice(2));
  loadEnv();
  const supabase = supabaseClient();
  const fantomes = loadFantomes();
  if (!fantomes) console.warn('⚠ scripts/audit/fantomes.json absent : colonne « fantôme » = inconnu. Lancer audit-fantomes.mjs d\'abord.');

  // Setters actifs (même règle que Dashboard et SetterAdmin : rôle principal ou secondaire « setter »)
  const { data: profiles, error: profErr } = await supabase
    .from('profiles').select('full_name, role, secondary_roles, is_active').eq('is_active', true);
  if (profErr) throw profErr;
  const setters = profiles
    .filter(p => p.full_name && (p.role === 'setter' || (p.secondary_roles ?? []).includes('setter')))
    .map(p => p.full_name)
    .sort();

  const { data: pipelineData, error: pipeError } = await supabase
    .from('ghl_pipelines').select('stages').eq('ghl_id', PIPELINE_SETTING_ID).single();
  if (pipeError) throw pipeError;
  const stages = (pipelineData?.stages ?? []).map(s => ({ id: s.id, name: s.name }));

  const opps = (await fetchAll(() => supabase
    .from('ghl_opportunities').select('*').eq('pipeline_id', PIPELINE_SETTING_ID).order('id'))).map(compactOpp);

  const appts = await fetchAll(() => supabase
    .from('ghl_appointments').select('contact_id, start_time, calendar_id')
    .in('calendar_id', CONSULTATION_CALENDAR_IDS).order('id'));

  console.log(`${opps.length} opps Setting, ${appts.length} RDV découverte, ${setters.length} setters actifs. Fuseau ${TIMEZONE}.`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'inputs.json'), JSON.stringify({
    genere_le: new Date().toISOString(), setters, stages, opps, appts,
  }));

  const resume = [];
  for (const { startDate, endDate } of periods) {
    const results = setters.map(setter => {
      const r = computeSetterCommissions({ opps, appts, stages, setterName: setter, start: startDate, end: endDate });
      const fantome = l => (fantomes ? (fantomes.ids.has(l.opportunite) ? 'oui' : 'non') : 'inconnu');
      const lignes = [...r.lignes]
        .sort((a, b) => String(a.date_rdv_retenu).localeCompare(String(b.date_rdv_retenu)))
        .map(l => ({ ...l, fantome: fantome(l) }));
      const sommeLignes = lignes.reduce((s, l) => s + l.total, 0);
      if (sommeLignes !== r.totalPay) throw new Error(`${setter} ${startDate}→${endDate} : lignes ${sommeLignes} ≠ total ${r.totalPay}`);
      const totalSansFantomes = lignes.filter(l => l.fantome !== 'oui').reduce((s, l) => s + l.total, 0);
      return {
        setter,
        total: r.totalPay,
        total_sans_fantomes: totalSansFantomes,
        ecart_fantomes: r.totalPay - totalSansFantomes,
        compteurs_app: {
          manuelCount: r.manuelCount, autoCount: r.autoCount, rebookingCount: r.rebookingCount,
          showupCount: r.showupCount, wonCount: r.wonCount,
          commissionManuel: r.commissionManuel, commissionAuto: r.commissionAuto,
          commissionRebook: r.commissionRebook, totalBonus: r.totalBonus,
          totalShowups: r.totalShowups, totalPay: r.totalPay,
        },
        lignes,
        lignes_showup_a_zero: r.lignesShowupZero.map(l => ({ ...l, fantome: fantome(l) })),
      };
    });
    const file = `${startDate}_${endDate}.json`;
    writeFileSync(join(outDir, file), JSON.stringify({
      periode: { debut: startDate, fin: endDate },
      genere_le: new Date().toISOString(),
      fuseau: TIMEZONE,
      source_logique: 'src/lib/commissions/setterCommissions.js',
      audit_fantomes_du: fantomes?.genereLe ?? null,
      total_periode: results.reduce((s, r) => s + r.total, 0),
      total_periode_sans_fantomes: results.reduce((s, r) => s + r.total_sans_fantomes, 0),
      setters: results,
    }, null, 2));
    for (const r of results) {
      resume.push({ setter: r.setter, periode: `${startDate} → ${endDate}`, total: r.total, sans_fantomes: r.total_sans_fantomes, ecart: r.ecart_fantomes });
    }
    console.log(`Écrit : ${join(outDir, file)}`);
  }

  console.table(resume.filter(r => r.total > 0));
}

main().catch(err => { console.error(err); process.exit(1); });
