import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { computeSetterCommissions } from '../lib/commissions/setterCommissions';
import { loadSetterCommissionData } from '../lib/commissions/loadSetterData';

// Toute la logique de paie vit dans src/lib/commissions/setterCommissions.js
// (moteur unique, testé contre les paies réellement versées). Ce hook ne fait
// que charger les données et appeler le moteur.

const EMPTY = {
  calledCount: 0, bookedCount: 0, showupCount: 0,
  manuelCount: 0, autoCount: 0, rebookingCount: 0,
  cancelledCount: 0, noShowCount: 0, wonCount: 0,
  commissionManuel: 0, commissionAuto: 0, commissionRebook: 0,
  totalShowups: 0, totalBonus: 0, totalPay: 0,
  apptMap: {}, opportunities: [],
  calledOpps: [], bookedOpps: [], manuelOpps: [], autoOpps: [], rebookOpps: [],
  cancelledOpps: [], noShowOpps: [], wonOpps: [],
  lignes: [], lignesShowupZero: [],
};

export function useSetterCommissions(memberFullName, startDate, endDate) {
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey(k => k + 1);

  const forcedKey = useRef(0); // dernier « Actualiser » déjà servi
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!memberFullName || !startDate || !endDate) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const force = refreshKey !== forcedKey.current;
        forcedKey.current = refreshKey;
        const raw = await loadSetterCommissionData(supabase, { force });
        if (cancelled) return;
        setData(computeSetterCommissions({ ...raw, setterName: memberFullName, start: startDate, end: endDate }));
      } catch (err) {
        console.error('Erreur lors du calcul des commissions:', err);
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [memberFullName, startDate, endDate, refreshKey]);

  return { data, loading, error, refresh };
}
