import { createSignal } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import {
  getPhotos,
  getRecentPhotos,
  importFolder,
  detectCamera,
  checkAiStatus,
  autoLabelAll,
  getRenameProposals,
  applyRenames,
  listCameraFiles,
  getNamingPattern,
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
const [cameraJustConnected, setCameraJustConnected] = createSignal(false);
const [cameraFileCount, setCameraFileCount] = createSignal(0);
const [namingPattern, setNamingPatternSignal] = createSignal("b {MM}-{DD}-{YYYY} {content}");
const [recentPhotos, setRecentPhotos] = createSignal<PhotoSummary[]>([]);

const [importProgress, setImportProgress] = createSignal({ done: 0, total: 0, current: "" });

// Listen for import progress events
listen("import:progress", (event: any) => {
  const data = event.payload as { done: number; total: number; current: string };
  setImportProgress(data);
  setImportStatus(`Importing ${data.done}/${data.total}: ${data.current}`);
});

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
    importProgress,
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
    cameraJustConnected,
    cameraFileCount,
    dismissCameraPopup,
    namingPattern,
    recentPhotos,
    refreshRecentPhotos,
    loadMorePhotos,
    hasMore,
    loadingMore,
  };
}

async function refreshRecentPhotos() {
  try {
    const page = await getRecentPhotos(24);
    setRecentPhotos(page.photos);
  } catch (e) {
    console.error("Failed to load recent photos:", e);
  }
}

const PAGE_SIZE = 100;
const [hasMore, setHasMore] = createSignal(true);
const [loadingMore, setLoadingMore] = createSignal(false);

async function refreshPhotos() {
  try {
    const page = await getPhotos(0, PAGE_SIZE);
    setPhotos(page.photos);
    setPhotoCount(page.total);
    setHasMore(page.photos.length < page.total);
  } catch (e) {
    console.error("Failed to load photos:", e);
  }
}

async function loadMorePhotos() {
  if (loadingMore() || !hasMore()) return;
  setLoadingMore(true);
  try {
    const offset = photos().length;
    const page = await getPhotos(offset, PAGE_SIZE);
    if (page.photos.length > 0) {
      setPhotos((prev) => [...prev, ...page.photos]);
    }
    setHasMore(photos().length < page.total);
  } catch (e) {
    console.error("Failed to load more photos:", e);
  }
  setLoadingMore(false);
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

// Camera polling — check every 5 seconds for camera connection
let previousCameraPath: string | null = null;
let initialCheckDone = false;

async function onCameraDetected(path: string) {
  setCameraJustConnected(true);
  try {
    const files = await listCameraFiles(path);
    const photoFiles = files.filter(f => f.is_photo);
    setCameraFileCount(photoFiles.length);
  } catch {
    setCameraFileCount(0);
  }
}

setInterval(async () => {
  const newPath = await checkCamera();
  if (newPath && !previousCameraPath) {
    // Camera just connected (or first detection on app start)
    await onCameraDetected(newPath);
  }
  previousCameraPath = newPath ?? null;
}, 5000);

// Also check immediately on startup — if camera is already plugged in, show popup
(async () => {
  const path = await checkCamera();
  if (path && !initialCheckDone) {
    initialCheckDone = true;
    // Check if we have unimported photos
    try {
      const files = await listCameraFiles(path);
      const photoFiles = files.filter(f => f.is_photo);
      const currentCount = photoCount();
      // Show popup if there are more photos on camera than imported
      if (photoFiles.length > currentCount) {
        setCameraJustConnected(true);
        setCameraFileCount(photoFiles.length);
      }
    } catch {}
  }
  previousCameraPath = path ?? null;
})();

function dismissCameraPopup() {
  setCameraJustConnected(false);
  setCameraFileCount(0);
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
  // Dismiss camera popup if showing
  dismissCameraPopup();
  setIsImporting(true);
  setImportStatus(`Importing from ${source}...`);
  try {
    const result = await importFolder(source);
    setImportStatus(`Imported ${result.imported} photos (${result.skipped} skipped)`);
    await refreshPhotos();
    await refreshRecentPhotos();

    // Auto-trigger AI labeling after import if AI is available
    const status = aiStatus();
    if (status?.available && !isLabeling()) {
      // Short delay so user sees the import result before labeling starts
      setTimeout(() => runAutoLabel(), 500);
    }
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
refreshRecentPhotos();
checkAiStatus().then(setAiStatus).catch(() => setAiStatus(null));
getNamingPattern().then(setNamingPatternSignal).catch(() => {});
