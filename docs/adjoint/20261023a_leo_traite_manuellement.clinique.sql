-- Projet Clinique (caogpyephqaohnbydvuc), PAS neo-admin : trace seulement.
-- Appliquée par Hugues le 23 oct. 2026, 13 h 30. Ne pas relancer.
-- Ajoute decision = 'traite_manuellement' (« Déjà traité à la main » dans la page Adjoint du hub).
-- Les skills de Léo ont été mis à jour en même temps.
alter table public.leo_service_interactions drop constraint if exists leo_service_interactions_decision_check;
alter table public.leo_service_interactions add constraint leo_service_interactions_decision_check
  check (decision = any (array['pending', 'approved_as_is', 'approved_modified', 'modified', 'rejected', 'auto_envoye', 'traite_manuellement']));
