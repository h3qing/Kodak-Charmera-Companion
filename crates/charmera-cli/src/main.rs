use anyhow::Result;
use clap::{CommandFactory, Parser, Subcommand};

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
    /// Generate shell completions
    Completions {
        /// Shell to generate for (bash, zsh, fish, powershell)
        shell: clap_complete::Shell,
    },
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
    /// Label all photos in a folder using local AI
    BatchLabel {
        /// Folder containing photos
        folder: String,
        /// Ollama model to use (auto-detects if omitted)
        #[arg(short, long)]
        model: Option<String>,
        /// Also rename files using naming pattern
        #[arg(long)]
        rename: bool,
        /// Naming pattern for --rename (default: b {MM}-{DD}-{YYYY} {content})
        #[arg(short, long)]
        pattern: Option<String>,
        /// Dry run — show labels without renaming
        #[arg(long)]
        dry_run: bool,
    },
    /// Show photo metadata (EXIF, dimensions, hash)
    Info {
        /// Photo path
        input: String,
    },
    /// Show system status (camera, AI, storage)
    Status,
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
        Commands::Completions { shell } => {
            clap_complete::generate(
                shell,
                &mut Cli::command(),
                "charmera",
                &mut std::io::stdout(),
            );
            Ok(())
        }
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
        Commands::BatchLabel {
            folder,
            model,
            rename,
            pattern,
            dry_run,
        } => {
            let folder_path = std::path::Path::new(&folder);
            if !folder_path.is_dir() {
                anyhow::bail!("not a directory: {folder}");
            }

            let files = charmera_core::import::list_media_files(folder_path)?;
            let photos: Vec<_> = files
                .iter()
                .filter(|f| {
                    f.extension()
                        .and_then(|e| e.to_str())
                        .map(|e| {
                            matches!(
                                e.to_lowercase().as_str(),
                                "jpg" | "jpeg" | "png" | "bmp" | "webp"
                            )
                        })
                        .unwrap_or(false)
                })
                .collect();

            if photos.is_empty() {
                if cli.json {
                    println!("{}", serde_json::json!({"photos": [], "total": 0}));
                } else {
                    println!("No JPEG photos found in {folder}");
                }
                return Ok(());
            }

            let total = photos.len();
            let pat = pattern.unwrap_or_else(|| "b {MM}-{DD}-{YYYY} {content}".to_string());
            let mut results = Vec::new();
            let mut renamed_count = 0u32;

            for (i, photo_path) in photos.iter().enumerate() {
                let file_name = photo_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown");

                if !cli.json {
                    eprint!("\r[{}/{}] {file_name}...", i + 1, total);
                }

                let label_result = if let Some(ref m) = model {
                    charmera_core::ai::label_photo_with_model(photo_path, m)
                } else {
                    charmera_core::ai::label_photo(photo_path)
                };

                match label_result {
                    Ok(label) => {
                        let mut entry = serde_json::json!({
                            "file": photo_path.display().to_string(),
                            "description": label.description,
                            "tags": label.tags,
                        });

                        if rename {
                            let exif = charmera_core::import::extract_exif(photo_path);
                            let stem = photo_path
                                .file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or("photo");
                            let ext = photo_path
                                .extension()
                                .and_then(|s| s.to_str())
                                .unwrap_or("jpg");
                            let new_stem = charmera_core::import::apply_naming_pattern(
                                &pat,
                                exif.taken_at.as_deref(),
                                &label.description,
                                (i + 1) as u32,
                                stem,
                            );
                            let new_name = format!("{new_stem}.{ext}");
                            let new_path = photo_path.with_file_name(&new_name);

                            entry["new_name"] = serde_json::Value::String(new_name.clone());

                            if !dry_run && !new_path.exists() {
                                if let Err(e) = std::fs::rename(photo_path, &new_path) {
                                    entry["rename_error"] =
                                        serde_json::Value::String(e.to_string());
                                } else {
                                    renamed_count += 1;
                                    entry["renamed"] = serde_json::Value::Bool(true);
                                }
                            }
                        }

                        results.push(entry);
                    }
                    Err(e) => {
                        results.push(serde_json::json!({
                            "file": photo_path.display().to_string(),
                            "error": e.to_string(),
                        }));
                    }
                }
            }

            if cli.json {
                println!(
                    "{}",
                    serde_json::json!({
                        "photos": results,
                        "total": total,
                        "labeled": results.iter().filter(|r| r.get("description").is_some()).count(),
                        "renamed": renamed_count,
                    })
                );
            } else {
                eprintln!(); // Clear progress line
                for r in &results {
                    if let Some(desc) = r.get("description").and_then(|d| d.as_str()) {
                        let file = r["file"].as_str().unwrap_or("");
                        let short = file.split('/').last().unwrap_or(file);
                        print!("{short}: {desc}");
                        if let Some(new) = r.get("new_name").and_then(|n| n.as_str()) {
                            print!(" → {new}");
                        }
                        println!();
                    }
                }
                println!(
                    "\nLabeled {}/{total} photos{}",
                    results
                        .iter()
                        .filter(|r| r.get("description").is_some())
                        .count(),
                    if rename {
                        format!(", renamed {renamed_count}")
                    } else {
                        String::new()
                    }
                );
            }

            Ok(())
        }
        Commands::Info { input } => {
            let path = std::path::Path::new(&input);
            if !path.exists() {
                anyhow::bail!("file not found: {input}");
            }

            let file_bytes = std::fs::read(path)?;
            let hash = blake3::hash(&file_bytes);
            let (width, height) =
                charmera_core::thumbnails::get_image_dimensions(path).unwrap_or((0, 0));
            let exif = charmera_core::import::extract_exif(path);
            let file_size = file_bytes.len();

            if cli.json {
                println!(
                    "{}",
                    serde_json::json!({
                        "file": input,
                        "size_bytes": file_size,
                        "width": width,
                        "height": height,
                        "hash_blake3": hash.to_hex().to_string(),
                        "taken_at": exif.taken_at,
                        "camera_make": exif.camera_make,
                        "camera_model": exif.camera_model,
                    })
                );
            } else {
                println!("File:    {input}");
                println!("Size:    {:.1} KB", file_size as f64 / 1024.0);
                println!("Dims:    {width} x {height}");
                println!("Hash:    {}", &hash.to_hex().to_string()[..16]);
                if let Some(date) = &exif.taken_at {
                    println!("Taken:   {date}");
                }
                if let Some(make) = &exif.camera_make {
                    println!("Camera:  {make}");
                }
                if let Some(model) = &exif.camera_model {
                    println!("Model:   {model}");
                }
            }
            Ok(())
        }
        Commands::Status => {
            let camera = charmera_core::import::find_camera();
            let ai_models = charmera_core::ai::list_vision_models().unwrap_or_default();
            let best_model = charmera_core::ai::best_available_model().ok();
            let data_dir =
                dirs_next::home_dir().map(|h| h.join(charmera_core::constants::APP_DIR_NAME));
            let db_exists = data_dir
                .as_ref()
                .map(|d| d.join("catalog.db").exists())
                .unwrap_or(false);

            if cli.json {
                println!(
                    "{}",
                    serde_json::json!({
                        "version": env!("CARGO_PKG_VERSION"),
                        "camera": {
                            "detected": camera.is_some(),
                            "path": camera.as_ref().map(|p| p.display().to_string()),
                        },
                        "ai": {
                            "available": !ai_models.is_empty(),
                            "models": ai_models,
                            "best_model": best_model,
                        },
                        "storage": {
                            "data_dir": data_dir.as_ref().map(|d| d.display().to_string()),
                            "catalog_exists": db_exists,
                        },
                    })
                );
            } else {
                println!("Charmera Companion v{}", env!("CARGO_PKG_VERSION"));
                println!();
                if let Some(path) = &camera {
                    println!("Camera:  {} (connected)", path.display());
                } else {
                    println!("Camera:  not detected");
                }
                if ai_models.is_empty() {
                    println!("AI:      not available (install Ollama + vision model)");
                } else {
                    println!(
                        "AI:      {} model(s): {}",
                        ai_models.len(),
                        ai_models.join(", ")
                    );
                    if let Some(best) = &best_model {
                        println!("         using: {best}");
                    }
                }
                if let Some(dir) = &data_dir {
                    println!("Storage: {}", dir.display());
                    println!(
                        "         catalog: {}",
                        if db_exists { "exists" } else { "not created" }
                    );
                }
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
