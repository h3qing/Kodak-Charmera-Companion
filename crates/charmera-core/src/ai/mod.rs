use std::path::Path;

use anyhow::{Context, Result};
use serde::Deserialize;

const OLLAMA_URL: &str = "http://localhost:11434";
const MODEL: &str = "moondream";

#[derive(Debug, Clone)]
pub struct PhotoLabel {
    pub description: String,
    pub tags: Vec<String>,
}

#[derive(Deserialize)]
struct OllamaResponse {
    response: Option<String>,
    error: Option<String>,
}

/// Check if Ollama is running and the vision model is available.
pub fn check_ollama() -> Result<bool> {
    let resp = ureq::get(&format!("{OLLAMA_URL}/api/tags"))
        .call()
        .map_err(|e| anyhow::anyhow!("ollama not reachable: {e}"))?;

    let body: serde_json::Value = resp.into_body().read_json()?;
    let empty = vec![];
    let models = body["models"].as_array().unwrap_or(&empty);
    let has_model = models.iter().any(|m| {
        m["name"]
            .as_str()
            .map(|n| n.starts_with(MODEL))
            .unwrap_or(false)
    });

    Ok(has_model)
}

/// Label a single photo using Ollama's vision model.
/// Uses the image file directly (reads and base64 encodes).
pub fn label_photo(image_path: &Path) -> Result<PhotoLabel> {
    let image_bytes = std::fs::read(image_path)
        .with_context(|| format!("reading image: {}", image_path.display()))?;
    label_photo_bytes(&image_bytes)
}

/// Label a photo from raw bytes.
pub fn label_photo_bytes(image_bytes: &[u8]) -> Result<PhotoLabel> {
    use base64::Engine;
    let img_b64 = base64::engine::general_purpose::STANDARD.encode(image_bytes);

    let request_body = serde_json::json!({
        "model": MODEL,
        "prompt": "Describe this photo in one short sentence. Then list 3-5 single-word tags separated by commas. Format your response exactly as:\nDESCRIPTION: <sentence>\nTAGS: <tag1>, <tag2>, <tag3>",
        "images": [img_b64],
        "stream": false,
    });

    let resp = ureq::post(&format!("{OLLAMA_URL}/api/generate"))
        .send_json(&request_body)
        .map_err(|e| anyhow::anyhow!("ollama request failed: {e}"))?;

    let ollama_resp: OllamaResponse = resp.into_body().read_json()?;

    if let Some(err) = ollama_resp.error {
        anyhow::bail!("ollama error: {err}");
    }

    let response_text = ollama_resp
        .response
        .unwrap_or_default();

    parse_label_response(&response_text)
}

fn parse_label_response(text: &str) -> Result<PhotoLabel> {
    let mut description = String::new();
    let mut tags = Vec::new();

    // Try to parse structured format
    for line in text.lines() {
        let line = line.trim();
        if let Some(desc) = line.strip_prefix("DESCRIPTION:") {
            description = desc.trim().to_string();
        } else if let Some(tag_str) = line.strip_prefix("TAGS:") {
            tags = tag_str
                .split(',')
                .map(|t| t.trim().to_lowercase().to_string())
                .filter(|t| !t.is_empty())
                .collect();
        }
    }

    // Fallback: if no structured format, use the whole text as description
    if description.is_empty() {
        description = text.lines().next().unwrap_or("").trim().to_string();
    }

    // If no tags parsed, generate basic ones from the description
    if tags.is_empty() {
        tags = extract_basic_tags(&description);
    }

    Ok(PhotoLabel { description, tags })
}

fn extract_basic_tags(description: &str) -> Vec<String> {
    let keywords = [
        "outdoor", "indoor", "dog", "cat", "person", "people", "car", "food",
        "nature", "sky", "water", "beach", "mountain", "tree", "flower",
        "building", "street", "road", "night", "sunset", "sunrise",
        "grass", "snow", "rain", "animal", "bird",
    ];

    let desc_lower = description.to_lowercase();
    keywords
        .iter()
        .filter(|k| desc_lower.contains(*k))
        .map(|k| k.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_structured_response() {
        let text = "DESCRIPTION: A dog walking on a road\nTAGS: dog, outdoor, road, animal";
        let label = parse_label_response(text).unwrap();
        assert_eq!(label.description, "A dog walking on a road");
        assert_eq!(label.tags, vec!["dog", "outdoor", "road", "animal"]);
    }

    #[test]
    fn parse_unstructured_response() {
        let text = "The image shows a beautiful sunset over the ocean.";
        let label = parse_label_response(text).unwrap();
        assert_eq!(label.description, "The image shows a beautiful sunset over the ocean.");
        assert!(label.tags.contains(&"sunset".to_string()));
    }
}
