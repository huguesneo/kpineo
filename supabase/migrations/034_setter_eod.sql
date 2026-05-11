-- ── Setter EOD — policies UPDATE + index unicité ────────────────────────────
--
-- Un setter peut soumettre UN seul rapport par jour (upsert côté client).
-- On ajoute aussi la politique UPDATE pour permettre la correction du rapport
-- de la journée en cours.
--

-- Unique index : un rapport par (user_id, report_date)
CREATE UNIQUE INDEX IF NOT EXISTS end_of_day_reports_user_date_uniq
  ON public.end_of_day_reports (user_id, report_date);

-- Membre peut mettre à jour son propre rapport
CREATE POLICY "Membre met à jour ses propres rapports" ON public.end_of_day_reports
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
