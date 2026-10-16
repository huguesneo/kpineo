-- Rencontre de décision : le formulaire se préremplit avec la fiche de la
-- rencontre précédente du même contact (souvent la découverte). Les closeurs
-- ne lisent que leurs propres lignes de sale_call_notes (RLS) : cette fonction
-- rend seulement la dernière fiche remplie du contact, à l'équipe de vente.
-- Purement additif. Annulation : supabase/rollback/20261016d_sale_call_notes_precedentes_rollback.sql
CREATE OR REPLACE FUNCTION public.sale_call_notes_precedentes(p_contact_id text, p_exclure text)
RETURNS TABLE (qualification jsonb, appointment_ghl_id text, mis_a_jour timestamptz, auteur text, debut_rdv timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT n.qualification, n.appointment_ghl_id, n.updated_at, p.full_name,
         (SELECT a.start_time FROM public.ghl_appointments a WHERE a.ghl_id = n.appointment_ghl_id LIMIT 1)
  FROM public.sale_call_notes n
  LEFT JOIN public.profiles p ON p.id = n.user_id
  WHERE public.is_vente_ou_admin()
    AND p_contact_id IS NOT NULL AND n.contact_id = p_contact_id
    AND n.appointment_ghl_id IS DISTINCT FROM p_exclure
    AND n.qualification IS NOT NULL AND n.qualification <> '{}'::jsonb
  ORDER BY n.updated_at DESC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.sale_call_notes_precedentes(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sale_call_notes_precedentes(text, text) TO authenticated;
