import { createSignal, Show } from "solid-js";
import Sidebar from "./components/layout/Sidebar";
import WelcomeScreen from "./components/shared/WelcomeScreen";
import PhotoGrid from "./components/photos/PhotoGrid";
import { useLibrary } from "./stores/library";

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
  const library = useLibrary();

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
                placeholder="Search photos..."
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

        {/* Content area */}
        <div class="flex-1 overflow-auto">
          <Show
            when={library.photoCount() > 0}
            fallback={<WelcomeScreen library={library} />}
          >
            <PhotoGrid photos={library.photos()} />
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
    </div>
  );
}
