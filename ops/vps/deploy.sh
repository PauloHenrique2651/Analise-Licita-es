#!/usr/bin/env bash
# Publica /srv/nexo/release.tar.gz na VPS: instala, compila, migra e troca a versão sem deixar o app fora do ar durante o build.
# Os serviços de coleta NÃO são reiniciados: job.sh entra em /srv/nexo/app a cada chamada e pega o código novo no próximo ciclo.
set -euo pipefail
cd /srv/nexo
rm -rf app.new && install -d -o nexo -g nexo -m 750 app.new
tar -xzf release.tar.gz -C app.new && chown -R nexo:nexo app.new
sudo -u nexo -H bash -c "cd /srv/nexo/app.new && npm ci --no-audit --no-fund --loglevel=error && set -a && . /srv/nexo/.env && set +a && npx next build >/tmp/nexo-build.log 2>&1 || { tail -30 /tmp/nexo-build.log; exit 1; }"
sudo -u nexo -H bash -c "cd /srv/nexo/app.new && node --env-file=/srv/nexo/.env --import tsx scripts/local-db-setup.ts"
rm -rf app.old; mv app app.old; mv app.new app
tr -d '\r' < app/ops/vps/job.sh > bin/job.sh && chmod 755 bin/job.sh
tr -d '\r' < app/ops/vps/deploy.sh > bin/deploy.sh.new && chmod 750 bin/deploy.sh.new && mv bin/deploy.sh.new bin/deploy.sh
# Reinício em sequência: uma instância por vez, esperando responder, então o site nunca fica fora do ar.
INSTANCES=$(systemctl list-unit-files 'nexo-app@*.service' --no-legend 2>/dev/null | awk '{print $1}' | grep -v '^nexo-app@.service$' || true)
if [ -n "$INSTANCES" ]; then
  for unit in $INSTANCES; do
    port=${unit#nexo-app@}; port=${port%.service}
    systemctl restart "$unit"
    for i in $(seq 1 40); do [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$port/login)" = 200 ] && break; sleep 1; done
  done
else
  systemctl restart nexo-app
fi
rm -f release.tar.gz
echo "versão publicada"
