import { createSignal } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import {
  getPhotos,
  importFolder,
  detectCamera,
  checkAiStatus,
  autoLabelAll,
  getRenameProposals,
  applyRenames,
  type PhotoSummary,
  type AiStatus,
  type RenameProposal,
} from "../lib/tauri";

const [photoCount, setPhotoCount] = createSignal(0);
const [photos, setPhotos] = createSignal<PhotoSummary[]>([]);
const [isImporting, setIsImporting] = createSignal(false);
const [importStatus, setImportStatus] = createSignal("");
const [cameraPath, setCameraPath] = createSignal<string | null>(null);
const [aiStatus, setAiStatus] = createSignal<AiStatus | null>(null);
const [isLabeling, setIsLabeling] = createSignal(false);
const [labelStatus, setLabelStatus] = createSignal("");
const [labelProgress, setLabelProgress] = createSignal({ done: 0, total: 0, current: "" });
const [renameProposals, setRenameProposals] = createSignal<RenameProposal[]>([]);
const [showRenameDialog, setShowRenameDialog] = createSignal(false);

// Listen for progress events from backend
listen("label:progress", (event: any) => {
  const data = event.payload as { done: number; total: number; current: string };
  setLabelProgress(data);
  if (data.total > 0) {
    setLabelStatus(`Analyzing ${data.done + 1} of ${data.total}: ${data.current}`);
  }
});

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
    labelProgress,
    renameProposals,
    showRenameDialog,
    setShowRenameDialog,
    refreshPhotos,
    importFromCamera,
    importFromPath,
    checkCamera,
    runAutoLabel,
    confirmRenames,
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
  setLabelProgress({ done: 0, total: 0, current: "" });
  setLabelStatus("Starting AI analysis...");
  try {
    const result = await autoLabelAll();
    if (result.labeled === 0 && result.total === 0) {
      setLabelStatus("All photos already labeled!");
    } else {
      setLabelStatus(`Labeled ${result.labeled} photos`);
    }
    await refreshPhotos();

    // After labeling, show rename proposals
    if (result.labeled > 0) {
      const proposals = await getRenameProposals();
      if (proposals.length > 0) {
        setRenameProposals(proposals);
        setShowRenameDialog(true);
      }
    }
  } catch (e) {
    setLabelStatus(`Labeling failed: ${e}`);
  } finally {
    setIsLabeling(false);
  }
}

async function confirmRenames(approved: [number, string][]) {
  if (approved.length === 0) {
    setShowRenameDialog(false);
    return;
  }
  try {
    const count = await applyRenames(approved);
    setLabelStatus(`Renamed ${count} files`);
    setShowRenameDialog(false);
    setRenameProposals([]);
    await refreshPhotos();
  } catch (e) {
    setLabelStatus(`Rename failed: ${e}`);
  }
}

// Initialize
checkCamera();
refreshPhotos();
checkAiStatus().then(setAiStatus).catch(() => setAiStatus(null));
