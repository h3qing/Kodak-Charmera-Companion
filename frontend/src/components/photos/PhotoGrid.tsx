import { For, Show, createSignal, createEffect, onMount } from "solid-js";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { PhotoSummary } from "../../lib/tauri";
import { getThumbnailBase64, getPhotoBase64, previewEffect, exportPhoto, getPhotoLabels, type PhotoLabels } from "../../lib/tauri";

interface PhotoGridProps {
  photos: PhotoSummary[];
}

export default function PhotoGrid(props: PhotoGridProps) {
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [viewingId, setViewingId] = createSignal<number | null>(null);

  const viewingPhoto = () => props.photos.find((p) => p.id === viewingId());

  return (
    <div class="h-full flex flex-col">
      {/* Grid view */}
      <Show when={!viewingId()}>
        <div class="flex-1 overflow-auto p-3">
          <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
            <For each={props.photos}>
              {(photo) => (
                <PhotoCard
                  photo={photo}
                  selected={selectedId() === photo.id}
                  onClick={() => setSelectedId(photo.id)}
                  onDoubleClick={() => setViewingId(photo.id)}
                />
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Detail view */}
      <Show when={viewingId()}>
        <PhotoDetailView
          photo={viewingPhoto()!}
          photos={props.photos}
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
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  const [thumbSrc, setThumbSrc] = createSignal<string | null>(null);

  onMount(async () => {
    if (props.photo.thumbnail_path) {
      try {
        const src = await getThumbnailBase64(props.photo.thumbnail_path);
        setThumbSrc(src);
      } catch (e) {
        console.error("Failed to load thumbnail:", e);
      }
    }
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
      class={`relative group cursor-pointer rounded-lg overflow-hidden transition-all duration-150 ${
        props.selected
          ? "ring-3 ring-kodak-amber scale-[0.97] shadow-lg"
          : "hover:ring-2 hover:ring-kodak-amber/30 hover:shadow-md"
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
        <div class="absolute top-2 left-2 w-5 h-5 bg-kodak-amber rounded-full flex items-center justify-center shadow-sm">
          <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </Show>

      {/* Hover overlay with filename */}
      <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <p class="text-white text-xs truncate">{props.photo.relative_path.split("/").pop()}</p>
      </div>
    </div>
  );
}

const EFFECTS = ["vintage", "noir", "faded", "warm", "cool", "sharp", "soft", "vignette", "grain", "light_leak"];
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
  const [showEffects, setShowEffects] = createSignal(false);
  const [showInfo, setShowInfo] = createSignal(true);
  const [labels, setLabels] = createSignal<PhotoLabels | null>(null);

  // Load full-res photo and labels
  createEffect(async () => {
    setLoading(true);
    setActiveEffects([]);
    setActiveFrame(null);
    setPreviewSrc(null);
    setLabels(null);
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
    await applyPreview(updated, activeFrame());
  };

  const toggleFrame = async (frame: string) => {
    const updated = activeFrame() === frame ? null : frame;
    setActiveFrame(updated);
    await applyPreview(activeEffects(), updated);
  };

  const applyPreview = async (effects: string[], frame: string | null) => {
    if (effects.length === 0 && !frame) {
      setPreviewSrc(null);
      return;
    }
    setPreviewing(true);
    try {
      const src = await previewEffect(props.photo.id, effects, frame);
      setPreviewSrc(src);
    } catch (e) {
      console.error("Preview failed:", e);
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
                ? "bg-kodak-amber text-white"
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
              class="text-xs px-3 py-1 rounded-full bg-kodak-amber/80 hover:bg-kodak-amber text-white transition-colors"
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
            <button onClick={() => navigate(-1)} class="absolute left-4 z-10 w-10 h-10 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
            </button>
          </Show>

          <Show when={!loading()} fallback={
            <div class="text-white/40 text-sm">Loading...</div>
          }>
            <img src={displaySrc()} alt={props.photo.relative_path} class="max-w-full max-h-full object-contain" />
          </Show>

          <Show when={hasNext()}>
            <button onClick={() => navigate(1)} class="absolute right-4 z-10 w-10 h-10 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white transition-colors">
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
            </div>

            {/* AI Description */}
            <Show when={labels()}>
              <div class="mb-4">
                <h4 class="text-purple-400 text-[10px] uppercase tracking-wider font-bold mb-2 flex items-center gap-1">
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
                  <h4 class="text-purple-400 text-[10px] uppercase tracking-wider font-bold mb-2">Tags</h4>
                  <div class="flex flex-wrap gap-1">
                    <For each={labels()!.tags}>
                      {(tag) => (
                        <span class="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-[11px] rounded-full">
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
                onClick={() => { setActiveEffects([]); setPreviewSrc(null); }}
                class="text-[10px] text-kodak-red-light hover:text-kodak-red transition-colors"
              >
                Clear all
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
                      ? "bg-kodak-amber text-white font-semibold"
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
                      ? "bg-kodak-amber text-white font-semibold"
                      : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                  }`}
                >
                  {frame.replace("_", " ")}
                </button>
              )}
            </For>
          </div>
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
          ? "border-kodak-amber scale-105"
          : "border-transparent opacity-60 hover:opacity-100"
      }`}
    >
      <Show when={src()} fallback={<div class="w-full h-full bg-kodak-charcoal-light" />}>
        <img src={src()!} class="w-full h-full object-cover" />
      </Show>
    </button>
  );
}
