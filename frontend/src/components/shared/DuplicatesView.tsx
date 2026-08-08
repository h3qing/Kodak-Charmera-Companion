import { createSignal, onMount, For, Show } from "solid-js";
import { getDuplicates, getThumbnailBase64, type DuplicateGroup, type PhotoSummary } from "../../lib/tauri";
import { invoke } from "@tauri-apps/api/core";

export default function DuplicatesView() {
  const [groups, setGroups] = createSignal<DuplicateGroup[]>([]);
  const [loading, setLoading] = createSignal(true);
  // A failed scan is not an empty result. Telling the user "All your photos are
  // unique" when the query blew up is worse than saying nothing.
  const [error, setError] = createSignal<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setGroups(await getDuplicates());
    } catch (e) {
      console.error("Failed to load duplicates:", e);
      setError(String(e));
    }
    setLoading(false);
  };

  onMount(load);

  const totalDuplicates = () => groups().reduce((sum, g) => sum + g.photos.length - 1, 0);

  const hidePhoto = async (id: number) => {
    try {
      await invoke("hide_photo", { id });
      // Refresh
      const dupes = await getDuplicates();
      setGroups(dupes);
    } catch (e) {
      console.error("Failed to hide photo:", e);
    }
  };

  return (
    <div class="p-4 h-full overflow-auto">
      <div class="flex items-center gap-2 mb-4">
        <svg class="w-5 h-5 text-kodak-yellow-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <h2 class="text-lg font-bold font-[Nunito] text-kodak-charcoal">
          Duplicate Photos
        </h2>
      </div>

      <Show when={!loading()} fallback={
        <div class="flex items-center justify-center py-16">
          <span class="kodak-spinner" />
        </div>
      }>
        <Show when={!error()} fallback={
          <div class="flex flex-col items-center justify-center py-16 text-kodak-warm-gray" role="alert">
            <svg class="w-12 h-12 mb-3 opacity-40 text-kodak-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p class="text-sm font-medium text-kodak-charcoal">Couldn't scan for duplicates</p>
            <p class="text-xs mt-1 max-w-md text-center break-words">{error()}</p>
            <button
              onClick={load}
              class="mt-4 px-4 py-2 text-xs bg-kodak-yellow hover:bg-kodak-yellow-dark text-kodak-charcoal rounded-lg font-medium transition-colors"
            >
              Try again
            </button>
          </div>
        }>
        <Show when={groups().length > 0} fallback={
          <div class="flex flex-col items-center justify-center py-16 text-kodak-warm-gray">
            <svg class="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="text-sm font-medium">No duplicates found</p>
            <p class="text-xs mt-1 opacity-60">All your photos are unique.</p>
          </div>
        }>
          <p class="text-sm text-kodak-warm-gray mb-4">
            Found {groups().length} group(s) with {totalDuplicates()} duplicate(s).
            Click "Hide" to remove a duplicate from your library (file stays on disk).
          </p>

          <div class="space-y-4">
            <For each={groups()}>
              {(group) => (
                <div class="bg-white rounded-xl border border-kodak-cream-dark p-4">
                  <p class="text-[10px] uppercase tracking-wider font-bold text-kodak-warm-gray mb-3">
                    {group.photos.length} copies &middot; hash {group.hash_hex.slice(0, 12)}...
                  </p>
                  <div class="flex gap-3 overflow-x-auto">
                    <For each={group.photos}>
                      {(photo, index) => (
                        <DuplicateCard
                          photo={photo}
                          isFirst={index() === 0}
                          onHide={() => hidePhoto(photo.id)}
                        />
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
        </Show>
      </Show>
    </div>
  );
}

function DuplicateCard(props: {
  photo: PhotoSummary;
  isFirst: boolean;
  onHide: () => void;
}) {
  const [src, setSrc] = createSignal<string | null>(null);

  onMount(async () => {
    if (props.photo.thumbnail_path) {
      try {
        setSrc(await getThumbnailBase64(props.photo.thumbnail_path));
      } catch {}
    }
  });

  return (
    <div class="shrink-0 w-40">
      <div class="aspect-[4/3] rounded-lg overflow-hidden bg-kodak-cream-dark mb-2">
        <Show when={src()}>
          <img src={src()!} class="w-full h-full object-cover" />
        </Show>
      </div>
      <p class="text-xs text-kodak-charcoal truncate mb-1">
        {props.photo.relative_path.split("/").pop()}
      </p>
      <div class="flex items-center gap-1">
        <Show when={props.isFirst}>
          <span class="px-1.5 py-0.5 text-[10px] bg-kodak-yellow/20 text-kodak-yellow-dark rounded font-medium">
            Keep
          </span>
        </Show>
        <Show when={!props.isFirst}>
          <button
            onClick={props.onHide}
            class="px-1.5 py-0.5 text-[10px] bg-kodak-red/10 text-kodak-red hover:bg-kodak-red/20 rounded transition-colors"
          >
            Hide
          </button>
        </Show>
      </div>
    </div>
  );
}
