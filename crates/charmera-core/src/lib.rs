//! # Charmera Core
//!
//! Core library for the Charmera Companion photo organizer.
//! Provides AI labeling, camera import, and catalog management.
//!
//! ## Modules
//!
//! - [`ai`] — Ollama vision model integration for photo labeling
//! - [`catalog`] — SQLite catalog with WAL mode, search, and settings
//! - [`import`] — Camera detection, EXIF extraction, file naming patterns
//! - [`export`] — JPEG export pipeline
//! - [`splash`] — Boot splash screen creator (960×720)
//! - [`thumbnails`] — 256px thumbnail generation and caching

pub mod ai;
pub mod catalog;
pub mod constants;
pub mod export;
pub mod import;
pub mod splash;
pub mod thumbnails;
