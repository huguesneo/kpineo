#!/usr/bin/env bash
# Teste les migrations du module Montage vidéo dans un Postgres LOCAL jetable.
# Usage : PGHOST=/chemin/socket PGPORT=5432 PGUSER=postgres ./run.sh
# Crée la base « montage_test », applique l'imitation Supabase, les migrations
# 20261002112114, 20261002112126 et 20261003a (deux fois, pour vérifier qu'elles se rejouent), puis les tests,
# puis les templates de départ (20261003b, deux fois) et leurs tests, puis ceux de l'éditeur,
# puis les clips (20261003c puis 20261003f, deux fois chacune, sur des montages existants : backfill) et leurs tests,
# puis les templates proposés (20261003d, deux fois) et leurs tests,
# puis les variantes (20261003e, deux fois) et leurs tests,
# puis l'annulation (20261003g, deux fois) et ses tests,
# puis la corbeille (20261003h, deux fois) et ses tests.
# Refuse de tourner sur un hôte Supabase : ne sert jamais en production.
set -euo pipefail

if [[ "${PGHOST:-}" == *supabase* || "${DATABASE_URL:-}" == *supabase* ]]; then
  echo "Refusé : ce script sert seulement à un Postgres local." >&2
  exit 1
fi

ICI="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS=("$ICI/../../migrations/20261002112114_montage_video.sql" "$ICI/../../migrations/20261002112126_montage_video_ajouts.sql" "$ICI/../../migrations/20261003a_montage_video_style_enregistre.sql")
DEPART="$ICI/../../migrations/20261003b_montage_video_templates_depart.sql"
CLIPS="$ICI/../../migrations/20261003c_montage_video_clips.sql"
CLIPS_APRES_V1="$ICI/../../migrations/20261003f_montage_video_clips_apres_v1.sql"
PROPOSES="$ICI/../../migrations/20261003d_montage_video_templates_proposes.sql"
VARIANTES="$ICI/../../migrations/20261003e_montage_video_variantes.sql"
ANNULATION="$ICI/../../migrations/20261003g_montage_video_annulation.sql"
CORBEILLE="$ICI/../../migrations/20261003h_montage_video_corbeille.sql"
BASE=montage_test

psql -q -d postgres -c "DROP DATABASE IF EXISTS $BASE" -c "CREATE DATABASE $BASE"
P="psql -q -v ON_ERROR_STOP=1 -d $BASE"
$P -f "$ICI/00_stub_supabase.sql" 2>&1 | grep -v -e WARNING -e HINT || true
for M in "${MIGRATIONS[@]}"; do
  $P -f "$M" >/dev/null 2>&1 || { echo "La migration échoue (1re passe) : $M" >&2; $P -f "$M"; exit 1; }
done
for M in "${MIGRATIONS[@]}"; do
  $P -f "$M" >/dev/null 2>&1 || { echo "La migration ne se rejoue pas (2e passe) : $M" >&2; exit 1; }
done

SORTIE="$($P -f "$ICI/10_tests_rls.sql" 2>&1)"
for _ in 1 2; do
  $P -f "$DEPART" >/dev/null 2>&1 || { echo "Les templates de départ ne s'insèrent pas : $DEPART" >&2; $P -f "$DEPART"; exit 1; }
done
SORTIE="$SORTIE
$($P -f "$ICI/20_tests_templates_depart.sql" 2>&1)"
SORTIE="$SORTIE
$($P -f "$ICI/30_tests_editeur.sql" 2>&1)"
for _ in 1 2; do
  $P -f "$CLIPS" >/dev/null 2>&1 || { echo "La migration des clips échoue : $CLIPS" >&2; $P -f "$CLIPS"; exit 1; }
done
for _ in 1 2; do
  $P -f "$CLIPS_APRES_V1" >/dev/null 2>&1 || { echo "La migration des clips après la v1 échoue : $CLIPS_APRES_V1" >&2; $P -f "$CLIPS_APRES_V1"; exit 1; }
done
SORTIE="$SORTIE
$($P -f "$ICI/40_tests_clips.sql" 2>&1)"
for _ in 1 2; do
  $P -f "$PROPOSES" >/dev/null 2>&1 || { echo "La migration des templates proposés échoue : $PROPOSES" >&2; $P -f "$PROPOSES"; exit 1; }
done
SORTIE="$SORTIE
$($P -f "$ICI/50_tests_templates_proposes.sql" 2>&1)"
for _ in 1 2; do
  $P -f "$VARIANTES" >/dev/null 2>&1 || { echo "La migration des variantes échoue : $VARIANTES" >&2; $P -f "$VARIANTES"; exit 1; }
done
SORTIE="$SORTIE
$($P -f "$ICI/60_tests_variantes.sql" 2>&1)"
for _ in 1 2; do
  $P -f "$ANNULATION" >/dev/null 2>&1 || { echo "La migration de l'annulation échoue : $ANNULATION" >&2; $P -f "$ANNULATION"; exit 1; }
done
SORTIE="$SORTIE
$($P -f "$ICI/70_tests_annulation.sql" 2>&1)"
for _ in 1 2; do
  $P -f "$CORBEILLE" >/dev/null 2>&1 || { echo "La migration de la corbeille échoue : $CORBEILLE" >&2; $P -f "$CORBEILLE"; exit 1; }
done
SORTIE="$SORTIE
$($P -f "$ICI/80_tests_corbeille.sql" 2>&1)"
echo "$SORTIE" | sed '/^$/d'
PASS=$(grep -c '^ PASS' <<<"$SORTIE" || true)
FAIL=$(grep -cE '^ FAIL|ERROR' <<<"$SORTIE" || true)
echo
echo "PASS: $PASS  FAIL: $FAIL"
psql -q -d postgres -c "DROP DATABASE $BASE"
[[ "$FAIL" -eq 0 ]]
