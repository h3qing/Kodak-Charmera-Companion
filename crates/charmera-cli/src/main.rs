use anyhow::Result;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "charmera")]
#[command(about = "Kodak Charmera Companion - Photo organizer for keychain cameras")]
#[command(version)]
struct Cli {
    /// Output as JSON (for AI agent consumption)
    #[arg(long, global = true)]
    json: bool,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Import photos from camera or folder
    Import {
        /// Source path (camera mount or folder). Auto-detects if omitted.
        source: Option<String>,
        /// Content label for smart renaming
        #[arg(short, long)]
        label: Option<String>,
    },
    /// List photos on connected camera
    List {
        /// Camera path (auto-detects if omitted)
        source: Option<String>,
    },
    /// Apply effects to a photo
    Effects {
        /// Input photo path
        input: String,
        /// Effects to apply (comma-separated)
        #[arg(short, long)]
        effects: Option<String>,
        /// Frame style
        #[arg(short, long)]
        frame: Option<String>,
        /// Output path
        #[arg(short, long)]
        output: Option<String>,
    },
    /// Label a photo using local AI (Ollama)
    Label {
        /// Photo path
        input: String,
        /// Ollama model to use (auto-detects if omitted)
        #[arg(short, long)]
        model: Option<String>,
    },
    /// AI-rename a photo based on its content
    Rename {
        /// Photo path
        input: String,
        /// Naming pattern (default: b {MM}-{DD}-{YYYY} {content})
        #[arg(short, long)]
        pattern: Option<String>,
        /// Dry run — show proposed name without renaming
        #[arg(long)]
        dry_run: bool,
    },
    /// Detect connected camera
    Detect,
    /// Create or install boot splash screen
    Splash {
        /// Source image
        input: String,
        /// Text overlay
        #[arg(short, long)]
        text: Option<String>,
        /// Install directly to camera
        #[arg(long)]
        install: bool,
    },
}

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "charmera=info".into()),
        )
        .init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Import { source, label: _ } => {
            let camera_path = match source {
                Some(p) => std::path::PathBuf::from(p),
                None => charmera_core::import::find_camera_or_raise()?,
            };
            let files = charmera_core::import::list_media_files(&camera_path)?;

            if cli.json {
                let json = serde_json::json!({
                    "source": camera_path.display().to_string(),
                    "files": files.iter().map(|f| f.display().to_string()).collect::<Vec<_>>(),
                    "count": files.len(),
                });
                println!("{}", serde_json::to_string_pretty(&json)?);
            } else {
                println!(
                    "Found {} media files in {}",
                    files.len(),
                    camera_path.display()
                );
                for f in &files {
                    println!("  {}", f.display());
                }
            }
            Ok(())
        }
        Commands::List { source } => {
            let camera_path = match source {
                Some(p) => std::path::PathBuf::from(p),
                None => charmera_core::import::find_camera_or_raise()?,
            };
            let files = charmera_core::import::list_media_files(&camera_path)?;

            if cli.json {
                let json = serde_json::json!({
                    "files": files.iter().map(|f| {
                        let meta = std::fs::metadata(f).ok();
                        serde_json::json!({
                            "path": f.display().to_string(),
                            "size": meta.map(|m| m.len()),
                        })
                    }).collect::<Vec<_>>(),
                    "count": files.len(),
                });
                println!("{}", serde_json::to_string_pretty(&json)?);
            } else {
                println!("{} media files:", files.len());
                for f in &files {
                    let size = std::fs::metadata(f)
                        .map(|m| format!("{:.1} KB", m.len() as f64 / 1024.0))
                        .unwrap_or_default();
                    println!("  {} ({})", f.display(), size);
                }
            }
            Ok(())
        }
        Commands::Effects {
            input,
            effects,
            frame,
            output,
        } => {
            let img = image::open(&input)?;
            let effect_list: Vec<String> = effects
                .unwrap_or_default()
                .split(',')
                .filter(|s| !s.is_empty())
                .map(String::from)
                .collect();
            let out_path = output.unwrap_or_else(|| {
                let p = std::path::Path::new(&input);
                let stem = p.file_stem().unwrap().to_str().unwrap();
                let ext = p.extension().unwrap().to_str().unwrap();
                format!("{stem}_edited.{ext}")
            });
            charmera_core::export::export_photo(
                &img,
                std::path::Path::new(&out_path),
                &effect_list,
                frame.as_deref(),
                None,
            )?;
            if cli.json {
                println!("{}", serde_json::json!({"output": out_path}));
            } else {
                println!("Saved to {out_path}");
            }
            Ok(())
        }
        Commands::Label { input, model } => {
            let path = std::path::Path::new(&input);
            if !path.exists() {
                anyhow::bail!("file not found: {input}");
            }

            let label = if let Some(m) = &model {
                charmera_core::ai::label_photo_with_model(path, m)?
            } else {
                charmera_core::ai::label_photo(path)?
            };

            if cli.json {
                println!(
                    "{}",
                    serde_json::json!({
                        "description": label.description,
                        "tags": label.tags,
                        "file": input,
                    })
                );
            } else {
                println!("Description: {}", label.description);
                if !label.tags.is_empty() {
                    println!("Tags: {}", label.tags.join(", "));
                }
            }
            Ok(())
        }
        Commands::Rename {
            input,
            pattern,
            dry_run,
        } => {
            let path = std::path::Path::new(&input);
            if !path.exists() {
                anyhow::bail!("file not found: {input}");
            }

            // Label the photo
            let label = charmera_core::ai::label_photo(path)?;

            // Extract EXIF date
            let exif = charmera_core::import::extract_exif(path);

            // Apply naming pattern
            let pat = pattern.unwrap_or_else(|| "b {MM}-{DD}-{YYYY} {content}".to_string());
            let original_stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("photo");
            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("jpg");

            let new_stem = charmera_core::import::apply_naming_pattern(
                &pat,
                exif.taken_at.as_deref(),
                &label.description,
                1,
                original_stem,
            );
            let new_name = format!("{new_stem}.{ext}");
            let new_path = path.with_file_name(&new_name);

            if cli.json {
                println!(
                    "{}",
                    serde_json::json!({
                        "original": input,
                        "proposed": new_path.display().to_string(),
                        "new_name": new_name,
                        "description": label.description,
                        "tags": label.tags,
                        "dry_run": dry_run,
                        "renamed": !dry_run && !new_path.exists(),
                    })
                );
            } else {
                println!("AI: {}", label.description);
                println!("{input} → {new_name}");
            }

            if !dry_run {
                if new_path.exists() {
                    anyhow::bail!("target already exists: {}", new_path.display());
                }
                std::fs::rename(path, &new_path)?;
                if !cli.json {
                    println!("Renamed!");
                }
            } else if !cli.json {
                println!("(dry run — no changes made)");
            }

            Ok(())
        }
        Commands::Detect => {
            let camera = charmera_core::import::find_camera();
            if cli.json {
                println!(
                    "{}",
                    serde_json::json!({
                        "detected": camera.is_some(),
                        "path": camera.as_ref().map(|p| p.display().to_string()),
                    })
                );
            } else if let Some(path) = camera {
                println!("Camera detected at {}", path.display());
            } else {
                println!("No camera detected");
            }
            Ok(())
        }
        Commands::Splash {
            input,
            text: _,
            install,
        } => {
            let img = image::open(&input)?;
            let splash = charmera_core::splash::create_splash(&img);
            let out_path = if install {
                let camera = charmera_core::import::find_camera_or_raise()?;
                let splash_dir = camera.join(charmera_core::constants::SPLASH_DIR);
                std::fs::create_dir_all(&splash_dir)?;
                splash_dir.join(charmera_core::constants::SPLASH_FILE)
            } else {
                std::path::PathBuf::from(charmera_core::constants::SPLASH_FILE)
            };
            charmera_core::splash::save_splash(&splash, &out_path)?;
            if cli.json {
                println!(
                    "{}",
                    serde_json::json!({"output": out_path.display().to_string()})
                );
            } else {
                println!("Splash saved to {}", out_path.display());
            }
            Ok(())
        }
    }
}
