import { createSignal, Show } from "solid-js";
import Sidebar from "./components/layout/Sidebar";
import WelcomeScreen from "./components/shared/WelcomeScreen";
import PhotoGrid from "./components/photos/PhotoGrid";
import TagBrowser from "./components/tags/TagBrowser";
import RenameDialog from "./components/shared/RenameDialog";
import { useLibrary } from "./stores/library";
import { searchPhotos, type PhotoSummary } from "./lib/tauri";

export type View =
  | "all-photos"
  | "recent"
  | "tags"
  | "smart-albums"
  | "duplicates"
  | "splash"
  | "settings";

export default function App() {
  const [currentView, setCurrentView] = createSignal<View>("all-photos");
  const [searchQuery, setSearchQuery] = createSignal("");
  const [searchResults, setSearchResults] = createSignal<PhotoSummary[] | null>(null);
  const library = useLibrary();

  let searchTimeout: number | undefined;
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    clearTimeout(searchTimeout);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    searchTimeout = setTimeout(async () => {
      try {
        const result = await searchPhotos(query);
        setSearchResults(result.photos);
      } catch { setSearchResults(null); }
    }, 300) as unknown as number;
  };

  const displayPhotos = () => searchResults() ?? library.photos();

  return (
    <div class="flex h-screen overflow-hidden no-select">
      <Sidebar
        currentView={currentView()}
        onNavigate={setCurrentView}
        aiStatus={library.aiStatus()}
        isLabeling={library.isLabeling()}
        labelStatus={library.labelStatus()}
        onAutoLabel={library.runAutoLabel}
      />

      <main class="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header class="h-12 flex items-center px-4 border-b border-kodak-cream-dark bg-kodak-cream/80 backdrop-blur-sm shrink-0">
          <div class="flex-1">
            <div class="relative max-w-md">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-kodak-warm-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search photos... (try 'dog', 'outdoor', etc.)"
                value={searchQuery()}
                onInput={(e) => handleSearch(e.currentTarget.value)}
                class="w-full pl-10 pr-4 py-1.5 text-sm bg-white/60 border border-kodak-cream-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-kodak-amber/40 focus:border-kodak-amber placeholder:text-kodak-warm-gray"
              />
            </div>
          </div>
          <div class="flex items-center gap-3 text-xs text-kodak-warm-gray">
            <Show when={library.isLabeling()}>
              <span class="flex items-center gap-1.5 text-kodak-amber-dark">
                <span class="w-3 h-3 border-2 border-kodak-amber border-t-transparent rounded-full animate-spin" />
                {library.labelStatus()}
              </span>
            </Show>
            <Show when={library.isImporting()}>
              <span class="flex items-center gap-1.5">
                <span class="w-2 h-2 bg-kodak-amber rounded-full animate-pulse" />
                {library.importStatus()}
              </span>
            </Show>
            <span>{library.photoCount()} photos</span>
          </div>
        </header>

        {/* AI Progress bar */}
        <Show when={library.isLabeling() && library.labelProgress().total > 0}>
          <div class="px-4 py-2 bg-purple-50 border-b border-purple-100 shrink-0">
            <div class="flex items-center gap-3 text-xs">
              <span class="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin shrink-0" />
              <span class="text-purple-700 font-medium truncate flex-1">
                {library.labelStatus()}
              </span>
              <span class="text-purple-500 shrink-0">
                {library.labelProgress().done}/{library.labelProgress().total}
              </span>
            </div>
            <div class="mt-1.5 h-1.5 bg-purple-100 rounded-full overflow-hidden">
              <div
                class="h-full bg-purple-500 rounded-full transition-all duration-300"
                style={{
                  width: `${(library.labelProgress().done / Math.max(library.labelProgress().total, 1)) * 100}%`,
                }}
              />
            </div>
          </div>
        </Show>

        {/* Content area */}
        <div class="flex-1 overflow-auto">
          <Show when={library.photoCount() > 0} fallback={<WelcomeScreen library={library} />}>
            <Show when={currentView() === "tags"} fallback={
              <Show when={searchResults()} fallback={<PhotoGrid photos={library.photos()} />}>
                <div class="p-3">
                  <p class="text-sm text-kodak-warm-gray mb-2">
                    {searchResults()!.length} results for "{searchQuery()}"
                  </p>
                  <PhotoGrid photos={searchResults()!} />
                </div>
              </Show>
            }>
              <TagBrowser />
            </Show>
          </Show>
        </div>

        {/* Status bar */}
        <footer class="h-7 flex items-center px-4 text-xs text-kodak-warm-gray bg-kodak-cream-dark/50 border-t border-kodak-cream-dark shrink-0">
          <span>{library.photoCount()} photos indexed</span>
          <span class="mx-2">|</span>
          <Show when={library.cameraPath()} fallback={<span>No camera</span>}>
            <span class="flex items-center gap-1">
              <span class="w-1.5 h-1.5 bg-green-500 rounded-full" />
              Camera connected
            </span>
          </Show>
          <Show when={library.aiStatus()?.available}>
            <span class="mx-2">|</span>
            <span class="flex items-center gap-1">
              <span class="w-1.5 h-1.5 bg-purple-500 rounded-full" />
              AI ready ({library.aiStatus()?.model})
            </span>
          </Show>
          <Show when={library.labelStatus() && !library.isLabeling()}>
            <span class="mx-2">|</span>
            <span>{library.labelStatus()}</span>
          </Show>
        </footer>
      </main>

      {/* Rename confirmation dialog */}
      <Show when={library.showRenameDialog() && library.renameProposals().length > 0}>
        <RenameDialog
          proposals={library.renameProposals()}
          onConfirm={library.confirmRenames}
          onCancel={() => library.setShowRenameDialog(false)}
        />
      </Show>
    </div>
  );
}
