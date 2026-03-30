import { createSignal } from "solid-js";
import {
  getPhotos,
  importFolder,
  detectCamera,
  checkAiStatus,
  autoLabelAll,
  type PhotoSummary,
  type AiStatus,
} from "../lib/tauri";

const [photoCount, setPhotoCount] = createSignal(0);
const [photos, setPhotos] = createSignal<PhotoSummary[]>([]);
const [isImporting, setIsImporting] = createSignal(false);
const [importStatus, setImportStatus] = createSignal("");
const [cameraPath, setCameraPath] = createSignal<string | null>(null);
const [aiStatus, setAiStatus] = createSignal<AiStatus | null>(null);
const [isLabeling, setIsLabeling] = createSignal(false);
const [labelStatus, setLabelStatus] = createSignal("");

export function useLibrary() {
  return {
    photoCount,
    photos,
    isImporting,
    importStatus,
    cameraPath,
    aiStatus,
    isLabeling,
    labelStatus,
    refreshPhotos,
    importFromCamera,
    importFromPath,
    checkCamera,
    runAutoLabel,
  };
}

async function refreshPhotos() {
  try {
    const page = await getPhotos(0, 200);
    setPhotos(page.photos);
    setPhotoCount(page.total);
  } catch (e) {
    console.error("Failed to load photos:", e);
  }
}

async function checkCamera() {
  try {
    const path = await detectCamera();
    setCameraPath(path);
    return path;
  } catch {
    setCameraPath(null);
    return null;
  }
}

async function importFromCamera() {
  const path = cameraPath();
  if (!path) {
    const detected = await checkCamera();
    if (!detected) {
      setImportStatus("No camera detected");
      return;
    }
    return importFromPath(detected);
  }
  return importFromPath(path);
}

async function importFromPath(source: string) {
  setIsImporting(true);
  setImportStatus(`Importing from ${source}...`);
  try {
    const result = await importFolder(source);
    setImportStatus(`Imported ${result.imported} photos (${result.skipped} skipped)`);
    await refreshPhotos();
  } catch (e) {
    setImportStatus(`Import failed: ${e}`);
  } finally {
    setIsImporting(false);
  }
}

async function runAutoLabel() {
  setIsLabeling(true);
  setLabelStatus("Analyzing photos with AI...");
  try {
    const result = await autoLabelAll();
    setLabelStatus(
      `Labeled ${result.labeled} photos` +
        (result.failed > 0 ? ` (${result.failed} failed)` : "")
    );
    await refreshPhotos();
  } catch (e) {
    setLabelStatus(`Labeling failed: ${e}`);
  } finally {
    setIsLabeling(false);
  }
}

// Initialize
checkCamera();
refreshPhotos();
checkAiStatus().then(setAiStatus).catch(() => setAiStatus(null));
