import { createSignal, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export default function SplashEditor() {
  const [sourcePath, setSourcePath] = createSignal<string | null>(null);
  const [previewSrc, setPreviewSrc] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [installing, setInstalling] = createSignal(false);
  const [status, setStatus] = createSignal("");

  const pickImage = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "bmp"] }],
    });
    if (!selected) return;

    const path = selected as string;
    setSourcePath(path);
    setLoading(true);
    setStatus("");
    try {
      const preview: string = await invoke("preview_splash", { sourcePath: path });
      setPreviewSrc(preview);
    } catch (e) {
      setStatus(`Preview failed: ${e}`);
    }
    setLoading(false);
  };

  const handleInstall = async () => {
    const path = sourcePath();
    if (!path) return;

    setInstalling(true);
    setStatus("");
    try {
      const dest: string = await invoke("install_splash", { sourcePath: path });
      setStatus(`Splash installed to ${dest.split("/").pop()}`);
    } catch (e) {
      setStatus(String(e));
    }
    setInstalling(false);
  };

  return (
    <div class="h-full overflow-auto">
      <div class="max-w-2xl mx-auto p-6">
        {/* Header */}
        <div class="mb-6">
          <div class="flex items-center gap-2 mb-1">
            <svg class="w-5 h-5 text-kodak-yellow-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h1 class="text-2xl font-extrabold font-[Nunito] text-kodak-charcoal">Boot Splash Editor</h1>
          </div>
          <p class="text-sm text-kodak-warm-gray">
            Customize the image your camera shows when it powers on. The splash screen is stored on the SD card at <code class="font-mono bg-kodak-cream-dark px-1 rounded text-xs">SPIDCIM/SPI00.jpg</code> (960x720 JPEG).
          </p>
          <div class="kodak-stripe mt-4 rounded-full" />
        </div>

        {/* Pick image */}
        <div class="mb-6">
          <button
            onClick={pickImage}
            disabled={loading()}
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-kodak-yellow hover:bg-kodak-yellow-dark text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {loading() ? "Loading..." : "Choose Image"}
          </button>
          <Show when={sourcePath()}>
            <span class="ml-3 text-xs text-kodak-warm-gray font-mono">
              {sourcePath()!.split("/").pop()}
            </span>
          </Show>
        </div>

        {/* Preview */}
        <Show when={previewSrc()}>
          <div class="mb-6">
            <h2 class="text-sm font-bold uppercase tracking-wider text-kodak-warm-gray mb-3">
              Preview (960 x 720)
            </h2>
            <div class="bg-kodak-charcoal rounded-xl p-4 inline-block">
              <img
                src={previewSrc()!}
                alt="Splash preview"
                class="rounded-lg shadow-lg"
                style="max-width: 480px; aspect-ratio: 960/720;"
              />
            </div>
          </div>

          {/* Install button */}
          <div class="flex items-center gap-3">
            <button
              onClick={handleInstall}
              disabled={installing()}
              class="inline-flex items-center gap-2 px-5 py-2.5 bg-kodak-charcoal hover:bg-kodak-charcoal-light text-kodak-yellow font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {installing() ? "Installing..." : "Install to Camera"}
            </button>
            <Show when={status()}>
              <span class={`text-xs ${status().includes("failed") || status().includes("No camera") ? "text-kodak-red" : "text-green-600"} font-medium`}>
                {status()}
              </span>
            </Show>
          </div>
          <p class="text-xs text-kodak-warm-gray mt-2">
            Writes to the connected camera's SD card. Power cycle the camera to see the new splash.
          </p>
        </Show>

        {/* Empty state */}
        <Show when={!previewSrc() && !loading()}>
          <div class="bg-white rounded-xl border border-kodak-cream-dark p-8 text-center">
            <div class="w-20 h-14 mx-auto mb-4 bg-kodak-cream rounded-lg flex items-center justify-center">
              <svg class="w-8 h-8 text-kodak-warm-gray/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p class="text-sm text-kodak-charcoal font-medium mb-1">Choose an image to get started</p>
            <p class="text-xs text-kodak-warm-gray">
              Any JPEG or PNG will be automatically resized and cropped to 960x720.
            </p>
          </div>
        </Show>
      </div>
    </div>
  );
}
