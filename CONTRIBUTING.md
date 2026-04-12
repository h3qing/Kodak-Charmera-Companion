# Contributing to Charmera Companion

Thanks for your interest in contributing! This project welcomes PRs for bug fixes, features, and documentation.

## Quick Setup

```bash
# Prerequisites: Rust, Bun, Ollama
git clone https://github.com/h3qing/Kodak-Charmera-Companion.git
cd Kodak-Charmera-Companion

# Install frontend deps
cd frontend && bun install && cd ..

# Run in development
cargo tauri dev
```

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
3. Run tests: `cargo test -p charmera-core`
4. Format: `cargo fmt --all`
5. Build frontend: `cd frontend && bun run build`
6. Open a PR against `main`

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
cargo test -p charmera-core    # 41 unit tests
cargo check --workspace        # Full type check
cargo fmt --all -- --check     # Format check
cd frontend && bun run build   # Frontend build
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
