#!/usr/bin/env bash
# Preenchimento histórico em laço, retomável (o cursor fica em procurement_sync_state).
# Uso: bash scripts/backfill-loop.sh PNCP|COMPRAS_GOV [env-file]
# Variáveis úteis: BACKFILL_MIN_DATE (piso, padrão 2025-11-14), BACKFILL_WITH_ITEMS (padrão true).
provider="${1:-PNCP}"
envfile="${2:-.env.production.local}"
export BACKFILL_MIN_DATE="${BACKFILL_MIN_DATE:-2025-11-14}"
export BACKFILL_WITH_ITEMS="${BACKFILL_WITH_ITEMS:-true}"
export BACKFILL_WINDOW_DAYS="${BACKFILL_WINDOW_DAYS:-1}"
export BACKFILL_CHUNKS_PER_RUN="${BACKFILL_CHUNKS_PER_RUN:-12}"
while true; do
  out=$(node --env-file="$envfile" --conditions=react-server --import tsx scripts/backfill-procurements.ts --provider="$provider" 2>&1)
  echo "$(date +%H:%M:%S) $provider $out" | cut -c1-400
  case "$out" in
    *'"complete":true'*) echo "$provider concluído"; break;;
  esac
  case "$out" in
    *'"processed"'*) ;;
    *) sleep 30;;
  esac
done
