use std::path::Path;

use anyhow::{Context, Result};
use serde::Deserialize;

const OLLAMA_URL: &str = "http://localhost:11434";
const DEFAULT_MODEL: &str = "moondream";

/// Supported vision models with their optimal prompts.
pub fn prompt_for_model(model: &str) -> &'static str {
    match model {
        "llava" | "llava:7b" | "llava:13b" => {
            "Describe this photo in one sentence. List 3-5 tags separated by commas.\nDESCRIPTION: <sentence>\nTAGS: <tags>"
        }
        "llava-phi3" | "llava-llama3" => {
            "Describe this photo briefly. Then list 3-5 tags.\nDESCRIPTION: <sentence>\nTAGS: <tags>"
        }
        "bakllava" => {
            "What is in this photo? Give a one-sentence description and 3-5 tags.\nDESCRIPTION: <sentence>\nTAGS: <tags>"
        }
        // moondream and other small models can't handle structured prompts
        _ => "Describe this image briefly.",
    }
}

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

/// Known vision-capable models to look for in Ollama.
const VISION_MODELS: &[&str] = &[
    "moondream",
    "llava",
    "llava-phi3",
    "llava-llama3",
    "bakllava",
    "minicpm-v",
];

/// Check if Ollama is running and find available vision models.
pub fn check_ollama() -> Result<bool> {
    let models = list_vision_models()?;
    Ok(!models.is_empty())
}

/// List all vision-capable models available in Ollama.
pub fn list_vision_models() -> Result<Vec<String>> {
    let resp = ureq::get(&format!("{OLLAMA_URL}/api/tags"))
        .call()
        .map_err(|e| anyhow::anyhow!("ollama not reachable: {e}"))?;

    let body: serde_json::Value = resp.into_body().read_json()?;
    let empty = vec![];
    let models = body["models"].as_array().unwrap_or(&empty);
    let vision_models: Vec<String> = models
        .iter()
        .filter_map(|m| {
            let name = m["name"].as_str()?;
            // Check if this model matches any known vision model
            if VISION_MODELS.iter().any(|v| name.starts_with(v)) {
                Some(name.to_string())
            } else {
                None
            }
        })
        .collect();

    Ok(vision_models)
}

/// Get the best available vision model (prefers larger models).
pub fn best_available_model() -> Result<String> {
    let models = list_vision_models()?;
    // Prefer llava > bakllava > moondream (quality order)
    for preferred in &["llava", "bakllava", "llava-phi3", "minicpm-v", "moondream"] {
        if let Some(m) = models.iter().find(|m| m.starts_with(preferred)) {
            return Ok(m.clone());
        }
    }
    models
        .into_iter()
        .next()
        .ok_or_else(|| anyhow::anyhow!("no vision models available in Ollama"))
}

/// Label a single photo using Ollama's vision model.
pub fn label_photo(image_path: &Path) -> Result<PhotoLabel> {
    let image_bytes = std::fs::read(image_path)
        .with_context(|| format!("reading image: {}", image_path.display()))?;
    label_photo_bytes(&image_bytes, None)
}

/// Label a photo with a specific model.
pub fn label_photo_with_model(image_path: &Path, model: &str) -> Result<PhotoLabel> {
    let image_bytes = std::fs::read(image_path)
        .with_context(|| format!("reading image: {}", image_path.display()))?;
    label_photo_bytes(&image_bytes, Some(model))
}

/// Label a photo from raw bytes. If model is None, uses the best available.
pub fn label_photo_bytes(image_bytes: &[u8], model: Option<&str>) -> Result<PhotoLabel> {
    let model_name = match model {
        Some(m) => m.to_string(),
        None => best_available_model().unwrap_or_else(|_| DEFAULT_MODEL.to_string()),
    };
    let prompt = prompt_for_model(&model_name);

    use base64::Engine;
    let img_b64 = base64::engine::general_purpose::STANDARD.encode(image_bytes);

    let request_body = serde_json::json!({
        "model": model_name,
        "prompt": prompt,
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

    let response_text = ollama_resp.response.unwrap_or_default();

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
        "outdoor",
        "indoor",
        "dog",
        "cat",
        "person",
        "people",
        "car",
        "food",
        "nature",
        "sky",
        "water",
        "beach",
        "mountain",
        "tree",
        "flower",
        "building",
        "street",
        "road",
        "night",
        "sunset",
        "sunrise",
        "grass",
        "snow",
        "rain",
        "animal",
        "bird",
        "house",
        "garden",
        "window",
        "door",
        "table",
        "chair",
        "couch",
        "bed",
        "kitchen",
        "bathroom",
        "selfie",
        "portrait",
        "landscape",
        "city",
        "park",
        "ocean",
        "lake",
        "river",
        "bridge",
        "forest",
        "field",
        "child",
        "baby",
        "family",
        "group",
        "pet",
        "plant",
        "book",
        "phone",
        "computer",
        "desk",
        "shelf",
        "wall",
        "floor",
        "ceiling",
        "light",
        "dark",
        "colorful",
        "close-up",
        "wide",
        "sunny",
        "cloudy",
    ];

    let desc_lower = description.to_lowercase();
    let mut tags: Vec<String> = keywords
        .iter()
        .filter(|k| {
            // Match whole words to avoid partial matches
            let k_str = **k;
            desc_lower
                .split(|c: char| !c.is_alphanumeric() && c != '-')
                .any(|word| word == k_str)
        })
        .map(|k| k.to_string())
        .collect();

    // Limit to 5 most relevant tags
    tags.truncate(5);
    tags
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
        let text = "A brown dog sits on the couch in a cozy indoor room.";
        let label = parse_label_response(text).unwrap();
        assert_eq!(
            label.description,
            "A brown dog sits on the couch in a cozy indoor room."
        );
        assert!(label.tags.contains(&"dog".to_string()));
        assert!(label.tags.contains(&"indoor".to_string()));
        assert!(label.tags.contains(&"couch".to_string()));
    }
}
