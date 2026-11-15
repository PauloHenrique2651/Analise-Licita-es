#!/usr/bin/env bash
# Escala horizontal do Nexo na VPS (idempotente): PgBouncer, réplica de leitura, instâncias do app e balanceamento no Nginx.
# Uso (como root): bash setup-scaling.sh
set -euo pipefail

PW=$(cat /root/.nexo/db_password)
PGV=$(ls /etc/postgresql | head -1)
INSTANCES=${NEXO_APP_INSTANCES:-2}

echo "== 1. Papel de replicação"
REPL_FILE=/root/.nexo/replication_password
[ -f "$REPL_FILE" ] || (openssl rand -base64 36 | tr -d '/+=\n' | cut -c1-40 > "$REPL_FILE"; chmod 600 "$REPL_FILE")
RPW=$(cat "$REPL_FILE")
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -v rpw="$RPW" <<'SQL'
select format('create role replicator login replication password %L', :'rpw')
where not exists (select 1 from pg_roles where rolname = 'replicator') \gexec
select format('alter role replicator password %L', :'rpw') \gexec
SQL
# O primário não pode acumular WAL sem limite se a réplica ficar fora do ar
cat > /etc/postgresql/$PGV/main/conf.d/nexo-replication.conf <<EOF
wal_level = replica
max_wal_senders = 6
max_replication_slots = 6
max_slot_wal_keep_size = 10GB
wal_keep_size = 1GB
EOF
systemctl restart postgresql

echo "== 2. Réplica de leitura (porta 5433)"
if ! pg_lsclusters | awk '{print $2}' | grep -qx replica; then
  pg_createcluster "$PGV" replica -p 5433 --start-conf=manual >/dev/null
  rm -rf "/var/lib/postgresql/$PGV/replica"
  install -d -o postgres -g postgres -m 700 "/var/lib/postgresql/$PGV/replica"
  sudo -u postgres env PGPASSWORD="$RPW" pg_basebackup -h 127.0.0.1 -p 5432 -U replicator -D "/var/lib/postgresql/$PGV/replica" -R -X stream -C -S replica1 -c fast
  mkdir -p "/etc/postgresql/$PGV/replica/conf.d"
  cat > "/etc/postgresql/$PGV/replica/conf.d/nexo-replica.conf" <<EOF
listen_addresses = 'localhost'
hot_standby = on
hot_standby_feedback = on
max_standby_streaming_delay = 60s
shared_buffers = 1GB
effective_cache_size = 3GB
work_mem = 16MB
random_page_cost = 1.1
max_connections = 60
EOF
  sed -i "s/^#\?start.*/start = auto/" "/etc/postgresql/$PGV/replica/start.conf"
fi
systemctl enable --now "postgresql@$PGV-replica" >/dev/null 2>&1 || pg_ctlcluster "$PGV" replica start
for i in $(seq 1 30); do sudo -u postgres psql -p 5433 -d nexo -tAc "select pg_is_in_recovery()" 2>/dev/null | grep -q t && break; sleep 1; done
echo "réplica em recuperação (somente leitura): $(sudo -u postgres psql -p 5433 -d nexo -tAc 'select pg_is_in_recovery()')"

echo "== 3. PgBouncer"
SCRAM=$(sudo -u postgres psql -d nexo -tAc "select rolpassword from pg_authid where rolname = 'nexo'")
printf '"nexo" "%s"\n' "$SCRAM" > /etc/pgbouncer/userlist.txt
chown postgres:postgres /etc/pgbouncer/userlist.txt; chmod 640 /etc/pgbouncer/userlist.txt
cat > /etc/pgbouncer/pgbouncer.ini <<EOF
[databases]
nexo    = host=127.0.0.1 port=5432 dbname=nexo
nexo_ro = host=127.0.0.1 port=5433 dbname=nexo

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 3000
default_pool_size = 25
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 3
server_idle_timeout = 300
query_wait_timeout = 30
ignore_startup_parameters = extra_float_digits,options
admin_users = nexo
logfile = /var/log/postgresql/pgbouncer.log
pidfile = /run/postgresql/pgbouncer.pid
unix_socket_dir = /run/postgresql
EOF
systemctl enable --now pgbouncer >/dev/null 2>&1
systemctl restart pgbouncer
sleep 1
PGPASSWORD="$PW" psql -h 127.0.0.1 -p 6432 -U nexo -d nexo -tAc "select 'primário via pgbouncer: ok'"
PGPASSWORD="$PW" psql -h 127.0.0.1 -p 6432 -U nexo -d nexo_ro -tAc "select 'réplica via pgbouncer: ' || case when pg_is_in_recovery() then 'ok (somente leitura)' else 'ERRO: não é réplica' end"

echo "== 4. Variáveis do app (conexão direta só para migrações)"
ENV=/srv/nexo/.env
grep -q '^LOCAL_DATABASE_ADMIN_URL=' $ENV || echo "LOCAL_DATABASE_ADMIN_URL=postgresql://nexo:${PW}@127.0.0.1:5432/nexo" >> $ENV
sed -i "s#^LOCAL_DATABASE_URL=.*#LOCAL_DATABASE_URL=postgresql://nexo:${PW}@127.0.0.1:6432/nexo#" $ENV
grep -q '^LOCAL_DATABASE_READ_URLS=' $ENV && sed -i "s#^LOCAL_DATABASE_READ_URLS=.*#LOCAL_DATABASE_READ_URLS=postgresql://nexo:${PW}@127.0.0.1:6432/nexo_ro#" $ENV \
  || echo "LOCAL_DATABASE_READ_URLS=postgresql://nexo:${PW}@127.0.0.1:6432/nexo_ro" >> $ENV
chown root:nexo $ENV; chmod 640 $ENV

echo "== 5. Instâncias do app + Nginx"
cat > /etc/systemd/system/nexo-app@.service <<'EOF'
[Unit]
Description=Nexo Publico (Next.js) instância %i
After=network.target postgresql.service pgbouncer.service
Requires=postgresql.service

[Service]
User=nexo
Group=nexo
WorkingDirectory=/srv/nexo/app
EnvironmentFile=/srv/nexo/.env
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -H 127.0.0.1 -p %i
Restart=always
RestartSec=3
MemoryMax=1500M
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/nexo/storage /srv/nexo/app/.next/cache
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true

[Install]
WantedBy=multi-user.target
EOF
PORTS=""
for i in $(seq 1 "$INSTANCES"); do PORTS="$PORTS $((3000 + i))"; done
{
  echo "upstream nexo_app {"
  echo "    least_conn;"
  for p in $PORTS; do echo "    server 127.0.0.1:$p max_fails=2 fail_timeout=10s;"; done
  echo "    keepalive 32;"
  echo "}"
} > /etc/nginx/conf.d/10-nexo-upstream.conf
sed -i 's#proxy_pass http://127.0.0.1:3000;#proxy_pass http://nexo_app;#; s#proxy_set_header Connection "upgrade";#proxy_set_header Connection "";#' /etc/nginx/snippets/nexo-proxy.conf
grep -q "proxy_next_upstream" /etc/nginx/snippets/nexo-proxy.conf || printf 'proxy_next_upstream error timeout http_502 http_503;\nproxy_next_upstream_tries 2;\n' >> /etc/nginx/snippets/nexo-proxy.conf
rm -f /etc/nginx/conf.d/20-nexo-cache.conf   # o gzip já vem ligado no nginx.conf
systemctl daemon-reload
for p in $PORTS; do systemctl enable "nexo-app@$p" >/dev/null 2>&1; systemctl restart "nexo-app@$p"; done
sleep 5
for p in $PORTS; do echo "instância $p: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$p/login)"; done
nginx -t 2>&1 | tail -1
systemctl reload nginx
systemctl disable --now nexo-app.service >/dev/null 2>&1 || true
echo "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/login) pelo Nginx"
echo "pronto"
