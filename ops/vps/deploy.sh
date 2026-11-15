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
install -m 755 app/ops/vps/job.sh bin/job.sh
install -m 750 app/ops/vps/deploy.sh bin/deploy.sh
systemctl restart nexo-app
rm -f release.tar.gz
echo "versão publicada"
