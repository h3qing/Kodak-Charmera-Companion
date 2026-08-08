<p align="center">
  <img src="crates/charmera-app/icons/icon.png" width="140" alt="Charmera Companion" />
</p>

<h1 align="center">Charmera Companion</h1>

<p align="center">
  <strong>Your camera roll, named in plain English — entirely on your own machine.</strong>
</p>

<p align="center">
  <code>PICT0042.jpg</code> &nbsp;→&nbsp; <code>2026-03-30 brown dog on the couch.jpg</code>
</p>

<p align="center">
  <a href="#install"><b>Install</b></a> ·
  <a href="#cli-in-30-seconds"><b>CLI</b></a> ·
  <a href="https://h3qing.github.io/Kodak-Charmera-Companion/">Website</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

<p align="center">
  <a href="https://github.com/h3qing/Kodak-Charmera-Companion/actions/workflows/ci.yml"><img src="https://github.com/h3qing/Kodak-Charmera-Companion/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/h3qing/Kodak-Charmera-Companion/releases/latest"><img src="https://img.shields.io/github/v/release/h3qing/Kodak-Charmera-Companion?include_prereleases&sort=semver" alt="Latest release" /></a>
  <img src="https://img.shields.io/badge/runs-100%25%20offline-1C1C1C" alt="Runs offline" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-FCC200" alt="MIT License" /></a>
</p>

<p align="center">
  <img src="docs/screenshot.png" width="800" alt="Charmera Companion — photo grid with AI-generated labels" />
</p>

A local AI photo organizer. Point it at a folder of photos and it describes each
one with a vision model running on your machine, then renames the files so you
can actually find them later. No cloud, no API keys, no account.

Built for the **KODAK CHARMERA** keychain camera — it detects the SD card and
imports on its own — but nothing about it is camera-specific. Any folder of
JPEG, PNG, BMP or WebP works.

## Install

### Download (recommended)

Grab the latest `.dmg`, `.AppImage`, `.msi`, or standalone `charmera` CLI binary
from the [**releases page**](https://github.com/h3qing/Kodak-Charmera-Companion/releases/latest).

macOS builds are unsigned, so the first launch needs one command to clear the
quarantine flag:

```bash
xattr -dr com.apple.quarantine "/Applications/Charmera Companion.app"
```

### CLI via Homebrew

```bash
brew tap h3qing/tap
brew install charmera
```

### CLI via cargo

```bash
cargo install --git https://github.com/h3qing/Kodak-Charmera-Companion charmera-cli
```

### You also need Ollama

The AI runs locally through [Ollama](https://ollama.com/download), which is a
separate install. Once it's running, pull a vision model:

```bash
ollama pull moondream    # ~1.7 GB, fast, short descriptions
# ollama pull llava      # ~4.7 GB, noticeably better, wants 8 GB+ RAM
```

Charmera talks to `http://localhost:11434` by default; set `OLLAMA_HOST` to point
somewhere else. Run `charmera status` at any time to see exactly what's missing.

> **No camera?** Click *Try with sample photos* on the welcome screen to generate
> test images and explore everything without hardware.

## CLI in 30 seconds

Every command takes `--json`, so this doubles as an API for scripts and agents.

```console
$ charmera status
Charmera Companion v0.6.0

Camera:  /Volumes/SDCARD (connected)
AI:      1 model(s): moondream:latest
         using: moondream:latest
Storage: /Users/you/.charmera

$ charmera import --dest ~/Pictures/charmera
Imported 36/36 files from /Volumes/SDCARD to /Users/you/Pictures/charmera

$ charmera batch-label ~/Pictures/charmera --rename --dry-run
PICT0001.jpg: A brown and white dog sitting on a couch → 2026-03-30 brown and white dog.jpg
PICT0002.jpg: A sunset over the ocean with orange sky  → 2026-03-30 sunset over the ocean.jpg
PICT0003.jpg: Two people laughing at a park bench      → 2026-03-30 two people laughing.jpg

Labeled 3/3 photos

$ charmera label PICT0001.jpg --json
{
  "description": "A brown and white dog sitting on a couch, gazing at the camera",
  "tags": ["dog", "indoor", "couch", "pet"],
  "file": "PICT0001.jpg"
}
```

Both destructive commands (`rename`, `batch-label --rename`) take `--dry-run`
(`-n`), never overwrite an existing file, and report what they skipped. Shell
completions ship for bash, zsh, fish and PowerShell via `charmera completions`.

Full reference: `charmera help`, or `man charmera` after a Homebrew install.

## Why not Google Photos / Apple Photos / digiKam

| | Charmera | Google Photos | Apple Photos | digiKam |
|---|---|---|---|---|
| AI labeling | Local (Ollama) | Cloud | Cloud | Plugin |
| Privacy | Nothing leaves the machine | Uploads everything | iCloud | Local |
| CLI / automation | Full JSON API | None | None | Limited |
| Custom naming patterns | Yes | No | No | No |
| Keychain camera support | Built for it | Generic | Generic | Generic |
| Cost | Free | Storage limits | iCloud sub | Free |
| Open source | MIT | No | No | GPL |

## What it does

- **Auto-import** — plug in the camera, get a popup, click once. Or drag any
  folder onto the window.
- **Local AI labels** — auto-selects the best vision model you have installed
  (moondream, llava, bakllava, llava-phi3, minicpm-v).
- **Smart renaming** — `{YYYY}-{MM}-{DD} {content}` by default, so files sort
  chronologically. Tokens: `{MM}` `{DD}` `{YYYY}` `{content}` `{counter}`
  `{original}`. Every rename is previewed before it touches disk.
- **Search** — full-text over AI descriptions, plus tag filtering.
- **Duplicate detection** — by blake3 file hash; hides duplicates without
  deleting anything.
- **Storage** — optional auto-move to a NAS, Google Drive, or Dropbox folder.

<details>
<summary><strong>Keyboard shortcuts</strong></summary>

| Shortcut | Action |
|----------|--------|
| `Cmd+1` | All Photos |
| `Cmd+2` | Recent Imports |
| `Cmd+3` | Tags |
| `Cmd+4` | Duplicates |
| `Cmd+F` | Focus search |
| `Cmd+,` | Settings |
| `↑` `↓` `←` `→` | Move through the grid |
| `Enter` | Open the focused photo |
| `Space` | Toggle selection |
| `I` | Toggle info panel (in photo detail) |
| `Esc` | Back to grid |

</details>

<details>
<summary><strong>How it works</strong></summary>

1. **Connect camera** — mounts as USB mass storage (e.g. `/Volumes/SDCARD`)
2. **Auto-detect** — polls every 5s, shows a popup when new photos appear
3. **Import** — reads DCIM, hashes with blake3, generates 256px thumbnails
4. **Label** — sends each thumbnail to the best available Ollama vision model
5. **Tag** — extracts keyword tags from the description
6. **Rename** — applies your naming pattern, after you approve the preview
7. **Browse** — search, filter by tag, multi-select, export

</details>

<details>
<summary><strong>Compatible cameras</strong></summary>

Built for the **KODAK CHARMERA** (Generalplus CBB3 chipset), but works with any
camera that mounts as USB mass storage with photos in a DCIM folder.

| Spec | Value |
|------|-------|
| Photos | 1440×1080 JPEG |
| Video | 1440×1080 @ 30fps MJPEG |
| Boot splash | 960×720 JPEG (`SPIDCIM/SPI00.jpg`) |
| Connection | USB mass storage |

Firmware details: [docs/hardware-guide.md](docs/hardware-guide.md).

</details>

## Build from source

Needs [Rust](https://rustup.rs/) 1.85+, [Bun](https://bun.sh/), and Ollama.

```bash
git clone https://github.com/h3qing/Kodak-Charmera-Companion.git
cd Kodak-Charmera-Companion
just setup     # frontend deps + tauri-cli
just dev       # run the desktop app
just test      # 38 tests
```

No `just`? See the [justfile](justfile) for the raw commands.

<details>
<summary><strong>Architecture</strong></summary>

```
Tauri 2 Desktop App
├── Frontend: Solid.js + Tailwind CSS v4
└── Backend: Rust (3 crates)
    ├── charmera-core (library)
    │   ├── ai         → Ollama vision labeling
    │   ├── catalog    → SQLite (WAL), full-text search
    │   ├── import     → Camera detect, hashing, smart rename
    │   ├── thumbnails → 256px sharded cache
    │   ├── splash     → Camera boot screen editor
    │   └── export     → JPEG export
    ├── charmera-app   → Tauri commands
    └── charmera-cli   → JSON-first CLI
```

</details>

## Roadmap

- [ ] **Dark mode**
- [ ] **EXIF repair** — fix the broken timestamps these cameras write
- [ ] **AVI → MP4** — convert camera clips to something that plays everywhere
- [ ] **Video thumbnails**
- [ ] **CLIP embeddings** — semantic search ("photos near the ocean")
- [ ] **Face grouping**
- [x] **Cloud sync** — Google Drive & Dropbox *(v0.6.0)*
- [x] **Linux + Windows support** *(v0.3.0)*

Have an idea? [Open a discussion](https://github.com/h3qing/Kodak-Charmera-Companion/discussions)
or [file a feature request](https://github.com/h3qing/Kodak-Charmera-Companion/issues/new?template=feature_request.yml).

## Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Good first
issues are labeled
[`good first issue`](https://github.com/h3qing/Kodak-Charmera-Companion/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

## License

MIT — see [LICENSE](LICENSE).

> Not affiliated with Kodak. KODAK and CHARMERA are trademarks of their
> respective owners.
