-- Rôles secondaires : un membre peut cumuler des rôles (ex: naturopathe + closer)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS secondary_roles text[] DEFAULT '{}';

-- Index GIN pour filtrer efficacement par rôle secondaire
CREATE INDEX IF NOT EXISTS idx_profiles_secondary_roles ON profiles USING GIN (secondary_roles);
