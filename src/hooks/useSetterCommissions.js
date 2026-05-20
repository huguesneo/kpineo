import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const PIPELINE_SETTING_ID    = "3C5ggTxPoWBmiFAPlCKn";

// IDs de champs GHL (confirmés via inspection DB)
const FIELD_SETTER_NOM       = "II5NrZGZrIScYItkxCi8"; // setter__nom
const FIELD_TYPE_BOOKING     = "YbAB98KAINZM7vzebAKh"; // setter__type_de_booking (Manuel/Automatique/Rebooking)
const FIELD_DATE_CLOSE       = "UPqvJX8MkZ4thsPX2tjV"; // date_de_close (timestamp Unix ms)
const FIELD_BONUS_VENTE      = "sMwYAtL24soFUoWyBQ0p"; // setter__bonus_vente (montant $)
// Champ date principal : stocke date_du_dernier_appel pour les appelés,
// et date_de_la_rencontre pour les show-ups (même champ GHL, valeur contextuelle)
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
    wonCount: 0,
    commissionManuel: 0,
    commissionAuto: 0,
    commissionRebook: 0,
    totalShowups: 0,
    totalBonus: 0,
    totalPay: 0,
    opportunities: [],
    calledOpps: [],
    bookedOpps: [],
    manuelOpps: [],
    autoOpps: [],
    rebookOpps: [],
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

        const stagesMap = {};
        (pipelineData?.stages ?? []).forEach(stage => {
          if (stage.id) stagesMap[stage.id] = stage.name;
        });

        const nameLower = memberFullName.toLowerCase();
        let calledCount = 0, bookedCount = 0, showupCount = 0;
        let manuelCount = 0, autoCount = 0, rebookingCount = 0;
        let wonCount = 0;
        let commissionManuel = 0, commissionAuto = 0, commissionRebook = 0;
        let totalBonus = 0;
        const setterOpps   = [];
        const calledOpps   = [];
        const bookedOpps   = [];
        const manuelOpps   = [];
        const autoOpps     = [];
        const rebookOpps   = [];
        const wonOpps      = [];

        (oppsData ?? []).forEach(opp => {
          const raw = opp.raw;

          // Filtre par nom du setter
          const setterName = getField(raw, FIELD_SETTER_NOM);
          if (!setterName || String(setterName).toLowerCase() !== nameLower) return;

          setterOpps.push(opp);

          const stageName     = (stagesMap[opp.pipeline_stage_id] || opp.stage_name || '').toLowerCase();
          const isBookedStage = stageName.includes('lead rencontre book');
          const isShowupStage = stageName.includes('show-up confirm');
          const isBonusVente  = stageName.includes('bonus vente');

          const typeDeBooking = String(getField(raw, FIELD_TYPE_BOOKING) || '').toLowerCase();

          // Champ date principal (date_du_dernier_appel / date_de_la_rencontre selon le stage)
          const dateField = parseGHLDate(getField(raw, FIELD_DATE_PRINCIPALE));

          // ── Total appelés : date principale dans la période ──
          if (dateField && dateField >= start && dateField <= end) {
            calledCount++;
            calledOpps.push(opp);
          }

          // ── Total bookés : stage "Lead rencontre book" OU "Show-up Confirmé"
          //    Date = Date du dernier appel si dispo, sinon created_at_ghl ──
          if (isBookedStage || isShowupStage) {
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

          // ── Bonus vente : stage "💰 bonus vente", par date_de_close ──
          if (isBonusVente) {
            const closeDate = parseGHLDate(getField(raw, FIELD_DATE_CLOSE));
            if (closeDate && closeDate >= start && closeDate <= end) {
              wonCount++;
              totalBonus += Number(getField(raw, FIELD_BONUS_VENTE) || 0);
              wonOpps.push(opp);
            }
          }
        });

        const totalShowups = commissionManuel + commissionAuto + commissionRebook;

        setData({
          calledCount,
          bookedCount,
          showupCount,
          manuelCount,
          autoCount,
          rebookingCount,
          wonCount,
          commissionManuel,
          commissionAuto,
          commissionRebook,
          totalShowups,
          totalBonus,
          totalPay: totalShowups + totalBonus,
          opportunities: setterOpps,
          calledOpps,
          bookedOpps,
          manuelOpps,
          autoOpps,
          rebookOpps,
          wonOpps,
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
