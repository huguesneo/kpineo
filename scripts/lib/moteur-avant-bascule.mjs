// Copie figée du moteur AVANT la bascule (commit 65ee9d7), pour comparer.
// Ne pas modifier : c'est la référence « ancien calcul ».
// Moteur de calcul des commissions setters — fonction PURE (aucun appel Supabase).
//
// Reprend à l'identique la logique de src/hooks/useSetterCommissions.js
// (état du 21 sept. 2026, validé contre les paies réellement versées),
// avec une seule différence volontaire : les bornes de période sont calculées
// sur le fuseau America/Toronto au lieu du fuseau du navigateur, pour que le
// résultat ne dépende plus de l'ordinateur qui l'affiche.

export const TIMEZONE = 'America/Toronto';

export const PIPELINE_SETTING_ID = '3C5ggTxPoWBmiFAPlCKn';

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

// Bornes de période, comme le hook : début 00:00:00, fin 23:59:59 (secondes pleines).
export function periodBounds(startDate, endDate, timeZone = TIMEZONE) {
  return { start: zonedDate(startDate, '00:00:00', timeZone), end: zonedDate(endDate, '23:59:59', timeZone) };
}

// stages : tableau [{ id, name }] du pipeline Setting (ghl_pipelines.stages)
// appts  : lignes ghl_appointments [{ contact_id, start_time, calendar_id? }]
//          (déjà filtrées sur CONSULTATION_CALENDAR_IDS, comme le hook)
// opps   : lignes ghl_opportunities du pipeline Setting
// start / end : 'AAAA-MM-JJ'
export function computeSetterCommissions({ opps, appts, stages, setterName, start: startDate, end: endDate, timeZone = TIMEZONE }) {
  const { start, end } = periodBounds(startDate, endDate, timeZone);

  // contactId → tous ses rendez-vous [{date, iso}]
  const apptsByContact = {};
  (appts ?? []).forEach(appt => {
    if (!appt.contact_id || !appt.start_time) return;
    const d = new Date(appt.start_time);
    if (isNaN(d.getTime())) return;
    if (!apptsByContact[appt.contact_id]) apptsByContact[appt.contact_id] = [];
    apptsByContact[appt.contact_id].push({ date: d, iso: appt.start_time });
  });

  // Meilleur RDV : parmi ceux de la période, le plus proche du created_at de l'opp ;
  // sinon, parmi tous les RDV du contact, le plus proche du created_at.
  function bestAppt(opp) {
    const list = apptsByContact[opp.contact_id] ?? [];
    if (list.length === 0) return null;
    const inPeriod = list.filter(a => a.date >= start && a.date <= end);
    const pool = inPeriod.length > 0 ? inPeriod : list;
    const ref = opp.created_at_ghl ? new Date(opp.created_at_ghl).getTime() : 0;
    return pool.reduce((best, a) =>
      Math.abs(a.date.getTime() - ref) < Math.abs(best.date.getTime() - ref) ? a : best
    );
  }

  const stagesMap = {};
  (stages ?? []).forEach(stage => { if (stage.id) stagesMap[stage.id] = stage.name; });

  const inPeriod = d => !!d && d >= start && d <= end;
  const showupAmount = type =>
    type === 'manuel' ? FLAT_MANUEL : type === 'automatique' ? FLAT_CONFIRM : type === 'rebooking' ? FLAT_REBOOK : 0;

  const oppApptMap = {};
  const nameLower = String(setterName ?? '').toLowerCase();
  let calledCount = 0, bookedCount = 0, showupCount = 0;
  let manuelCount = 0, autoCount = 0, rebookingCount = 0;
  let cancelledCount = 0, noShowCount = 0, wonCount = 0;
  let commissionManuel = 0, commissionAuto = 0, commissionRebook = 0, totalBonus = 0;
  const setterOpps = [], calledOpps = [], bookedOpps = [], manuelOpps = [], autoOpps = [];
  const rebookOpps = [], cancelledOpps = [], noShowOpps = [], wonOpps = [];
  const lignes = [];         // une ligne par carte qui rapporte > 0 $
  const lignesShowupZero = []; // carte comptée en show-up mais qui ne rapporte rien (type vide ou inconnu)

  function addShowup(opp, typeDeBooking) {
    showupCount++;
    if (typeDeBooking === 'manuel') {
      manuelCount++; commissionManuel += FLAT_MANUEL; manuelOpps.push(opp);
    } else if (typeDeBooking === 'automatique') {
      autoCount++; commissionAuto += FLAT_CONFIRM; autoOpps.push(opp);
    } else if (typeDeBooking === 'rebooking') {
      rebookingCount++; commissionRebook += FLAT_REBOOK; rebookOpps.push(opp);
    }
  }

  (opps ?? []).forEach(opp => {
    const raw = opp.raw;

    const oppSetter = getField(raw, FIELD_SETTER_NOM);
    if (!oppSetter || String(oppSetter).toLowerCase() !== nameLower) return;
    setterOpps.push(opp);

    const stageLabel       = stagesMap[opp.pipeline_stage_id] || opp.stage_name || '';
    const stageName        = stageLabel.toLowerCase();
    const isBookedStage    = stageName.includes('lead rencontre book');
    const isShowupStage    = stageName.includes('show-up confirm');
    const isCancelledStage = stageName.includes('rencontre annul');
    const isNoShowStage    = stageName.includes('no show');
    const isBonusVente     = stageName.includes('bonus vente');
    const typeDeBooking    = String(getField(raw, FIELD_TYPE_BOOKING) || '').toLowerCase();
    const isTypedBooking   = typeDeBooking === 'manuel' || typeDeBooking === 'automatique' || typeDeBooking === 'rebooking';

    const appt = bestAppt(opp);
    if (appt) oppApptMap[opp.id] = appt.iso;
    const dateField = appt?.date ?? parseGHLDate(getField(raw, FIELD_DATE_PRINCIPALE));
    const createdDate = opp.created_at_ghl ? new Date(opp.created_at_ghl) : null;

    if (inPeriod(dateField)) { calledCount++; calledOpps.push(opp); }

    if ((isBookedStage || isShowupStage || isBonusVente) && inPeriod(dateField ?? createdDate)) {
      bookedCount++; bookedOpps.push(opp);
    }

    let montantShowup = 0, bonus = 0, showupCompte = false;

    if (isShowupStage && inPeriod(dateField)) {
      addShowup(opp, typeDeBooking);
      montantShowup += showupAmount(typeDeBooking);
      showupCompte = true;
    }

    if (isCancelledStage && isTypedBooking && inPeriod(dateField ?? createdDate)) {
      cancelledCount++; cancelledOpps.push(opp);
    }

    if (isNoShowStage && isTypedBooking && inPeriod(dateField ?? createdDate)) {
      noShowCount++; noShowOpps.push(opp);
    }

    // Bonus vente : 10 $ si date_de_close dans la période,
    // + show-up selon le type si le RDV retenu est dans la période.
    const closeDate = parseGHLDate(getField(raw, FIELD_DATE_CLOSE));
    if (isBonusVente) {
      if (inPeriod(closeDate)) {
        wonCount++; totalBonus += BONUS_VENTE; bonus += BONUS_VENTE; wonOpps.push(opp);
      }
      if (inPeriod(dateField)) {
        addShowup(opp, typeDeBooking);
        montantShowup += showupAmount(typeDeBooking);
        showupCompte = true;
      }
    }

    if (montantShowup + bonus > 0 || showupCompte) {
      const ligne = {
        opportunite: opp.ghl_id,
        supabase_id: opp.id,
        contact: opp.contact_name,
        contact_id: opp.contact_id,
        etape: stageLabel,
        type_booking: getField(raw, FIELD_TYPE_BOOKING),
        date_rdv_retenu: appt?.iso ?? (dateField ? dateField.toISOString() : null),
        source_date_rdv: appt ? 'rdv_calendrier' : (dateField ? 'champ_date_principale' : null),
        date_de_close: closeDate ? closeDate.toISOString() : null,
        montant_showup: montantShowup,
        bonus,
        total: montantShowup + bonus,
      };
      if (ligne.total > 0) lignes.push(ligne);
      else lignesShowupZero.push(ligne);
    }
  });

  const totalShowups = commissionManuel + commissionAuto + commissionRebook;

  // Tri décroissant par date de RDV (ou date_de_close pour les ventes), comme le hook
  const byApptDesc = arr => [...arr].sort((a, b) => {
    const da = oppApptMap[a.id] ? new Date(oppApptMap[a.id]) : new Date(0);
    const db = oppApptMap[b.id] ? new Date(oppApptMap[b.id]) : new Date(0);
    return db - da;
  });
  const byCloseDateDesc = arr => [...arr].sort((a, b) => {
    const da = parseGHLDate(getField(a.raw, FIELD_DATE_CLOSE)) ?? new Date(0);
    const db = parseGHLDate(getField(b.raw, FIELD_DATE_CLOSE)) ?? new Date(0);
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
  };
}
