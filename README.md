# Kodak Charmera Companion

Desktop photo organizer with local AI for **KODAK CHARMERA** and other Generalplus CBB3-based keychain digital cameras.

> Not affiliated with Kodak. KODAK and CHARMERA are trademarks of their respective owners.

## What it does

- **Auto-label photos** with local AI (moondream via Ollama, runs 100% on your machine)
- **Smart import** from camera with AI-based file renaming
- **Browse & search** photos by AI-generated tags and descriptions
- **Photo effects** (vintage, noir, faded, warm, cool, sharp, soft, vignette, grain, light leak)
- **Photo frames** (polaroid, film strip, simple, rounded)
- **Multi-select & batch export** photos to any folder
- **Custom boot splash** screen for your camera
- **Tag browser** to organize photos by AI-detected content

All processing happens locally. No cloud, no API keys, no subscriptions.

## Architecture

```
Tauri Desktop App (Solid.js + Tailwind)
    │
Rust Backend (charmera-core)
    ├── catalog    (SQLite, search)
    ├── effects    (10 effects, 4 frames)
    ├── ai         (Ollama + moondream, local)
    ├── import     (camera detect, EXIF, smart rename)
    ├── thumbnails (256px cache)
    ├── splash     (boot screen editor)
    └── export     (batch pipeline)
```

## Install

### Desktop App (Tauri)

Requires: Rust, Node.js/Bun, Ollama

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Ollama + vision model
curl -fsSL https://ollama.com/install.sh | sh
ollama pull moondream

# Build & run
cd frontend && bun install && cd ..
cargo tauri dev
```

### Python CLI (original)

```bash
pip install -e .
kodak-helper import --label "beach day"
```

### Rust CLI (agent-friendly)

```bash
cargo build -p charmera-cli
charmera import /Volumes/SDCARD --json
charmera list --json
charmera effects photo.jpg --effects vintage,grain --output edited.jpg
```

## Usage

### Desktop App

1. Connect your KODAK CHARMERA via USB
2. Click **Import from Camera** (or Add Folder)
3. Click **Auto Label Photos** to run local AI analysis
4. Browse by tags, search by description, multi-select and export

### Effects

| Effect | Description |
|--------|-------------|
| `vintage` | Warm tones, slight desaturation |
| `noir` | High-contrast black & white |
| `faded` | Lifted blacks, film fade look |
| `warm` | Golden warm tones |
| `cool` | Blue cool tones |
| `sharp` | Sharpen details |
| `soft` | Dreamy soft focus |
| `vignette` | Dark edges |
| `grain` | Film grain noise |
| `light_leak` | Warm light leak in corner |

### Frames

| Frame | Description |
|-------|-------------|
| `simple` | Solid white border |
| `polaroid` | Classic polaroid with thick bottom |
| `film_strip` | 35mm film strip with sprocket holes |
| `rounded` | Rounded corners |

## Hardware Hacking

Want to modify the actual firmware? See [docs/hardware-guide.md](docs/hardware-guide.md).

## Camera Specs (Generalplus CBB3)

- Photos: 1440x1080 JPEG
- Video: 1440x1080 @ 30fps MJPEG + mono audio
- Boot splash: 960x720 JPEG (stored in `SPIDCIM/SPI00.jpg`)
- USB: Mass storage (mounts as SD card)

## License

MIT
