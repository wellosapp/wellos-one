#!/usr/bin/env bash
# ============================================================================
# WellOs / Velura — VPS Instance Bootstrap Script
# ============================================================================
#
# Runs ONCE at first boot on a fresh Ubuntu 24.04 LTS VPS instance.
# Implements the bootstrap responsibilities from master spec §12.2.
#
# Provider-agnostic Ubuntu hardening + app prep. Works on:
#   - AWS Lightsail (paste into "Launch script" field at instance create)
#   - DigitalOcean (paste into "User data" field at Droplet create)
#   - Hetzner (paste into "Cloud config" / user data)
#   - Any other Ubuntu 24.04 VPS with cloud-init-style user-data support
#
# Safe to re-run: every step is idempotent (guards against double-install,
# double-UFW-rule, etc.).
#
# What this script does NOT do (intentionally deferred to later PRs):
#   - Install provider-specific CLIs (aws, doctl, hcloud)
#   - Configure registry auth (GHCR login)
#   - Install TLS certs (certbot needs DNS to resolve — runs after domain setup)
#   - Start the app (no code yet)
#
# After this runs, the instance is ready to accept SSH from `deploy` user
# and run Docker workloads once we push the first image.
# ============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration (override via env vars if needed; defaults match master spec)
# ---------------------------------------------------------------------------
DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_ROOT="${APP_ROOT:-/opt/app}"
SWAP_SIZE_MB="${SWAP_SIZE_MB:-2048}"
NODE_MAJOR="${NODE_MAJOR:-20}"
LOG_FILE="/var/log/wellos-bootstrap.log"

# Public keys authorized for the `deploy` user. One per line. Replace the
# placeholder below with the real ed25519 public key before running.
# For AWS Lightsail: this is ALSO injected via Lightsail's own SSH-key system
# for the `ubuntu` user, but the `deploy` user is what we actually use.
DEPLOY_AUTHORIZED_KEYS="${DEPLOY_AUTHORIZED_KEYS:-REPLACE_WITH_PUBLIC_KEY}"

# Team IP CIDRs allowed to SSH on port 22. Comma-separated.
# Example: "203.0.113.5/32,198.51.100.0/24"
# If left empty, script falls back to allowing 22/tcp from anywhere — FIX THIS
# in production by setting the env var before running.
SSH_ALLOW_CIDRS="${SSH_ALLOW_CIDRS:-}"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
mkdir -p "$(dirname "$LOG_FILE")"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "=============================================================="
echo "WellOs instance bootstrap starting at $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "=============================================================="

# ---------------------------------------------------------------------------
# 1. Wait for apt locks to clear (cloud-init sometimes fights unattended-upgrades)
# ---------------------------------------------------------------------------
echo ">>> [1/11] Waiting for apt locks to clear"
while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || \
      fuser /var/lib/apt/lists/lock >/dev/null 2>&1 || \
      fuser /var/lib/dpkg/lock >/dev/null 2>&1; do
  echo "  apt is locked by another process — waiting 5s..."
  sleep 5
done

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

# ---------------------------------------------------------------------------
# 2. Install baseline packages (master spec §12.2 item 2)
# ---------------------------------------------------------------------------
echo ">>> [2/11] Installing baseline packages"
apt-get install -y \
  ufw \
  fail2ban \
  curl \
  git \
  nginx \
  certbot \
  python3-certbot-nginx \
  unattended-upgrades \
  ca-certificates \
  gnupg \
  lsb-release \
  apt-transport-https \
  software-properties-common \
  jq \
  htop \
  ncdu \
  postgresql-client-16

# ---------------------------------------------------------------------------
# 3. Install Node.js 20 LTS via NodeSource (master spec §11 + §12.2 item 2)
# ---------------------------------------------------------------------------
echo ">>> [3/11] Installing Node.js ${NODE_MAJOR} LTS"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1)" != "v${NODE_MAJOR}" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

# ---------------------------------------------------------------------------
# 4. Install PM2 globally (master spec §12.2 item 3)
# ---------------------------------------------------------------------------
echo ">>> [4/11] Installing PM2"
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi
pm2 --version

# ---------------------------------------------------------------------------
# 5. Install Docker Engine (Ubuntu official repo)
# ---------------------------------------------------------------------------
echo ">>> [5/11] Installing Docker Engine"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
     https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
docker --version
docker compose version

# ---------------------------------------------------------------------------
# 6. Create the deploy user (master spec §12.2 item 1)
# ---------------------------------------------------------------------------
echo ">>> [6/11] Creating ${DEPLOY_USER} user"
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash -G sudo,docker "$DEPLOY_USER"
fi

# Passwordless sudo for deploy (CI/CD needs this). Locked-down file.
cat > "/etc/sudoers.d/90-${DEPLOY_USER}" <<EOF
${DEPLOY_USER} ALL=(ALL) NOPASSWD:ALL
EOF
chmod 0440 "/etc/sudoers.d/90-${DEPLOY_USER}"
visudo -cf "/etc/sudoers.d/90-${DEPLOY_USER}"

# Install deploy user's authorized_keys
install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/${DEPLOY_USER}/.ssh"
if [ "$DEPLOY_AUTHORIZED_KEYS" != "REPLACE_WITH_PUBLIC_KEY" ]; then
  echo "$DEPLOY_AUTHORIZED_KEYS" > "/home/${DEPLOY_USER}/.ssh/authorized_keys"
  chown "$DEPLOY_USER:$DEPLOY_USER" "/home/${DEPLOY_USER}/.ssh/authorized_keys"
  chmod 0600 "/home/${DEPLOY_USER}/.ssh/authorized_keys"
else
  echo "  WARNING: DEPLOY_AUTHORIZED_KEYS env var not set. You MUST add the"
  echo "  public key to /home/${DEPLOY_USER}/.ssh/authorized_keys manually before SSH works."
fi

# Harden sshd: disable root password login (keys only), keep PermitRootLogin
# at prohibit-password which is Ubuntu's default — just assert it.
sed -i -E 's/^#?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i -E 's/^#?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh || systemctl reload sshd

# ---------------------------------------------------------------------------
# 7. Configure UFW (master spec §12.2 item 4)
# ---------------------------------------------------------------------------
echo ">>> [7/11] Configuring UFW"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

if [ -n "$SSH_ALLOW_CIDRS" ]; then
  IFS=',' read -ra CIDRS <<< "$SSH_ALLOW_CIDRS"
  for cidr in "${CIDRS[@]}"; do
    cidr_trimmed="$(echo "$cidr" | xargs)"  # strip whitespace
    ufw allow from "$cidr_trimmed" to any port 22 proto tcp comment 'SSH team'
  done
else
  echo "  WARNING: SSH_ALLOW_CIDRS not set — allowing SSH from anywhere."
  echo "  Lock this down via the provider's cloud firewall (Lightsail firewall,"
  echo "  DO Cloud Firewall, etc.) and/or re-run with SSH_ALLOW_CIDRS set."
  ufw allow 22/tcp comment 'SSH (any — RESTRICT IN PROD)'
fi

ufw allow 80/tcp  comment 'HTTP (redirects to HTTPS)'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
ufw status verbose

# ---------------------------------------------------------------------------
# 8. Configure fail2ban (master spec §12.2 item 5)
# ---------------------------------------------------------------------------
echo ">>> [8/11] Configuring fail2ban"
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 86400
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled  = true
port     = 22
logpath  = %(sshd_log)s

[nginx-botsearch]
enabled  = true
port     = http,https
logpath  = /var/log/nginx/access.log
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban
fail2ban-client status

# ---------------------------------------------------------------------------
# 9. Configure unattended-upgrades for security patches only (item 6)
# ---------------------------------------------------------------------------
echo ">>> [9/11] Configuring unattended-upgrades"
cat > /etc/apt/apt.conf.d/50unattended-upgrades <<'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
EOF
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
systemctl enable --now unattended-upgrades

# ---------------------------------------------------------------------------
# 10. Provision swap file (master spec §12.2 item 7)
# ---------------------------------------------------------------------------
echo ">>> [10/11] Provisioning ${SWAP_SIZE_MB} MB swap"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l "${SWAP_SIZE_MB}M" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
free -h

# ---------------------------------------------------------------------------
# 11. Create /opt/app/ layout (master spec §12.2 item 8)
# ---------------------------------------------------------------------------
echo ">>> [11/11] Creating ${APP_ROOT} layout"
install -d -m 0755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" \
  "$APP_ROOT" \
  "$APP_ROOT/releases" \
  "$APP_ROOT/shared" \
  "$APP_ROOT/shared/logs"

# `current` symlink will point to the active release once the first deploy runs.
# Create a placeholder so downstream nginx configs don't break on boot.
if [ ! -L "$APP_ROOT/current" ]; then
  install -d -m 0755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_ROOT/releases/0-placeholder"
  sudo -u "$DEPLOY_USER" ln -s "$APP_ROOT/releases/0-placeholder" "$APP_ROOT/current"
fi
ls -la "$APP_ROOT"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo "=============================================================="
echo "Bootstrap complete at $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "=============================================================="
echo ""
echo "Verify:"
echo "  ssh ${DEPLOY_USER}@<instance-ip>   # key-only login as deploy user"
echo "  docker --version                   # Docker engine"
echo "  node -v                            # should be v${NODE_MAJOR}.x"
echo "  sudo ufw status                    # 22/80/443 rules"
echo "  sudo fail2ban-client status        # sshd + nginx-botsearch jails"
echo "  free -h                            # ${SWAP_SIZE_MB} MB swap visible"
echo "  ls -la ${APP_ROOT}                 # releases/ shared/ current -> placeholder"
echo ""
echo "Next steps (separate PRs):"
echo "  - Install provider CLI (aws / doctl / hcloud) for registry auth"
echo "  - Wire GHCR docker login for pulling release images"
echo "  - Run certbot once DNS resolves for the subdomains"
echo "  - Write nginx server blocks for app.velura.com / booking.velura.com / etc."
