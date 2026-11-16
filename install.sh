#!/usr/bin/env bash
# ==============================================================================
# CyberPross Server Panel - Universal 1-Line Installer & Provisioning Engine
# 100% Free & Open-Source Infrastructure Control Plane
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

BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_banner() {
  cat <<'BANNER'
   ______      __              ____                     
  / ____/_  __/ /_  ___  _____/ __ \_________  __________
 / /   / / / / __ \/ _ \/ ___/ /_/ / ___/ __ \/ ___/ ___/
/ /___/ /_/ / /_/ /  __/ /  / ____/ /  / /_/ (__  |__  ) 
\____/\__, /_.___/\___/_/  /_/   /_/   \____/____/____/  
     /____/       Server Panel · 100% Open Source        
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
  echo -e "${RED}[!] CyberPross Server Panel supports Linux only.${NC}" >&2
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

echo -e "${CYAN}[*] Operating System:${NC} ${NAME:-Linux} ${VERSION_ID:-}"
echo -e "${CYAN}[*] Target Architecture:${NC} $(uname -m)"

# Dependency check & installation
install_dependencies() {
  echo -e "${CYAN}[*] Checking required system dependencies...${NC}"
  local missing=()
  for bin in curl git openssl tar gzip python3 flock jq; do
    if ! command -v "$bin" >/dev/null 2>&1; then
      missing+=("$bin")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo -e "${YELLOW}[+] Installing missing base tools: ${missing[*]}${NC}"
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
}

install_node() {
  local need_node=1
  if command -v node >/dev/null 2>&1; then
    local major
    major=$(node -v | sed 's/v\([0-9]*\).*/\1/')
    if (( major >= 24 )); then
      need_node=0
      echo -e "${GREEN}[✓] Node.js $major is already installed.${NC}"
    fi
  fi

  if [[ $need_node -eq 1 ]]; then
    echo -e "${YELLOW}[+] Installing Node.js 24 LTS...${NC}"
    if command -v apt-get >/dev/null 2>&1; then
      curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
      apt-get install -y nodejs
    elif command -v dnf >/dev/null 2>&1; then
      curl -fsSL https://rpm.nodesource.com/setup_24.x | bash -
      dnf install -y nodejs
    elif command -v pacman >/dev/null 2>&1; then
      pacman -Sy --noconfirm nodejs npm
    else
      echo -e "${RED}[!] Automatic Node.js 24 installation not supported on $OS_ID. Please install Node.js 24+ manually.${NC}" >&2
      exit 1
    fi
  fi
}

install_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo -e "${YELLOW}[+] Docker not detected. Provisioning official Docker Engine and Compose...${NC}"
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
    echo -e "${GREEN}[✓] Docker installed and started.${NC}"
  else
    echo -e "${GREEN}[✓] Docker Engine is ready.${NC}"
  fi
}

install_dependencies
install_node
install_docker

SOURCE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
NODE_EXEC=$(command -v node)

# Interactive configuration if not auto
if [[ $CYBER_AUTO -eq 0 && -z "$CYBER_ADMIN_PASSWORD" ]]; then
  echo -e "\n${BOLD}--- Setup Configuration ---${NC}"
  read -r -p "Panel Listening Port [${CYBER_PORT}]: " input_port
  if [[ -n "$input_port" ]]; then CYBER_PORT="$input_port"; fi

  read -r -p "Public Domain / HTTPS URL (optional, e.g. https://cyber.example.com): " input_url
  if [[ -n "$input_url" ]]; then
    if [[ "$input_url" =~ ^https?:// ]]; then
      CYBER_PUBLIC_URL="$input_url"
    else
      CYBER_PUBLIC_URL="https://$input_url"
    fi
  fi

  read -r -p "Administrator Username [admin]: " input_user
  if [[ -n "$input_user" ]]; then CYBER_ADMIN_USER="$input_user"; fi

  while true; do
    read -r -s -p "Administrator Password (min 10 characters): " pass1
    echo
    if [[ ${#pass1} -lt 10 ]]; then
      echo -e "${RED}[!] Password must be at least 10 characters.${NC}"
      continue
    fi
    read -r -s -p "Confirm Password: " pass2
    echo
    if [[ "$pass1" != "$pass2" ]]; then
      echo -e "${RED}[!] Passwords do not match. Try again.${NC}"
      continue
    fi
    CYBER_ADMIN_PASSWORD="$pass1"
    break
  done

  read -r -p "Security Profile (core / security) [${CYBER_PROFILE}]: " input_profile
  if [[ "$input_profile" == "security" ]]; then CYBER_PROFILE="security"; fi
fi

if [[ -z "$CYBER_ADMIN_PASSWORD" ]]; then
  # Auto-generate a secure random 16-char password if running non-interactively without password
  CYBER_ADMIN_PASSWORD=$(openssl rand -base64 15 | tr -dc 'A-Za-z0-9!@#%^&*' | head -c 16)
  echo -e "${YELLOW}[!] Generated secure initial password: ${CYBER_ADMIN_PASSWORD}${NC}"
fi

# Ensure release bundle signature is valid
if [[ ! -f "$SOURCE_DIR/RELEASE-MANIFEST.sig" || ! -f "$SOURCE_DIR/RELEASE-PUBLIC.pem" ]]; then
  echo -e "${CYAN}[*] Generating signed release bundle manifest...${NC}"
  "$NODE_EXEC" "$SOURCE_DIR/scripts/build-release.mjs"
fi

echo -e "${CYAN}[*] Verifying release integrity...${NC}"
"$NODE_EXEC" "$SOURCE_DIR/scripts/verify-release.mjs" "$SOURCE_DIR" "$SOURCE_DIR/RELEASE-PUBLIC.pem"

# Prepare private staging directory
STAGING_DIR=$(mktemp -d /var/tmp/cyberpross-install-XXXXXXXX)
RECOVERY_OUT="/root/.cyberpross-recovery-$(date +%s).txt"
trap 'rm -rf -- "$STAGING_DIR"' EXIT

echo -e "${CYAN}[*] Initializing administrator account and environment...${NC}"
SETUP_JSON=$(jq -n \
  --arg username "$CYBER_ADMIN_USER" \
  --arg password "$CYBER_ADMIN_PASSWORD" \
  --arg confirmation "$CYBER_ADMIN_PASSWORD" \
  --arg port "$CYBER_PORT" \
  --arg publicURL "$CYBER_PUBLIC_URL" \
  '{username: $username, password: $password, confirmation: $confirmation, port: $port, publicURL: $publicURL}')

printf "%s" "$SETUP_JSON" | "$NODE_EXEC" "$SOURCE_DIR/scripts/first-run-from-stdin.mjs" "$STAGING_DIR/data" "$STAGING_DIR/environment" "$RECOVERY_OUT"

echo -e "${CYAN}[*] Installing systemd service and configuring server-panel...${NC}"
/bin/bash "$SOURCE_DIR/scripts/install-service.sh" "$SOURCE_DIR" "$STAGING_DIR/data" "$NODE_EXEC" "$CYBER_PORT" "$CYBER_PUBLIC_URL" 1 "$CYBER_PROFILE" direct

# Verification
systemctl daemon-reload
systemctl enable --now server-panel.service

echo -e "\n${GREEN}${BOLD}================================================================${NC}"
echo -e "${GREEN}${BOLD}      🎉 CyberPross Server Panel Installed Successfully!        ${NC}"
echo -e "${GREEN}${BOLD}================================================================${NC}"
echo -e "${BOLD}Local Address:${NC}       http://127.0.0.1:${CYBER_PORT}/"
if [[ -n "$CYBER_PUBLIC_URL" ]]; then
  echo -e "${BOLD}Public Address:${NC}      ${CYBER_PUBLIC_URL}"
  echo -e "${BOLD}MCP Endpoint:${NC}        ${CYBER_PUBLIC_URL}/mcp"
else
  echo -e "${BOLD}MCP Endpoint:${NC}        http://127.0.0.1:${CYBER_PORT}/mcp"
fi
echo -e "${CYAN}${BOLD}Cloudflare Tunnel:${NC}   Zero open inbound ports (80/443) required!"
echo -e "                     Edge SSL is 100% automated by Cloudflare Edge."
echo -e "                     Point your Cloudflare Tunnel -> http://127.0.0.1:${CYBER_PORT}"
echo -e "${BOLD}Admin Username:${NC}      ${CYBER_ADMIN_USER}"
echo -e "${BOLD}Admin Password:${NC}      (configured)"
echo -e "${BOLD}Recovery Secrets:${NC}    Saved privately to ${RECOVERY_OUT} (0600)"
echo -e "\n${BOLD}Quick Management Commands:${NC}"
echo -e "  systemctl status server-panel"
echo -e "  journalctl -u server-panel -f"
echo -e "  sudo /opt/server-panel/app/scripts/update-service.sh"
echo -e "${GREEN}================================================================${NC}\n"
