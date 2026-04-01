import { createSignal } from "solid-js";

interface NasMoveDialogProps {
  photoCount: number;
  nasPath: string;
  onMove: (keepLocal: boolean) => void;
  onSkip: () => void;
}

export default function NasMoveDialog(props: NasMoveDialogProps) {
  const [keepLocal, setKeepLocal] = createSignal(true);
  const [moving, setMoving] = createSignal(false);

  const handleMove = () => {
    setMoving(true);
    props.onMove(keepLocal());
  };

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nas-move-title"
      onKeyDown={(e) => { if (e.key === "Escape" && !moving()) props.onSkip(); }}
    >
      <div class="bg-kodak-cream rounded-xl shadow-2xl w-[480px] overflow-hidden">
        {/* Header */}
        <div class="px-6 py-4 border-b border-kodak-cream-dark">
          <h2
            id="nas-move-title"
            class="text-lg font-bold font-[Nunito] text-kodak-charcoal flex items-center gap-2"
          >
            <svg class="w-5 h-5 text-kodak-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 12h14M12 5l7 7-7 7"
              />
            </svg>
            Move to NAS
          </h2>
          <p class="text-sm text-kodak-warm-gray mt-1">
            {props.photoCount} labeled photo{props.photoCount !== 1 ? "s" : ""} ready to archive
          </p>
        </div>

        {/* Body */}
        <div class="px-6 py-4">
          <div class="bg-white rounded-lg border border-kodak-cream-dark p-3 mb-4">
            <p class="text-xs text-kodak-warm-gray">Destination</p>
            <p class="text-sm font-mono text-kodak-charcoal truncate">{props.nasPath}</p>
          </div>

          {/* Keep local toggle */}
          <label class="flex items-center gap-3 cursor-pointer">
            <button
              onClick={() => setKeepLocal(!keepLocal())}
              class={`w-10 h-5 rounded-full transition-colors relative ${
                keepLocal() ? "bg-kodak-yellow" : "bg-kodak-cream-dark"
              }`}
              role="switch"
              aria-checked={keepLocal()}
              aria-label="Keep local copies"
            >
              <div
                class={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  keepLocal() ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
            <div>
              <p class="text-sm text-kodak-charcoal font-medium">Keep local copies</p>
              <p class="text-xs text-kodak-warm-gray">
                {keepLocal()
                  ? "Photos stay on this Mac for fast viewing"
                  : "Delete local copies after moving to NAS"}
              </p>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div class="px-6 py-4 border-t border-kodak-cream-dark flex items-center justify-between">
          <button
            onClick={props.onSkip}
            disabled={moving()}
            class="px-4 py-2 text-sm text-kodak-warm-gray hover:text-kodak-charcoal transition-colors disabled:opacity-50"
          >
            Skip
          </button>
          <button
            onClick={handleMove}
            disabled={moving()}
            class="px-5 py-2 bg-kodak-yellow hover:bg-kodak-yellow-dark text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {moving() ? "Moving..." : `Move ${props.photoCount} Photo${props.photoCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
