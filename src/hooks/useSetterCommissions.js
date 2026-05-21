import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const PIPELINE_SETTING_ID    = "3C5ggTxPoWBmiFAPlCKn";

// Calendriers "Consultation découverte avec un closer"
const CONSULTATION_CALENDAR_IDS = ['4227QzeKvFczi5BZyHOC', 'ucyJmhYKKDDm7U5JmaJ8', 'DIN6EPtG7eNU3Gf6ZRoC'];

// IDs de champs GHL (confirmés via inspection DB)
const FIELD_SETTER_NOM       = "II5NrZGZrIScYItkxCi8"; // setter__nom
const FIELD_TYPE_BOOKING     = "YbAB98KAINZM7vzebAKh"; // setter__type_de_booking (Manuel/Automatique/Rebooking)
const FIELD_DATE_CLOSE       = "UPqvJX8MkZ4thsPX2tjV"; // date_de_close (timestamp Unix ms)
const FIELD_BONUS_VENTE      = "sMwYAtL24soFUoWyBQ0p"; // setter__bonus_vente (montant $)
// Fallback date si aucun rendez-vous calendrier trouvé
const FIELD_DATE_PRINCIPALE  = "mv0GU9HmvkCrkGVUSaqR";

// Montants flat
const FLAT_MANUEL  = 40;
const FLAT_CONFIRM = 20;
const FLAT_REBOOK  = 20;

// Cherche un champ GHL par id, key ou fieldKey
function getField(rawObj, idOrKey) {
  if (!rawObj?.customFields || !idOrKey || idOrKey === 'ID_A_REMPLIR') return null;
  const f = rawObj.customFields.find(
    cf => cf.id === idOrKey || cf.key === idOrKey || cf.fieldKey === idOrKey
  );
  if (!f) return null;
  return f.fieldValueNumber ?? f.fieldValueString ?? f.fieldValueDate ?? f.value ?? null;
}

// Parse une date GHL (timestamp Unix ms ou string ISO)
function parseGHLDate(raw) {
  if (raw == null) return null;
  const n = Number(raw);
  if (!isNaN(n) && n > 0) return new Date(n);
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export function useSetterCommissions(memberFullName, startDate, endDate) {
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey(k => k + 1);

  const [data, setData] = useState({
    calledCount: 0,
    bookedCount: 0,
    showupCount: 0,
    manuelCount: 0,
    autoCount: 0,
    rebookingCount: 0,
    cancelledCount: 0,
    noShowCount: 0,
    wonCount: 0,
    commissionManuel: 0,
    commissionAuto: 0,
    commissionRebook: 0,
    totalShowups: 0,
    totalBonus: 0,
    totalPay: 0,
    apptMap: {},
    opportunities: [],
    calledOpps: [],
    bookedOpps: [],
    manuelOpps: [],
    autoOpps: [],
    rebookOpps: [],
    cancelledOpps: [],
    noShowOpps: [],
    wonOpps: [],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchCommissions() {
      if (!memberFullName || !startDate || !endDate) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const start = new Date(startDate + 'T00:00:00');
        const end   = new Date(endDate   + 'T23:59:59');

        // Fetch pipeline + toutes les opps en parallèle (pagination par batch de 1000)
        const { data: pipelineData, error: pipeError } = await supabase
          .from('ghl_pipelines').select('stages').eq('ghl_id', PIPELINE_SETTING_ID).single();
        if (pipeError) throw pipeError;

        const BATCH = 1000;
        let allOpps = [];
        let offset = 0;
        let keepGoing = true;
        while (keepGoing) {
          const { data: batch, error: batchErr } = await supabase
            .from('ghl_opportunities')
            .select('*')
            .eq('pipeline_id', PIPELINE_SETTING_ID)
            .range(offset, offset + BATCH - 1);
          if (batchErr) throw batchErr;
          allOpps = allOpps.concat(batch ?? []);
          keepGoing = (batch?.length ?? 0) === BATCH;
          offset += BATCH;
        }
        const oppsData = allOpps;

        // Fetch tous les rendez-vous "Consultation découverte" (paginated)
        let allAppts = [], apptOffset = 0, apptGoing = true;
        while (apptGoing) {
          const { data: apptBatch, error: apptErr } = await supabase
            .from('ghl_appointments')
            .select('contact_id, start_time, calendar_id')
            .in('calendar_id', CONSULTATION_CALENDAR_IDS)
            .range(apptOffset, apptOffset + BATCH - 1);
          if (apptErr) throw apptErr;
          allAppts = allAppts.concat(apptBatch ?? []);
          apptGoing = (apptBatch?.length ?? 0) === BATCH;
          apptOffset += BATCH;
        }

        // Map contactId → tous ses rendez-vous [{date, iso}]
        const apptsByContact = {};
        allAppts.forEach(appt => {
          if (!appt.contact_id || !appt.start_time) return;
          const d = new Date(appt.start_time);
          if (isNaN(d.getTime())) return;
          if (!apptsByContact[appt.contact_id]) apptsByContact[appt.contact_id] = [];
          apptsByContact[appt.contact_id].push({ date: d, iso: appt.start_time });
        });

        // Trouve le meilleur rendez-vous pour une opportunité :
        // parmi les RDV dans la période, prend le plus proche du created_at de l'opp.
        // Sinon, parmi tous les RDV, prend le plus proche du created_at.
        function bestAppt(opp) {
          const appts = apptsByContact[opp.contact_id] ?? [];
          if (appts.length === 0) return null;
          const inPeriod = appts.filter(a => a.date >= start && a.date <= end);
          const pool = inPeriod.length > 0 ? inPeriod : appts;
          const ref = opp.created_at_ghl ? new Date(opp.created_at_ghl).getTime() : 0;
          return pool.reduce((best, a) =>
            Math.abs(a.date.getTime() - ref) < Math.abs(best.date.getTime() - ref) ? a : best
          );
        }

        // Map oppId → ISO string (pour affichage dans les modals)
        const oppApptMap = {};

        const stagesMap = {};
        (pipelineData?.stages ?? []).forEach(stage => {
          if (stage.id) stagesMap[stage.id] = stage.name;
        });

        const nameLower = memberFullName.toLowerCase();
        let calledCount = 0, bookedCount = 0, showupCount = 0;
        let manuelCount = 0, autoCount = 0, rebookingCount = 0;
        let cancelledCount = 0, noShowCount = 0;
        let wonCount = 0;
        let commissionManuel = 0, commissionAuto = 0, commissionRebook = 0;
        let totalBonus = 0;
        const setterOpps    = [];
        const calledOpps    = [];
        const bookedOpps    = [];
        const manuelOpps    = [];
        const autoOpps      = [];
        const rebookOpps    = [];
        const cancelledOpps = [];
        const noShowOpps    = [];
        const wonOpps       = [];

        (oppsData ?? []).forEach(opp => {
          const raw = opp.raw;

          // Filtre par nom du setter
          const setterName = getField(raw, FIELD_SETTER_NOM);
          if (!setterName || String(setterName).toLowerCase() !== nameLower) return;

          setterOpps.push(opp);

          const stageName       = (stagesMap[opp.pipeline_stage_id] || opp.stage_name || '').toLowerCase();
          const isBookedStage   = stageName.includes('lead rencontre book');
          const isShowupStage   = stageName.includes('show-up confirm');
          const isCancelledStage = stageName.includes('rencontre annul');
          const isNoShowStage   = stageName.includes('no show');
          const isBonusVente    = stageName.includes('bonus vente');

          const typeDeBooking = String(getField(raw, FIELD_TYPE_BOOKING) || '').toLowerCase();

          // Date = meilleur rendez-vous calendrier pour cette opp, sinon date_du_dernier_appel
          const appt      = bestAppt(opp);
          if (appt) oppApptMap[opp.id] = appt.iso;
          const dateField = appt?.date ?? parseGHLDate(getField(raw, FIELD_DATE_PRINCIPALE));

          // ── Total appelés : date principale dans la période ──
          if (dateField && dateField >= start && dateField <= end) {
            calledCount++;
            calledOpps.push(opp);
          }

          // ── Total bookés : "Lead rencontre book", "Show-up Confirmé" OU "bonus vente"
          if (isBookedStage || isShowupStage || isBonusVente) {
            const bookedDate = dateField ?? (opp.created_at_ghl ? new Date(opp.created_at_ghl) : null);
            if (bookedDate && bookedDate >= start && bookedDate <= end) {
              bookedCount++;
              bookedOpps.push(opp);
            }
          }

          // ── Show-ups : stage "Show-up Confirmé", par date principale (date_de_la_rencontre) ──
          if (isShowupStage) {
            const dateRencontre = dateField;
            if (dateRencontre && dateRencontre >= start && dateRencontre <= end) {
              showupCount++;
              if (typeDeBooking === 'manuel') {
                manuelCount++;
                commissionManuel += FLAT_MANUEL;
                manuelOpps.push(opp);
              } else if (typeDeBooking === 'automatique') {
                autoCount++;
                commissionAuto += FLAT_CONFIRM;
                autoOpps.push(opp);
              } else if (typeDeBooking === 'rebooking') {
                rebookingCount++;
                commissionRebook += FLAT_REBOOK;
                rebookOpps.push(opp);
              }
            }
          }

          // ── Rencontre annulée : stage "🔴 rencontre annulé", par date principale ──
          if (isCancelledStage && (typeDeBooking === 'manuel' || typeDeBooking === 'automatique' || typeDeBooking === 'rebooking')) {
            const dateAnnul = dateField ?? (opp.created_at_ghl ? new Date(opp.created_at_ghl) : null);
            if (dateAnnul && dateAnnul >= start && dateAnnul <= end) {
              cancelledCount++;
              cancelledOpps.push(opp);
            }
          }

          // ── No-show : stage "👻 no show", par date principale ──
          if (isNoShowStage && (typeDeBooking === 'manuel' || typeDeBooking === 'automatique' || typeDeBooking === 'rebooking')) {
            const dateNoShow = dateField ?? (opp.created_at_ghl ? new Date(opp.created_at_ghl) : null);
            if (dateNoShow && dateNoShow >= start && dateNoShow <= end) {
              noShowCount++;
              noShowOpps.push(opp);
            }
          }

          // ── Bonus vente : stage "💰 bonus vente" ──
          // Bonus $10 flat filtré par date_de_close
          // + compté dans manuel/auto/rebooking selon type de booking et date RDV calendrier
          if (isBonusVente) {
            const closeDate = parseGHLDate(getField(raw, FIELD_DATE_CLOSE));
            if (closeDate && closeDate >= start && closeDate <= end) {
              wonCount++;
              totalBonus += 10;
              wonOpps.push(opp);
            }
            if (dateField && dateField >= start && dateField <= end) {
              showupCount++;
              if (typeDeBooking === 'manuel') {
                manuelCount++;
                commissionManuel += FLAT_MANUEL;
                manuelOpps.push(opp);
              } else if (typeDeBooking === 'automatique') {
                autoCount++;
                commissionAuto += FLAT_CONFIRM;
                autoOpps.push(opp);
              } else if (typeDeBooking === 'rebooking') {
                rebookingCount++;
                commissionRebook += FLAT_REBOOK;
                rebookOpps.push(opp);
              }
            }
          }
        });

        const totalShowups = commissionManuel + commissionAuto + commissionRebook;

        // Tri décroissant par date de rendez-vous (ou date_de_close pour les ventes)
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

        setData({
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
        });

      } catch (err) {
        console.error("Erreur lors du calcul des commissions:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchCommissions();
  }, [memberFullName, startDate, endDate, refreshKey]);

  return { data, loading, error, refresh };
}
