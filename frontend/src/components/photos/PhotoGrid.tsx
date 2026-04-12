import { For, Show, createSignal, createEffect, createMemo, onMount } from "solid-js";
import type { PhotoSummary } from "../../lib/tauri";
import { getThumbnailBase64, getPhotoBase64, exportPhoto, getPhotoLabels, type PhotoLabels } from "../../lib/tauri";
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
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  searchQuery?: string;
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
        await exportPhoto(id, `${dest}/${fileName}`);
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
      <Show when={selectedCount() >= 1 && !viewingId()}>
        <div class="px-4 py-2 bg-kodak-yellow/10 border-b border-kodak-yellow/20 shrink-0">
          <div class="flex items-center gap-3">
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
                  searchQuery={props.searchQuery}
                />
              )}
            </For>
          </div>
          {/* Load more trigger */}
          <Show when={props.onLoadMore && props.hasMore}>
            <div class="flex justify-center py-4">
              <Show when={props.loadingMore} fallback={
                <button
                  onClick={() => props.onLoadMore?.()}
                  class="px-4 py-2 text-xs bg-kodak-yellow/10 hover:bg-kodak-yellow/20 text-kodak-yellow-dark rounded-lg transition-colors font-medium"
                >
                  Load more photos
                </button>
              }>
                <div class="flex items-center gap-2 text-xs text-kodak-warm-gray">
                  <span class="kodak-spinner" style="width: 14px; height: 14px; border-width: 1.5px;" />
                  Loading...
                </div>
              </Show>
            </div>
          </Show>
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

function highlightText(text: string, query?: string): string {
  if (!query || !query.trim()) return text;
  // Simple case-insensitive highlight using mark tags
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(${escaped})`, "gi"), "**$1**");
}

function PhotoCard(props: {
  photo: PhotoSummary;
  selected: boolean;
  onClick: (e: MouseEvent) => void;
  onDoubleClick: () => void;
  searchQuery?: string;
}) {
  const [thumbSrc, setThumbSrc] = createSignal<string | null>(null);
  const [labels, setLabels] = createSignal<PhotoLabels | null>(null);
  let cardRef: HTMLDivElement | undefined;
  let loaded = false;

  // Lazy load: only fetch thumbnail when card scrolls into view
  onMount(() => {
    if (!cardRef) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loaded) {
          loaded = true;
          observer.disconnect();
          // Load thumbnail
          if (props.photo.thumbnail_path) {
            getThumbnailBase64(props.photo.thumbnail_path)
              .then(setThumbSrc)
              .catch(() => {});
          }
          // Load labels
          getPhotoLabels(props.photo.id)
            .then((l) => { if (l.description || l.tags.length > 0) setLabels(l); })
            .catch(() => {});
        }
      },
      { rootMargin: "200px" } // Start loading 200px before visible
    );
    observer.observe(cardRef);
  });

  const aspectRatio = () => {
    if (props.photo.width && props.photo.height) {
      return props.photo.width / props.photo.height;
    }
    return 4 / 3;
  };

  const tooltip = () => {
    const name = props.photo.relative_path.split("/").pop() || "";
    const dims = `${props.photo.width}×${props.photo.height}`;
    const desc = labels()?.description || "";
    const parts = [name, dims];
    if (desc) parts.push(desc);
    if (props.photo.taken_at) parts.push(props.photo.taken_at);
    return parts.join("\n");
  };

  return (
    <div
      ref={cardRef}
      onClick={props.onClick}
      onDblClick={props.onDoubleClick}
      title={tooltip()}
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
      <div class={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 transition-opacity ${
        props.searchQuery ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      }`}>
        <Show when={labels()?.description} fallback={
          <p class="text-white text-xs truncate">{props.photo.relative_path.split("/").pop()}</p>
        }>
          <p class="text-white text-[11px] leading-tight line-clamp-2">{labels()!.description}</p>
        </Show>
        <Show when={labels()?.tags && labels()!.tags.length > 0}>
          <div class="flex flex-wrap gap-0.5 mt-1">
            <For each={labels()!.tags.slice(0, 3)}>
              {(tag) => {
                const isMatch = props.searchQuery && tag.toLowerCase().includes(props.searchQuery.toLowerCase());
                return (
                  <span class={`px-1.5 py-0 text-[9px] rounded-full ${
                    isMatch ? "bg-kodak-yellow text-kodak-charcoal font-bold" : "bg-white/20 text-white"
                  }`}>{tag}</span>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

function PhotoDetailView(props: {
  photo: PhotoSummary;
  photos: PhotoSummary[];
  onBack: () => void;
  onNavigate: (id: number) => void;
}) {
  const [detailSrc, setDetailSrc] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const [showInfo, setShowInfo] = createSignal(true);
  const [labels, setLabels] = createSignal<PhotoLabels | null>(null);

  createEffect(async () => {
    setLoading(true);
    setLabels(null);
    try {
      const src = await getPhotoBase64(props.photo.id);
      setDetailSrc(src);
    } catch {
      if (props.photo.thumbnail_path) {
        const src = await getThumbnailBase64(props.photo.thumbnail_path);
        setDetailSrc(src);
      }
    }
    setLoading(false);

    try {
      const l = await getPhotoLabels(props.photo.id);
      setLabels(l);
    } catch { /* no labels yet */ }
  });

  const [exporting, setExporting] = createSignal(false);

  const handleExport = async () => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const fileName = props.photo.relative_path.split("/").pop()?.replace(/\.[^.]+$/, "") || `photo-${props.photo.id}`;
    const dest = await save({
      defaultPath: `${fileName}.jpg`,
      filters: [{ name: "JPEG", extensions: ["jpg"] }],
    });
    if (dest) {
      setExporting(true);
      try {
        await exportPhoto(props.photo.id, dest);
        showToast("Photo saved!", "success");
      } catch (e) {
        showToast(`Save failed: ${e}`, "error");
      }
      setExporting(false);
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
    if (e.key === "i") setShowInfo(!showInfo());
  };

  const fileName = () => props.photo.relative_path.split("/").pop() || "";
  const shortDate = () => {
    const raw = props.photo.taken_at;
    if (!raw) return null;
    const normalized = raw.replace(/:/g, "-").slice(0, 10);
    return normalized;
  };

  return (
    <div
      class="flex-1 flex flex-col bg-kodak-charcoal"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      ref={(el) => el.focus()}
    >
      {/* Top bar */}
      <div class="shrink-0">
        <div class="h-11 flex items-center px-4 bg-kodak-brown-dark">
          <button
            onClick={props.onBack}
            class="text-kodak-cream/70 hover:text-kodak-yellow text-sm flex items-center gap-1.5 transition-colors font-display"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
            Album
          </button>
          <div class="flex-1 flex items-center justify-center gap-2">
            <button
              onClick={() => setShowInfo(!showInfo())}
              class={`text-[11px] uppercase tracking-widest px-3 py-1 rounded-full transition-colors font-display ${
                showInfo()
                  ? "bg-kodak-cream/15 text-kodak-cream"
                  : "text-kodak-cream/50 hover:text-kodak-cream hover:bg-kodak-cream/10"
              }`}
            >
              Info
            </button>
            <button
              onClick={handleExport}
              disabled={exporting()}
              class="text-[11px] uppercase tracking-widest px-3 py-1 rounded-full bg-kodak-yellow hover:bg-kodak-yellow-light text-kodak-charcoal font-display font-bold transition-colors disabled:opacity-50"
            >
              {exporting() ? "Saving…" : "Save Copy"}
            </button>
          </div>
          <span class="text-kodak-cream/50 text-[11px] tabular-nums font-mono">
            {String(currentIndex() + 1).padStart(2, "0")} / {String(props.photos.length).padStart(2, "0")}
          </span>
        </div>
        <div class="kodak-stripe-thin" />
      </div>

      {/* Photo + Info panel */}
      <div class="flex-1 flex overflow-hidden">
        {/* Photo area — felt-table backdrop with polaroid-framed photo */}
        <div class="flex-1 flex items-center justify-center relative overflow-hidden p-8">
          <Show when={hasPrev()}>
            <button
              onClick={() => navigate(-1)}
              aria-label="Previous photo"
              class="absolute left-4 z-10 w-11 h-11 bg-kodak-cream/10 hover:bg-kodak-yellow hover:text-kodak-charcoal rounded-full flex items-center justify-center text-kodak-cream/70 transition-colors"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
            </button>
          </Show>

          <Show when={!loading()} fallback={
            <div class="flex items-center gap-2 text-kodak-cream/50 text-sm font-display">
              <span class="kodak-spinner" />
              Loading photo…
            </div>
          }>
            {/* Polaroid print */}
            <div
              class="bg-kodak-cream p-3 pb-6 shadow-2xl max-w-full max-h-full flex flex-col items-center"
              style={{ "box-shadow": "0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0,0,0,0.1)" }}
            >
              <img
                src={detailSrc()}
                alt={props.photo.relative_path}
                class="max-w-[calc(100vw-28rem)] max-h-[calc(100vh-18rem)] object-contain bg-kodak-charcoal"
              />
              <div class="w-full mt-3 px-1 flex items-baseline justify-between gap-3 font-display">
                <Show
                  when={labels()?.description}
                  fallback={<span class="text-kodak-warm-gray text-xs italic truncate">{fileName()}</span>}
                >
                  <span class="text-kodak-charcoal text-sm italic truncate" style={{ "font-family": "'Caveat', 'Nunito', cursive" }}>
                    {labels()!.description}
                  </span>
                </Show>
                <Show when={shortDate()}>
                  <span class="text-kodak-warm-gray text-[10px] font-mono shrink-0">{shortDate()}</span>
                </Show>
              </div>
            </div>
          </Show>

          <Show when={hasNext()}>
            <button
              onClick={() => navigate(1)}
              aria-label="Next photo"
              class="absolute right-4 z-10 w-11 h-11 bg-kodak-cream/10 hover:bg-kodak-yellow hover:text-kodak-charcoal rounded-full flex items-center justify-center text-kodak-cream/70 transition-colors"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
            </button>
          </Show>
        </div>

        {/* Info panel — album index card */}
        <Show when={showInfo()}>
          <div class="w-72 bg-kodak-cream border-l-4 border-kodak-yellow overflow-auto shrink-0">
            <div class="kodak-stripe-thin" />
            <div class="p-5">
              <div class="pb-3 mb-4 border-b border-dashed border-kodak-warm-gray/30">
                <h3 class="text-kodak-warm-gray text-[10px] uppercase tracking-widest font-display font-bold mb-1">
                  From the Album
                </h3>
                <p class="text-kodak-charcoal text-sm font-display font-semibold break-all leading-tight">
                  {fileName()}
                </p>
                <p class="text-kodak-warm-gray text-[11px] mt-1 font-mono">
                  {props.photo.width} × {props.photo.height}
                </p>
                <Show when={props.photo.taken_at}>
                  <p class="text-kodak-warm-gray text-[11px] mt-0.5 font-mono">
                    📅 {props.photo.taken_at}
                  </p>
                </Show>
              </div>

              <Show when={labels()} fallback={
                <div class="text-kodak-warm-gray text-xs italic font-display leading-relaxed">
                  No caption yet. Tap <span class="font-semibold not-italic">Auto Label Photos</span> in the sidebar to let the AI write one.
                </div>
              }>
                <Show when={labels()!.description}>
                  <div class="mb-4">
                    <h4 class="text-kodak-warm-gray text-[10px] uppercase tracking-widest font-display font-bold mb-2">
                      Caption
                    </h4>
                    <p
                      class="text-kodak-charcoal text-base leading-snug"
                      style={{ "font-family": "'Caveat', 'Nunito', cursive" }}
                    >
                      “{labels()!.description}”
                    </p>
                  </div>
                </Show>

                <Show when={labels()!.tags.length > 0}>
                  <div>
                    <h4 class="text-kodak-warm-gray text-[10px] uppercase tracking-widest font-display font-bold mb-2">
                      Tags
                    </h4>
                    <div class="flex flex-wrap gap-1.5">
                      <For each={labels()!.tags}>
                        {(tag) => (
                          <span class="px-2 py-0.5 bg-kodak-yellow/80 text-kodak-charcoal text-[11px] rounded-sm font-display font-semibold shadow-sm">
                            {tag}
                          </span>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </Show>
            </div>
          </div>
        </Show>
      </div>

      {/* Film strip */}
      <div class="shrink-0 bg-kodak-film-border">
        <div class="film-sprockets" />
        <div class="h-20 flex items-center gap-2 px-4 overflow-x-auto">
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
        <div class="film-sprockets" />
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
