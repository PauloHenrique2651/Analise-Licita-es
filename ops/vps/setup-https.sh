#!/usr/bin/env bash
# HTTPS do Nexo na VPS (idempotente). Certificado Let's Encrypt para o IP (perfil "shortlived", ~6 dias),
# renovado automaticamente a cada 6 h. Quando houver domínio, troque --ip-address por -d dominio e
# NEXT_PUBLIC_APP_URL no /srv/nexo/.env, e rode o deploy.
# Uso (root): IP=187.77.241.33 bash setup-https.sh
set -euo pipefail
IP=${IP:?defina IP}

export DEBIAN_FRONTEND=noninteractive
apt-get -y -qq install python3-venv >/dev/null
# certbot >= 5.1 emite certificado para IP; o do Ubuntu é mais antigo, então usa a instalação oficial via pip
[ -x /opt/certbot/bin/certbot ] || { python3 -m venv /opt/certbot; /opt/certbot/bin/pip install -q --upgrade pip certbot; }
install -d -m 755 /var/www/acme

cat > /etc/nginx/snippets/nexo-locations.conf <<'EOF'
    client_max_body_size 26m;
    location ^~ /.well-known/acme-challenge/ { root /var/www/acme; default_type text/plain; }
    location ~ /\. { deny all; return 404; }
    location ~ ^/(login|auth|atualizar-senha|api/auth/) {
        limit_req zone=nexo_auth burst=20 nodelay;
        limit_req_status 429;
        include /etc/nginx/snippets/nexo-proxy.conf;
    }
    location / {
        limit_req zone=nexo_general burst=60 nodelay;
        limit_req_status 429;
        include /etc/nginx/snippets/nexo-proxy.conf;
    }
EOF

# 1ª emissão precisa do HTTP servindo o desafio
if [ ! -f /etc/letsencrypt/live/nexo-ip/fullchain.pem ]; then
  cat > /etc/nginx/sites-available/nexo <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    include /etc/nginx/snippets/nexo-locations.conf;
}
EOF
  nginx -t && systemctl reload nginx
  /opt/certbot/bin/certbot certonly --non-interactive --agree-tos --register-unsafely-without-email \
    --webroot -w /var/www/acme --ip-address "$IP" --preferred-profile shortlived --cert-name nexo-ip
fi

cat > /etc/nginx/sites-available/nexo <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    location ^~ /.well-known/acme-challenge/ { root /var/www/acme; default_type text/plain; }
    location / { return 301 https://$host$request_uri; }
}
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    http2 on;
    server_name _;
    ssl_certificate     /etc/letsencrypt/live/nexo-ip/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nexo-ip/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:nexo_ssl:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    include /etc/nginx/snippets/nexo-locations.conf;
}
EOF
nginx -t && systemctl reload nginx

cat > /etc/systemd/system/nexo-certbot.service <<'EOF'
[Unit]
Description=Renova o certificado HTTPS (Let's Encrypt)
[Service]
Type=oneshot
ExecStart=/opt/certbot/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"
EOF
cat > /etc/systemd/system/nexo-certbot.timer <<'EOF'
[Unit]
Description=Renovação do certificado HTTPS a cada 6 horas
[Timer]
OnCalendar=*-*-* 00/6:17
RandomizedDelaySec=900
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now nexo-certbot.timer >/dev/null

sed -i "s#^NEXT_PUBLIC_APP_URL=.*#NEXT_PUBLIC_APP_URL=https://$IP#; s#^SESSION_COOKIE_SECURE=.*#SESSION_COOKIE_SECURE=true#" /srv/nexo/.env
echo "HTTPS ativo. Rode o deploy para o app passar a usar https://$IP e cookies seguros."
