#!/usr/bin/env bash
# Tarefas de coleta do Nexo na VPS (chamadas por systemd: nexo-job@<tarefa>.service).
# Instalado em /srv/nexo/bin/job.sh por ops/vps/deploy.sh.
set -uo pipefail

APP=/srv/nexo/app
FLOOR=${NEXO_FLOOR:-2025-11-14}   # carga histórica: 12 meses

# O diretório do app é trocado a cada deploy, então entra nele a cada chamada (não só no início).
run()   { (cd "$APP" && node --env-file=/srv/nexo/.env --conditions=react-server --import tsx "$@"); }
# O PNCP limita por IP (HTTP 429): o limitador compartilhado em src/lib/pncp-throttle.ts regula todas as chamadas, de todos os serviços.
pncp_headers() { run "$@"; }
pncp_items()   { run "$@"; }

# Serviço de itens do PNCP fora do ar (disjuntor aberto)? As fases de itens esperam; cabeçalhos seguem.
items_down() { run scripts/pncp-circuit.ts >/dev/null 2>&1; [ $? -eq 10 ]; }

summary='import sys,json
t=sys.stdin.read()
try:
  d=json.loads(t[t.index("{"):])
  if "runs" in d:
    r=[x for run in d["runs"] for x in run["results"]]
    print(sys.argv[1], "processadas", sum(x["processed"] for x in r), "novas", sum(x["inserted"] for x in r), "erros", sum(x.get("errors",0) for x in r))
  else:
    print(sys.argv[1], "processadas", d.get("processed"), "novas", d.get("inserted"), "erros", d.get("errors"), "cursor", d.get("cursor",{}).get("endDate"), d.get("cursor",{}).get("modalityIndex"), "complete" if d.get("cursor",{}).get("complete") else "")
except Exception: print(sys.argv[1], t[-300:])'

case "$1" in
  mirror-PNCP)
    # Espelho em tempo real: só HOJE a cada ciclo (barato); ontem e anteontem só de vez em quando, porque já estão fechados.
    # Assim a maior parte do orçamento de chamadas do PNCP fica para o histórico. Fase 1 = cabeçalhos; fase 2 = itens do que é novo/mudou.
    cycle=0
    while true; do
      today=$(TZ=America/Sao_Paulo date +%F)
      days="$today"
      if [ $((cycle % 12)) -eq 0 ]; then days="$(TZ=America/Sao_Paulo date -d '-2 day' +%F) $(TZ=America/Sao_Paulo date -d '-1 day' +%F) $today"; fi
      for day in $days; do
        SYNC_MAX_PAGES=500 SYNC_PAGE_SIZE=50 SYNC_WITH_ITEMS=false SYNC_SKIP_UNCHANGED=false         SYNC_MODALITY_CONCURRENCY=1 SYNC_MODALITY_DELAY_MS=0 SYNC_PAGE_DELAY_MS=0           pncp_headers scripts/sync-procurements.ts --provider=PNCP --start=$day --end=$day 2>&1 | python3 -c "$summary" "espelho-cabecalhos $day:"
        if items_down; then echo "espelho-itens $day: serviço de itens do PNCP fora do ar, pulando"; continue; fi
        SYNC_MAX_PAGES=500 SYNC_PAGE_SIZE=50 SYNC_WITH_ITEMS=true SYNC_SKIP_UNCHANGED=true         SYNC_MODALITY_CONCURRENCY=1 SYNC_MODALITY_DELAY_MS=0 SYNC_PAGE_DELAY_MS=0           pncp_items scripts/sync-procurements.ts --provider=PNCP --start=$day --end=$day 2>&1 | python3 -c "$summary" "espelho-itens $day:"
      done
      cycle=$((cycle + 1))
      sleep 30
    done ;;
  mirror-COMPRAS_GOV)
    while true; do
      for items in false true; do
        SYNC_LOOKBACK_DAYS=3 SYNC_MAX_PAGES=500 SYNC_PAGE_SIZE=500 SYNC_WITH_ITEMS=$items SYNC_SKIP_UNCHANGED=$items \
        SYNC_MODALITY_CONCURRENCY=2 SYNC_MODALITY_DELAY_MS=500 SYNC_PAGE_DELAY_MS=250 \
          run scripts/sync-procurements.ts --provider=COMPRAS_GOV 2>&1 | python3 -c "$summary" "compras itens=$items:"
      done
      sleep 60
    done ;;
  backfill-PNCP|backfill-COMPRAS_GOV)
    # Histórico só de cabeçalhos, do mais novo para o mais antigo (cobertura rápida). Itens vêm em backfill-items-*.
    p=${1#backfill-}
    if [ "$p" = PNCP ]; then call=pncp_headers; else call=run; fi
    while true; do
      out=$(BACKFILL_MIN_DATE=$FLOOR BACKFILL_WITH_ITEMS=false BACKFILL_WINDOW_DAYS=1 BACKFILL_CHUNKS_PER_RUN=4 BACKFILL_PAGE_DELAY_MS=1200 BACKFILL_START_OFFSET_DAYS=$([ "$p" = COMPRAS_GOV ] && echo 0 || echo 3) \
        $call scripts/backfill-procurements.ts --provider=$p 2>&1)
      echo "$out" | python3 -c "$summary" "histórico-cabecalhos $p:"
      case "$out" in *'"complete":true'*) echo "$p cabeçalhos concluído"; exit 0;; esac
      case "$out" in *'"processed"'*) sleep 2;; *) sleep 30;; esac
    done ;;
  backfill-items-PNCP)
    # Histórico com itens: percorre os dias de novo e só busca itens do que ainda não tem.
    while true; do
      if items_down; then echo "histórico-itens PNCP: serviço de itens do PNCP fora do ar, aguardando"; sleep 120; continue; fi
      out=$(BACKFILL_STATE_SUFFIX=_ITEMS BACKFILL_MIN_DATE=$FLOOR BACKFILL_WITH_ITEMS=true BACKFILL_SKIP_UNCHANGED=true BACKFILL_WINDOW_DAYS=1 BACKFILL_CHUNKS_PER_RUN=2 BACKFILL_PAGE_DELAY_MS=1200 BACKFILL_START_OFFSET_DAYS=3 \
        pncp_items scripts/backfill-procurements.ts --provider=PNCP 2>&1)
      echo "$out" | python3 -c "$summary" "histórico-itens PNCP:"
      case "$out" in *'"complete":true'*) echo "itens PNCP concluído"; exit 0;; esac
      case "$out" in *'"processed"'*) sleep 2;; *) sleep 30;; esac
    done ;;
  backfill-results)
    while true; do
      out=$(RESULT_BACKFILL_MIN_DATE=$FLOOR RESULT_BACKFILL_WINDOW_DAYS=7 RESULT_BACKFILL_WINDOWS_PER_RUN=4 RESULT_BACKFILL_MAX_PAGES=10 RESULT_BACKFILL_PAGE_SIZE=250 RESULT_BACKFILL_HYDRATE_LIMIT=100 RESULT_BACKFILL_PAGE_DELAY_MS=500 \
        run scripts/sync-procurement-results.ts --backfill 2>&1)
      echo "$out" | tail -c 300
      case "$out" in *'"complete":true'*) echo "resultados concluído"; exit 0;; esac
      sleep 10
    done ;;
  groups)             run scripts/build-product-groups.ts ;;   # agrupa itens equivalentes por produto/nicho (incremental)
  groups-reclassify)  run scripts/build-product-groups.ts --reclassify ;;   # reaplica nichos e nomes sem refazer o agrupamento
  recent-results)     RESULT_SYNC_LOOKBACK_DAYS=30 RESULT_SYNC_MAX_PAGES=4 RESULT_SYNC_PAGE_SIZE=250 RESULT_SYNC_HYDRATE_LIMIT=40 RESULT_SYNC_PAGE_DELAY_MS=300 run scripts/sync-procurement-results.ts ;;
  watchdog)           SYNC_WATCHDOG_STALE_MINUTES=30 pncp_headers scripts/sync-watchdog.ts ;;
  daily)
    run scripts/sync-rj-siga.ts; run scripts/sync-rj-siga-items.ts; run scripts/sync-geography.ts
    run scripts/sync-catalog.ts || true ;;
  *) echo "tarefa desconhecida: $1"; exit 2 ;;
esac
