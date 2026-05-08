import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const PIPELINE_SETTING_ID = "3C5ggTxPoWBmiFAPlCKn";

// IDs des champs custom GHL (confirmés via raw JSON)
const FIELD_SETTER_NOM    = "II5NrZGZrIScYItkxCi8"; // setter__nom
const FIELD_TYPE_BOOKING  = "YbAB98KAINZM7vzebAKh"; // setter__type_de_booking
const FIELD_DATE_CLOSE    = "UPqvJX8MkZ4thsPX2tjV"; // date_de_close (timestamp Unix)
const FIELD_BONUS_VENTE   = "ID_A_REMPLIR";          // setter__bonus_vente (à remplir)

// Montants flat hardcodés (logique métier)
const FLAT_MANUEL  = 40;
const FLAT_CONFIRM = 20;
const FLAT_REBOOK  = 20;

// GHL stocke par `id`, pas par `key`
function getFieldById(rawObj, fieldId) {
  if (!rawObj?.customFields || fieldId === 'ID_A_REMPLIR') return null;
  const field = rawObj.customFields.find(f => f.id === fieldId);
  if (!field) return null;
  return field.fieldValueNumber ?? field.fieldValueString ?? field.fieldValueDate ?? null;
}

export function useSetterCommissions(memberFullName, startDate, endDate) {
  const [data, setData] = useState({
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

        const [{ data: pipelineData, error: pipeError }, { data: oppsData, error: oppsError }] = await Promise.all([
          supabase.from('ghl_pipelines').select('stages').eq('ghl_id', PIPELINE_SETTING_ID).single(),
          supabase.from('ghl_opportunities').select('*').eq('pipeline_id', PIPELINE_SETTING_ID),
        ]);

        if (pipeError) throw pipeError;
        if (oppsError) throw oppsError;

        // Map stageId → stageName depuis le pipeline
        const stagesMap = {};
        (pipelineData?.stages ?? []).forEach(stage => {
          if (stage.id) stagesMap[stage.id] = stage.name;
        });

        const nameLower = memberFullName.toLowerCase();
        let bookedCount = 0, showupCount = 0;
        let manuelCount = 0, autoCount = 0, rebookingCount = 0;
        let wonCount = 0;
        let commissionManuel = 0, commissionAuto = 0, commissionRebook = 0;
        let totalBonus = 0;
        const setterOpps = [];

        oppsData.forEach(opp => {
          const raw = opp.raw;

          // Filtre par setter nom (via ID de champ)
          const setterName = getFieldById(raw, FIELD_SETTER_NOM);
          if (!setterName || String(setterName).toLowerCase() !== nameLower) return;

          setterOpps.push(opp);

          // Résolution du stage depuis le pipeline (stage_name en DB est souvent vide)
          const stageName     = (stagesMap[opp.pipeline_stage_id] || opp.stage_name || '').toLowerCase();
          const isShowupStage = stageName.includes('show-up confirm') || stageName.includes('bonus vente');
          const isWonStage    = stageName.includes('bonus vente');

          const typeDeBooking = String(getFieldById(raw, FIELD_TYPE_BOOKING) || '').toLowerCase();
          // La prequal est un checkbox GHL — si absent des customFields, considéré non-coché
          const prequelOui = false; // TODO: ajouter FIELD_PREQUAL quand l'ID est connu

          // Books : comptés à la date de création
          if (opp.created_at_ghl) {
            const createdDate = new Date(opp.created_at_ghl);
            if (createdDate >= start && createdDate <= end) {
              bookedCount++;

              // Show-ups dans stage show-up, créés dans la période
              if (isShowupStage) {
                showupCount++;

                if (typeDeBooking === 'manuel') {
                  manuelCount++;
                  commissionManuel += FLAT_MANUEL;
                } else if (typeDeBooking === 'automatique' && prequelOui) {
                  autoCount++;
                  commissionAuto += FLAT_CONFIRM;
                } else if (typeDeBooking === 'rebooking' && prequelOui) {
                  rebookingCount++;
                  commissionRebook += FLAT_REBOOK;
                }
              }
            }
          }

          // Ventes : stage bonus vente, date de close dans la période
          if (isWonStage) {
            const closeDateRaw = getFieldById(raw, FIELD_DATE_CLOSE);
            if (closeDateRaw) {
              const closeDate = new Date(Number(closeDateRaw));
              if (!isNaN(closeDate.getTime()) && closeDate >= start && closeDate <= end) {
                wonCount++;
                totalBonus += Number(getFieldById(raw, FIELD_BONUS_VENTE) || 0);
              }
            }
          }
        });

        const totalShowups = commissionManuel + commissionAuto + commissionRebook;

        setData({
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
        });

      } catch (err) {
        console.error("Erreur lors du calcul des commissions:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchCommissions();
  }, [memberFullName, startDate, endDate]);

  return { data, loading, error };
}
