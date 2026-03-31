import { createSignal, onMount, onCleanup, Show } from "solid-js";

interface CameraPopupProps {
  fileCount: number;
  onImport: () => void;
  onDismiss: () => void;
}

export default function CameraPopup(props: CameraPopupProps) {
  const [visible, setVisible] = createSignal(false);
  let timer: number | undefined;

  onMount(() => {
    // Slide in after a brief delay
    setTimeout(() => setVisible(true), 100);
    // Auto-dismiss after 10 seconds
    timer = setTimeout(() => {
      handleDismiss();
    }, 10000) as unknown as number;
  });

  onCleanup(() => {
    if (timer) clearTimeout(timer);
  });

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => props.onDismiss(), 300); // Wait for slide-out animation
  };

  const handleImport = () => {
    setVisible(false);
    setTimeout(() => props.onImport(), 300);
  };

  return (
    <div
      class={`fixed top-4 right-4 z-50 transition-all duration-300 ${
        visible() ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
      }`}
    >
      <div class="bg-kodak-yellow rounded-xl shadow-2xl p-4 w-80 border-2 border-kodak-yellow-dark">
        {/* Rainbow stripe at top */}
        <div class="kodak-stripe-thin rounded-full mb-3" />

        {/* Content */}
        <div class="flex items-start gap-3">
          {/* Camera icon */}
          <div class="w-10 h-10 bg-kodak-charcoal rounded-lg flex items-center justify-center shrink-0">
            <svg class="w-5 h-5 text-kodak-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>

          <div class="flex-1 min-w-0">
            <h3 class="font-bold text-kodak-charcoal text-sm">
              Kodak Charmera Connected!
            </h3>
            <p class="text-kodak-charcoal/70 text-xs mt-0.5">
              <Show when={props.fileCount > 0} fallback="Camera detected">
                {props.fileCount} photos found on SD card
              </Show>
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={handleDismiss}
            class="text-kodak-charcoal/40 hover:text-kodak-charcoal transition-colors shrink-0"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Action buttons */}
        <div class="flex gap-2 mt-3">
          <button
            onClick={handleImport}
            class="flex-1 px-3 py-2 bg-kodak-charcoal hover:bg-kodak-charcoal-light text-kodak-yellow text-sm font-semibold rounded-lg transition-colors"
          >
            Import Now
          </button>
          <button
            onClick={handleDismiss}
            class="px-3 py-2 text-kodak-charcoal/60 hover:text-kodak-charcoal text-sm transition-colors"
          >
            Dismiss
          </button>
        </div>

        {/* Auto-dismiss progress bar */}
        <div class="mt-2 h-0.5 bg-kodak-charcoal/10 rounded-full overflow-hidden">
          <div
            class="h-full bg-kodak-charcoal/30 rounded-full"
            style="animation: shrink 10s linear forwards;"
          />
        </div>
      </div>

      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}
