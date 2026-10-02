-- Terminal : hugues@ et info@ voient toutes les ventes de tout le monde
CREATE POLICY "Superviseurs lisent tous les plans" ON public.payment_plans FOR SELECT TO authenticated
  USING (lower(auth.jwt()->>'email') IN ('hugues@neoperformance.ca','info@neoperformance.ca'));
CREATE POLICY "Superviseurs lisent tous les versements" ON public.payment_installments FOR SELECT TO authenticated
  USING (lower(auth.jwt()->>'email') IN ('hugues@neoperformance.ca','info@neoperformance.ca'));
