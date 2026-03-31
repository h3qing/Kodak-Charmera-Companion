# Changelog

All notable changes to Charmera Companion will be documented in this file.

## [0.5.0] - 2026-03-31

### Added
- **PNG, BMP, WebP support** — import any photo format, not just JPEG
- **CLI `status` command** — system health check (camera, AI, storage)
- **CLI `info` command** — show EXIF, dimensions, blake3 hash
- **Shell completions** — bash, zsh, fish, powershell
- **JSON label export** — export all metadata from Settings
- **Comparison table** — vs Google Photos, Apple Photos, digiKam in README
- **CLI demo** in README with expandable terminal session

### Fixed
- **Robustness**: 120s timeout on AI requests, 5s on model check
- **Error recovery**: one bad file doesn't abort entire import
- **Panic prevention**: CLI handles files without extensions
- **Broader positioning**: "Works with any photo folder" in description

### Changed
- 11 CLI commands total
- 15 GitHub topics for discoverability
- Updated website SEO and meta tags

## [0.4.1] - 2026-03-31

### Added
- **CLI `info` command** — show EXIF, dimensions, blake3 hash for any photo
- **CLI `completions` command** — shell completions for bash, zsh, fish, powershell
- **Export Labels as JSON** — save all metadata from Settings
- **CLI demo in README** — expandable terminal session showing all commands
- **Comparison table** — vs Google Photos, Apple Photos, digiKam

### Changed
- Broader positioning: "Works with any JPEG folder" alongside keychain camera focus
- Added GitHub topics: photo-manager, image-labeling, local-ai, cli-tool
- Updated website SEO meta tags
- CLI now has 10 commands (import, list, label, rename, batch-label, info, detect, effects, splash, completions)

## [0.4.0] - 2026-03-31

### Added
- **CLI `batch-label`** — label + rename entire folders in one command
- **CLI `rename`** — single-file AI rename pipeline
- **Export Labels as JSON** — settings button to export all metadata
- **Homebrew formula** — `brew install charmera`
- **Man page** — `man charmera` with all 8 commands
- **CLI demo in README** — expandable terminal session
- **Comparison table** — vs Google Photos, Apple Photos, digiKam
- **40 tests** (up from 35)

### Fixed
- **Photos persist after camera disconnect** — copied to ~/.charmera/photos/
- Import progress bar with per-file events
- Zero compiler warnings

## [0.3.2] - 2026-03-31

### Added
- **Copy photos locally** — photos now copied to `~/.charmera/photos/` during import, accessible after camera disconnect
- **Import progress bar** — green progress bar with per-file status during import
- **CLI `rename` command** — `charmera rename photo.jpg` does AI label + rename in one step
- **Search highlighting** — matching tags highlighted in yellow, overlays visible during search
- **Version in status bar** — shows current version

### Fixed
- Photos no longer inaccessible after camera is unplugged (critical)
- Import shows per-file progress instead of generic "importing" message

## [0.3.1] - 2026-03-31

### Added
- **Demo mode** — "Try with sample photos" generates test images without a camera
- **Before/after comparison** — side-by-side view (C key) for effect preview
- **CLI `label` command** — `charmera label photo.jpg --json` for AI agents
- **CLI `detect` command** — `charmera detect --json` for camera status
- **Photo card tooltips** — hover to see filename, dimensions, AI description
- **Website improvements** — detail screenshot, demo hint, 2 new feature cards
- **Crate documentation** — module-level docs on charmera-core

### Changed
- 35 tests (up from 27) — AI parsing, tag extraction, EXIF, edge cases
- Zero compiler warnings (removed dead code, fixed duplicate derives)
- Python code marked as legacy with migration guide

## [0.3.0] - 2026-03-31

### Added
- **Cross-platform camera detection** — Linux (/media, /mnt, /run/media) and Windows (D:-Z:) support
- **Dynamic volume scanning** — finds any mounted volume with a DCIM folder
- **Batch effects export** — apply effects to multiple selected photos at once
- **Accessibility** — ARIA roles, labels, dialog management, progress bar attributes
- **Security Policy** (SECURITY.md) — design principles and vulnerability reporting
- **Detail view screenshot** in README with expandable gallery
- **Roadmap** section with 10 planned features

### Changed
- CI matrix now tests on both macOS and Ubuntu
- 27 tests (up from 22) with catalog CRUD and settings tests
- Photo detail mockup added to README and website

## [0.2.1] - 2026-03-31

### Added
- **Paginated photo loading** — loads 100 photos initially, "Load more" button at bottom
- **Toast notifications** — non-intrusive success/error messages replace alert()/confirm()
- **Always-visible export** — "Save Copy" or "Export with Effects" button in detail view
- **Welcome screen status** — camera and AI readiness indicators
- **Social preview** — branded 1280x640 image for link sharing
- **SEO** — Open Graph, Twitter cards, sitemap, robots.txt

### Fixed
- Batch hide no longer reloads the entire page
- Export shows loading state and uses original filename
- Double-click-to-confirm pattern for destructive batch actions

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
- **EXIF date extraction** — reads DateTimeOriginal from JPEG metadata on import
- **Multi-model AI** — auto-detects and uses best Ollama vision model (moondream, llava, bakllava)
- **Photo sorting toolbar** — sort by newest, oldest, name A-Z/Z-A with grid size toggle
- **Smart Albums** — auto-groups photos by date with cover images and breadcrumb navigation
- **One-line install script** — `curl | bash` setup for macOS
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
