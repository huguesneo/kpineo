-- Migration 023 : ajout des rôles "service_client" et "resp_vente"
-- À exécuter dans Supabase SQL Editor

-- 1. Supprimer l'ancienne contrainte
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Recréer la contrainte avec les nouveaux rôles inclus
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'naturopathe',
    'closer',
    'setter',
    'service_client',
    'resp_vente',
    'admin'
  ));
