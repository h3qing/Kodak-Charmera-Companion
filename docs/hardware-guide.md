# Hardware Hacking Guide: KODAK CHARMERA / Generalplus CBB3

## What's Inside

Your CHARMERA runs on a **Generalplus CBB3** SoC (System on Chip). This is a cheap,
mass-produced camera chip used in dozens of keychain/toy cameras. The firmware that
controls everything — filenames, menus, effects, resolution — lives on an internal
SPI flash chip, NOT on the SD card.

## Camera Internals

```
┌─────────────────────────────────┐
│  KODAK CHARMERA PCB             │
│                                 │
│  ┌──────────┐  ┌─────────────┐  │
│  │ GP CBB3  │  │ SPI Flash   │  │
│  │ Main SoC │──│ (Firmware)  │  │
│  └──────────┘  │ W25Q series │  │
│       │        └─────────────┘  │
│  ┌────┴────┐                    │
│  │ CMOS    │   ┌─────────────┐  │
│  │ Sensor  │   │ SD Card     │  │
│  │1440x1080│   │ Slot        │  │
│  └─────────┘   └─────────────┘  │
│                                 │
│  [Battery]  [USB]  [LCD]        │
└─────────────────────────────────┘
```

## What You Need

### Tools
- **Small Phillips screwdriver** — to open the case
- **CH341A USB programmer** (~$5 on Amazon/AliExpress)
- **SOIC8 test clip** (~$3) — clips onto the flash chip without soldering
- **Jumper wires** — to connect clip to programmer
- **Computer with flashrom** — open-source flash programming tool

### Software
- **flashrom** — `brew install flashrom` on macOS
- **binwalk** — `brew install binwalk` — firmware analysis
- **Ghidra** (free, from NSA) — for reverse engineering the binary
- **hexdump / xxd** — for quick binary inspection

## Step-by-Step: Dumping the Firmware

### 1. Open the Camera
- Remove any visible screws (check under stickers/labels)
- Carefully pry open the plastic shell
- Photograph everything before disconnecting anything

### 2. Identify the Flash Chip
Look for a small 8-pin chip near the main SoC. Common chips:
- **Winbond W25Q32** (4MB)
- **Winbond W25Q64** (8MB)
- **Winbond W25Q128** (16MB)

The part number is printed on top of the chip. Note it down.

### 3. Connect the Programmer

```
SOIC8 Test Clip Pinout:
         ┌──────┐
  CS#  1 │●     │ 8  VCC
  DO   2 │      │ 7  HOLD#
  WP#  3 │      │ 6  CLK
  GND  4 │      │ 5  DI
         └──────┘

CH341A connections:
  Clip Pin 1 (CS)   → CH341A CS
  Clip Pin 2 (DO)   → CH341A MISO
  Clip Pin 4 (GND)  → CH341A GND
  Clip Pin 5 (DI)   → CH341A MOSI
  Clip Pin 6 (CLK)  → CH341A CLK
  Clip Pin 8 (VCC)  → CH341A 3.3V
  Clip Pin 3 (WP)   → CH341A 3.3V (disable write protect)
  Clip Pin 7 (HOLD) → CH341A 3.3V (disable hold)
```

### 4. Dump the Firmware

```bash
# Install flashrom
brew install flashrom

# Detect the chip (with CH341A connected)
flashrom -p ch341a_spi

# Read/dump the firmware (do this twice and compare!)
flashrom -p ch341a_spi -r firmware_dump_1.bin
flashrom -p ch341a_spi -r firmware_dump_2.bin

# Verify both dumps match
md5sum firmware_dump_1.bin firmware_dump_2.bin
# If they don't match, your connection is unreliable — fix it

# KEEP A SAFE BACKUP
cp firmware_dump_1.bin firmware_BACKUP_DO_NOT_DELETE.bin
```

### 5. Analyze the Firmware

```bash
# Install analysis tools
brew install binwalk

# Scan for embedded files and filesystems
binwalk firmware_dump_1.bin

# Extract embedded files
binwalk -e firmware_dump_1.bin

# Look at raw hex
xxd firmware_dump_1.bin | head -100

# Search for strings (filenames, menus, etc.)
strings firmware_dump_1.bin | grep -i "pict"
strings firmware_dump_1.bin | grep -i "movi"
strings firmware_dump_1.bin | grep -i "dcim"
```

## What Can Be Modified

### Filename Pattern
The format string for `PICT%04d.jpg` and `MOVI%04d.avi` is embedded in the
firmware as a literal string. You can find it with:

```bash
strings firmware_dump_1.bin | grep "PICT"
strings firmware_dump_1.bin | grep "MOVI"
```

To change it, find the hex offset and patch it. The new string must be the
**exact same length** or shorter (pad with null bytes). Example:

```bash
# Find the offset
grep -oba "PICT" firmware_dump_1.bin

# Use a hex editor to change PICT%04d → SNAP%04d
# or use Python:
python3 -c "
data = open('firmware_dump_1.bin', 'rb').read()
patched = data.replace(b'PICT', b'SNAP')
open('firmware_patched.bin', 'wb').write(patched)
"
```

### Date Stamp Format
The date overlay format string is also in the firmware. Look for patterns like:
```bash
strings firmware_dump_1.bin | grep "%04d"
strings firmware_dump_1.bin | grep "%02d"
```

### Menu Text
Any text shown on the LCD is stored as strings in the firmware.

### Sounds
Beep/shutter sound data may be stored as raw PCM or compressed audio.

## Flashing Modified Firmware

⚠️ **WARNING: This can brick your camera. Make sure you have a verified backup.**

```bash
# Write patched firmware
flashrom -p ch341a_spi -w firmware_patched.bin

# Verify the write
flashrom -p ch341a_spi -v firmware_patched.bin
```

## Recovery if Bricked

If the camera won't boot after flashing:
1. Re-connect the programmer
2. Flash your backup: `flashrom -p ch341a_spi -w firmware_BACKUP_DO_NOT_DELETE.bin`
3. The camera should be restored

## Safety Tips

- **Always dump twice and verify** before modifying anything
- **Keep multiple backups** of the original firmware
- **Only change strings of equal length** — changing sizes breaks offsets
- **Don't modify code sections** unless you understand the instruction set
- **The Generalplus CBB3 uses a proprietary ISA** — Ghidra may not have a processor module for it, but string patching doesn't require understanding the code
- **Work on a copy** — never modify your backup file

## Community Resources

- Search GitHub for "generalplus camera firmware"
- eevblog.com forums — hardware reverse engineering
- Hackaday — cheap camera teardowns
- r/vintagedigitalcameras on Reddit
