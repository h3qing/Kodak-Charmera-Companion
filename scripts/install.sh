#!/bin/bash
# Charmera Companion — Quick Install Script
# Usage: curl -fsSL https://raw.githubusercontent.com/h3qing/Kodak-Charmera-Companion/main/scripts/install.sh | bash

set -e

YELLOW='\033[1;33m'
RED='\033[0;31m'
GREEN='\033[0;32m'
DIM='\033[2m'
NC='\033[0m'

echo ""
echo -e "${YELLOW}╔═══════════════════════════════════╗${NC}"
echo -e "${YELLOW}║   Charmera Companion Installer    ║${NC}"
echo -e "${YELLOW}║   Photo organizer for KODAK       ║${NC}"
echo -e "${YELLOW}║   CHARMERA keychain cameras       ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════╝${NC}"
echo ""

check_cmd() {
  command -v "$1" &>/dev/null
}

# Check dependencies
echo -e "${DIM}Checking dependencies...${NC}"

if ! check_cmd rustc; then
  echo -e "${RED}Rust not found.${NC} Install it with:"
  echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  echo ""
  read -p "Install Rust now? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
  else
    exit 1
  fi
fi
echo -e "  ${GREEN}✓${NC} Rust $(rustc --version | awk '{print $2}')"

if check_cmd bun; then
  PKG_MGR="bun"
  echo -e "  ${GREEN}✓${NC} Bun $(bun --version)"
elif check_cmd npm; then
  PKG_MGR="npm"
  echo -e "  ${GREEN}✓${NC} npm $(npm --version)"
else
  echo -e "${RED}Neither Bun nor npm found.${NC} Install Bun:"
  echo "  curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

if check_cmd ollama; then
  echo -e "  ${GREEN}✓${NC} Ollama"
else
  echo -e "${YELLOW}⚠${NC}  Ollama not found (optional — needed for AI labeling)"
  echo -e "  ${DIM}Install: https://ollama.com/download${NC}"
fi

echo ""

# Clone or update
INSTALL_DIR="$HOME/Kodak-Charmera-Companion"
if [ -d "$INSTALL_DIR" ]; then
  echo -e "${DIM}Updating existing installation...${NC}"
  cd "$INSTALL_DIR"
  git pull --ff-only
else
  echo -e "${DIM}Cloning repository...${NC}"
  git clone https://github.com/h3qing/Kodak-Charmera-Companion.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Install frontend deps
echo -e "${DIM}Installing frontend dependencies...${NC}"
cd frontend
if [ "$PKG_MGR" = "bun" ]; then
  bun install
else
  npm install
fi
cd ..

# Pull moondream model if Ollama is available
if check_cmd ollama; then
  echo -e "${DIM}Pulling moondream vision model...${NC}"
  ollama pull moondream 2>/dev/null || echo -e "${YELLOW}⚠${NC}  Could not pull moondream (is Ollama running?)"
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Installation complete!          ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════╝${NC}"
echo ""
echo "To launch Charmera Companion:"
echo ""
echo -e "  ${YELLOW}cd $INSTALL_DIR${NC}"
echo -e "  ${YELLOW}cargo tauri dev${NC}"
echo ""
echo -e "${DIM}First build takes a few minutes. Subsequent launches are fast.${NC}"
echo ""
