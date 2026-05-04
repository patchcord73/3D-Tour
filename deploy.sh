#!/usr/bin/env bash
# =============================================================================
#  deploy.sh — деплой / обновление 3D-тура на Ubuntu 24
#  Использование:
#    Первый деплой:  sudo bash deploy.sh <REPO_URL> [DOMAIN]
#    Обновление:     sudo bash deploy.sh
#  Примеры:
#    sudo bash deploy.sh https://github.com/user/tour.git tour.example.ru
#    sudo bash deploy.sh https://github.com/user/tour.git   # без домена → IP
#    sudo bash deploy.sh                                     # обновление
# =============================================================================
set -euo pipefail

# ─── Конфигурация ─────────────────────────────────────────────────────────────
APP_DIR="/opt/tour"
APP_USER="tour"
SERVICE="tour-api"
NODE_MAJOR="22"

REPO_URL="${1:-}"   # URL репозитория (нужен только при первом деплое)
DOMAIN="${2:-}"     # домен (опционально, для SSL)

# ─── Цвета ────────────────────────────────────────────────────────────────────
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' B='\033[0;34m' N='\033[0m' BOLD='\033[1m'
log()  { echo -e "${G}[$(date '+%H:%M:%S')]${N} $*"; }
info() { echo -e "${B}[$(date '+%H:%M:%S')]${N} $*"; }
warn() { echo -e "${Y}[$(date '+%H:%M:%S')] ВНИМАНИЕ:${N} $*"; }
die()  { echo -e "${R}[$(date '+%H:%M:%S')] ОШИБКА:${N} $*" >&2; exit 1; }
section() { echo -e "\n${BOLD}${B}══ $* ══${N}"; }

# ─── Проверки ─────────────────────────────────────────────────────────────────
[ "$EUID" -eq 0 ] || die "Запустите от root: sudo bash deploy.sh"

IS_UPDATE=false
if [ -d "$APP_DIR/.git" ]; then
    IS_UPDATE=true
    log "Режим: обновление существующей установки"
else
    [ -n "$REPO_URL" ] || die "Укажите URL репозитория: sudo bash deploy.sh <REPO_URL> [DOMAIN]"
    log "Режим: первый деплой"
fi

# ─── Системные пакеты ─────────────────────────────────────────────────────────
section "Системные пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

# Git
if ! command -v git &>/dev/null; then
    log "Установка git..."
    apt-get install -y -qq git
fi

# curl
if ! command -v curl &>/dev/null; then
    apt-get install -y -qq curl
fi

# Node.js
if ! node --version 2>/dev/null | grep -q "^v${NODE_MAJOR}"; then
    log "Установка Node.js ${NODE_MAJOR}..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
    apt-get install -y -qq nodejs
fi
log "Node.js: $(node --version)  npm: $(npm --version)"

# Nginx
if ! command -v nginx &>/dev/null; then
    log "Установка nginx..."
    apt-get install -y -qq nginx
fi

# ─── Пользователь приложения ──────────────────────────────────────────────────
section "Пользователь"
if ! id "$APP_USER" &>/dev/null; then
    log "Создание пользователя $APP_USER..."
    useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"
fi

# ─── Код приложения ───────────────────────────────────────────────────────────
section "Код"
if $IS_UPDATE; then
    log "Сохранение рабочих данных сервера..."
    cp "$APP_DIR/public/data.json"     /tmp/tour_data.json.bak     2>/dev/null || true
    cp "$APP_DIR/public/settings.json" /tmp/tour_settings.json.bak 2>/dev/null || true

    log "git pull..."
    cd "$APP_DIR"
    git pull

    log "Восстановление рабочих данных..."
    cp /tmp/tour_data.json.bak     "$APP_DIR/public/data.json"     2>/dev/null || true
    cp /tmp/tour_settings.json.bak "$APP_DIR/public/settings.json" 2>/dev/null || true
else
    log "Клонирование репозитория..."
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# Директория для панорам (может не быть в git из-за .gitignore)
mkdir -p "$APP_DIR/public/panoramas"

# ─── Зависимости и сборка ─────────────────────────────────────────────────────
section "Сборка"
cd "$APP_DIR"

log "npm ci..."
npm ci --prefer-offline 2>&1 | tail -3

log "npm run build..."
npm run build

log "Сборка завершена: $(du -sh dist/ | cut -f1)"

# ─── Права доступа ────────────────────────────────────────────────────────────
section "Права доступа"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod -R 755 "$APP_DIR/public/panoramas"
chmod 644 "$APP_DIR/public/"*.json 2>/dev/null || true
log "Права выставлены"

# ─── Systemd-служба ───────────────────────────────────────────────────────────
section "Systemd"
cat > "/etc/systemd/system/${SERVICE}.service" << EOF
[Unit]
Description=3D Tour — API Server
Documentation=https://github.com/user/tour
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
ExecStart=$(which node) ${APP_DIR}/server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE}
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE"

if systemctl is-active --quiet "$SERVICE"; then
    log "Перезапуск службы $SERVICE..."
    systemctl restart "$SERVICE"
else
    log "Запуск службы $SERVICE..."
    systemctl start "$SERVICE"
fi

sleep 2
systemctl is-active --quiet "$SERVICE" \
    && log "Служба ${SERVICE}: активна ✓" \
    || warn "Служба ${SERVICE}: проблема со запуском. Проверьте: journalctl -u ${SERVICE} -n 50"

# ─── Nginx ────────────────────────────────────────────────────────────────────
section "Nginx"

NGINX_CONF="/etc/nginx/sites-available/tour"

# Если домен не задан — используем IP
if [ -z "$DOMAIN" ]; then
    SERVER_NAME="_"
else
    SERVER_NAME="$DOMAIN"
fi

cat > "$NGINX_CONF" << NGINX_EOF
# 3D Tour — nginx config
# Сгенерирован deploy.sh $(date '+%d.%m.%Y %H:%M')

server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAME};

    # Для certbot (Let's Encrypt)
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # ── Статика: собранный фронтенд ──────────────────────────────
    root ${APP_DIR}/dist;
    index index.html;

    # ── Панорамы из рабочей директории (загружаются в runtime) ───
    location /panoramas/ {
        alias ${APP_DIR}/public/panoramas/;
        expires 7d;
        add_header Cache-Control "public";
        add_header X-Content-Type-Options nosniff;
    }

    # ── API → Express ─────────────────────────────────────────────
    location /api/ {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout  300s;
        proxy_send_timeout  300s;
        proxy_buffering     off;
        proxy_request_buffering off;
        client_max_body_size 512m;
    }

    # ── SPA fallback ──────────────────────────────────────────────
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    client_max_body_size 512m;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
}
NGINX_EOF

# Активируем сайт
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/tour
# Отключаем дефолтный сайт
rm -f /etc/nginx/sites-enabled/default

nginx -t && log "Конфиг nginx: OK ✓"
systemctl enable nginx
systemctl reload nginx

# ─── SSL (Let's Encrypt) ──────────────────────────────────────────────────────
if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "_" ]; then
    section "SSL — Let's Encrypt"
    if ! command -v certbot &>/dev/null; then
        log "Установка certbot..."
        apt-get install -y -qq certbot python3-certbot-nginx
    fi

    if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
        log "Получение сертификата для $DOMAIN..."
        certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
            --email "admin@${DOMAIN}" --redirect \
            && log "SSL сертификат получен ✓" \
            || warn "Не удалось получить SSL. Запустите вручную: certbot --nginx -d $DOMAIN"
    else
        log "SSL сертификат уже есть, обновление..."
        certbot renew --quiet || true
    fi

    # Автообновление через таймер systemd (Ubuntu 24 — certbot.timer уже включён)
    systemctl is-enabled --quiet certbot.timer 2>/dev/null \
        && log "Автообновление SSL: включено ✓" \
        || warn "Проверьте автообновление: systemctl enable certbot.timer"
fi

# ─── Итог ─────────────────────────────────────────────────────────────────────
section "Готово"

IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${BOLD}${G}  ✓ Деплой завершён успешно!${N}"
echo ""
echo -e "  ${BOLD}Сайт:${N}"
if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "_" ]; then
    echo -e "    https://${DOMAIN}"
fi
echo -e "    http://${IP}"
echo ""
echo -e "  ${BOLD}Управление службой:${N}"
echo -e "    systemctl status ${SERVICE}"
echo -e "    systemctl restart ${SERVICE}"
echo -e "    journalctl -u ${SERVICE} -f      # логи в реальном времени"
echo ""
echo -e "  ${BOLD}Приложение:${N}  ${APP_DIR}"
echo -e "  ${BOLD}Панорамы:${N}    ${APP_DIR}/public/panoramas/"
echo -e "  ${BOLD}Nginx лог:${N}   /var/log/nginx/error.log"
echo ""
