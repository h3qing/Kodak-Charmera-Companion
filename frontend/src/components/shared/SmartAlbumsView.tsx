import { createSignal, onMount, For, Show } from "solid-js";
import { getPhotos, getThumbnailBase64, type PhotoSummary } from "../../lib/tauri";
import PhotoGrid from "../photos/PhotoGrid";

interface DateGroup {
  label: string;
  date: string;
  photos: PhotoSummary[];
}

export default function SmartAlbumsView() {
  const [groups, setGroups] = createSignal<DateGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = createSignal<DateGroup | null>(null);
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    try {
      const page = await getPhotos(0, 500);
      const grouped = groupByDate(page.photos);
      setGroups(grouped);
    } catch (e) {
      console.error("Failed to load photos for albums:", e);
    }
    setLoading(false);
  });

  return (
    <div class="h-full overflow-auto">
      <Show when={selectedGroup()} fallback={
        <div class="p-4">
          <div class="flex items-center gap-2 mb-4">
            <svg class="w-5 h-5 text-kodak-yellow-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            <h2 class="text-lg font-bold font-[Nunito] text-kodak-charcoal">
              Smart Albums
            </h2>
          </div>

          <Show when={!loading()} fallback={
            <div class="flex items-center justify-center py-16">
              <span class="kodak-spinner" />
            </div>
          }>
            <Show when={groups().length > 0} fallback={
              <div class="flex flex-col items-center justify-center py-16 text-kodak-warm-gray">
                <svg class="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <p class="text-sm">No photos to group.</p>
                <p class="text-xs mt-1 opacity-60">Import photos to see smart albums.</p>
              </div>
            }>
              <p class="text-sm text-kodak-warm-gray mb-4">
                {groups().length} groups, automatically organized by import date.
              </p>
              <div class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                <For each={groups()}>
                  {(group) => (
                    <AlbumCard
                      group={group}
                      onClick={() => setSelectedGroup(group)}
                    />
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      }>
        <div>
          {/* Back bar */}
          <div class="flex items-center gap-2 px-4 py-2 border-b border-kodak-cream-dark bg-kodak-cream/50">
            <button
              onClick={() => setSelectedGroup(null)}
              class="flex items-center gap-1 text-sm text-kodak-warm-gray hover:text-kodak-charcoal transition-colors"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
              Smart Albums
            </button>
            <span class="text-kodak-warm-gray">/</span>
            <span class="text-sm font-semibold text-kodak-charcoal">
              {selectedGroup()!.label}
            </span>
            <span class="text-xs text-kodak-warm-gray">
              ({selectedGroup()!.photos.length} photos)
            </span>
          </div>
          <PhotoGrid photos={selectedGroup()!.photos} />
        </div>
      </Show>
    </div>
  );
}

function AlbumCard(props: { group: DateGroup; onClick: () => void }) {
  const [coverSrc, setCoverSrc] = createSignal<string | null>(null);

  onMount(async () => {
    // Use first photo as cover
    const cover = props.group.photos[0];
    if (cover?.thumbnail_path) {
      try {
        setCoverSrc(await getThumbnailBase64(cover.thumbnail_path));
      } catch {}
    }
  });

  return (
    <button
      onClick={props.onClick}
      class="text-left rounded-xl overflow-hidden border border-kodak-cream-dark bg-white hover:shadow-md transition-all group cursor-pointer"
    >
      {/* Cover image */}
      <div class="aspect-[16/10] bg-kodak-cream-dark overflow-hidden">
        <Show when={coverSrc()}>
          <img
            src={coverSrc()!}
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </Show>
      </div>
      {/* Info */}
      <div class="p-3">
        <p class="text-sm font-semibold text-kodak-charcoal truncate">
          {props.group.label}
        </p>
        <p class="text-xs text-kodak-warm-gray mt-0.5">
          {props.group.photos.length} photos
        </p>
      </div>
    </button>
  );
}

function groupByDate(photos: PhotoSummary[]): DateGroup[] {
  const groups = new Map<string, PhotoSummary[]>();

  for (const photo of photos) {
    // Group by import date (approximate from ID ordering) or taken_at
    const dateKey = photo.taken_at
      ? photo.taken_at.slice(0, 10) // "YYYY-MM-DD" or "YYYY:MM:DD"
      : "Unknown date";

    const existing = groups.get(dateKey) ?? [];
    groups.set(dateKey, [...existing, photo]);
  }

  // Convert to sorted array
  const result: DateGroup[] = [];
  for (const [date, photos] of groups) {
    const label = date === "Unknown date"
      ? "Undated Photos"
      : formatDateLabel(date);
    result.push({ label, date, photos });
  }

  // Sort newest first
  result.sort((a, b) => b.date.localeCompare(a.date));
  return result;
}

function formatDateLabel(dateStr: string): string {
  // Handle "YYYY:MM:DD" EXIF format
  const normalized = dateStr.replace(/:/g, "-");
  try {
    const date = new Date(normalized + "T00:00:00");
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}
