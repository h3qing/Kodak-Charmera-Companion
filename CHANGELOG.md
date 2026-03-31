# Changelog

All notable changes to Charmera Companion will be documented in this file.

## [0.2.0] - 2026-03-31

### Added
- **Vintage Kodak 1987 UI** — complete visual redesign matching the KODAK CHARMERA camera
  - Bright yellow primary palette with rainbow stripe accents
  - Camera-inspired sidebar with "Kodak Charmera" branding and photo count badges
  - Film frame borders on photo cards
  - New 1024x1024 app icon with camera lens design
- **Camera auto-detect popup** — polls every 5s, shows notification with photo count
- **Auto AI labeling after import** — seamless import → label → rename workflow
- **Customizable file naming patterns** — default `b {MM}-{DD}-{YYYY} {content}`
  - Token editor with `{MM}`, `{DD}`, `{YYYY}`, `{content}`, `{counter}`, `{original}`
  - Live preview in both Settings and Rename dialog
- **Settings view** — naming pattern config, AI status, about section
- **Settings KV store** — SQLite-backed persistent settings
- **Recent Imports view** — shows photos imported in the last 24 hours
- **Drag-and-drop import** — drop any folder onto the app to import photos
- **Duplicate detection** — find identical photos by blake3 hash, hide duplicates
- **Keyboard shortcuts** — Cmd+1-4 for views, Cmd+F to search, Cmd+, for settings
- **Sidebar photo count badges** — see library size at a glance
- **GitHub Actions CI** — Rust check/test, frontend build, format check
- **GitHub Pages site** — vintage landing page at h3qing.github.io/Kodak-Charmera-Companion

### Fixed
- AI labeling returning empty descriptions (simplified moondream prompt)
- Effects panel hidden by default in photo detail view
- Silent failures in effect preview — now shows visible error messages
- Tag extraction expanded from 27 to 55+ keywords with whole-word matching

### Changed
- macOS bundle config: DMG + .app, photography category, minimum 10.15
- Upgraded color palette from muted amber to bright Kodak Yellow (#FCC200)

## [0.1.0] - 2026-03-29

### Added
- Initial release of Charmera Companion
- Tauri 2 desktop app with Solid.js frontend
- Photo import from camera or folder with blake3 deduplication
- AI photo labeling via Ollama + moondream (local, no cloud)
- 10 photo effects: vintage, noir, faded, warm, cool, sharp, soft, vignette, grain, light leak
- 4 photo frames: simple, polaroid, film strip, rounded
- Tag browser with AI-generated and user tags
- Multi-select with batch export
- File rename with AI-generated descriptions
- Boot splash screen editor (960x720)
- Rust CLI with --json output for AI agent integration
- SQLite catalog with WAL mode and full-text search
