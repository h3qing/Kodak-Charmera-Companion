import "./styles.css";
import { ErrorBoundary } from "solid-js";
import { render } from "solid-js/web";
import App from "./App";

// Without this, any uncaught render error disposes the whole tree and leaves a
// blank white window with no way back short of quitting the app.
function CrashScreen(props: { error: unknown; reset: () => void }) {
  return (
    <div class="h-screen flex items-center justify-center bg-kodak-cream p-8">
      <div class="max-w-md text-center">
        <div class="kodak-stripe rounded-full mb-6" />
        <h1 class="text-2xl font-extrabold font-[Nunito] text-kodak-charcoal mb-2">
          Something went wrong
        </h1>
        <p class="text-sm text-kodak-warm-gray mb-6 leading-relaxed">
          Charmera hit an unexpected error. Your photos and labels are safe on disk —
          reloading usually clears it.
        </p>
        <pre class="text-[11px] font-mono text-left bg-white border border-kodak-cream-dark rounded-lg p-3 mb-6 max-h-40 overflow-auto text-kodak-charcoal whitespace-pre-wrap break-words">
          {String((props.error as Error)?.message ?? props.error)}
        </pre>
        <button
          onClick={props.reset}
          class="px-6 py-2.5 bg-kodak-yellow hover:bg-kodak-yellow-dark text-kodak-charcoal text-sm font-semibold rounded-lg transition-colors cursor-pointer"
        >
          Reload
        </button>
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  render(
    () => (
      <ErrorBoundary fallback={(error: unknown, reset: () => void) => <CrashScreen error={error} reset={reset} />}>
        <App />
      </ErrorBoundary>
    ),
    root
  );
}
