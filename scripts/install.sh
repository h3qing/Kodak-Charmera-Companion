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

if ! check_cmd git; then
  echo -e "${RED}git not found.${NC} Install the Xcode command line tools first:"
  echo "  xcode-select --install"
  exit 1
fi

if ! check_cmd rustc; then
  echo -e "${RED}Rust not found.${NC}"
  echo ""
  # This script is documented as `curl ... | bash`, where stdin is the script
  # itself — a bare `read` would eat the next line of script and never reach
  # the user. Ask on the terminal when there is one, and default to installing
  # when there isn't (the user opted in by running the installer at all).
  REPLY="y"
  if [ -r /dev/tty ]; then
    read -p "Install Rust now? (Y/n) " -n 1 -r < /dev/tty
    echo
    [ -z "$REPLY" ] && REPLY="y"
  else
    echo -e "${DIM}No terminal attached — installing Rust automatically.${NC}"
  fi

  if [[ $REPLY =~ ^[Yy]$ ]]; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    # shellcheck source=/dev/null
    . "$HOME/.cargo/env"
  else
    echo "Install Rust from https://rustup.rs/ and re-run this script."
    exit 1
  fi
fi
echo -e "  ${GREEN}✓${NC} Rust $(rustc --version | awk '{print $2}')"

# Bun specifically, not "bun or npm": tauri.conf.json's beforeDevCommand and
# beforeBuildCommand are literally `bun run dev` / `bun run build`, so an
# npm-only machine finishes this installer and then fails at launch with
# "bun: command not found".
if check_cmd bun; then
  echo -e "  ${GREEN}✓${NC} Bun $(bun --version)"
else
  echo -e "${RED}Bun not found.${NC} Charmera's Tauri config invokes bun directly."
  echo "  curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

if check_cmd ollama; then
  echo -e "  ${GREEN}✓${NC} Ollama"
else
  echo -e "${YELLOW}⚠${NC}  Ollama not found (optional — needed for AI labeling)"
  echo -e "  ${DIM}Install: https://ollama.com/download${NC}"
fi

# Tauri CLI — required for `cargo tauri dev`
if check_cmd cargo-tauri; then
  echo -e "  ${GREEN}✓${NC} tauri-cli $(cargo tauri --version 2>/dev/null | awk '{print $2}')"
else
  echo -e "${DIM}Installing tauri-cli (one-time, ~2 min)...${NC}"
  cargo install tauri-cli --locked
  echo -e "  ${GREEN}✓${NC} tauri-cli installed"
fi

echo ""

# Clone or update
INSTALL_DIR="$HOME/Kodak-Charmera-Companion"
if [ -d "$INSTALL_DIR" ]; then
  echo -e "${DIM}Updating existing installation...${NC}"
  cd "$INSTALL_DIR"
  # Don't let `set -e` kill the whole install because the checkout is dirty or
  # has diverged — that's the user's local work, not an installer failure.
  if ! git pull --ff-only; then
    echo -e "${YELLOW}⚠${NC}  Could not fast-forward $INSTALL_DIR (local changes?)."
    echo -e "  ${DIM}Continuing with the checkout as-is.${NC}"
  fi
else
  echo -e "${DIM}Cloning repository...${NC}"
  git clone https://github.com/h3qing/Kodak-Charmera-Companion.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Install frontend deps
echo -e "${DIM}Installing frontend dependencies...${NC}"
cd frontend
bun install
cd ..

# Pull moondream model if Ollama is available
if check_cmd ollama; then
  echo -e "${DIM}Pulling moondream vision model (~1.7 GB)...${NC}"
  # Show Ollama's own error rather than replacing it with a guess.
  if ! ollama pull moondream; then
    echo -e "${YELLOW}⚠${NC}  Could not pull moondream (see the error above)."
    echo -e "  ${DIM}Start Ollama with 'ollama serve', then run 'ollama pull moondream'.${NC}"
    echo -e "  ${DIM}Everything except AI labeling works without it.${NC}"
  fi
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
