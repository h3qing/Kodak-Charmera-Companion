# Charmera Companion — task runner.
#
#   brew install just     (or: cargo install just)
#   just                  list every recipe
#   just setup            one-time setup
#   just dev              run the desktop app with hot reload
#
# Prerequisites: Rust 1.85+ (edition 2024), Bun, and — for AI labelling —
# Ollama with a vision model (`ollama pull moondream`).

set shell := ["bash", "-uc"]

# List available recipes.
default:
    @just --list --unsorted

# One-time setup: frontend dependencies + the Tauri CLI.
setup:
    cd frontend && bun install
    @command -v cargo-tauri >/dev/null 2>&1 \
        && echo "tauri-cli already installed" \
        || cargo install tauri-cli --version "^2" --locked
    @echo ""
    @echo "Setup done. Next: 'just dev'."
    @echo "For AI labelling you also need Ollama running: ollama pull moondream"

# tauri.conf.json's beforeDevCommand starts 'bun run dev' on :1420 for us.
# Run the desktop app in development mode (hot reload).
dev:
    cargo tauri dev

# tauri.conf.json's beforeBuildCommand runs 'bun run build' for us; the
# bun install here only ensures dependencies are present first.
#
# CI=true is required on macOS, not cosmetic: without it bundle_dmg.sh asks
# Finder over AppleScript to lay out the disk-image window, which stalls and
# then fails with "AppleEvent timed out (-1712)" whenever Finder automation
# isn't available (ssh, tmux, a locked screen, or an automation-permission
# prompt you never see). Setting it skips the prettify step; the .dmg is
# otherwise identical.
#
# Build the release desktop bundle (.dmg / .deb + .AppImage / .msi).
build:
    cd frontend && bun install
    CI=true cargo tauri build

# Build just the CLI binary in release mode.
build-cli:
    cargo build --release -p charmera-cli
    @echo "Binary: target/release/charmera"

# Run the full Rust test suite.
test:
    cargo test --workspace

# Check formatting and run clippy exactly as CI does.
lint:
    cargo fmt --all -- --check
    cargo clippy --workspace --all-targets -- -D warnings

# Apply rustfmt in place.
fmt:
    cargo fmt --all

# Type-check and build the frontend (vite build alone does not type-check).
check-frontend:
    cd frontend && bunx tsc --noEmit
    cd frontend && bun run build

# Run the charmera CLI without installing it, e.g. 'just cli status'.
cli *args:
    @cargo run --quiet --release -p charmera-cli -- {{ args }}

# Remove Rust and frontend build output.
clean:
    cargo clean
    rm -rf frontend/dist
