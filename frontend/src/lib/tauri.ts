import { invoke } from "@tauri-apps/api/core";

export interface FileInfo {
  path: string;
  name: string;
  size: number;
  is_photo: boolean;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  total_files: number;
}

export interface PhotoSummary {
  id: number;
  relative_path: string;
  thumbnail_path: string | null;
  width: number;
  height: number;
  taken_at: string | null;
  rating: number;
}

export interface PhotoPage {
  photos: PhotoSummary[];
  total: number;
}

export async function detectCamera(): Promise<string | null> {
  return invoke("detect_camera");
}

export async function listCameraFiles(source: string): Promise<FileInfo[]> {
  return invoke("list_camera_files", { source });
}

export async function importFolder(source: string): Promise<void> {
  return invoke("import_folder", { source });
}

export async function getPhotos(offset: number, limit: number): Promise<PhotoPage> {
  return invoke("get_photos", { offset, limit });
}

export async function getRecentPhotos(hours?: number): Promise<PhotoPage> {
  return invoke("get_recent_photos", { hours: hours ?? 24 });
}

export async function getAppVersion(): Promise<string> {
  return invoke("get_app_version");
}

export async function generateDemoPhotos(): Promise<string> {
  return invoke("generate_demo_photos");
}

export async function getThumbnailBase64(path: string): Promise<string> {
  return invoke("get_thumbnail_base64", { path });
}

export async function getPhotoBase64(id: number): Promise<string> {
  return invoke("get_photo_base64", { id });
}

export async function previewEffect(
  id: number,
  effects: string[],
  frame: string | null,
): Promise<string> {
  return invoke("preview_effect", { id, effects, frame });
}

export interface AiStatus {
  available: boolean;
  model: string;
  models: string[];
}

export interface LabelResult {
  labeled: number;
  failed: number;
  total: number;
}

export interface PhotoLabels {
  description: string | null;
  tags: string[];
}

export async function checkAiStatus(): Promise<AiStatus> {
  return invoke("check_ai_status");
}

export async function autoLabelAll(): Promise<number> {
  return invoke("auto_label_all");
}

export async function getPhotoLabels(id: number): Promise<PhotoLabels> {
  return invoke("get_photo_labels", { id });
}

export interface RenameProposal {
  id: number;
  current_name: string;
  proposed_name: string;
  description: string;
  file_path: string;
  thumbnail_path: string | null;
}

export async function getRenameProposals(): Promise<RenameProposal[]> {
  return invoke("get_rename_proposals");
}

export async function applyRenames(renames: [number, string][]): Promise<number> {
  return invoke("apply_renames", { renames });
}

export async function searchPhotos(query: string): Promise<PhotoPage> {
  return invoke("search_photos", { query });
}

export interface DuplicateGroup {
  hash_hex: string;
  photos: PhotoSummary[];
}

export async function getDuplicates(): Promise<DuplicateGroup[]> {
  return invoke("get_duplicates");
}

export async function exportPhoto(
  id: number,
  dest: string,
  effects: string[],
  frame: string | null,
): Promise<string> {
  return invoke("export_photo", { id, dest, effects, frame });
}

export async function getNamingPattern(): Promise<string> {
  return invoke("get_naming_pattern");
}

export async function setNamingPattern(pattern: string): Promise<void> {
  return invoke("set_naming_pattern", { pattern });
}

export async function getSetting(key: string): Promise<string | null> {
  return invoke("get_setting", { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke("set_setting", { key, value });
}

export interface NasConfig {
  enabled: boolean;
  path: string;
  auto_move: boolean;
  organize_by_date: boolean;
}

export async function detectNasVolumes(): Promise<string[]> {
  return invoke("detect_nas_volumes");
}

export interface CloudDrive {
  provider: string;
  path: string;
  account: string;
}

export async function detectCloudDrives(): Promise<CloudDrive[]> {
  return invoke("detect_cloud_drives");
}

export async function testNasPath(path: string): Promise<boolean> {
  return invoke("test_nas_path", { path });
}

export async function getNasConfig(): Promise<NasConfig> {
  return invoke("get_nas_config");
}

export async function setNasConfig(config: NasConfig): Promise<void> {
  return invoke("set_nas_config", { config });
}

export async function moveToNas(photoIds: number[], keepLocal: boolean): Promise<[number, number]> {
  return invoke("move_to_nas", { photoIds, keepLocal });
}
