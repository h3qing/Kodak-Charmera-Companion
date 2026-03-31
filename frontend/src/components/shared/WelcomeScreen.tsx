import { Show } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";

interface WelcomeProps {
  library: {
    cameraPath: () => string | null;
    isImporting: () => boolean;
    importStatus: () => string;
    importFromCamera: () => Promise<void>;
    importFromPath: (source: string) => Promise<void>;
    aiStatus: () => { available: boolean; model: string } | null;
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

  const handleTryDemo = async () => {
    try {
      const { generateDemoPhotos } = await import("../../lib/tauri");
      const demoDir = await generateDemoPhotos();
      await props.library.importFromPath(demoDir);
    } catch (e) {
      console.error("Demo failed:", e);
    }
  };

  return (
    <div class="flex-1 flex items-center justify-center h-full">
      <div class="text-center max-w-md px-8">
        {/* Kodak Charmera camera illustration */}
        <div class="mx-auto w-48 h-32 mb-8 relative">
          {/* Camera body - yellow rectangle */}
          <div class="absolute inset-0 bg-kodak-yellow rounded-xl shadow-lg">
            {/* Rainbow stripe across middle */}
            <div class="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-6 overflow-hidden rounded-xl">
              <div class="h-full" style="background: linear-gradient(to bottom, #C41E3A 20%, #E87D1E 20%, #E87D1E 35%, #8B4513 35%, #8B4513 50%, #1C1C1C 50%, #1C1C1C 65%, #003DA5 65%, #003DA5 80%, #3D1F6E 80%);" />
            </div>
            {/* Lens */}
            <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-kodak-charcoal rounded-full border-4 border-kodak-charcoal-light flex items-center justify-center z-10">
              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border-2 border-gray-600" />
            </div>
            {/* "1987" text */}
            <div class="absolute bottom-2 right-3 text-white font-extrabold text-lg font-[Nunito] z-10">1987</div>
            {/* Top buttons */}
            <div class="absolute top-2 left-4 flex gap-2">
              <div class="w-3 h-3 rounded-full bg-kodak-charcoal/60" />
              <div class="w-3 h-3 rounded-full bg-kodak-charcoal/60" />
            </div>
            {/* Kodak branding */}
            <div class="absolute top-2 left-1/2 -translate-x-1/2 flex items-baseline gap-1 z-10">
              <span class="text-kodak-red text-[10px] font-bold">Kodak</span>
              <span class="text-white text-[10px] font-semibold">Charmera</span>
            </div>
          </div>
        </div>

        <h1 class="text-2xl font-extrabold font-[Nunito] text-kodak-charcoal mb-2">
          Welcome to Charmera
        </h1>
        <p class="text-sm text-kodak-warm-gray mb-2 leading-relaxed">
          Connect your KODAK CHARMERA or add a photo folder to get started.
          Your photos stay where they are, we just help you find them.
        </p>
        <p class="text-xs text-kodak-warm-gray/60 mb-8">
          Plug in your camera — we'll detect it automatically
        </p>

        <Show when={props.library.isImporting()}>
          <div class="mb-6 flex items-center justify-center gap-2 text-sm text-kodak-yellow-dark">
            <span class="w-4 h-4 border-2 border-kodak-yellow border-t-transparent rounded-full animate-spin" />
            {props.library.importStatus()}
          </div>
        </Show>

        <div class="flex flex-col gap-3 items-center">
          <button
            onClick={handleImportCamera}
            disabled={props.library.isImporting()}
            class="inline-flex items-center gap-2 px-6 py-2.5 bg-kodak-yellow hover:bg-kodak-yellow-dark disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm cursor-pointer disabled:cursor-not-allowed"
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

          <div class="flex items-center gap-3 mt-3">
            <div class="flex-1 h-px bg-kodak-cream-dark" />
            <span class="text-xs text-kodak-warm-gray/50">or</span>
            <div class="flex-1 h-px bg-kodak-cream-dark" />
          </div>

          <button
            onClick={handleTryDemo}
            disabled={props.library.isImporting()}
            class="inline-flex items-center gap-2 px-6 py-2 text-kodak-warm-gray hover:text-kodak-yellow-dark text-sm transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Try with sample photos
          </button>

          <p class="text-[10px] text-kodak-warm-gray/40 mt-1">
            Generates 6 test images — drag and drop also works
          </p>
        </div>

        {/* Status checklist */}
        <div class="mt-8 flex justify-center gap-4 text-xs">
          <div class="flex items-center gap-1.5">
            <span class={`w-2 h-2 rounded-full ${props.library.cameraPath() ? "bg-green-500" : "bg-kodak-warm-gray/30"}`} />
            <span class={props.library.cameraPath() ? "text-green-700" : "text-kodak-warm-gray/50"}>
              {props.library.cameraPath() ? "Camera detected" : "No camera"}
            </span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class={`w-2 h-2 rounded-full ${props.library.aiStatus()?.available ? "bg-green-500" : "bg-kodak-warm-gray/30"}`} />
            <span class={props.library.aiStatus()?.available ? "text-green-700" : "text-kodak-warm-gray/50"}>
              {props.library.aiStatus()?.available ? `AI ready (${props.library.aiStatus()?.model})` : "AI not available"}
            </span>
          </div>
        </div>

        {/* Decorative film strip with sprocket pattern */}
        <div class="mt-12 opacity-20">
          <div class="flex justify-center gap-1">
            {Array.from({ length: 9 }).map(() => (
              <div class="w-6 h-8 rounded-sm bg-kodak-charcoal" />
            ))}
          </div>
          <div class="flex justify-center mt-0.5">
            {Array.from({ length: 18 }).map(() => (
              <div class="w-2 h-1.5 rounded-sm bg-kodak-charcoal mx-0.5" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
