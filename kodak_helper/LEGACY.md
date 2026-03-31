# Legacy Python Code

This directory contains the original Python implementation of the Kodak Helper toolkit.

**It has been fully superseded by the Rust implementation** in `crates/`. The Rust version includes all Python features plus:
- Desktop GUI (Tauri 2 + Solid.js)
- Local AI labeling (Ollama)
- Smart file renaming
- SQLite catalog with full-text search
- 10 photo effects + 4 frames
- And much more

## Migration

If you previously used `pip install -e .` to install `kodak-helper`:

```bash
# Uninstall the Python version
pip uninstall kodak-helper

# Use the Rust CLI instead
cargo build -p charmera-cli
./target/debug/charmera --help
```

This directory is kept for reference but is no longer maintained.
