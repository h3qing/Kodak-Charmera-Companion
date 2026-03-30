# Kodak Helper

Toolkit for the **KODAK CHARMERA** and other Generalplus CBB3-based keychain digital cameras.

## Features

- **Smart Import** -- Import photos with `mm-dd-yyyy content` renaming
- **Custom Boot Splash** -- Replace the camera's startup screen with your own image
- **Photo Effects** -- Vintage, noir, faded, warm, cool, sharp, soft, vignette, grain, light leak
- **Photo Frames** -- Simple border, polaroid, film strip, rounded corners
- **Hardware Hacking Guide** -- Dump and modify the camera's firmware

## Install

```bash
pip install -e .
```

## Usage

### Import photos from camera

```bash
# Auto-detect camera, label photos
kodak-helper import --label "beach day"

# Specify source and destination
kodak-helper import --source /Volumes/SDCARD --dest ~/Photos/charmera --label dog
```

Files are renamed to: `03-29-2026 beach day 001.jpg`

### List photos on camera

```bash
kodak-helper list
```

### Set custom boot splash screen

```bash
# Preview -- creates SPI00.jpg locally
kodak-helper splash my-art.png

# Add text overlay
kodak-helper splash my-art.png --text "HELLO WORLD"

# Install directly to camera
kodak-helper splash my-art.png --install
```

### Apply effects and frames

```bash
# Single effect
kodak-helper effects photo.jpg --effect vintage

# Stack effects
kodak-helper effects photo.jpg --effect warm --effect vignette

# Add a frame
kodak-helper effects photo.jpg --frame polaroid

# Combine effects + frame
kodak-helper effects photo.jpg --effect vintage --effect grain --frame film_strip

# Process entire folder
kodak-helper effects ./imported/ --effect faded --frame simple --output ./processed/
```

### Available effects

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

### Available frames

| Frame | Description |
|-------|-------------|
| `simple` | Solid border (default white) |
| `polaroid` | Classic polaroid with thick bottom |
| `film_strip` | 35mm film strip with sprocket holes |
| `rounded` | Rounded corners |

## Hardware Hacking

Want to modify the actual firmware (filenames, menus, sounds)?
See [docs/hardware-guide.md](docs/hardware-guide.md).

## Camera Specs (Generalplus CBB3)

- Photos: 1440x1080 JPEG
- Video: 1440x1080 @ 30fps MJPEG + mono audio
- Boot splash: 960x720 JPEG (stored in `SPIDCIM/SPI00.jpg`)
- USB: Mass storage (mounts as SD card)

## License

MIT
