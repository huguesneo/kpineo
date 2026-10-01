#!/usr/bin/env bash
# Teste la migration du module Montage vidéo dans un Postgres LOCAL jetable.
# Usage : PGHOST=/chemin/socket PGPORT=5432 PGUSER=postgres ./run.sh
# Crée la base « montage_test », applique l'imitation Supabase, la migration
# (deux fois, pour vérifier qu'elle se rejoue), puis les tests.
# Refuse de tourner sur un hôte Supabase : ne sert jamais en production.
set -euo pipefail

if [[ "${PGHOST:-}" == *supabase* || "${DATABASE_URL:-}" == *supabase* ]]; then
  echo "Refusé : ce script sert seulement à un Postgres local." >&2
  exit 1
fi

ICI="$(cd "$(dirname "$0")" && pwd)"
MIGRATION="$ICI/../../migrations/20261001e_montage_video.sql"
BASE=montage_test

psql -q -d postgres -c "DROP DATABASE IF EXISTS $BASE" -c "CREATE DATABASE $BASE"
P="psql -q -v ON_ERROR_STOP=1 -d $BASE"
$P -f "$ICI/00_stub_supabase.sql" 2>&1 | grep -v -e WARNING -e HINT || true
$P -f "$MIGRATION" >/dev/null 2>&1 || { echo "La migration échoue (1re passe)" >&2; $P -f "$MIGRATION"; exit 1; }
$P -f "$MIGRATION" >/dev/null 2>&1 || { echo "La migration ne se rejoue pas (2e passe)" >&2; exit 1; }

SORTIE="$($P -f "$ICI/10_tests_rls.sql" 2>&1)"
echo "$SORTIE" | sed '/^$/d'
PASS=$(grep -c '^ PASS' <<<"$SORTIE" || true)
FAIL=$(grep -cE '^ FAIL|ERROR' <<<"$SORTIE" || true)
echo
echo "PASS: $PASS  FAIL: $FAIL"
psql -q -d postgres -c "DROP DATABASE $BASE"
[[ "$FAIL" -eq 0 ]]
