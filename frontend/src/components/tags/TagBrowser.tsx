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

  onMount(async () => {
    await loadTags();
  });

  const loadTags = async () => {
    try {
      const t: TagInfo[] = await invoke("get_all_tags");
      setTags(t);
    } catch (e) {
      console.error("Failed to load tags:", e);
    }
  };

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
                          ? "bg-purple-500 text-white font-semibold shadow-sm"
                          : "bg-purple-500/10 text-purple-700 hover:bg-purple-500/20"
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
                          ? "bg-kodak-amber text-white font-semibold"
                          : "bg-kodak-amber/10 text-kodak-amber-dark hover:bg-kodak-amber/20"
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
    <div class="rounded-lg overflow-hidden aspect-[4/3]">
      <Show when={src()} fallback={<div class="w-full h-full bg-kodak-cream-dark" />}>
        <img src={src()!} class="w-full h-full object-cover" />
      </Show>
    </div>
  );
}
