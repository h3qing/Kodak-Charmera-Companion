import { Show } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";

interface WelcomeProps {
  library: {
    cameraPath: () => string | null;
    isImporting: () => boolean;
    importStatus: () => string;
    importFromCamera: () => Promise<void>;
    importFromPath: (source: string) => Promise<void>;
  };
}

export default function WelcomeScreen(props: WelcomeProps) {
  const handleImportCamera = async () => {
    await props.library.importFromCamera();
  };

  const handleAddFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      await props.library.importFromPath(selected as string);
    }
  };

  return (
    <div class="flex-1 flex items-center justify-center h-full">
      <div class="text-center max-w-md px-8">
        {/* Vintage camera illustration */}
        <div class="mx-auto w-32 h-32 mb-6 relative">
          <div class="absolute inset-0 bg-kodak-amber/10 rounded-2xl rotate-3" />
          <div class="absolute inset-0 flex items-center justify-center">
            <svg class="w-20 h-20 text-kodak-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1">
              <rect x="2" y="6" width="20" height="14" rx="2" />
              <circle cx="12" cy="13" r="4" />
              <circle cx="12" cy="13" r="2" />
              <path d="M7 6V4a1 1 0 011-1h8a1 1 0 011 1v2" />
              <circle cx="17" cy="9" r="1" fill="currentColor" />
            </svg>
          </div>
        </div>

        <h1 class="text-2xl font-extrabold font-[Nunito] text-kodak-charcoal mb-2">
          Welcome to Charmera
        </h1>
        <p class="text-sm text-kodak-warm-gray mb-8 leading-relaxed">
          Connect your KODAK CHARMERA or add a photo folder to get started.
          Your photos stay where they are, we just help you find them.
        </p>

        <Show when={props.library.isImporting()}>
          <div class="mb-6 flex items-center justify-center gap-2 text-sm text-kodak-amber-dark">
            <span class="w-4 h-4 border-2 border-kodak-amber border-t-transparent rounded-full animate-spin" />
            {props.library.importStatus()}
          </div>
        </Show>

        <div class="flex flex-col gap-3 items-center">
          <button
            onClick={handleImportCamera}
            disabled={props.library.isImporting()}
            class="inline-flex items-center gap-2 px-6 py-2.5 bg-kodak-amber hover:bg-kodak-amber-dark disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm cursor-pointer disabled:cursor-not-allowed"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            </svg>
            <Show
              when={props.library.cameraPath()}
              fallback="Import from Camera (not detected)"
            >
              Import from Camera
            </Show>
          </button>

          <button
            onClick={handleAddFolder}
            disabled={props.library.isImporting()}
            class="inline-flex items-center gap-2 px-6 py-2.5 bg-white hover:bg-kodak-cream-dark disabled:opacity-50 text-kodak-charcoal text-sm font-medium rounded-lg border border-kodak-cream-dark transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            Add Folder
          </button>

          <p class="text-xs text-kodak-warm-gray/60 mt-2">
            or drag and drop a folder anywhere
          </p>
        </div>

        {/* Decorative film strip */}
        <div class="mt-12 flex justify-center gap-1 opacity-20">
          {Array.from({ length: 7 }).map(() => (
            <div class="w-6 h-8 rounded-sm bg-kodak-charcoal" />
          ))}
        </div>
      </div>
    </div>
  );
}
