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

// Listen for labeling events from backend
listen("label:progress", (event: any) => {
  const data = event.payload as { done: number; total: number; current: string };
  setLabelProgress(data);
  setLabelStatus(`${data.done + 1} of ${data.total}: ${data.current}`);
});

listen("label:photo_done", (event: any) => {
  const data = event.payload as { id: number; description: string; tags: string[]; done: number; total: number };
  setLabelProgress({ done: data.done, total: data.total, current: "" });
  setLabelStatus(`${data.done} of ${data.total} done`);
  // Refresh photos to show new labels on the grid
  refreshPhotos();
});

listen("label:done", (event: any) => {
  const data = event.payload as { labeled: number; failed: number; total: number };
  setIsLabeling(false);
  if (data.labeled === 0 && data.total === 0) {
    setLabelStatus("All photos already labeled!");
  } else {
    setLabelStatus(`Done! Labeled ${data.labeled} photos`);
  }
  refreshPhotos();

  // Show rename proposals
  if (data.labeled > 0) {
    getRenameProposals().then((proposals) => {
      if (proposals.length > 0) {
        setRenameProposals(proposals);
        setShowRenameDialog(true);
      }
    });
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
    const total = await autoLabelAll();
    if (total === 0) {
      setIsLabeling(false);
      setLabelStatus("All photos already labeled!");
    } else {
      setLabelStatus(`Analyzing ${total} photos...`);
      // The rest happens via events (label:progress, label:photo_done, label:done)
    }
  } catch (e) {
    setLabelStatus(`Labeling failed: ${e}`);
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
