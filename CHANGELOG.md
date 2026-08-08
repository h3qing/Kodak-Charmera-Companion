# Changelog

All notable changes to Charmera Companion will be documented in this file.

## [Unreleased]

### Security
- **Content Security Policy is now set.** It was `null`, i.e. disabled, while
  SECURITY.md advertised XSS protection. AI-generated text is rendered in the
  UI, so this matters. No remote origin is permitted.
- **The webview no longer has filesystem permissions.** `fs:default`,
  `fs:allow-write-text-file` and `fs:allow-read-text-file` were granted to
  every window (`"windows": ["*"]`) with no path scope. Label export now writes
  from Rust, so the `fs` plugin was removed outright and the capability is
  scoped to the `main` window with dialogs only.
- **`test_nas_path` was an arbitrary write/delete primitive.** It created a
  fixed-name `.charmera_test` in any path the frontend named and then deleted
  it — destroying a pre-existing file of that name. It now requires a
  directory and uses a unique probe opened with `create_new`, so it can only
  remove a file it just created.
- **Path traversal in the rename dialog** — filenames are user-editable and were
  passed straight to `Path::with_file_name`, so an absolute path or one with
  `..` relocated the photo anywhere on disk instead of renaming it in place.
  Rename targets are now validated as single path components, and the resolved
  target must stay in the source directory.
- **Arbitrary file read via `get_thumbnail_base64`** — the command base64-encoded
  whatever path the webview handed it. Paths are now canonicalized and must
  resolve inside the thumbnail cache.

### Fixed
- **Database writes were fire-and-forget.** `Catalog::write` returned `Ok` as
  soon as an operation was *queued*; the writer thread only logged failures.
  An import could report "imported 100" with all 100 inserts having failed, and
  callers papered over the race with `thread::sleep(100ms)`. Writes are now
  acknowledged, the sleeps are gone, and there are tests proving a failing
  write surfaces its real cause and does not kill the writer thread.
- **Queued writes were lost on quit.** The writer thread was never joined, so
  labels and renames made just before closing could vanish. `Catalog` now
  drains on drop.
- **Every Tauri command ran on the main thread**, so NAS network copies,
  full-resolution base64 encoding and duplicate scans froze the UI. All 33 run
  on the async threadpool now.
- **Decompression bombs.** `image::open` was called with no limits in five
  places; a 20000×20000 PNG decodes to over a gigabyte. All decoding now goes
  through `imageio::open_limited`, with tests using a real oversize image.
- **Search treated `%` and `_` as wildcards.** Searching for `100%` silently
  matched the entire library. `LIKE` patterns are escaped now, with tests.
- **N+1 query in duplicate detection** — one prepared statement per group, up
  to 100 round-trips on the UI path. Collapsed into a single `IN` query.
- **Rows were silently dropped.** Six `filter_map(|r| r.ok())` sites made a
  malformed row cause a photo to disappear from the UI with no error at all.
  These now propagate with context.
- **Label export built the whole catalog in memory** as `Vec<serde_json::Value>`,
  serialized it to one pretty-printed string, and passed that over IPC for the
  frontend to write — three copies of the library plus a multi-megabyte IPC
  payload. It streams to disk from Rust now.
- **Auto-labeling didn't preflight**, so a stopped Ollama produced N identical
  failures and a bare "labeled 0". It now checks once up front and reports
  failures and any un-run remainder rather than always saying "Done!".
- **Crash that bricked the app until restart** — filename truncation sliced the
  AI description by *bytes*, so any description whose 30th byte fell inside a
  multi-byte character (`café`, CJK, emoji) panicked. Because the panic happened
  while the catalog mutex was held, the mutex was poisoned and every subsequent
  command failed with `lock: poisoned lock`. Truncation is now char-based, with
  regression tests across the boundary. Same class of bug fixed in EXIF date
  parsing and NAS date-folder derivation.
- **`charmera import` imported nothing** — it was a copy of `list` that printed
  filenames. It now actually copies (or `--move`s) files, with `--dest`,
  `--dry-run`, collision handling, and a JSON report.
- **`batch-label` reported success when everything failed** — a run against a
  stopped Ollama labeled 0 photos and still exited 0, so cron jobs and scripts
  saw a green run. It now preflights the connection and exits non-zero when
  nothing was labeled.
- **Ollama errors were all reported as "timeout 120s"** — including
  connection-refused and rejected images. Errors now name the actual cause and
  the fix (start Ollama / pull the model / try another photo).
- **AI unavailability was a dead end in the UI** — the three distinct causes
  (Ollama missing, not running, no vision model) collapsed into one boolean and
  the Auto Label button simply vanished. The button now stays visible but
  disabled, with the specific reason and remediation beside it.
- **Import and labeling errors were invisible** — every error path wrote to a
  status field that only rendered while an import was in flight, so failures
  showed nothing at all. All error paths now raise a toast.
- **White screen on the photo detail view** — a non-null assertion on a photo
  that can disappear mid-refresh crashed the whole tree with no error boundary.
- **Film strip fired one IPC call per photo in the library** — opening a photo
  with 500 loaded issued 500 concurrent thumbnail requests. Now windowed.
- **Sidebar photo counts never appeared** — the badge was computed outside a
  reactive scope, so it was permanently baked as `undefined`.
- **NAS auto-move offered to move the entire library**, not the batch just
  labeled — with "keep local copies" off, that deleted thousands of untouched
  files.
- **Rename dialog could rename the wrong batch** — the selection map was seeded
  once on mount and went stale when new proposals arrived.
- **Skipped renames were reported as successes** — `apply_renames` now returns
  `{renamed, skipped}` and the UI shows both.
- **Shift-click range selection used the unsorted photo list**, so ranges were
  scattered whenever the sort order wasn't insertion order.
- Rename collisions, unreadable rows, and "no photos found" messages now name
  the real reason. "No JPEG photos found" listed only JPEG despite accepting
  PNG, BMP and WebP.
- Errors no longer masquerade as reassuring empty states in the Duplicates,
  Smart Albums and Tags views.

### Added
- `OLLAMA_HOST` is honored, matching Ollama's own convention — remote servers,
  non-default ports and Docker now work without a rebuild.
- `charmera status` reports *why* AI is unavailable, not just that it is.
- Keyboard navigation in the photo grid (arrows, Enter, Space) with proper
  listbox/option roles; the grid was previously mouse-only.
- An error boundary with a recoverable crash screen.
- Release workflow producing `.dmg`, `.AppImage`, `.msi` and standalone CLI
  binaries, so installing no longer requires compiling Rust.
- `justfile` with `setup`, `dev`, `build`, `test`, `lint`, `cli`.

### Changed
- **Default naming pattern is now `{YYYY}-{MM}-{DD} {content}`** (was
  `b {MM}-{DD}-{YYYY} {content}`). ISO-style dates sort chronologically in any
  file manager, which is the point of renaming. Existing saved patterns are
  untouched.
- Primary buttons use charcoal text on Kodak yellow (~11.9:1) instead of white
  (~1.75:1), which failed WCAG AA badly.
- Test count is **38** (34 core + 4 app), corrected from the stale "41" claimed
  in the README, CONTRIBUTING and this changelog.
- CI now runs clippy with `-D warnings`, the full workspace test suite,
  frontend type-checking, and installs the Linux system dependencies the
  Ubuntu job was silently missing.
- `tsconfig.json` includes the `DOM` lib — the frontend had 29 type errors and
  effectively no type safety on DOM code. Now zero.
- Rust MSRV declared as 1.85 via `rust-version` (edition 2024).

### Removed
- Dead dependencies `img_hash` and `rayon`, which pulled in a second full copy
  of the `image` crate. Also `tokio` (declared with `features = ["full"]` for a
  single channel that is now `std::sync::mpsc`) and `tauri-plugin-fs`.
- Seven `WriteOp` variants that were never constructed (albums, ratings,
  embeddings, thumbnail updates, unhide, insert-tag) along with their SQL —
  unreachable code that had never executed, so it could not be trusted anyway.
- Dead functions `ai::check_ollama`, `Catalog::write_async`,
  `AppState::import_from_path`, and five unused constants.
- `splash --text`, which was advertised in `--help` and silently ignored.

### Known gaps
- The `albums`, `album_photos`, `duplicate_groups`, `duplicate_members`,
  `watched_folders` and `jobs` tables are created by the initial migration but
  never queried. They are left in place deliberately: editing an already-shipped
  migration would break existing installs. Remove them in a future migration if
  they stay unused.
- AI labeling is still sequential. Local Ollama serializes per model, so
  concurrency here is not the clear win it looks like; it was left alone rather
  than added speculatively.

#### Earlier in this cycle
- **Photo effects & frames** — dropped the 10-effect / 4-frame pipeline, compare view, batch effects UI, and `charmera effects` CLI subcommand. Charmera is now a focused photo-management app: import, label, browse, rename, export. Editing belongs elsewhere.
- `edits` catalog table, `EditInfo` type, `SaveEdit` write op, `preview_effect` Tauri command
- Keyboard shortcuts `E` (toggle effects) and `C` (compare) — both freed up
- `fastrand` dependency (only used by the `grain` effect)
- Legacy `kodak_helper/effects.py` and `tests/test_effects.py`

## [0.6.0] - 2026-04-01

### Added
- **NAS integration** — guided setup, auto-move photos after labeling, date-organized folders
- **Google Drive sync** — auto-detects desktop app, writes to sync folder, zero OAuth
- **Dropbox sync** — auto-detects desktop app, same zero-config approach
- **Guided Storage Setup wizard** — step-by-step flow for NAS, local, cloud destinations
- **NAS Move Dialog** — per-batch keep/delete local copies toggle
- **NAS status indicator** in status bar

### Fixed
- **AI label returns empty** when moondream prefixes response with leading newline
- Removed accidentally committed `.claude/` directory
- Replaced broken CI badge with version badge
- Fixed git push email privacy restriction

### Changed
- 41 tests (up from 40)
- Website redesigned with scroll animations, typing terminal, parallax
- `.claude/` added to `.gitignore`

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
