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
  getNasConfig,
  moveToNas,
  getAppVersion,
  type PhotoSummary,
  type AiStatus,
  type RenameProposal,
  type NasConfig,
} from "../lib/tauri";
import { showToast } from "../components/shared/Toast";

const [photoCount, setPhotoCount] = createSignal(0);
const [photos, setPhotos] = createSignal<PhotoSummary[]>([]);
// False until the first refreshPhotos() settles, so the UI can show a skeleton
// instead of flashing the welcome screen at returning users.
const [libraryLoaded, setLibraryLoaded] = createSignal(false);
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
const [namingPattern, setNamingPatternSignal] = createSignal("{YYYY}-{MM}-{DD} {content}");
const [recentPhotos, setRecentPhotos] = createSignal<PhotoSummary[]>([]);
const [appVersion, setAppVersion] = createSignal("");

const [nasConfig, setNasConfigSignal] = createSignal<NasConfig | null>(null);
const [showNasMoveDialog, setShowNasMoveDialog] = createSignal(false);
const [nasPhotoIds, setNasPhotoIds] = createSignal<number[]>([]);

const [importProgress, setImportProgress] = createSignal({ done: 0, total: 0, current: "" });

// Listen for import progress events
listen("import:progress", (event: any) => {
  const data = event.payload as { done: number; total: number; current: string };
  setImportProgress(data);
  setImportStatus(`Importing ${data.done}/${data.total}: ${data.current}`);
  // Refresh photos progressively so they appear as they're imported
  if (data.done % 5 === 0 || data.done === data.total) {
    refreshPhotos();
  }
});

// Listen for import completion
listen("import:done", (event: any) => {
  const data = event.payload as { imported: number; skipped: number; total_files: number; error?: string };
  setIsImporting(false);
  if (data.error) {
    // importStatus only renders while isImporting is true, which it no longer
    // is — the toast is the only thing the user will actually see.
    setImportStatus(`Import failed: ${data.error}`);
    showToast(`Import failed: ${data.error}`, "error", 6000);
  } else {
    setImportStatus(`Imported ${data.imported} photos (${data.skipped} skipped)`);
  }
  refreshPhotos();
  refreshRecentPhotos();
  // Auto-trigger AI labeling
  const status = aiStatus();
  if (status?.available && !isLabeling() && data.imported > 0) {
    setTimeout(() => runAutoLabel(), 500);
  }
});

// Listen for labeling events from backend
listen("label:progress", (event: any) => {
  const data = event.payload as { done: number; total: number; current: string };
  setLabelProgress(data);
  setLabelStatus(`${data.done + 1} of ${data.total}: ${data.current}`);
});

// IDs labeled during the current run, so follow-up actions (NAS move) touch
// only this batch rather than the whole library.
let labeledBatchIds: number[] = [];

// refreshPhotos() replaces every photo object, and <For> is keyed by reference,
// so every card unmounts and refetches its thumbnail + labels. Once per photo
// is unusable on a large library; batch it.
const LABEL_REFRESH_EVERY = 20;

listen("label:photo_done", (event: any) => {
  const data = event.payload as { id: number; description: string; tags: string[]; done: number; total: number };
  setLabelProgress({ done: data.done, total: data.total, current: "" });
  setLabelStatus(`${data.done} of ${data.total} done`);
  labeledBatchIds.push(data.id);
  // Refresh photos to show new labels on the grid, batched. The final refresh
  // is guaranteed by the label:done listener below.
  if (data.done % LABEL_REFRESH_EVERY === 0) {
    refreshPhotos();
  }
});

listen("label:done", (event: any) => {
  const data = event.payload as {
    labeled: number;
    failed: number;
    total: number;
    remaining?: number;
  };
  setIsLabeling(false);

  if (data.labeled === 0 && data.total === 0) {
    setLabelStatus("All photos already labeled!");
  } else {
    // Report failures and the un-run remainder instead of only the good news:
    // a run that labels 3 of 500 should not read as "Done!".
    const parts = [`Labeled ${data.labeled} photos`];
    if (data.failed > 0) parts.push(`${data.failed} failed`);
    if (data.remaining && data.remaining > 0) {
      parts.push(`${data.remaining} still waiting — run Auto Label again`);
    }
    const message = parts.join(" · ");
    setLabelStatus(message);
    showToast(message, data.failed > 0 ? "error" : "success");
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

    // Check if NAS is configured and auto_move is enabled
    const cfg = nasConfig();
    if (cfg?.enabled && cfg.auto_move && cfg.path) {
      // Only the photos this run actually labeled. Offering the whole library
      // would propose moving (and with keep-local off, deleting) thousands of
      // files the user never touched.
      const ids = [...new Set(labeledBatchIds)];
      if (ids.length > 0) {
        setNasPhotoIds(ids);
        setShowNasMoveDialog(true);
      }
    }
  }
});

export function useLibrary() {
  return {
    photoCount,
    photos,
    libraryLoaded,
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
    nasConfig,
    showNasMoveDialog,
    nasPhotoIds,
    movePhotosToNas,
    dismissNasDialog,
    triggerRenameDialog,
    appVersion,
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
  setLibraryLoaded(true);
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
  // AI availability changes out from under us (user starts Ollama, pulls a
  // model). Checking only once at module load left the core feature
  // permanently disabled with no way to recover short of restarting.
  if (!isLabeling()) {
    await refreshAiStatus();
  }
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
      showToast("No camera detected. Plug in your Charmera, or use Add Folder.", "error", 5000);
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
  setImportProgress({ done: 0, total: 0, current: "" });
  setImportStatus(`Starting import from ${source}...`);
  try {
    // This returns immediately — import runs in background thread
    // Progress comes via import:progress events, completion via import:done
    await importFolder(source);
  } catch (e) {
    setImportStatus(`Import failed: ${e}`);
    setIsImporting(false);
    showToast(`Import failed: ${e}`, "error", 6000);
  }
  // Note: setIsImporting(false) is now handled by the import:done event listener
}

async function runAutoLabel() {
  setIsLabeling(true);
  labeledBatchIds = [];
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
    showToast(`Labeling failed: ${e}`, "error", 6000);
  }
}

async function confirmRenames(approved: [number, string][]) {
  if (approved.length === 0) {
    setShowRenameDialog(false);
    return;
  }
  try {
    const { renamed, skipped } = await applyRenames(approved);
    const msg = skipped > 0
      ? `Renamed ${renamed} · ${skipped} skipped (name already taken)`
      : `Renamed ${renamed} files`;
    setLabelStatus(msg);
    showToast(msg, skipped > 0 ? "info" : "success", skipped > 0 ? 6000 : 3000);
    setShowRenameDialog(false);
    setRenameProposals([]);
    await refreshPhotos();
  } catch (e) {
    setLabelStatus(`Rename failed: ${e}`);
    showToast(`Rename failed: ${e}`, "error", 6000);
  }
}

async function movePhotosToNas(keepLocal: boolean) {
  const ids = nasPhotoIds();
  if (ids.length === 0) {
    setShowNasMoveDialog(false);
    return;
  }
  try {
    const [moved, failed] = await moveToNas(ids, keepLocal);
    setLabelStatus(`Moved ${moved} to NAS${failed > 0 ? ` (${failed} failed)` : ""}`);
    setShowNasMoveDialog(false);
    setNasPhotoIds([]);
    if (!keepLocal) {
      await refreshPhotos();
    }
  } catch (e) {
    setLabelStatus(`NAS move failed: ${e}`);
    showToast(`NAS move failed: ${e}`, "error", 6000);
    setShowNasMoveDialog(false);
    setNasPhotoIds([]);
  }
}

function dismissNasDialog() {
  setShowNasMoveDialog(false);
  setNasPhotoIds([]);
}

async function triggerRenameDialog(): Promise<{ found: boolean; count: number }> {
  try {
    const proposals = await getRenameProposals();
    if (proposals.length > 0) {
      setRenameProposals(proposals);
      setShowRenameDialog(true);
      return { found: true, count: proposals.length };
    }
    return { found: false, count: 0 };
  } catch (e) {
    console.error("Failed to get rename proposals:", e);
    return { found: false, count: 0 };
  }
}

async function refreshAiStatus() {
  try {
    setAiStatus(await checkAiStatus());
  } catch (e) {
    // Swallowing this used to leave aiStatus null, which the Sidebar rendered
    // as "no AI button at all" with zero explanation.
    setAiStatus({
      available: false,
      model: "",
      models: [],
      reason: `Could not reach the AI service: ${e}`,
    });
  }
}

// Initialize
checkCamera();
refreshPhotos();
refreshRecentPhotos();
refreshAiStatus();
getNamingPattern().then(setNamingPatternSignal).catch(() => {});
getNasConfig().then(setNasConfigSignal).catch(() => setNasConfigSignal(null));
getAppVersion().then(setAppVersion).catch(() => setAppVersion(""));
