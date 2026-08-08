//! Camera specs for Generalplus CBB3-based keychain cameras.

/// Default filename pattern used when the user hasn't chosen one.
///
/// ISO-style date first so files sort chronologically in any file manager —
/// which is the entire point of renaming them.
pub const DEFAULT_NAMING_PATTERN: &str = "{YYYY}-{MM}-{DD} {content}";

// Splash screen dimensions
pub const SPLASH_WIDTH: u32 = 960;
pub const SPLASH_HEIGHT: u32 = 720;
pub const SPLASH_DIR: &str = "SPIDCIM";
pub const SPLASH_FILE: &str = "SPI00.jpg";

pub const DCIM_DIR: &str = "DCIM";

// File extensions
pub const PHOTO_EXTENSIONS: &[&str] = &[".jpg", ".jpeg", ".png", ".bmp", ".webp"];
pub const VIDEO_EXTENSIONS: &[&str] = &[".avi"];

/// Default mount points to search for camera SD cards.
/// Platform-specific: macOS uses /Volumes, Linux uses /media and /mnt.
#[cfg(target_os = "macos")]
pub const VOLUME_PATHS: &[&str] = &[
    "/Volumes/SDCARD",
    "/Volumes/CAMERA",
    "/Volumes/KODAK",
    "/Volumes/CHARMERA",
];

#[cfg(target_os = "linux")]
pub const VOLUME_PATHS: &[&str] = &[
    "/media/SDCARD",
    "/media/CAMERA",
    "/media/KODAK",
    "/media/CHARMERA",
    "/mnt/SDCARD",
    "/mnt/CAMERA",
    "/mnt/KODAK",
    "/mnt/CHARMERA",
];

#[cfg(target_os = "windows")]
pub const VOLUME_PATHS: &[&str] = &["D:\\", "E:\\", "F:\\", "G:\\"];

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
pub const VOLUME_PATHS: &[&str] = &["/Volumes/SDCARD", "/media/SDCARD", "/mnt/SDCARD"];

// JPEG quality
pub const DEFAULT_JPEG_QUALITY: u8 = 92;
pub const SPLASH_JPEG_QUALITY: u8 = 85;

// Thumbnail settings
pub const THUMBNAIL_SIZE: u32 = 256;

// App data directory name
pub const APP_DIR_NAME: &str = ".charmera";
