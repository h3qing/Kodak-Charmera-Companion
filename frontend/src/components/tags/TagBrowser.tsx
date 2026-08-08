import { createSignal, onMount, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { getThumbnailBase64, type PhotoSummary } from "../../lib/tauri";

interface TagInfo {
  id: number;
  name: string;
  color: string | null;
  source: string;
  category: string | null;
  count: number;
}

export default function TagBrowser() {
  const [tags, setTags] = createSignal<TagInfo[]>([]);
  const [selectedTag, setSelectedTag] = createSignal<string | null>(null);
  const [tagPhotos, setTagPhotos] = createSignal<PhotoSummary[]>([]);
  const [loading, setLoading] = createSignal(true);
  // A failed tag query used to render the same encouraging empty state as a
  // genuinely untagged library, so the user waited for labels that never came.
  const [error, setError] = createSignal<string | null>(null);

  const loadTags = async () => {
    setLoading(true);
    setError(null);
    try {
      const t: TagInfo[] = await invoke("get_all_tags");
      setTags(t);
    } catch (e) {
      console.error("Failed to load tags:", e);
      setError(String(e));
    }
    setLoading(false);
  };

  onMount(loadTags);

  const selectTag = async (tagName: string) => {
    setSelectedTag(tagName);
    try {
      const photos: { photos: PhotoSummary[]; total: number } = await invoke("search_by_tag", { tag: tagName });
      setTagPhotos(photos.photos);
    } catch (e) {
      console.error("Failed to search by tag:", e);
    }
  };

  const aiTags = () => tags().filter((t) => t.source === "ai");
  const userTags = () => tags().filter((t) => t.source === "user");

  return (
    <div class="p-4 h-full overflow-auto">
      <Show when={!loading()} fallback={
        <div class="flex items-center justify-center py-16">
          <span class="kodak-spinner" />
        </div>
      }>
      <Show when={!error()} fallback={
        <div class="flex flex-col items-center justify-center h-full text-kodak-warm-gray" role="alert">
          <svg class="w-12 h-12 mb-3 opacity-40 text-kodak-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p class="text-sm font-medium text-kodak-charcoal">Couldn't load your tags</p>
          <p class="text-xs mt-1 max-w-md text-center break-words">{error()}</p>
          <button
            onClick={loadTags}
            class="mt-4 px-4 py-2 text-xs bg-kodak-yellow hover:bg-kodak-yellow-dark text-kodak-charcoal rounded-lg font-medium transition-colors"
          >
            Try again
          </button>
        </div>
      }>
      <Show
        when={tags().length > 0}
        fallback={
          <div class="flex flex-col items-center justify-center h-full text-kodak-warm-gray">
            <svg class="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 7h.01M7 3h5a2 2 0 011.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A2 2 0 013 10V5a2 2 0 012-2z" />
            </svg>
            <p class="text-sm">Tags will appear here as your photos are analyzed.</p>
            <p class="text-xs mt-1 opacity-60">Click "Auto Label Photos" in the sidebar to start.</p>
          </div>
        }
      >
        <div class="flex gap-6">
          {/* Tag cloud */}
          <div class="w-64 shrink-0">
            <Show when={aiTags().length > 0}>
              <h3 class="text-[10px] uppercase tracking-wider font-bold text-kodak-warm-gray mb-2">
                AI Tags ({aiTags().length})
              </h3>
              <div class="flex flex-wrap gap-1.5 mb-4">
                <For each={aiTags()}>
                  {(tag) => (
                    <button
                      onClick={() => selectTag(tag.name)}
                      class={`px-2.5 py-1 text-xs rounded-full transition-all cursor-pointer ${
                        selectedTag() === tag.name
                          ? "bg-kodak-yellow text-kodak-charcoal font-semibold shadow-sm"
                          : "bg-kodak-yellow/10 text-kodak-yellow-dark hover:bg-kodak-yellow/20"
                      }`}
                    >
                      {tag.name}
                      <span class="ml-1 opacity-60">{tag.count}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>

            <Show when={userTags().length > 0}>
              <h3 class="text-[10px] uppercase tracking-wider font-bold text-kodak-warm-gray mb-2">
                Your Tags ({userTags().length})
              </h3>
              <div class="flex flex-wrap gap-1.5">
                <For each={userTags()}>
                  {(tag) => (
                    <button
                      onClick={() => selectTag(tag.name)}
                      class={`px-2.5 py-1 text-xs rounded-full transition-all cursor-pointer ${
                        selectedTag() === tag.name
                          ? "bg-kodak-red text-white font-semibold"
                          : "bg-kodak-red/10 text-kodak-red hover:bg-kodak-red/20"
                      }`}
                    >
                      {tag.name}
                      <span class="ml-1 opacity-60">{tag.count}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>

          {/* Photos for selected tag */}
          <div class="flex-1">
            <Show when={selectedTag()}>
              <h2 class="text-sm font-semibold text-kodak-charcoal mb-3">
                Photos tagged "{selectedTag()}" ({tagPhotos().length})
              </h2>
              <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                <For each={tagPhotos()}>
                  {(photo) => <TagPhotoCard photo={photo} />}
                </For>
              </div>
            </Show>
            <Show when={!selectedTag()}>
              <p class="text-kodak-warm-gray text-sm">Select a tag to see matching photos.</p>
            </Show>
          </div>
        </div>
      </Show>
      </Show>
      </Show>
    </div>
  );
}

function TagPhotoCard(props: { photo: PhotoSummary }) {
  const [src, setSrc] = createSignal<string | null>(null);

  onMount(async () => {
    if (props.photo.thumbnail_path) {
      try {
        setSrc(await getThumbnailBase64(props.photo.thumbnail_path));
      } catch {}
    }
  });

  return (
    <div class="rounded-lg overflow-hidden aspect-[4/3] border border-kodak-cream-dark">
      <Show when={src()} fallback={<div class="w-full h-full bg-kodak-cream-dark" />}>
        <img src={src()!} class="w-full h-full object-cover" />
      </Show>
    </div>
  );
}
