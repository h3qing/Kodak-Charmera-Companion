import { createSignal, onMount, Show } from "solid-js";

export default function SettingsView() {
  const [namingPattern, setNamingPatternLocal] = createSignal("b {MM}-{DD}-{YYYY} {content}");
  const [appVersion, setAppVersion] = createSignal("");
  const [aiAvailable, setAiAvailable] = createSignal(false);
  const [aiModel, setAiModel] = createSignal("");
  const [aiModels, setAiModels] = createSignal<string[]>([]);
  const [saved, setSaved] = createSignal(false);

  onMount(async () => {
    try {
      const { getAppVersion, checkAiStatus, getNamingPattern } = await import("../../lib/tauri");
      setAppVersion(await getAppVersion());
      try {
        const status = await checkAiStatus();
        setAiAvailable(status.available);
        setAiModel(status.model);
        setAiModels(status.models || []);
      } catch {}
      try {
        const pattern = await getNamingPattern();
        if (pattern) setNamingPatternLocal(pattern);
      } catch {}
    } catch (e) {
      console.error("Settings load error:", e);
    }
  });

  const handlePatternSave = async () => {
    try {
      const { setNamingPattern } = await import("../../lib/tauri");
      await setNamingPattern(namingPattern());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("Failed to save pattern:", e);
    }
  };

  const resetPattern = () => {
    setNamingPatternLocal("b {MM}-{DD}-{YYYY} {content}");
  };

  const patternPreview = () => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const yyyy = String(now.getFullYear());
    return namingPattern()
      .replace("{MM}", mm)
      .replace("{DD}", dd)
      .replace("{YYYY}", yyyy)
      .replace("{content}", "sunset at the beach")
      .replace("{counter}", "001")
      .replace("{original}", "IMG_0042")
      + ".jpg";
  };

  return (
    <div class="h-full overflow-auto">
      <div class="max-w-2xl mx-auto p-6">
        {/* Header */}
        <div class="mb-8">
          <h1 class="text-2xl font-extrabold font-[Nunito] text-kodak-charcoal">Settings</h1>
          <div class="kodak-stripe mt-3 rounded-full" />
        </div>

        {/* File Naming Pattern */}
        <section class="mb-8">
          <h2 class="text-sm font-bold uppercase tracking-wider text-kodak-warm-gray mb-3 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            File Naming Pattern
          </h2>
          <div class="bg-white rounded-xl border border-kodak-cream-dark p-4">
            <p class="text-xs text-kodak-warm-gray mb-3">
              Configure how files are renamed after AI labeling. Use tokens to build your pattern.
            </p>

            {/* Pattern input */}
            <div class="flex items-center gap-2 mb-3">
              <input
                type="text"
                value={namingPattern()}
                onInput={(e) => setNamingPatternLocal(e.currentTarget.value)}
                class="flex-1 text-sm px-3 py-2 rounded-lg border border-kodak-cream-dark bg-kodak-cream/50 focus:outline-none focus:ring-2 focus:ring-kodak-yellow/40 focus:border-kodak-yellow font-mono"
              />
              <button
                onClick={resetPattern}
                class="text-xs px-3 py-2 text-kodak-warm-gray hover:text-kodak-red transition-colors"
              >
                Reset
              </button>
            </div>

            {/* Token buttons */}
            <div class="flex flex-wrap gap-1.5 mb-3">
              {[
                { token: "{MM}", label: "Month" },
                { token: "{DD}", label: "Day" },
                { token: "{YYYY}", label: "Year" },
                { token: "{content}", label: "AI Description" },
                { token: "{counter}", label: "Counter" },
                { token: "{original}", label: "Original Name" },
              ].map(({ token, label }) => (
                <button
                  onClick={() => setNamingPatternLocal(prev => prev + token)}
                  class="px-2.5 py-1 text-xs font-mono bg-kodak-yellow/10 text-kodak-yellow-dark rounded-lg hover:bg-kodak-yellow/20 transition-colors flex items-center gap-1"
                  title={label}
                >
                  {token}
                  <span class="text-[10px] text-kodak-warm-gray font-sans">{label}</span>
                </button>
              ))}
            </div>

            {/* Preview */}
            <div class="bg-kodak-cream rounded-lg px-3 py-2 mb-3">
              <span class="text-[10px] uppercase tracking-wider font-bold text-kodak-warm-gray">Preview</span>
              <p class="font-mono text-sm text-kodak-charcoal mt-0.5">{patternPreview()}</p>
            </div>

            {/* Save button */}
            <div class="flex items-center gap-2">
              <button
                onClick={handlePatternSave}
                class="px-4 py-2 bg-kodak-yellow hover:bg-kodak-yellow-dark text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Save Pattern
              </button>
              <Show when={saved()}>
                <span class="text-xs text-green-600 font-medium">Saved!</span>
              </Show>
            </div>
          </div>
        </section>

        {/* Export */}
        <section class="mb-8">
          <h2 class="text-sm font-bold uppercase tracking-wider text-kodak-warm-gray mb-3 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Data Export
          </h2>
          <div class="bg-white rounded-xl border border-kodak-cream-dark p-4">
            <p class="text-xs text-kodak-warm-gray mb-3">
              Export all photo labels and metadata as a JSON file for use in other tools.
            </p>
            <button
              onClick={async () => {
                try {
                  const { invoke } = await import("@tauri-apps/api/core");
                  const json: string = await invoke("export_labels_json");
                  const { save } = await import("@tauri-apps/plugin-dialog");
                  const dest = await save({
                    defaultPath: "charmera-labels.json",
                    filters: [{ name: "JSON", extensions: ["json"] }],
                  });
                  if (dest) {
                    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
                    await writeTextFile(dest, json);
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2000);
                  }
                } catch (e) {
                  console.error("Export failed:", e);
                }
              }}
              class="px-4 py-2 bg-kodak-charcoal hover:bg-kodak-charcoal-light text-kodak-yellow text-sm font-semibold rounded-lg transition-colors"
            >
              Export Labels as JSON
            </button>
          </div>
        </section>

        {/* AI Status */}
        <section class="mb-8">
          <h2 class="text-sm font-bold uppercase tracking-wider text-kodak-warm-gray mb-3 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12" />
            </svg>
            AI Engine
          </h2>
          <div class="bg-white rounded-xl border border-kodak-cream-dark p-4">
            <div class="flex items-center gap-3">
              <div class={`w-3 h-3 rounded-full ${aiAvailable() ? "bg-green-500" : "bg-kodak-red"}`} />
              <div>
                <p class="text-sm text-kodak-charcoal font-medium">
                  {aiAvailable() ? "Ollama Connected" : "Ollama Not Available"}
                </p>
                <Show when={aiModel()}>
                  <p class="text-xs text-kodak-warm-gray">Active model: <span class="font-mono">{aiModel()}</span></p>
                </Show>
              </div>
            </div>
            <Show when={aiModels().length > 0}>
              <div class="mt-3 pt-3 border-t border-kodak-cream-dark">
                <p class="text-[10px] uppercase tracking-wider font-bold text-kodak-warm-gray mb-2">
                  Available Vision Models
                </p>
                <div class="flex flex-wrap gap-1.5">
                  {aiModels().map(m => (
                    <span class={`px-2 py-0.5 text-xs rounded-full font-mono ${
                      m === aiModel()
                        ? "bg-kodak-yellow/20 text-kodak-yellow-dark font-medium"
                        : "bg-kodak-cream text-kodak-warm-gray"
                    }`}>
                      {m}
                    </span>
                  ))}
                </div>
                <p class="text-[10px] text-kodak-warm-gray mt-2">
                  The best available model is used automatically. Pull more with <code class="font-mono bg-kodak-cream px-1 rounded">ollama pull llava</code>
                </p>
              </div>
            </Show>
            <Show when={!aiAvailable()}>
              <p class="text-xs text-kodak-warm-gray mt-2">
                Install Ollama and pull a vision model to enable AI photo labeling:
              </p>
              <pre class="text-xs font-mono bg-kodak-cream p-2 rounded-lg mt-1 text-kodak-charcoal">
                ollama pull moondream
              </pre>
            </Show>
          </div>
        </section>

        {/* About */}
        <section class="mb-8">
          <h2 class="text-sm font-bold uppercase tracking-wider text-kodak-warm-gray mb-3 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            About
          </h2>
          <div class="bg-white rounded-xl border border-kodak-cream-dark p-4">
            <div class="flex items-center gap-4">
              {/* Mini camera icon */}
              <div class="w-12 h-8 bg-kodak-yellow rounded-lg flex items-center justify-center relative overflow-hidden">
                <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2" style="background: linear-gradient(to bottom, #C41E3A 25%, #1C1C1C 25%, #1C1C1C 50%, #003DA5 50%, #003DA5 75%, #3D1F6E 75%);" />
                <div class="w-4 h-4 bg-kodak-charcoal rounded-full border border-gray-600 z-10" />
              </div>
              <div>
                <p class="text-sm font-bold text-kodak-charcoal font-[Nunito]">Charmera Companion</p>
                <p class="text-xs text-kodak-warm-gray">
                  Version {appVersion() || "..."}
                </p>
              </div>
            </div>
            <p class="text-xs text-kodak-warm-gray mt-3 leading-relaxed">
              Your personal photo companion for the Kodak Charmera keychain camera.
              Import, organize, and enhance your photos with local AI.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
