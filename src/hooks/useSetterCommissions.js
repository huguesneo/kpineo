import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Constantes des IDs GoHighLevel
const PIPELINE_SETTING_ID = "3C5ggTxPoWBmiFAPlCKn";
const FIELD_SETTER_NOM = "II5NrZGZrIScYItkxCi8";
const FIELD_COMMISSION_SHOWUP = "sMwYAtL24soFUoWyBQ0p";
const FIELD_DATE_CLOSE = "UPqvJX8MkZ4thsPX2tjV";
const FIELD_BONUS_VENTE = "ID_A_REMPLIR"; // Remplacer par le vrai ID plus tard

/**
 * Extrait la valeur d'un champ personnalisé depuis l'objet raw GHL
 */
function getCustomFieldValue(rawObj, fieldId) {
  if (!rawObj || !rawObj.customFields) return null;
  
  const field = rawObj.customFields.find(f => f.id === fieldId);
  if (!field) return null;

  // L'API GHL type fortement la réponse, on prend la première valeur existante
  return field.fieldValueNumber ?? field.fieldValueString ?? field.fieldValueDate ?? null;
}

// NOUVEAU : On utilise startDate et endDate au lieu de month et year
export function useSetterCommissions(memberFullName, startDate, endDate) {
  const [data, setData] = useState({
    bookedCount: 0,
    showupCount: 0,
    wonCount: 0,
    totalShowups: 0,
    totalBonus: 0,
    totalPay: 0,
    opportunities: []
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchCommissions() {
      // NOUVEAU : On vérifie les nouvelles variables
      if (!memberFullName || !startDate || !endDate) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // NOUVEAU : Création des objets Date pour comparer précisément (de 00h00 à 23h59)
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T23:59:59');

        // 1. Récupérer le pipeline pour mapper les IDs d'étapes à leurs noms
        const { data: pipelineData, error: pipeError } = await supabase
          .from('ghl_pipelines')
          .select('stages')
          .eq('ghl_id', PIPELINE_SETTING_ID)
          .single();

        if (pipeError) throw pipeError;

        const stagesMap = {};
        if (pipelineData?.stages) {
          pipelineData.stages.forEach(stage => {
            stagesMap[stage.id] = stage.name;
          });
        }

        // 2. Récupérer toutes les opportunités du pipeline Setting
        const { data: oppsData, error: oppsError } = await supabase
          .from('ghl_opportunities')
          .select('*')
          .eq('pipeline_id', PIPELINE_SETTING_ID);

        if (oppsError) throw oppsError;

        const nameLower = memberFullName.toLowerCase();
        let bookedCount = 0;
        let showupCount = 0;
        let wonCount = 0;
        let totalShowups = 0;
        let totalBonus = 0;
        const setterOpps = [];

        // 3. Filtrer et calculer les métriques
        oppsData.forEach(opp => {
          const raw = opp.raw;
          
          // Vérifier si cette opportunité appartient au Setter
          const setterName = getCustomFieldValue(raw, FIELD_SETTER_NOM);
          if (!setterName || String(setterName).toLowerCase() !== nameLower) {
            return;
          }

          setterOpps.push(opp);

          // Résoudre le vrai nom de l'étape
          const stageName = (stagesMap[opp.pipeline_stage_id] || '').toLowerCase();
          
          const isShowupStage = stageName.includes('show-up confirm') || stageName.includes('bonus vente');
          const isWonStage = stageName.includes('bonus vente');

          // Vérifier la création pour les Books et Show-ups (basé sur created_at_ghl)
          if (opp.created_at_ghl) {
            const createdDate = new Date(opp.created_at_ghl);
            // NOUVEAU : On vérifie si la date tombe DANS l'intervalle sélectionné
            const isCreatedInPeriod = createdDate >= start && createdDate <= end;

            if (isCreatedInPeriod) {
              bookedCount++; // Ajout aux books de la période

              if (isShowupStage) {
                showupCount++;
                const showupCom = Number(getCustomFieldValue(raw, FIELD_COMMISSION_SHOWUP) || 0);
                totalShowups += showupCom;
              }
            }
          }

          // Vérifier le Won (basé sur le champ custom FIELD_DATE_CLOSE en timestamp Unix)
          if (isWonStage) {
            const closeDateMs = getCustomFieldValue(raw, FIELD_DATE_CLOSE);
            if (closeDateMs) {
              // Convertir le timestamp Unix en Date locale
              const closeDate = new Date(Number(closeDateMs));
              
              // NOUVEAU : On vérifie si la date tombe DANS l'intervalle sélectionné
              if (closeDate >= start && closeDate <= end) {
                wonCount++;
                const bonusCom = Number(getCustomFieldValue(raw, FIELD_BONUS_VENTE) || 0);
                totalBonus += bonusCom;
              }
            }
          }
        });

        // 4. Mettre à jour l'état final
        setData({
          bookedCount,
          showupCount,
          wonCount,
          totalShowups,
          totalBonus,
          totalPay: totalShowups + totalBonus,
          opportunities: setterOpps
        });

      } catch (err) {
        console.error("Erreur lors du calcul des commissions:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchCommissions();
  }, [memberFullName, startDate, endDate]); // NOUVEAU : mise à jour des dépendances

  return { data, loading, error };
}