# Contributing to Charmera Companion

Thanks for your interest in contributing! This project welcomes PRs for bug fixes, features, and documentation.

## Quick Setup

```bash
# Prerequisites: Rust, Bun, Ollama
git clone https://github.com/h3qing/Kodak-Charmera-Companion.git
cd Kodak-Charmera-Companion

just setup   # frontend deps + tauri-cli
just dev     # run the desktop app
```

Without `just`:

```bash
cargo install tauri-cli --locked
cd frontend && bun install && cd ..
cargo tauri dev
```

Requires Rust 1.85+ (edition 2024), [Bun](https://bun.sh/), and
[Ollama](https://ollama.com/download) with a vision model
(`ollama pull moondream`). On Linux you also need the Tauri system
dependencies: `libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev
libayatana-appindicator3-dev librsvg2-dev`.

## Project Structure

```
crates/
  charmera-core/   # Core library (AI, catalog, import, export)
  charmera-app/    # Tauri desktop app (commands, state)
  charmera-cli/    # CLI tool (--json for agent use)
frontend/          # Solid.js + Tailwind CSS v4
docs/              # GitHub Pages site
scripts/           # Build scripts (icon generation)
```

## Development Workflow

1. Create a feature branch from `main`
2. Make changes with clear, focused commits
3. Run the checks CI runs: `just lint && just test`
   (raw: `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`,
   `cargo test --workspace`, and `cd frontend && bunx tsc --noEmit && bun run build`)
4. Open a PR against `main`

Clippy is enforced with `-D warnings`, and the frontend is type-checked with
`tsc --noEmit`. Both are green on `main` — please keep them that way.

## Commit Messages

Use conventional commits:

```
feat: add drag-and-drop import
fix: thumbnail cache not updating after rename
docs: update hardware guide
refactor: extract thumbnail cache logic
```

## Code Style

- **Rust**: Follow `cargo fmt` + `cargo clippy`
- **TypeScript**: Solid.js patterns, Tailwind utility classes
- **CSS**: Use the Kodak design system colors (`kodak-yellow`, `kodak-red`, etc.)
- **Immutability**: Prefer creating new objects over mutation

## Areas to Contribute

- **Camera support**: Test with other keychain cameras
- **AI models**: Test with different Ollama vision models
- **Platform**: Help with Linux/Windows support
- **UI**: Improve accessibility, animations, responsive design

## Testing

```bash
cargo test --workspace          # 38 tests
cargo check --workspace        # Full type check
cargo fmt --all -- --check     # Format check
cd frontend && bun run build   # Frontend build
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
