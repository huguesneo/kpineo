// Moteur de calcul des commissions setters — fonctions PURES (aucun appel Supabase).
//
// Deux pipelines (voir config.js) :
//   - legacy « Setting » 3C5gg… : logique historique de useSetterCommissions.js,
//     inchangée pour les RDV avant la date de bascule C (périodes déjà payées
//     vérifiées à 0 $ près par les tests de non-régression) ;
//   - nouveau « pipeline setting » KkPiF… : étapes par ID, RDV choisi dans le
//     cycle de la carte, payé pour les RDV à partir de C.
// Bornes de période sur America/Toronto, quel que soit l'ordinateur.

import {
  BASCULE_DATE, RDV_NON_SHOWED, TEST_CONTACT_IDS, SETTER_PIPELINES, PIPELINE_SETTING_LEGACY,
} from './config.js';

export const TIMEZONE = 'America/Toronto';

// Pipeline historique (compatibilité avec les scripts et anciens imports)
export const PIPELINE_SETTING_ID = PIPELINE_SETTING_LEGACY;
export const SETTER_PIPELINE_IDS = SETTER_PIPELINES.map(p => p.id);

// Calendriers « Consultation découverte avec un closer »
export const CONSULTATION_CALENDAR_IDS = ['4227QzeKvFczi5BZyHOC', 'ucyJmhYKKDDm7U5JmaJ8', 'DIN6EPtG7eNU3Gf6ZRoC'];

// IDs de champs GHL (opportunité)
export const FIELD_SETTER_NOM      = 'II5NrZGZrIScYItkxCi8'; // setter__nom
export const FIELD_TYPE_BOOKING    = 'YbAB98KAINZM7vzebAKh'; // setter__type_de_booking (Manuel/Automatique/Rebooking)
export const FIELD_DATE_CLOSE      = 'UPqvJX8MkZ4thsPX2tjV'; // date_de_close (timestamp Unix ms)
export const FIELD_DATE_PRINCIPALE = 'mv0GU9HmvkCrkGVUSaqR'; // repli si aucun RDV calendrier trouvé

// Champs de MONTANT écrits par les workflows GHL. Documentés seulement :
// AUCUN des deux ne sert à payer. La paie utilise les montants fixes ci-dessous.
// (L'ancienne constante FIELD_BONUS_VENTE = sMwY… du hook pointait par erreur
// sur la commission show-up.)
export const FIELD_SETTER_COMMISSION_SHOWUP = 'sMwYAtL24soFUoWyBQ0p'; // setter__commission_showup (valeur observée : 40)
export const FIELD_SETTER_BONUS_VENTE       = 'FSejGTmnujIwiI2CENIQ'; // setter__bonus_vente (valeur observée : 10)

// Montants fixes
export const FLAT_MANUEL  = 40;
export const FLAT_CONFIRM = 20;
export const FLAT_REBOOK  = 20;
export const BONUS_VENTE  = 10;

export const DEFAULT_CONFIG = {
  basculeDate: BASCULE_DATE,
  rdvNonShowed: RDV_NON_SHOWED,
  testContactIds: TEST_CONTACT_IDS,
  pipelines: SETTER_PIPELINES,
};

// Libellés du rapport d'anomalies
export const ANOMALIES = {
  sans_setter:             'Carte payable sans setter',
  type_inconnu:            'Type de booking inconnu (0 $)',
  showup_sans_rdv:         'Show-up sans RDV au calendrier',
  rdv_pas_showed:          'RDV retenu pas « showed »',
  doublon_contact_rdv:     'Deux cartes sur le même contact + jour de RDV',
  doublon_contact_close:   'Deux bonus sur le même contact + jour de close',
  legacy_rdv_apres_bascule: 'Carte de l\'ancien pipeline avec un RDV après la bascule',
  contact_test:            'Contact test (exclu)',
};

// Cherche un champ GHL par id, key ou fieldKey
export function getField(rawObj, idOrKey) {
  if (!rawObj?.customFields || !idOrKey || idOrKey === 'ID_A_REMPLIR') return null;
  const f = rawObj.customFields.find(
    cf => cf.id === idOrKey || cf.key === idOrKey || cf.fieldKey === idOrKey
  );
  if (!f) return null;
  return f.fieldValueNumber ?? f.fieldValueString ?? f.fieldValueDate ?? f.value ?? null;
}

// Parse une date GHL (timestamp Unix ms ou string ISO)
export function parseGHLDate(raw) {
  if (raw == null) return null;
  const n = Number(raw);
  if (!isNaN(n) && n > 0) return new Date(n);
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

// Décalage (ms) entre l'heure murale de `timeZone` et UTC à l'instant `utcMs`.
function zoneOffsetMs(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const p = Object.fromEntries(parts.map(x => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utcMs;
}

// 'AAAA-MM-JJ' + 'hh:mm:ss' lus à l'heure de `timeZone` → Date (instant UTC).
export function zonedDate(dateStr, timeStr = '00:00:00', timeZone = TIMEZONE) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi, s] = timeStr.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  let utc = wall - zoneOffsetMs(wall, timeZone);
  utc = wall - zoneOffsetMs(utc, timeZone); // 2e passe : changement d'heure
  return new Date(utc);
}

// Jour calendaire ('AAAA-MM-JJ') d'un instant, à l'heure de `timeZone`.
export function zonedDay(date, timeZone = TIMEZONE) {
  if (!date || isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// Bornes de période, comme le hook historique : début 00:00:00, fin 23:59:59.
export function periodBounds(startDate, endDate, timeZone = TIMEZONE) {
  return { start: zonedDate(startDate, '00:00:00', timeZone), end: zonedDate(endDate, '23:59:59', timeZone) };
}

// Date de close. GHL enregistre ce champ « date » à minuit UTC : lu tel quel,
// il tombe la veille à Montréal. À partir de C seulement (pour ne pas toucher
// aux périodes déjà payées), on le lit comme une date de calendrier.
export function closeDateOf(raw, basculeDate = BASCULE_DATE, timeZone = TIMEZONE) {
  const v = getField(raw, FIELD_DATE_CLOSE);
  const d = parseGHLDate(v);
  if (!d) return null;
  const isNumeric = !isNaN(Number(v));
  const atUtcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  const utcDay = d.toISOString().slice(0, 10);
  if (isNumeric && atUtcMidnight && utcDay >= basculeDate) return zonedDate(utcDay, '00:00:00', timeZone);
  return d;
}

const TYPES_PAYES = { manuel: FLAT_MANUEL, automatique: FLAT_CONFIRM, rebooking: FLAT_REBOOK };

function stageKinds(pipeline, opp, stageLabel) {
  const s = pipeline.stages;
  if (pipeline.match === 'id') {
    const id = opp.pipeline_stage_id;
    return {
      booked: id === s.booked, showup: id === s.showup, bonus: id === s.bonus,
      cancelled: id === s.cancelled, noshow: id === s.noshow,
    };
  }
  const name = stageLabel.toLowerCase();
  return {
    booked: name.includes(s.booked), showup: name.includes(s.showup), bonus: name.includes(s.bonus),
    cancelled: name.includes(s.cancelled), noshow: name.includes(s.noshow),
  };
}

// ── Évaluation de TOUTES les cartes d'une période ────────────────
// Le dédoublonnage (contact + jour) se fait ici, sur l'ensemble des setters,
// avant tout filtrage par setter.
const evalCache = new WeakMap();

export function evaluateSetterPeriod({ opps, appts, stages, start: startDate, end: endDate, timeZone = TIMEZONE, config = DEFAULT_CONFIG }) {
  const cacheable = Array.isArray(opps);
  if (cacheable) {
    const hit = evalCache.get(opps);
    if (hit && hit.appts === appts && hit.stages === stages && hit.config === config) {
      const key = `${startDate}|${endDate}|${timeZone}`;
      if (hit.results.has(key)) return hit.results.get(key);
    }
  }
  const result = evaluateUncached({ opps, appts, stages, startDate, endDate, timeZone, config });
  if (cacheable) {
    let hit = evalCache.get(opps);
    if (!hit || hit.appts !== appts || hit.stages !== stages || hit.config !== config) {
      hit = { appts, stages, config, results: new Map() };
      evalCache.set(opps, hit);
    }
    hit.results.set(`${startDate}|${endDate}|${timeZone}`, result);
  }
  return result;
}

function evaluateUncached({ opps, appts, stages, startDate, endDate, timeZone, config }) {
  const { start, end } = periodBounds(startDate, endDate, timeZone);
  const bascule = zonedDate(config.basculeDate, '00:00:00', timeZone);
  const testIds = new Set(config.testContactIds ?? []);
  const pipelinesById = Object.fromEntries(config.pipelines.map(p => [p.id, p]));
  const inPeriod = d => !!d && d >= start && d <= end;

  // contactId → RDV [{date, iso, status}] (ordre d'origine conservé)
  const apptsByContact = {};
  (appts ?? []).forEach(appt => {
    if (!appt.contact_id || !appt.start_time) return;
    const d = new Date(appt.start_time);
    if (isNaN(d.getTime())) return;
    (apptsByContact[appt.contact_id] ??= []).push({ date: d, iso: appt.start_time, status: appt.status ?? null });
  });

  // Legacy (inchangé) : parmi les RDV de la période, le plus proche du created_at ;
  // sinon, parmi tous les RDV du contact, le plus proche du created_at.
  function bestApptLegacy(opp) {
    const list = apptsByContact[opp.contact_id] ?? [];
    if (list.length === 0) return null;
    const periodList = list.filter(a => a.date >= start && a.date <= end);
    const pool = periodList.length > 0 ? periodList : list;
    const ref = opp.created_at_ghl ? new Date(opp.created_at_ghl).getTime() : 0;
    return pool.reduce((best, a) =>
      Math.abs(a.date.getTime() - ref) < Math.abs(best.date.getTime() - ref) ? a : best
    );
  }

  // Nouveau : RDV pris dans le cycle de la carte (entre sa création et la
  // création de la carte suivante du même contact dans ce pipeline).
  // Le RDV « showed » s'il y en a un, sinon le premier non annulé.
  const cyclesByContact = {};
  (opps ?? []).forEach(opp => {
    const p = pipelinesById[opp.pipeline_id];
    if (p?.role !== 'nouveau' || !opp.contact_id) return;
    (cyclesByContact[opp.contact_id] ??= []).push(opp);
  });
  const cycleEnd = new Map();
  Object.values(cyclesByContact).forEach(list => {
    list.sort((a, b) => new Date(a.created_at_ghl ?? 0) - new Date(b.created_at_ghl ?? 0));
    list.forEach((o, k) => cycleEnd.set(o, list[k + 1]?.created_at_ghl ? new Date(list[k + 1].created_at_ghl) : null));
  });
  function cycleAppt(opp) {
    const from = opp.created_at_ghl ? new Date(opp.created_at_ghl) : new Date(0);
    const to = cycleEnd.get(opp);
    const inCycle = (apptsByContact[opp.contact_id] ?? [])
      .filter(a => a.date >= from && (!to || a.date < to))
      .sort((a, b) => a.date - b.date);
    return inCycle.find(a => a.status === 'showed') ?? inCycle.find(a => a.status !== 'cancelled') ?? null;
  }

  const stagesMap = {};
  (stages ?? []).forEach(stage => { if (stage.id) stagesMap[stage.id] = stage.name; });

  const cards = [];
  (opps ?? []).forEach(opp => {
    const pipeline = pipelinesById[opp.pipeline_id ?? PIPELINE_SETTING_LEGACY];
    if (!pipeline) return;
    const raw = opp.raw;
    // Comparé tel quel (sans trim), comme l'ancien calcul
    const setter = String(getField(raw, FIELD_SETTER_NOM) ?? '');
    const stageLabel = stagesMap[opp.pipeline_stage_id] || opp.stage_name || '';
    const k = stageKinds(pipeline, opp, stageLabel);
    const typeRaw = getField(raw, FIELD_TYPE_BOOKING);
    const typeDeBooking = String(typeRaw || '').toLowerCase();
    const isTypedBooking = typeDeBooking in TYPES_PAYES;

    const appt = pipeline.role === 'nouveau' ? cycleAppt(opp) : bestApptLegacy(opp);
    const dateField = appt?.date ?? parseGHLDate(getField(raw, FIELD_DATE_PRINCIPALE));
    const createdDate = opp.created_at_ghl ? new Date(opp.created_at_ghl) : null;
    const closeDate = closeDateOf(raw, config.basculeDate, timeZone);

    // Show-up : RDV dans la période ET dans la bonne tranche de la bascule
    const showupStage = k.showup || k.bonus;
    const rdvInPeriod = showupStage && inPeriod(dateField);
    const afterC = !!dateField && dateField >= bascule;
    const belongs = pipeline.role === 'nouveau' ? afterC : !afterC;
    const legacyAfterC = rdvInPeriod && pipeline.role === 'legacy' && afterC;

    cards.push({
      opp, pipeline, setter, setterLower: setter.toLowerCase(), stageLabel, k,
      typeRaw, typeDeBooking, isTypedBooking, appt, dateField, createdDate, closeDate,
      isTest: testIds.has(opp.contact_id),
      called: inPeriod(dateField),
      booked: (k.booked || k.showup || k.bonus) && inPeriod(dateField ?? createdDate),
      cancelled: k.cancelled && isTypedBooking && inPeriod(dateField ?? createdDate),
      noshow: k.noshow && isTypedBooking && inPeriod(dateField ?? createdDate),
      showupEligible: rdvInPeriod && belongs,
      montantShowup: rdvInPeriod && belongs ? (TYPES_PAYES[typeDeBooking] ?? 0) : 0,
      won: k.bonus && inPeriod(closeDate),
      bonus: k.bonus && inPeriod(closeDate) ? BONUS_VENTE : 0,
      legacyAfterC,
      anomalies: [],
    });
  });

  // Contacts test : jamais payés
  cards.forEach(c => {
    if (!c.isTest) return;
    if (c.showupEligible || c.bonus > 0) c.anomalies.push('contact_test');
    c.showupEligible = false; c.montantShowup = 0; c.won = false; c.bonus = 0;
  });

  // Filet de sécurité : une seule carte payée par contact + jour
  const winnerFirst = (a, b) =>
    (b.setter.trim() ? 1 : 0) - (a.setter.trim() ? 1 : 0)
    || (a.createdDate?.getTime() ?? 0) - (b.createdDate?.getTime() ?? 0)
    || String(a.opp.ghl_id).localeCompare(String(b.opp.ghl_id));
  function dedupe(list, keyOf, code, drop) {
    const groups = {};
    list.forEach(c => { const key = keyOf(c); if (key) (groups[key] ??= []).push(c); });
    Object.values(groups).forEach(g => {
      if (g.length < 2) return;
      g.sort(winnerFirst).forEach((c, idx) => { c.anomalies.push(code); if (idx > 0) drop(c); });
    });
  }
  dedupe(cards.filter(c => c.showupEligible), c => c.opp.contact_id && `${c.opp.contact_id}|${zonedDay(c.dateField, timeZone)}`,
    'doublon_contact_rdv', c => { c.showupEligible = false; c.montantShowup = 0; });
  dedupe(cards.filter(c => c.bonus > 0), c => c.opp.contact_id && `${c.opp.contact_id}|${zonedDay(c.closeDate, timeZone)}`,
    'doublon_contact_close', c => { c.won = false; c.bonus = 0; });

  // Contrôles sur les show-ups retenus
  cards.forEach(c => {
    if (c.showupEligible) {
      if (!c.appt) c.anomalies.push('showup_sans_rdv');
      else if (c.appt.status !== 'showed') {
        c.anomalies.push('rdv_pas_showed');
        if (config.rdvNonShowed === 'bloquer') { c.showupEligible = false; c.montantShowup = 0; }
      }
      if (!c.isTypedBooking) c.anomalies.push('type_inconnu');
    }
    if (c.legacyAfterC && !c.isTest) c.anomalies.push('legacy_rdv_apres_bascule');
    if (!c.setter.trim() && !c.isTest && (c.showupEligible || c.bonus > 0)) c.anomalies.push('sans_setter');
  });

  const anomalies = [];
  cards.forEach(c => c.anomalies.forEach(code => anomalies.push({
    code,
    libelle: ANOMALIES[code],
    pipeline: c.pipeline.label,
    opportunite: c.opp.ghl_id,
    contact: c.opp.contact_name,
    contact_id: c.opp.contact_id,
    setter: c.setter.trim() || null,
    etape: c.stageLabel,
    type_booking: c.typeRaw ?? null,
    date_rdv: c.appt?.iso ?? (c.dateField ? c.dateField.toISOString() : null),
    statut_rdv: c.appt?.status ?? null,
    date_de_close: c.closeDate ? c.closeDate.toISOString() : null,
    // Ce qui sera réellement payé (0 si personne à payer)
    montant_retenu: c.setter.trim() && !c.isTest ? c.montantShowup + c.bonus : 0,
  })));

  return { cards, anomalies };
}

// Anomalies de la période (tous setters)
export function computeSetterAnomalies(args) {
  return evaluateSetterPeriod(args).anomalies;
}

// Commissions d'un setter pour une période. Même forme de résultat que
// l'ancien hook (compteurs, listes d'opps, apptMap) + détail ligne par ligne.
// stages : étapes des pipelines setters (ghl_pipelines.stages, concaténées)
// appts  : ghl_appointments des calendriers découverte [{ contact_id, start_time, status }]
// opps   : ghl_opportunities des pipelines setters (pipeline_id absent = legacy)
// start / end : 'AAAA-MM-JJ'
export function computeSetterCommissions({ opps, appts, stages, setterName, start, end, timeZone = TIMEZONE, config = DEFAULT_CONFIG }) {
  const { cards, anomalies } = evaluateSetterPeriod({ opps, appts, stages, start, end, timeZone, config });
  const nameLower = String(setterName ?? '').toLowerCase();

  const oppApptMap = {};
  let calledCount = 0, bookedCount = 0, showupCount = 0;
  let manuelCount = 0, autoCount = 0, rebookingCount = 0;
  let cancelledCount = 0, noShowCount = 0, wonCount = 0;
  let commissionManuel = 0, commissionAuto = 0, commissionRebook = 0, totalBonus = 0;
  const setterOpps = [], calledOpps = [], bookedOpps = [], manuelOpps = [], autoOpps = [];
  const rebookOpps = [], cancelledOpps = [], noShowOpps = [], wonOpps = [];
  const lignes = [];           // une ligne par carte qui rapporte > 0 $
  const lignesShowupZero = []; // carte comptée en show-up mais qui ne rapporte rien

  for (const c of cards) {
    if (!c.setter || c.isTest || c.setterLower !== nameLower) continue;
    const opp = c.opp;
    setterOpps.push(opp);
    if (c.appt) oppApptMap[opp.id] = c.appt.iso;

    if (c.called) { calledCount++; calledOpps.push(opp); }
    if (c.booked) { bookedCount++; bookedOpps.push(opp); }
    if (c.cancelled) { cancelledCount++; cancelledOpps.push(opp); }
    if (c.noshow) { noShowCount++; noShowOpps.push(opp); }
    if (c.won) { wonCount++; totalBonus += c.bonus; wonOpps.push(opp); }
    if (c.showupEligible) {
      showupCount++;
      if (c.typeDeBooking === 'manuel') { manuelCount++; commissionManuel += c.montantShowup; manuelOpps.push(opp); }
      else if (c.typeDeBooking === 'automatique') { autoCount++; commissionAuto += c.montantShowup; autoOpps.push(opp); }
      else if (c.typeDeBooking === 'rebooking') { rebookingCount++; commissionRebook += c.montantShowup; rebookOpps.push(opp); }
    }

    const total = c.montantShowup + c.bonus;
    if (total > 0 || c.showupEligible) {
      const ligne = {
        opportunite: opp.ghl_id,
        supabase_id: opp.id,
        pipeline: c.pipeline.role,
        contact: opp.contact_name,
        contact_id: opp.contact_id,
        etape: c.stageLabel,
        type_booking: c.typeRaw,
        date_rdv_retenu: c.appt?.iso ?? (c.dateField ? c.dateField.toISOString() : null),
        source_date_rdv: c.appt ? 'rdv_calendrier' : (c.dateField ? 'champ_date_principale' : null),
        statut_rdv: c.appt?.status ?? null,
        date_de_close: c.closeDate ? c.closeDate.toISOString() : null,
        montant_showup: c.montantShowup,
        bonus: c.bonus,
        total,
        anomalies: [...c.anomalies],
      };
      if (total > 0) lignes.push(ligne);
      else lignesShowupZero.push(ligne);
    }
  }

  const totalShowups = commissionManuel + commissionAuto + commissionRebook;

  // Tri décroissant par date de RDV (ou date de close pour les ventes)
  const byApptDesc = arr => [...arr].sort((a, b) => {
    const da = oppApptMap[a.id] ? new Date(oppApptMap[a.id]) : new Date(0);
    const db = oppApptMap[b.id] ? new Date(oppApptMap[b.id]) : new Date(0);
    return db - da;
  });
  const byCloseDateDesc = arr => [...arr].sort((a, b) => {
    const da = closeDateOf(a.raw, config.basculeDate, timeZone) ?? new Date(0);
    const db = closeDateOf(b.raw, config.basculeDate, timeZone) ?? new Date(0);
    return db - da;
  });

  return {
    calledCount,
    bookedCount,
    showupCount,
    manuelCount,
    autoCount,
    rebookingCount,
    cancelledCount,
    noShowCount,
    wonCount,
    commissionManuel,
    commissionAuto,
    commissionRebook,
    totalShowups,
    totalBonus,
    totalPay: totalShowups + totalBonus,
    apptMap: oppApptMap,
    opportunities: setterOpps,
    calledOpps:    byApptDesc(calledOpps),
    bookedOpps:    byApptDesc(bookedOpps),
    manuelOpps:    byApptDesc(manuelOpps),
    autoOpps:      byApptDesc(autoOpps),
    rebookOpps:    byApptDesc(rebookOpps),
    cancelledOpps: byApptDesc(cancelledOpps),
    noShowOpps:    byApptDesc(noShowOpps),
    wonOpps:       byCloseDateDesc(wonOpps),
    lignes,
    lignesShowupZero,
    anomalies: anomalies.filter(a => (a.setter ?? '').toLowerCase() === nameLower),
  };
}
