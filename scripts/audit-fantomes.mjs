#!/usr/bin/env node
// Audit des « cartes fantômes » : opportunités présentes dans Supabase
// (ghl_opportunities) mais supprimées dans GHL.
//
// LECTURE SEULE : aucun écriture dans Supabase ni dans GHL (GET uniquement).
//
// Méthode (économe en requêtes) :
//   1. Lit toutes les opps Supabase des 4 pipelines.
//   2. Liste toutes les opps GHL de chaque pipeline (/opportunities/search, 100 par page).
//   3. Chaque opp Supabase absente de la liste GHL est confirmée une à une
//      (GET /opportunities/{id}) : 404 = supprimée (fantôme), 200 = déplacée
//      dans un autre pipeline ou simplement manquée par la liste.
//   Option --verify-all : confirme TOUTES les opps une à une (≈ 20 min).
//
// Usage :
//   GHL_API_KEY=pit-... node scripts/audit-fantomes.mjs [--verify-all]
// Sortie : scripts/audit/fantomes.json + tableau récapitulatif dans la console.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LOCATION_ID, loadEnv, supabaseClient, fetchAll, getField, parseGHLDate, ghlClient,
} from './lib/common.mjs';

const PIPELINES = {
  '3C5ggTxPoWBmiFAPlCKn': 'Setting (ancien)',
  'KkPiFjw0ztAXc7z6Ab9c': 'Pipeline setting (nouveau)',
  'pc4eWgm1TOfZgMgqh6Gv': 'Vente',
  'YPTruORTl0LOSdS2vWJS': 'Rencontre découverte (ancien)',
};
const FIELD_SETTER_NOM   = 'II5NrZGZrIScYItkxCi8';
const FIELD_TYPE_BOOKING = 'YbAB98KAINZM7vzebAKh';
const FIELD_DATE_CLOSE   = 'UPqvJX8MkZ4thsPX2tjV';

// Étapes qui déclenchent une paie setter (reconnues par morceau de nom, comme l'app)
const PAYABLE = [
  { key: 'show-up', match: 'show-up confirm' },
  { key: 'bonus vente', match: 'bonus vente' },
  { key: 'rebooking confirmé', match: 'rebooking confirm' },
];
const payableKind = name => PAYABLE.find(p => (name || '').toLowerCase().includes(p.match))?.key ?? null;

const verifyAll = process.argv.includes('--verify-all');
const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  loadEnv();
  const supabase = supabaseClient();
  const ghl = ghlClient(process.env.GHL_API_KEY);
  const pipelineIds = Object.keys(PIPELINES);

  // ── 1. Supabase ──────────────────────────────────────────────
  const { data: pipes, error: pipeErr } = await supabase
    .from('ghl_pipelines').select('ghl_id, name, stages').in('ghl_id', pipelineIds);
  if (pipeErr) throw pipeErr;
  const stageName = {};
  for (const p of pipes) for (const s of p.stages ?? []) stageName[s.id] = s.name;

  const sbOpps = await fetchAll(() => supabase
    .from('ghl_opportunities')
    .select('id, ghl_id, pipeline_id, pipeline_stage_id, stage_name, contact_id, contact_name, status, created_at_ghl, synced_at, raw')
    .in('pipeline_id', pipelineIds)
    .order('id'));
  console.log(`Supabase : ${sbOpps.length} opportunités sur ${pipelineIds.length} pipelines.`);

  // ── 2. Liste GHL par pipeline ────────────────────────────────
  const ghlById = new Map();
  const ghlTotals = {};
  for (const pid of pipelineIds) {
    let startAfter = null, startAfterId = null, pages = 0, total = null, seen = 0;
    const guard = new Set();
    while (true) {
      const qs = new URLSearchParams({ location_id: LOCATION_ID, pipeline_id: pid, limit: '100', status: 'all' });
      if (startAfterId) { qs.set('startAfter', String(startAfter)); qs.set('startAfterId', startAfterId); }
      const { status, body } = await ghl.get(`/opportunities/search?${qs}`);
      if (status !== 200) throw new Error(`Liste GHL ${pid} : HTTP ${status} ${JSON.stringify(body).slice(0, 200)}`);
      const list = body?.opportunities ?? [];
      total = body?.meta?.total ?? total;
      for (const o of list) {
        ghlById.set(o.id, { pipelineId: o.pipelineId, stageId: o.pipelineStageId, status: o.status });
        seen++;
      }
      pages++;
      const next = body?.meta?.startAfterId;
      if (!list.length || !next || guard.has(next)) break;
      guard.add(next);
      startAfter = body.meta.startAfter;
      startAfterId = next;
    }
    ghlTotals[pid] = { listees: seen, total_annonce_par_ghl: total, pages };
    console.log(`GHL ${PIPELINES[pid]} : ${seen} listées (total annoncé ${total}) en ${pages} pages.`);
  }

  // ── 3. Confirmation une à une ────────────────────────────────
  const toCheck = verifyAll
    ? sbOpps
    : sbOpps.filter(o => ghlById.get(o.ghl_id)?.pipelineId !== o.pipeline_id);
  console.log(`Vérification individuelle de ${toCheck.length} opportunités…`);

  const verdicts = new Map(); // ghl_id → { etat, ghlPipelineId, ghlStageId, http }
  let done = 0;
  for (const o of toCheck) {
    const { status, body } = await ghl.get(`/opportunities/${o.ghl_id}`);
    const g = body?.opportunity;
    let etat;
    if (status === 200 && g?.id) etat = g.pipelineId === o.pipeline_id ? 'presente' : 'deplacee';
    else if (status === 404 || (status === 400 && /not found/i.test(JSON.stringify(body)))) etat = 'supprimee';
    else etat = `inconnu_http_${status}`;
    verdicts.set(o.ghl_id, { etat, http: status, ghlPipelineId: g?.pipelineId ?? null, ghlStageId: g?.pipelineStageId ?? null });
    if (++done % 50 === 0) console.log(`  ${done}/${toCheck.length}`);
  }

  // ── 4. Résultats ─────────────────────────────────────────────
  const fantomes = [];
  const deplacees = [];
  const etapesPerimees = [];
  const inconnues = [];

  for (const o of sbOpps) {
    const sbStage = stageName[o.pipeline_stage_id] || o.stage_name || '';
    const base = {
      ghl_id: o.ghl_id,
      supabase_id: o.id,
      pipeline_id: o.pipeline_id,
      pipeline: PIPELINES[o.pipeline_id],
      etape: sbStage,
      etape_payante: payableKind(sbStage),
      contact_id: o.contact_id,
      contact_name: o.contact_name,
      setter_nom: getField(o.raw, FIELD_SETTER_NOM),
      type_booking: getField(o.raw, FIELD_TYPE_BOOKING),
      statut: o.status,
      cree_le: o.created_at_ghl,
      dernier_changement_etape: o.raw?.lastStageChangeAt ?? null,
      date_de_close: parseGHLDate(getField(o.raw, FIELD_DATE_CLOSE))?.toISOString() ?? null,
      synchronise_le: o.synced_at,
    };
    const v = verdicts.get(o.ghl_id);
    if (v?.etat === 'supprimee') { fantomes.push(base); continue; }
    if (v?.etat === 'deplacee') {
      deplacees.push({ ...base, pipeline_ghl: PIPELINES[v.ghlPipelineId] ?? v.ghlPipelineId, etape_ghl: stageName[v.ghlStageId] ?? v.ghlStageId });
      continue;
    }
    if (v?.etat?.startsWith('inconnu')) { inconnues.push({ ...base, http: v.http }); continue; }

    // Présente : l'étape Supabase est-elle encore la bonne ?
    const g = ghlById.get(o.ghl_id);
    const ghlStageId = v?.ghlStageId ?? g?.stageId;
    if (ghlStageId && ghlStageId !== o.pipeline_stage_id) {
      const ghlStage = stageName[ghlStageId] ?? ghlStageId;
      if (payableKind(sbStage) || payableKind(ghlStage)) {
        etapesPerimees.push({ ...base, etape_ghl: ghlStage, etape_payante_ghl: payableKind(ghlStage) });
      }
    }
  }

  // Récapitulatif par pipeline
  const recap = pipelineIds.map(pid => {
    const f = fantomes.filter(x => x.pipeline_id === pid);
    return {
      pipeline: PIPELINES[pid],
      supabase: sbOpps.filter(o => o.pipeline_id === pid).length,
      ghl: ghlTotals[pid].listees,
      fantomes: f.length,
      fantomes_payants: f.filter(x => x.etape_payante).length,
      'dont show-up': f.filter(x => x.etape_payante === 'show-up').length,
      'dont bonus vente': f.filter(x => x.etape_payante === 'bonus vente').length,
      'dont rebooking confirmé': f.filter(x => x.etape_payante === 'rebooking confirmé').length,
      deplacees: deplacees.filter(x => x.pipeline_id === pid).length,
    };
  });

  const out = {
    genere_le: new Date().toISOString(),
    location_id: LOCATION_ID,
    mode: verifyAll ? 'verification individuelle de toutes les opps' : 'liste GHL + confirmation des absentes',
    requetes_ghl: ghl.count(),
    totaux_ghl: ghlTotals,
    recap,
    fantomes,
    deplacees,
    etapes_perimees_payantes: etapesPerimees,
    verification_impossible: inconnues,
  };
  const outDir = join(here, 'audit');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'fantomes.json'), JSON.stringify(out, null, 2));

  console.log('\n── Récapitulatif ──');
  console.table(recap);
  const payants = fantomes.filter(x => x.etape_payante);
  if (payants.length) {
    console.log('\n── Fantômes à une étape qui paie ──');
    console.table(payants.map(x => ({
      pipeline: x.pipeline, etape: x.etape, contact: x.contact_name, setter: x.setter_nom,
      type: x.type_booking, changement_etape: x.dernier_changement_etape?.slice(0, 10),
      close: x.date_de_close?.slice(0, 10),
    })));
  }
  if (etapesPerimees.length) console.log(`\n${etapesPerimees.length} opps présentes mais avec une étape payante périmée dans Supabase (voir etapes_perimees_payantes).`);
  if (inconnues.length) console.log(`\n⚠ ${inconnues.length} opps non vérifiables (voir verification_impossible).`);
  console.log(`\n${ghl.count()} requêtes GHL. Écrit : scripts/audit/fantomes.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
