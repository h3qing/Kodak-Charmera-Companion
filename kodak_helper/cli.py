"""CLI entry point for the Kodak Helper toolkit."""

import argparse
import sys
from pathlib import Path

from . import __version__
from .effects import EFFECTS, FRAMES, apply_effects
from .importer import find_camera_or_raise, import_files, list_media_files
from .splash import create_splash, install_splash


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="kodak-helper",
        description="Toolkit for KODAK CHARMERA & Generalplus keychain cameras",
    )
    parser.add_argument(
        "--version", action="version", version=f"kodak-helper {__version__}"
    )

    sub = parser.add_subparsers(dest="command", help="Available commands")

    # --- import ---
    imp = sub.add_parser("import", help="Import photos from camera with smart renaming")
    imp.add_argument(
        "--source", "-s",
        help="Camera/SD card path (auto-detected if not specified)",
    )
    imp.add_argument(
        "--dest", "-d",
        default="./imported",
        help="Destination folder (default: ./imported)",
    )
    imp.add_argument(
        "--label", "-l",
        help="Content label for filenames (e.g. 'dog', 'sunset')",
    )
    imp.add_argument(
        "--move",
        action="store_true",
        help="Move files instead of copying",
    )

    # --- splash ---
    spl = sub.add_parser("splash", help="Set custom boot splash screen")
    spl.add_argument("image", help="Image to use as splash screen")
    spl.add_argument(
        "--text", "-t",
        help="Text overlay on splash screen",
    )
    spl.add_argument(
        "--install", "-i",
        action="store_true",
        help="Install directly to connected camera",
    )
    spl.add_argument(
        "--camera",
        help="Camera path (auto-detected if not specified)",
    )
    spl.add_argument(
        "--output", "-o",
        help="Save splash to custom path instead of installing",
    )

    # --- effects ---
    eff = sub.add_parser("effects", help="Apply effects and frames to photos")
    eff.add_argument("input", help="Photo file or directory of photos")
    eff.add_argument(
        "--output", "-o",
        default="./processed",
        help="Output directory (default: ./processed)",
    )
    eff.add_argument(
        "--effect", "-e",
        action="append",
        choices=list(EFFECTS.keys()),
        help=f"Effect to apply (can repeat). Options: {', '.join(EFFECTS)}",
    )
    eff.add_argument(
        "--frame", "-f",
        choices=list(FRAMES.keys()),
        help=f"Frame to apply. Options: {', '.join(FRAMES)}",
    )

    # --- list ---
    lst = sub.add_parser("list", help="List photos on connected camera")
    lst.add_argument(
        "--source", "-s",
        help="Camera/SD card path (auto-detected if not specified)",
    )

    return parser


def _cmd_import(args: argparse.Namespace) -> int:
    camera = find_camera_or_raise(args.source)
    dest = Path(args.dest)

    print(f"Importing from {camera} → {dest}")
    if args.label:
        print(f"Label: {args.label}")

    results = import_files(camera, dest, label=args.label, move=args.move)

    if not results:
        print("No media files found.")
        return 1

    for r in results:
        action = "moved" if args.move else "copied"
        print(f"  {r.original_name} → {r.new_name}  ({action})")

    print(f"\n{len(results)} file(s) imported.")
    return 0


def _cmd_splash(args: argparse.Namespace) -> int:
    image_path = Path(args.image)
    if not image_path.exists():
        print(f"Error: {image_path} not found")
        return 1

    if args.install:
        camera = find_camera_or_raise(args.camera)
        dest = install_splash(image_path, camera)
        print(f"Splash screen installed to {dest}")
        print("Eject the SD card and reboot the camera to see it!")
    elif args.output:
        dest = create_splash(image_path, output_path=Path(args.output), text=args.text)
        print(f"Splash screen saved to {dest}")
    else:
        dest = create_splash(image_path, text=args.text)
        print(f"Splash screen created: {dest}")
        print("Use --install to write directly to camera")

    return 0


def _cmd_effects(args: argparse.Namespace) -> int:
    input_path = Path(args.input)
    output_dir = Path(args.output)

    if not args.effect and not args.frame:
        print("Error: specify at least one --effect or --frame")
        return 1

    if input_path.is_file():
        files = [input_path]
    elif input_path.is_dir():
        files = sorted(
            f for f in input_path.iterdir()
            if f.suffix.lower() in {".jpg", ".jpeg"} and not f.name.startswith(".")
        )
    else:
        print(f"Error: {input_path} not found")
        return 1

    if not files:
        print("No photos found.")
        return 1

    suffix = "_".join(args.effect or [])
    if args.frame:
        suffix = f"{suffix}_{args.frame}" if suffix else args.frame

    for f in files:
        out = output_dir / f"{f.stem}_{suffix}{f.suffix}"
        apply_effects(f, out, effects=args.effect, frame=args.frame)
        print(f"  {f.name} → {out}")

    print(f"\n{len(files)} photo(s) processed.")
    return 0


def _cmd_list(args: argparse.Namespace) -> int:
    camera = find_camera_or_raise(args.source)
    files = list_media_files(camera)

    if not files:
        print("No media files found on camera.")
        return 1

    print(f"Camera: {camera}\n")
    total_size = 0
    for f in files:
        size = f.stat().st_size
        total_size += size
        size_str = f"{size / 1024:.0f}KB" if size < 1048576 else f"{size / 1048576:.1f}MB"
        print(f"  {f.name:20s}  {size_str}")

    total_str = f"{total_size / 1048576:.1f}MB"
    print(f"\n{len(files)} file(s), {total_str} total")
    return 0


COMMANDS = {
    "import": _cmd_import,
    "splash": _cmd_splash,
    "effects": _cmd_effects,
    "list": _cmd_list,
}


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    handler = COMMANDS.get(args.command)
    if handler is None:
        parser.print_help()
        sys.exit(1)

    try:
        code = handler(args)
        sys.exit(code)
    except FileNotFoundError as e:
        print(f"Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
