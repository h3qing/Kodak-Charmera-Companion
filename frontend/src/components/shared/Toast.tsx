import { createSignal, Show } from "solid-js";

type ToastType = "success" | "error" | "info";

interface ToastState {
  message: string;
  type: ToastType;
  visible: boolean;
}

const [toast, setToast] = createSignal<ToastState>({ message: "", type: "info", visible: false });
let hideTimer: number | undefined;

export function showToast(message: string, type: ToastType = "info", duration = 3000) {
  clearTimeout(hideTimer);
  setToast({ message, type, visible: true });
  hideTimer = setTimeout(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, duration) as unknown as number;
}

export default function Toast() {
  const colors: Record<ToastType, string> = {
    success: "bg-green-600 text-white",
    error: "bg-kodak-red text-white",
    info: "bg-kodak-charcoal text-kodak-cream",
  };

  return (
    <Show when={toast().visible}>
      <div
        class={`fixed bottom-12 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all duration-300 ${colors[toast().type]}`}
      >
        {toast().message}
      </div>
    </Show>
  );
}
