import { createSignal, Show, onMount, onCleanup } from "solid-js";
import Sidebar from "./components/layout/Sidebar";
import WelcomeScreen from "./components/shared/WelcomeScreen";
import PhotoGrid from "./components/photos/PhotoGrid";
import TagBrowser from "./components/tags/TagBrowser";
import RenameDialog from "./components/shared/RenameDialog";
import CameraPopup from "./components/shared/CameraPopup";
import SettingsView from "./components/shared/SettingsView";
import DuplicatesView from "./components/shared/DuplicatesView";
import SmartAlbumsView from "./components/shared/SmartAlbumsView";
import SplashEditor from "./components/shared/SplashEditor";
import Toast from "./components/shared/Toast";
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
  const [isDragging, setIsDragging] = createSignal(false);
  const library = useLibrary();

  // Listen for Tauri file drop events
  let dragCounter = 0;
  onMount(async () => {
    try {
      const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const appWindow = getCurrentWebviewWindow();
      const unlisten = await appWindow.onDragDropEvent((event) => {
        if (event.payload.type === "enter") {
          dragCounter++;
          setIsDragging(true);
        } else if (event.payload.type === "leave") {
          dragCounter--;
          if (dragCounter <= 0) {
            dragCounter = 0;
            setIsDragging(false);
          }
        } else if (event.payload.type === "drop") {
          dragCounter = 0;
          setIsDragging(false);
          const paths = event.payload.paths;
          if (paths.length > 0) {
            // Import from the first dropped folder/file's parent
            const droppedPath = paths[0];
            library.importFromPath(droppedPath);
          }
        }
      });
      onCleanup(() => unlisten());
    } catch (e) {
      console.error("Failed to set up drag-drop listener:", e);
    }
  });

  // Global keyboard shortcuts
  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case "1": e.preventDefault(); setCurrentView("all-photos"); break;
          case "2": e.preventDefault(); setCurrentView("recent"); break;
          case "3": e.preventDefault(); setCurrentView("tags"); break;
          case "4": e.preventDefault(); setCurrentView("duplicates"); break;
          case ",": e.preventDefault(); setCurrentView("settings"); break;
          case "f": e.preventDefault(); document.querySelector<HTMLInputElement>('input[type="text"]')?.focus(); break;
        }
      }
    };
    document.addEventListener("keydown", handler);
    onCleanup(() => document.removeEventListener("keydown", handler));
  });

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
        photoCount={library.photoCount()}
        recentCount={library.recentPhotos().length}
      />

      <main class="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header class="shrink-0">
          <div class="h-12 flex items-center px-4 bg-kodak-cream/90 backdrop-blur-sm">
            <div class="flex-1">
              <div class="relative max-w-md">
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-kodak-warm-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search photos... (try 'dog', 'outdoor', etc.)"
                  aria-label="Search photos by description or tags"
                  value={searchQuery()}
                  onInput={(e) => handleSearch(e.currentTarget.value)}
                  class="w-full pl-10 pr-4 py-1.5 text-sm bg-white/60 border border-kodak-cream-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-kodak-yellow/40 focus:border-kodak-yellow placeholder:text-kodak-warm-gray"
                />
              </div>
            </div>
            <div class="flex items-center gap-3 text-xs text-kodak-warm-gray">
              <Show when={library.isLabeling()}>
                <span class="flex items-center gap-1.5 text-kodak-yellow-dark">
                  <span class="w-3 h-3 border-2 border-kodak-yellow border-t-transparent rounded-full animate-spin" />
                  {library.labelStatus()}
                </span>
              </Show>
              <Show when={library.isImporting()}>
                <span class="flex items-center gap-1.5">
                  <span class="w-2 h-2 bg-kodak-yellow rounded-full animate-pulse" />
                  {library.importStatus()}
                </span>
              </Show>
              <span>{library.photoCount()} photos</span>
            </div>
          </div>
          <div class="kodak-stripe-thin" />
        </header>

        {/* Import progress bar */}
        <Show when={library.isImporting() && library.importProgress().total > 0}>
          <div class="px-4 py-2 bg-green-50 border-b border-green-100 shrink-0" role="progressbar">
            <div class="flex items-center gap-3 text-xs">
              <span class="w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full animate-spin shrink-0" />
              <span class="text-green-700 font-medium truncate flex-1">{library.importStatus()}</span>
              <span class="text-green-600 shrink-0">{library.importProgress().done}/{library.importProgress().total}</span>
            </div>
            <div class="mt-1.5 h-1.5 bg-green-100 rounded-full overflow-hidden">
              <div class="h-full bg-green-500 rounded-full transition-all duration-300" style={{ width: `${(library.importProgress().done / Math.max(library.importProgress().total, 1)) * 100}%` }} />
            </div>
          </div>
        </Show>

        {/* AI Progress bar */}
        <Show when={library.isLabeling() && library.labelProgress().total > 0}>
          <div class="px-4 py-2 bg-kodak-yellow/10 border-b border-kodak-yellow/20 shrink-0" role="progressbar" aria-label="AI labeling progress" aria-valuenow={library.labelProgress().done} aria-valuemax={library.labelProgress().total}>
            <div class="flex items-center gap-3 text-xs">
              <span class="w-3 h-3 border-2 border-kodak-yellow border-t-transparent rounded-full animate-spin shrink-0" />
              <span class="text-kodak-yellow-dark font-medium truncate flex-1">
                {library.labelStatus()}
              </span>
              <span class="text-kodak-yellow-dark shrink-0">
                {library.labelProgress().done}/{library.labelProgress().total}
              </span>
            </div>
            <div class="mt-1.5 h-1.5 bg-kodak-yellow/20 rounded-full overflow-hidden">
              <div
                class="h-full bg-kodak-yellow rounded-full transition-all duration-300"
                style={{
                  width: `${(library.labelProgress().done / Math.max(library.labelProgress().total, 1)) * 100}%`,
                }}
              />
            </div>
          </div>
        </Show>

        {/* Content area */}
        <div class="flex-1 overflow-auto">
          {(() => {
            const view = currentView();
            if (view === "settings") return <SettingsView />;
            if (view === "duplicates") return <DuplicatesView />;
            if (view === "smart-albums") return <SmartAlbumsView />;
            if (view === "splash") return <SplashEditor />;
            if (library.photoCount() === 0) return <WelcomeScreen library={library} />;
            if (view === "tags") return <TagBrowser />;
            if (view === "recent") return (
              <div class="p-3">
                <div class="flex items-center gap-2 mb-3">
                  <svg class="w-4 h-4 text-kodak-yellow-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h2 class="text-sm font-semibold text-kodak-charcoal">
                    Imported in the last 24 hours
                  </h2>
                  <span class="text-xs text-kodak-warm-gray">
                    ({library.recentPhotos().length} photos)
                  </span>
                </div>
                <Show when={library.recentPhotos().length > 0} fallback={
                  <div class="flex flex-col items-center justify-center py-16 text-kodak-warm-gray">
                    <svg class="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p class="text-sm">No recent imports.</p>
                    <p class="text-xs mt-1 opacity-60">Import photos from your camera to see them here.</p>
                  </div>
                }>
                  <PhotoGrid photos={library.recentPhotos()} onRefresh={library.refreshRecentPhotos} />
                </Show>
              </div>
            );
            if (searchResults()) return (
              <div class="p-3">
                <p class="text-sm text-kodak-warm-gray mb-2">
                  {searchResults()!.length} results for "{searchQuery()}"
                </p>
                <PhotoGrid photos={searchResults()!} onRefresh={library.refreshPhotos} searchQuery={searchQuery()} />
              </div>
            );
            return <PhotoGrid photos={library.photos()} onRefresh={library.refreshPhotos} onLoadMore={library.loadMorePhotos} hasMore={library.hasMore()} loadingMore={library.loadingMore()} />;
          })()}
        </div>

        {/* Status bar */}
        <footer class="h-7 flex items-center px-4 text-xs text-kodak-cream/70 bg-kodak-charcoal shrink-0" role="status" aria-label="Application status">
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
              <span class="w-1.5 h-1.5 bg-kodak-yellow rounded-full" />
              AI ready ({library.aiStatus()?.model})
            </span>
          </Show>
          <Show when={library.labelStatus() && !library.isLabeling()}>
            <span class="mx-2">|</span>
            <span>{library.labelStatus()}</span>
          </Show>
          <span class="ml-auto text-kodak-cream/30">v0.3.1</span>
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

      {/* Camera connection popup */}
      <Show when={library.cameraJustConnected()}>
        <CameraPopup
          fileCount={library.cameraFileCount()}
          onImport={library.importFromCamera}
          onDismiss={() => library.dismissCameraPopup()}
        />
      </Show>

      {/* Drag-and-drop overlay */}
      <Show when={isDragging()}>
        <div class="fixed inset-0 z-[100] bg-kodak-yellow/90 flex items-center justify-center backdrop-blur-sm">
          <div class="text-center">
            <div class="w-24 h-24 mx-auto mb-4 rounded-2xl bg-white/30 flex items-center justify-center">
              <svg class="w-12 h-12 text-kodak-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h2 class="text-2xl font-extrabold font-[Nunito] text-kodak-charcoal mb-1">
              Drop to Import
            </h2>
            <p class="text-kodak-charcoal/70 text-sm">
              Drop a folder of photos to import them
            </p>
          </div>
        </div>
      </Show>

      <Toast />
    </div>
  );
}
