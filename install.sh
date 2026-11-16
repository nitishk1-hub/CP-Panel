#!/usr/bin/env bash
# ==============================================================================
# CP-Panel - Universal Step-by-Step Provisioning Engine
# Developed by CyberPross · 100% Free & Open-Source Infrastructure Control Plane
# ==============================================================================
set -euo pipefail
umask 077

CYBER_PORT=8787
CYBER_PUBLIC_URL=""
CYBER_ADMIN_USER="admin"
CYBER_ADMIN_PASSWORD=""
CYBER_PROFILE="core"
CYBER_AUTO=0
CYBER_RESUME=0
CYBER_FORCE=0

BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_banner() {
  cat <<'BANNER'
   ______      ____                     __
  / ____/___  / __ \____ _____  ___  __/ /
 / /   / __ \/ /_/ / __ `/ __ \/ _ \/ / / 
/ /___/ /_/ / ____/ /_/ / / / /  __/ / /  
\____/ .___/_/    \__,_/_/ /_/\___/_/_/   
    /_/      Developed by CyberPross · 100% Open Source
BANNER
}

usage() {
  cat <<EOF
Usage: sudo ./install.sh [options]

Options:
  --port=<port>             Panel listening port (default: 8787)
  --public-url=<url>        Public HTTPS origin (e.g. https://cyber.example.com)
  --domain=<domain>         Convenience flag for public domain
  --admin-user=<username>   Initial administrator username (default: admin)
  --admin-password=<pass>   Initial administrator password (min 10 characters)
  --profile=<core|security> Installation profile (core or security, default: core)
  --auto, --non-interactive Non-interactive automatic deployment
  --force                   Force reinstall / upgrade if already active
  --resume                  Resume an interrupted installation
  -h, --help                Show this message
EOF
  exit 0
}

for arg in "$@"; do
  case "$arg" in
    --port=*) CYBER_PORT="${arg#*=}" ;;
    --public-url=*) CYBER_PUBLIC_URL="${arg#*=}" ;;
    --domain=*) CYBER_PUBLIC_URL="https://${arg#*=}" ;;
    --admin-user=*) CYBER_ADMIN_USER="${arg#*=}" ;;
    --admin-password=*) CYBER_ADMIN_PASSWORD="${arg#*=}" ;;
    --profile=*) CYBER_PROFILE="${arg#*=}" ;;
    --auto|--non-interactive) CYBER_AUTO=1 ;;
    --force) CYBER_FORCE=1 ;;
    --resume) CYBER_RESUME=1 ;;
    -h|--help) usage ;;
    *) echo -e "${RED}Unknown option: $arg${NC}" >&2; usage ;;
  esac
done

if [[ ${EUID} -ne 0 ]]; then
  echo -e "${RED}[!] Administrator authorization required. Please run with: sudo $0${NC}" >&2
  exit 1
fi

if [[ "$(uname -s)" != "Linux" ]]; then
  echo -e "${RED}[!] CP-Panel supports Linux operating systems only.${NC}" >&2
  exit 1
fi

if [[ ! -d /run/systemd/system ]]; then
  echo -e "${RED}[!] A running systemd host is required to manage the panel service.${NC}" >&2
  exit 1
fi

print_banner

# OS Detection
OS_ID="unknown"
if [[ -f /etc/os-release ]]; then
  # shellcheck source=/dev/null
  . /etc/os-release
  OS_ID="${ID:-unknown}"
fi

echo -e "${CYAN}[*] Target Host:${NC} ${NAME:-Linux} ${VERSION_ID:-} ($(uname -m))"

# Check if already installed & running
if systemctl is-active --quiet server-panel.service 2>/dev/null; then
  echo -e "\n${YELLOW}[!] CP-Panel is already installed and actively running on this host.${NC}"
  echo -e "    • Status: Active (PID $(systemctl show --property=MainPID --value server-panel.service 2>/dev/null || echo 'unknown'))"
  echo -e "    • Management: systemctl status server-panel"
  echo -e "    • Upgrade:    sudo /opt/server-panel/app/scripts/update-service.sh"
  
  if [[ $CYBER_FORCE -eq 1 ]]; then
    echo -e "${YELLOW}[!] --force specified. Stopping existing service for reinstall/upgrade...${NC}"
    systemctl stop server-panel.service
  elif [[ $CYBER_AUTO -eq 1 ]]; then
    echo -e "${GREEN}[✓] Active installation preserved. Exiting cleanly.${NC}"
    exit 0
  else
    echo ""
    confirm_action="n"
    if [ -t 0 ] || [ -e /dev/tty ]; then
      read -r -p "Do you want to stop the service and perform a reinstall/upgrade? [y/N]: " confirm_action < /dev/tty || confirm_action="n"
    fi
    if [[ ! "$confirm_action" =~ ^[Yy]$ ]]; then
      echo -e "${CYAN}[*] Operation cancelled. Active service remains running unchanged.${NC}"
      exit 0
    fi
    echo -e "${CYAN}[*] Stopping existing service for reinstall...${NC}"
    systemctl stop server-panel.service
  fi
fi

# Step 1: System Dependencies
install_dependencies() {
  echo -e "\n${CYAN}[1/6] Verifying system dependencies...${NC}"
  local missing=()
  for bin in curl git openssl tar gzip python3 jq; do
    if ! command -v "$bin" >/dev/null 2>&1; then
      missing+=("$bin")
    fi
  done

  # flock is in util-linux
  if ! command -v flock >/dev/null 2>&1; then
    missing+=("util-linux")
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo -e "${YELLOW}[+] Installing required base packages: ${missing[*]}${NC}"
    if command -v apt-get >/dev/null 2>&1; then
      apt-get update -y && apt-get install -y "${missing[@]}"
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y "${missing[@]}"
    elif command -v yum >/dev/null 2>&1; then
      yum install -y "${missing[@]}"
    elif command -v pacman >/dev/null 2>&1; then
      pacman -Sy --noconfirm "${missing[@]}"
    fi
  fi
  echo -e "${GREEN}[✓] Base system dependencies are ready.${NC}"
}

# Step 2: Node.js 24 LTS
install_node() {
  echo -e "\n${CYAN}[2/6] Verifying Node.js 24 LTS runtime...${NC}"
  local need_node=1
  if command -v node >/dev/null 2>&1; then
    local major
    major=$(node -v | sed 's/v\([0-9]*\).*/\1/')
    if (( major >= 24 )); then
      need_node=0
      echo -e "${GREEN}[✓] Node.js $major is already installed ($(node -v)).${NC}"
    fi
  fi

  if [[ $need_node -eq 1 ]]; then
    echo -e "${YELLOW}[+] Installing official Node.js 24 LTS...${NC}"
    if command -v apt-get >/dev/null 2>&1; then
      curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
      apt-get install -y nodejs build-essential
    elif command -v dnf >/dev/null 2>&1; then
      curl -fsSL https://rpm.nodesource.com/setup_24.x | bash -
      dnf install -y nodejs gcc gcc-c++ make
    elif command -v pacman >/dev/null 2>&1; then
      pacman -Sy --noconfirm nodejs npm base-devel
    else
      echo -e "${RED}[!] Automatic Node.js 24 installation not supported on $OS_ID. Please install Node.js 24+ manually.${NC}" >&2
      exit 1
    fi
    echo -e "${GREEN}[✓] Node.js $(node -v) installed successfully.${NC}"
  fi
}

# Step 3: Docker Engine & Compose
install_docker() {
  echo -e "\n${CYAN}[3/6] Verifying Docker Engine & Compose...${NC}"
  if ! command -v docker >/dev/null 2>&1; then
    echo -e "${YELLOW}[+] Docker not detected. Provisioning official Docker Engine and Compose...${NC}"
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
    echo -e "${GREEN}[✓] Docker installed and started.${NC}"
  else
    echo -e "${GREEN}[✓] Docker Engine is ready ($(docker --version 2>/dev/null | head -n 1)).${NC}"
  fi
  # Pre-cache official Node.js website sandbox container image
  if command -v docker >/dev/null 2>&1 && systemctl is-active --quiet docker 2>/dev/null; then
    if ! docker image inspect node:24-bookworm-slim >/dev/null 2>&1; then
      echo -e "${CYAN}[*] Pre-caching isolated Node.js website sandbox image (node:24-bookworm-slim)...${NC}"
      docker pull node:24-bookworm-slim >/dev/null 2>&1 || true
    fi
  fi
}

install_dependencies
install_node
install_docker

# Determine and validate repository directory (supports both git clone and curl | bash pipe)
SOURCE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" 2>/dev/null && pwd -P || echo "")
if [[ -z "$SOURCE_DIR" || ! -f "$SOURCE_DIR/src/server.mjs" ]]; then
  echo -e "${CYAN}[*] Downloading CP-Panel source code from GitHub...${NC}"
  REPO_DIR="/opt/cp-panel-src"
  if [[ -d "$REPO_DIR/.git" ]]; then
    git -C "$REPO_DIR" fetch --depth=1 origin main
    git -C "$REPO_DIR" reset --hard origin/main
  else
    rm -rf "$REPO_DIR"
    git clone --depth=1 https://github.com/nitishk1-hub/CP-Panel.git "$REPO_DIR"
  fi
  SOURCE_DIR="$REPO_DIR"
fi

NODE_EXEC=$(command -v node)

# Step 4: Production Dependencies (npm)
install_npm_packages() {
  echo -e "\n${CYAN}[4/6] Verifying application dependencies...${NC}"
  if [[ ! -d "$SOURCE_DIR/node_modules" ]]; then
    echo -e "${YELLOW}[+] Installing production npm dependencies...${NC}"
    if [[ -f "$SOURCE_DIR/package-lock.json" ]]; then
      (cd "$SOURCE_DIR" && npm ci --omit=dev) 2>/dev/null || (cd "$SOURCE_DIR" && npm install --omit=dev)
    else
      (cd "$SOURCE_DIR" && npm install --omit=dev)
    fi
    echo -e "${GREEN}[✓] Production dependencies installed.${NC}"
  else
    echo -e "${GREEN}[✓] Production dependencies ready.${NC}"
  fi
}
install_npm_packages

# Interactive configuration (prompts via /dev/tty if stdin is piped)
if [[ $CYBER_AUTO -eq 0 && -z "$CYBER_ADMIN_PASSWORD" ]]; then
  TTY_DEV=""
  if [ -t 0 ]; then
    TTY_DEV="/dev/stdin"
  elif [ -e /dev/tty ]; then
    TTY_DEV="/dev/tty"
  fi

  if [[ -n "$TTY_DEV" ]]; then
    echo -e "\n${BOLD}--- Step-by-Step Setup Configuration ---${NC}"
    read -r -p "Panel Listening Port [${CYBER_PORT}]: " input_port < "$TTY_DEV" || input_port=""
    if [[ -n "$input_port" ]]; then CYBER_PORT="$input_port"; fi

    read -r -p "Public Domain / HTTPS URL (optional, e.g. https://cyber.example.com): " input_url < "$TTY_DEV" || input_url=""
    if [[ -n "$input_url" ]]; then
      if [[ "$input_url" =~ ^https?:// ]]; then
        CYBER_PUBLIC_URL="$input_url"
      else
        CYBER_PUBLIC_URL="https://$input_url"
      fi
    fi

    read -r -p "Administrator Username [admin]: " input_user < "$TTY_DEV" || input_user=""
    if [[ -n "$input_user" ]]; then CYBER_ADMIN_USER="$input_user"; fi

    while true; do
      read -r -s -p "Administrator Password (min 10 characters): " pass1 < "$TTY_DEV" || pass1=""
      echo
      if [[ ${#pass1} -lt 10 ]]; then
        echo -e "${RED}[!] Password must be at least 10 characters.${NC}"
        continue
      fi
      read -r -s -p "Confirm Password: " pass2 < "$TTY_DEV" || pass2=""
      echo
      if [[ "$pass1" != "$pass2" ]]; then
        echo -e "${RED}[!] Passwords do not match. Please try again.${NC}"
        continue
      fi
      CYBER_ADMIN_PASSWORD="$pass1"
      break
    done

    read -r -p "Security Profile (core / security) [${CYBER_PROFILE}]: " input_profile < "$TTY_DEV" || input_profile=""
    if [[ "$input_profile" == "security" ]]; then CYBER_PROFILE="security"; fi
  fi
fi

if [[ -z "$CYBER_ADMIN_PASSWORD" ]]; then
  # Auto-generate a secure random password if running non-interactively without preset password
  CYBER_ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -dc 'A-Za-z0-9!@#%^&*' | head -c 16)
  echo -e "${YELLOW}[!] Generated secure initial administrator password: ${CYBER_ADMIN_PASSWORD}${NC}"
fi

# Step 5: Cryptographic Release Signing & Integrity Verification
echo -e "\n${CYAN}[5/6] Securing release integrity and manifest signatures...${NC}"
if [[ ! -f "$SOURCE_DIR/RELEASE-MANIFEST.sig" || ! -f "$SOURCE_DIR/RELEASE-PUBLIC.pem" ]]; then
  echo -e "${CYAN}[*] Generating signed cryptographic manifest for host architecture...${NC}"
  "$NODE_EXEC" --input-type=module -e "
    import path from 'node:path';
    const {signRelease} = await import(path.join(process.argv[1], 'scripts/sign-release.mjs'));
    await signRelease(process.argv[1], {
      keyDirectory: path.join(process.argv[1], '.release-keys'),
      node: process.argv[2]
    });
  " "$SOURCE_DIR" "$NODE_EXEC"
fi

"$NODE_EXEC" "$SOURCE_DIR/scripts/verify-release.mjs" "$SOURCE_DIR" "$SOURCE_DIR/RELEASE-PUBLIC.pem"
echo -e "${GREEN}[✓] Release bundle cryptographic verification passed.${NC}"

# Step 6: Deploy Service and Initialize Accounts
echo -e "\n${CYAN}[6/6] Initializing administrator account and deploying systemd service...${NC}"
RECOVERY_DIR="/etc/server-panel/recovery"
install -d -o root -g root -m 0700 "$RECOVERY_DIR"
RECOVERY_OUT="$RECOVERY_DIR/admin-recovery-$(date +%s).txt"

STAGING_DIR=$(mktemp -d /var/tmp/cp-panel-install-XXXXXXXX)
trap 'rm -rf -- "$STAGING_DIR"' EXIT

SETUP_JSON=$(jq -n \
  --arg username "$CYBER_ADMIN_USER" \
  --arg password "$CYBER_ADMIN_PASSWORD" \
  --arg confirmation "$CYBER_ADMIN_PASSWORD" \
  --arg port "$CYBER_PORT" \
  --arg publicURL "$CYBER_PUBLIC_URL" \
  '{username: $username, password: $password, confirmation: $confirmation, port: $port, publicURL: $publicURL}')

printf "%s" "$SETUP_JSON" | "$NODE_EXEC" "$SOURCE_DIR/scripts/first-run-from-stdin.mjs" "$STAGING_DIR/data" "$STAGING_DIR/environment" "$RECOVERY_OUT"

/bin/bash "$SOURCE_DIR/scripts/install-service.sh" "$SOURCE_DIR" "$STAGING_DIR/data" "$NODE_EXEC" "$CYBER_PORT" "$CYBER_PUBLIC_URL" 1 "$CYBER_PROFILE" direct

systemctl daemon-reload
systemctl enable --now server-panel.service

echo -e "\n${GREEN}${BOLD}================================================================${NC}"
echo -e "${GREEN}${BOLD}        🎉 CP-Panel Deployed and Ready! (by CyberPross)          ${NC}"
echo -e "${GREEN}${BOLD}================================================================${NC}"
echo -e "${BOLD}Local URL:${NC}           http://127.0.0.1:${CYBER_PORT}/"
if [[ -n "$CYBER_PUBLIC_URL" ]]; then
  echo -e "${BOLD}Public URL:${NC}          ${CYBER_PUBLIC_URL}"
  echo -e "${BOLD}MCP Endpoint:${NC}        ${CYBER_PUBLIC_URL}/mcp"
else
  echo -e "${BOLD}MCP Endpoint:${NC}        http://127.0.0.1:${CYBER_PORT}/mcp"
fi
echo -e "${CYAN}${BOLD}Cloudflare Tunnel:${NC}   Zero open inbound ports (80/443) required!"
echo -e "                     Point Cloudflare Tunnel -> http://127.0.0.1:${CYBER_PORT}"
echo -e "${BOLD}Admin Username:${NC}      ${CYBER_ADMIN_USER}"
echo -e "${BOLD}Admin Password:${NC}      ${CYBER_ADMIN_PASSWORD}"
echo -e "${BOLD}Recovery Code File:${NC}  ${RECOVERY_OUT} (0600 root-only)"
echo -e "\n${BOLD}Service Management:${NC}"
echo -e "  systemctl status server-panel"
echo -e "  journalctl -u server-panel -f"
echo -e "  sudo /opt/server-panel/app/scripts/update-service.sh"
echo -e "${GREEN}================================================================${NC}\n"
