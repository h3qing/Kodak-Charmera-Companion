import { For, Show, createSignal, createEffect, createMemo, onMount } from "solid-js";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { PhotoSummary } from "../../lib/tauri";
import { getThumbnailBase64, getPhotoBase64, previewEffect, exportPhoto, getPhotoLabels, type PhotoLabels } from "../../lib/tauri";
import { showToast } from "../shared/Toast";

type SortBy = "newest" | "oldest" | "name-asc" | "name-desc";
type GridSize = "small" | "medium" | "large";

const GRID_SIZES: Record<GridSize, string> = {
  small: "grid-cols-[repeat(auto-fill,minmax(120px,1fr))]",
  medium: "grid-cols-[repeat(auto-fill,minmax(180px,1fr))]",
  large: "grid-cols-[repeat(auto-fill,minmax(260px,1fr))]",
};

interface PhotoGridProps {
  photos: PhotoSummary[];
  onRefresh?: () => void;
}

export default function PhotoGrid(props: PhotoGridProps) {
  const [selectedIds, setSelectedIds] = createSignal<Set<number>>(new Set());
  const [viewingId, setViewingId] = createSignal<number | null>(null);
  const [batchExporting, setBatchExporting] = createSignal(false);
  const [sortBy, setSortBy] = createSignal<SortBy>("newest");
  const [gridSize, setGridSize] = createSignal<GridSize>("medium");

  const sortedPhotos = createMemo(() => {
    const photos = [...props.photos];
    switch (sortBy()) {
      case "newest":
        return photos.sort((a, b) => b.id - a.id);
      case "oldest":
        return photos.sort((a, b) => a.id - b.id);
      case "name-asc":
        return photos.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
      case "name-desc":
        return photos.sort((a, b) => b.relative_path.localeCompare(a.relative_path));
      default:
        return photos;
    }
  });

  const viewingPhoto = () => sortedPhotos().find((p) => p.id === viewingId());
  const selectedCount = () => selectedIds().size;

  const handleClick = (id: number, e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      // Toggle individual selection
      const next = new Set(selectedIds());
      if (next.has(id)) next.delete(id); else next.add(id);
      setSelectedIds(next);
    } else if (e.shiftKey && selectedIds().size > 0) {
      // Range select
      const ids = props.photos.map((p) => p.id);
      const lastSelected = [...selectedIds()].pop()!;
      const from = ids.indexOf(lastSelected);
      const to = ids.indexOf(id);
      const [start, end] = from < to ? [from, to] : [to, from];
      const next = new Set(selectedIds());
      for (let i = start; i <= end; i++) next.add(ids[i]!);
      setSelectedIds(next);
    } else {
      // Single select
      setSelectedIds(new Set([id]));
    }
  };

  const selectAll = () => setSelectedIds(new Set(props.photos.map((p) => p.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const handleBatchExport = async () => {
    const { open: openDir } = await import("@tauri-apps/plugin-dialog");
    const dest = await openDir({ directory: true });
    if (!dest) return;

    setBatchExporting(true);
    let count = 0;
    for (const id of selectedIds()) {
      const photo = props.photos.find((p) => p.id === id);
      if (!photo) continue;
      const fileName = photo.relative_path.split("/").pop() || `photo-${id}.jpg`;
      try {
        await exportPhoto(id, `${dest}/${fileName}`, [], null);
        count++;
      } catch (e) {
        console.error(`Export failed for ${id}:`, e);
      }
    }
    setBatchExporting(false);
    showToast(`Exported ${count} photos`, "success");
    clearSelection();
  };

  const [confirmingHide, setConfirmingHide] = createSignal(false);

  const handleBatchDelete = async () => {
    if (!confirmingHide()) {
      setConfirmingHide(true);
      // Auto-reset after 3 seconds if not confirmed
      setTimeout(() => setConfirmingHide(false), 3000);
      return;
    }
    setConfirmingHide(false);
    const count = selectedCount();
    for (const id of selectedIds()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("hide_photo", { id });
      } catch (e) {
        console.error(`Hide failed for ${id}:`, e);
      }
    }
    clearSelection();
    showToast(`Hidden ${count} photos from library`, "info");
    props.onRefresh?.();
  };

  return (
    <div class="h-full flex flex-col">
      {/* Batch action bar */}
      <Show when={selectedCount() > 1 && !viewingId()}>
        <div class="flex items-center gap-3 px-4 py-2 bg-kodak-yellow/10 border-b border-kodak-yellow/20 shrink-0">
          <span class="text-sm font-semibold text-kodak-yellow-dark">
            {selectedCount()} selected
          </span>
          <div class="flex items-center gap-1.5 ml-auto">
            <button
              onClick={selectAll}
              class="px-2.5 py-1 text-xs text-kodak-warm-gray hover:text-kodak-charcoal transition-colors"
            >
              Select all
            </button>
            <button
              onClick={handleBatchExport}
              disabled={batchExporting()}
              class="px-3 py-1.5 text-xs bg-kodak-yellow hover:bg-kodak-yellow-dark text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {batchExporting() ? "Exporting..." : "Export"}
            </button>
            <button
              onClick={handleBatchDelete}
              class={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                confirmingHide()
                  ? "bg-kodak-red text-white"
                  : "bg-kodak-red/10 hover:bg-kodak-red/20 text-kodak-red"
              }`}
            >
              {confirmingHide() ? "Click again to confirm" : "Hide"}
            </button>
            <button
              onClick={clearSelection}
              class="px-2.5 py-1 text-xs text-kodak-warm-gray hover:text-kodak-charcoal transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Show>

      {/* Grid view */}
      <Show when={!viewingId()}>
        <div class="flex-1 overflow-auto">
          {/* Toolbar */}
          <div class="flex items-center justify-between px-3 py-2 border-b border-kodak-cream-dark bg-kodak-cream/50">
            <span class="text-[10px] text-kodak-warm-gray">
              {props.photos.length} photos &middot; Cmd+click to multi-select
            </span>
            <div class="flex items-center gap-2">
              {/* Sort dropdown */}
              <select
                value={sortBy()}
                onChange={(e) => setSortBy(e.currentTarget.value as SortBy)}
                class="text-[11px] px-2 py-1 rounded-md border border-kodak-cream-dark bg-white text-kodak-charcoal focus:outline-none focus:ring-1 focus:ring-kodak-yellow/40"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name-asc">Name A-Z</option>
                <option value="name-desc">Name Z-A</option>
              </select>
              {/* Grid size buttons */}
              <div class="flex rounded-md border border-kodak-cream-dark overflow-hidden">
                {(["small", "medium", "large"] as GridSize[]).map((size) => (
                  <button
                    onClick={() => setGridSize(size)}
                    class={`px-1.5 py-1 transition-colors ${
                      gridSize() === size
                        ? "bg-kodak-yellow/20 text-kodak-yellow-dark"
                        : "bg-white text-kodak-warm-gray hover:bg-kodak-cream-dark"
                    }`}
                    title={`${size} grid`}
                  >
                    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                      {size === "small" ? (
                        <path d="M1 2.5A1.5 1.5 0 012.5 1h3A1.5 1.5 0 017 2.5v3A1.5 1.5 0 015.5 7h-3A1.5 1.5 0 011 5.5v-3zm8 0A1.5 1.5 0 0110.5 1h3A1.5 1.5 0 0115 2.5v3A1.5 1.5 0 0113.5 7h-3A1.5 1.5 0 019 5.5v-3zm-8 8A1.5 1.5 0 012.5 9h3A1.5 1.5 0 017 10.5v3A1.5 1.5 0 015.5 15h-3A1.5 1.5 0 011 13.5v-3zm8 0A1.5 1.5 0 0110.5 9h3a1.5 1.5 0 011.5 1.5v3a1.5 1.5 0 01-1.5 1.5h-3A1.5 1.5 0 019 13.5v-3z" />
                      ) : size === "medium" ? (
                        <path d="M1 2a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H2a1 1 0 01-1-1V2zm8 0a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1V2zM1 10a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H2a1 1 0 01-1-1v-5zm8 0a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1v-5z" />
                      ) : (
                        <path d="M1 2a1 1 0 011-1h12a1 1 0 011 1v5a1 1 0 01-1 1H2a1 1 0 01-1-1V2zm0 8a1 1 0 011-1h12a1 1 0 011 1v4a1 1 0 01-1 1H2a1 1 0 01-1-1v-4z" />
                      )}
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div class="p-3">
          <div class={`grid ${GRID_SIZES[gridSize()]} gap-2`}>
            <For each={sortedPhotos()}>
              {(photo) => (
                <PhotoCard
                  photo={photo}
                  selected={selectedIds().has(photo.id)}
                  onClick={(e) => handleClick(photo.id, e)}
                  onDoubleClick={() => setViewingId(photo.id)}
                />
              )}
            </For>
          </div>
          </div>
        </div>
      </Show>

      {/* Detail view */}
      <Show when={viewingId()}>
        <PhotoDetailView
          photo={viewingPhoto()!}
          photos={sortedPhotos()}
          onBack={() => setViewingId(null)}
          onNavigate={(id) => setViewingId(id)}
        />
      </Show>
    </div>
  );
}

function PhotoCard(props: {
  photo: PhotoSummary;
  selected: boolean;
  onClick: (e: MouseEvent) => void;
  onDoubleClick: () => void;
}) {
  const [thumbSrc, setThumbSrc] = createSignal<string | null>(null);
  const [labels, setLabels] = createSignal<PhotoLabels | null>(null);

  onMount(async () => {
    if (props.photo.thumbnail_path) {
      try {
        const src = await getThumbnailBase64(props.photo.thumbnail_path);
        setThumbSrc(src);
      } catch (e) {
        console.error("Failed to load thumbnail:", e);
      }
    }
    // Load labels
    try {
      const l = await getPhotoLabels(props.photo.id);
      if (l.description || l.tags.length > 0) setLabels(l);
    } catch { /* no labels yet */ }
  });

  const aspectRatio = () => {
    if (props.photo.width && props.photo.height) {
      return props.photo.width / props.photo.height;
    }
    return 4 / 3;
  };

  return (
    <div
      onClick={props.onClick}
      onDblClick={props.onDoubleClick}
      class={`relative group cursor-pointer rounded-lg overflow-hidden border-2 border-kodak-charcoal/10 transition-all duration-150 ${
        props.selected
          ? "ring-3 ring-kodak-yellow scale-[0.97] shadow-lg"
          : "hover:ring-2 hover:ring-kodak-yellow/30 hover:shadow-md"
      }`}
      style={{ "aspect-ratio": `${aspectRatio()}` }}
    >
      <Show
        when={thumbSrc()}
        fallback={
          <div class="w-full h-full bg-kodak-cream-dark animate-pulse flex items-center justify-center">
            <svg class="w-8 h-8 text-kodak-warm-gray/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        }
      >
        <img
          src={thumbSrc()!}
          alt={props.photo.relative_path}
          class="w-full h-full object-cover"
          loading="lazy"
        />
      </Show>

      {/* Selection checkmark */}
      <Show when={props.selected}>
        <div class="absolute top-2 left-2 w-5 h-5 bg-kodak-yellow rounded-full flex items-center justify-center shadow-sm">
          <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </Show>

      {/* Hover overlay with description and tags */}
      <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Show when={labels()?.description} fallback={
          <p class="text-white text-xs truncate">{props.photo.relative_path.split("/").pop()}</p>
        }>
          <p class="text-white text-[11px] leading-tight line-clamp-2">{labels()!.description}</p>
        </Show>
        <Show when={labels()?.tags && labels()!.tags.length > 0}>
          <div class="flex flex-wrap gap-0.5 mt-1">
            <For each={labels()!.tags.slice(0, 3)}>
              {(tag) => (
                <span class="px-1.5 py-0 bg-white/20 text-white text-[9px] rounded-full">{tag}</span>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

const EFFECTS = ["vintage", "noir", "faded", "warm", "cool", "sharp", "soft", "vignette", "grain", "light_leak"];

// Remember last used effects across photo navigation
let lastUsedEffects: string[] = [];
let lastUsedFrame: string | null = null;
const FRAMES = ["simple", "polaroid", "film_strip", "rounded"];

function PhotoDetailView(props: {
  photo: PhotoSummary;
  photos: PhotoSummary[];
  onBack: () => void;
  onNavigate: (id: number) => void;
}) {
  const [detailSrc, setDetailSrc] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const [activeEffects, setActiveEffects] = createSignal<string[]>([]);
  const [activeFrame, setActiveFrame] = createSignal<string | null>(null);
  const [previewSrc, setPreviewSrc] = createSignal<string | null>(null);
  const [previewing, setPreviewing] = createSignal(false);
  const [showEffects, setShowEffects] = createSignal(true);
  const [showInfo, setShowInfo] = createSignal(true);
  const [labels, setLabels] = createSignal<PhotoLabels | null>(null);
  const [effectError, setEffectError] = createSignal<string | null>(null);
  const [hasLastPreset, setHasLastPreset] = createSignal(lastUsedEffects.length > 0 || lastUsedFrame !== null);

  // Load full-res photo and labels
  createEffect(async () => {
    setLoading(true);
    setActiveEffects([]);
    setActiveFrame(null);
    setPreviewSrc(null);
    setLabels(null);
    setHasLastPreset(lastUsedEffects.length > 0 || lastUsedFrame !== null);
    try {
      const src = await getPhotoBase64(props.photo.id);
      setDetailSrc(src);
    } catch {
      // Fall back to thumbnail
      if (props.photo.thumbnail_path) {
        const src = await getThumbnailBase64(props.photo.thumbnail_path);
        setDetailSrc(src);
      }
    }
    setLoading(false);

    // Load labels
    try {
      const l = await getPhotoLabels(props.photo.id);
      setLabels(l);
    } catch { /* no labels yet */ }
  });

  const toggleEffect = async (effect: string) => {
    const current = activeEffects();
    const updated = current.includes(effect)
      ? current.filter((e) => e !== effect)
      : [...current, effect].slice(-3); // max 3
    setActiveEffects(updated);
    lastUsedEffects = updated;
    await applyPreview(updated, activeFrame());
  };

  const toggleFrame = async (frame: string) => {
    const updated = activeFrame() === frame ? null : frame;
    lastUsedFrame = updated;
    setActiveFrame(updated);
    await applyPreview(activeEffects(), updated);
  };

  const applyPreview = async (effects: string[], frame: string | null) => {
    if (effects.length === 0 && !frame) {
      setPreviewSrc(null);
      setEffectError(null);
      return;
    }
    setPreviewing(true);
    setEffectError(null);
    try {
      const src = await previewEffect(props.photo.id, effects, frame);
      setPreviewSrc(src);
    } catch (e) {
      console.error("Preview failed:", e);
      setEffectError(String(e));
    }
    setPreviewing(false);
  };

  const handleExport = async () => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const dest = await save({
      defaultPath: `charmera-export-${props.photo.id}.jpg`,
      filters: [{ name: "JPEG", extensions: ["jpg"] }],
    });
    if (dest) {
      await exportPhoto(props.photo.id, dest, activeEffects(), activeFrame());
    }
  };

  const currentIndex = () => props.photos.findIndex((p) => p.id === props.photo.id);
  const hasPrev = () => currentIndex() > 0;
  const hasNext = () => currentIndex() < props.photos.length - 1;
  const navigate = (delta: number) => {
    const idx = currentIndex() + delta;
    const photo = props.photos[idx];
    if (photo) props.onNavigate(photo.id);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") props.onBack();
    if (e.key === "ArrowLeft" && hasPrev()) navigate(-1);
    if (e.key === "ArrowRight" && hasNext()) navigate(1);
    if (e.key === "e") setShowEffects(!showEffects());
    if (e.key === "i") setShowInfo(!showInfo());
  };

  const displaySrc = () => previewSrc() || detailSrc();

  return (
    <div
      class="flex-1 flex flex-col bg-kodak-charcoal"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      ref={(el) => el.focus()}
    >
      {/* Top bar */}
      <div class="h-10 flex items-center px-4 shrink-0">
        <button
          onClick={props.onBack}
          class="text-white/70 hover:text-white text-sm flex items-center gap-1 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div class="flex-1 flex items-center justify-center gap-3">
          <button
            onClick={() => setShowEffects(!showEffects())}
            class={`text-xs px-3 py-1 rounded-full transition-colors ${
              showEffects()
                ? "bg-kodak-yellow text-white"
                : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            Effects
          </button>
          <button
            onClick={() => setShowInfo(!showInfo())}
            class={`text-xs px-3 py-1 rounded-full transition-colors ${
              showInfo()
                ? "bg-white/20 text-white"
                : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            Info
          </button>
          <Show when={activeEffects().length > 0 || activeFrame()}>
            <button
              onClick={handleExport}
              class="text-xs px-3 py-1 rounded-full bg-kodak-yellow/80 hover:bg-kodak-yellow text-white transition-colors"
            >
              Export
            </button>
          </Show>
        </div>
        <span class="text-white/50 text-xs">
          {currentIndex() + 1} / {props.photos.length}
          {previewing() && " (rendering...)"}
        </span>
      </div>

      {/* Photo + Info panel */}
      <div class="flex-1 flex overflow-hidden">
        {/* Photo area */}
        <div class="flex-1 flex items-center justify-center relative overflow-hidden">
          <Show when={hasPrev()}>
            <button onClick={() => navigate(-1)} class="absolute left-4 z-10 w-10 h-10 bg-kodak-yellow/40 hover:bg-kodak-yellow/60 rounded-full flex items-center justify-center text-white transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
            </button>
          </Show>

          <Show when={!loading()} fallback={
            <div class="text-white/40 text-sm">Loading...</div>
          }>
            <img src={displaySrc()} alt={props.photo.relative_path} class="max-w-full max-h-full object-contain" />
          </Show>

          <Show when={hasNext()}>
            <button onClick={() => navigate(1)} class="absolute right-4 z-10 w-10 h-10 bg-kodak-yellow/40 hover:bg-kodak-yellow/60 rounded-full flex items-center justify-center text-white transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
            </button>
          </Show>
        </div>

        {/* Info panel */}
        <Show when={showInfo()}>
          <div class="w-64 bg-kodak-brown border-l border-white/10 overflow-auto shrink-0 p-4">
            <h3 class="text-white/40 text-[10px] uppercase tracking-wider font-bold mb-3">Photo Info</h3>

            {/* File info */}
            <div class="mb-4">
              <p class="text-white/80 text-xs break-all">{props.photo.relative_path.split("/").pop()}</p>
              <p class="text-white/40 text-[10px] mt-1">{props.photo.width} x {props.photo.height}</p>
              <Show when={props.photo.taken_at}>
                <p class="text-white/40 text-[10px] mt-0.5 flex items-center gap-1">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {props.photo.taken_at}
                </p>
              </Show>
            </div>

            {/* AI Description */}
            <Show when={labels()}>
              <div class="mb-4">
                <h4 class="text-kodak-yellow text-[10px] uppercase tracking-wider font-bold mb-2 flex items-center gap-1">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12" />
                  </svg>
                  AI Description
                </h4>
                <Show when={labels()!.description}>
                  <p class="text-white/70 text-xs leading-relaxed">{labels()!.description}</p>
                </Show>
              </div>

              {/* AI Tags */}
              <Show when={labels()!.tags.length > 0}>
                <div class="mb-4">
                  <h4 class="text-kodak-yellow text-[10px] uppercase tracking-wider font-bold mb-2">Tags</h4>
                  <div class="flex flex-wrap gap-1">
                    <For each={labels()!.tags}>
                      {(tag) => (
                        <span class="px-2 py-0.5 bg-kodak-yellow/20 text-kodak-yellow-light text-[11px] rounded-full">
                          {tag}
                        </span>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </Show>

            <Show when={!labels()}>
              <div class="text-white/30 text-xs italic">
                No AI labels yet. Click "Auto Label Photos" in the sidebar.
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* Effects panel */}
      <Show when={showEffects()}>
        <div class="bg-kodak-brown px-4 py-3 shrink-0">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-white/50 text-[10px] uppercase tracking-wider font-bold">Effects</span>
            <Show when={activeEffects().length > 0}>
              <button
                onClick={() => { setActiveEffects([]); setActiveFrame(null); setPreviewSrc(null); lastUsedEffects = []; lastUsedFrame = null; }}
                class="text-[10px] text-kodak-red-light hover:text-kodak-red transition-colors"
              >
                Clear all
              </button>
            </Show>
            <Show when={hasLastPreset() && activeEffects().length === 0}>
              <button
                onClick={() => { setActiveEffects(lastUsedEffects); setActiveFrame(lastUsedFrame); applyPreview(lastUsedEffects, lastUsedFrame); }}
                class="text-[10px] text-kodak-yellow-dark hover:text-kodak-yellow transition-colors"
              >
                Reapply last
              </button>
            </Show>
          </div>
          <div class="flex gap-1.5 overflow-x-auto pb-1">
            <For each={EFFECTS}>
              {(effect) => (
                <button
                  onClick={() => toggleEffect(effect)}
                  class={`shrink-0 px-3 py-1.5 text-xs rounded-lg transition-all ${
                    activeEffects().includes(effect)
                      ? "bg-kodak-yellow text-white font-semibold"
                      : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                  }`}
                >
                  {effect.replace("_", " ")}
                </button>
              )}
            </For>
          </div>
          <div class="flex items-center gap-2 mt-2">
            <span class="text-white/50 text-[10px] uppercase tracking-wider font-bold">Frames</span>
          </div>
          <div class="flex gap-1.5 mt-1">
            <For each={FRAMES}>
              {(frame) => (
                <button
                  onClick={() => toggleFrame(frame)}
                  class={`shrink-0 px-3 py-1.5 text-xs rounded-lg transition-all ${
                    activeFrame() === frame
                      ? "bg-kodak-yellow text-white font-semibold"
                      : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                  }`}
                >
                  {frame.replace("_", " ")}
                </button>
              )}
            </For>
          </div>
          {/* Error feedback */}
          <Show when={effectError()}>
            <div class="mt-2 px-2 py-1 bg-kodak-red/20 text-kodak-red-light text-xs rounded">
              Effect failed: {effectError()}
            </div>
          </Show>
          {/* Rendering indicator */}
          <Show when={previewing()}>
            <div class="mt-2 flex items-center gap-2 text-xs text-white/50">
              <span class="kodak-spinner" style="width: 12px; height: 12px; border-width: 1.5px;" />
              Rendering preview...
            </div>
          </Show>
        </div>
      </Show>

      {/* Film strip */}
      <div class="h-20 bg-kodak-film-border flex items-center gap-1 px-4 overflow-x-auto shrink-0">
        <For each={props.photos}>
          {(photo) => (
            <FilmStripThumb
              photo={photo}
              active={photo.id === props.photo.id}
              onClick={() => props.onNavigate(photo.id)}
            />
          )}
        </For>
      </div>
    </div>
  );
}

function FilmStripThumb(props: { photo: PhotoSummary; active: boolean; onClick: () => void }) {
  const [src, setSrc] = createSignal<string | null>(null);

  onMount(async () => {
    if (props.photo.thumbnail_path) {
      try {
        const data = await getThumbnailBase64(props.photo.thumbnail_path);
        setSrc(data);
      } catch { /* ignore */ }
    }
  });

  return (
    <button
      onClick={props.onClick}
      class={`shrink-0 w-14 h-14 rounded overflow-hidden border-2 transition-all ${
        props.active
          ? "border-kodak-yellow scale-105"
          : "border-transparent opacity-60 hover:opacity-100"
      }`}
    >
      <Show when={src()} fallback={<div class="w-full h-full bg-kodak-charcoal-light" />}>
        <img src={src()!} class="w-full h-full object-cover" />
      </Show>
    </button>
  );
}
