-- Migration 024 : permettre à tous les membres authentifiés de lire
-- les points de l'équipe (pour le classement / leaderboard boutique)

CREATE POLICY "Membres voient les points de l'équipe" ON public.user_points
  FOR SELECT
  USING (auth.role() = 'authenticated');
