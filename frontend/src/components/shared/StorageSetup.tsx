import { createSignal, For, Show } from "solid-js";
import { showToast } from "./Toast";

interface StorageDestination {
  id: string;
  name: string;
  icon: string;
  description: string;
  available: boolean;
  setupSteps: string[];
}

const DESTINATIONS: StorageDestination[] = [
  {
    id: "nas",
    name: "Network Drive (NAS)",
    icon: "🖥️",
    description: "UGREEN, Synology, QNAP, or any SMB/NFS share",
    available: true,
    setupSteps: [
      "Open Finder → Go → Connect to Server (⌘K)",
      "Enter your NAS address: smb://192.168.1.xxx or smb://NAS-NAME.local",
      "Enter your NAS username and password",
      "Select the shared folder to mount",
      "Come back here and click \"Browse\" to select it",
    ],
  },
  {
    id: "local",
    name: "Local Folder",
    icon: "📁",
    description: "External drive, Desktop, or any folder on this Mac",
    available: true,
    setupSteps: [
      "Click \"Browse\" below to pick any folder",
    ],
  },
  {
    id: "google-drive",
    name: "Google Drive",
    icon: "☁️",
    description: "Sync via Google Drive for Desktop app",
    available: true,
    setupSteps: [
      "Install Google Drive for Desktop from drive.google.com/drive/download",
      "Sign in with your Google account",
      "Come back here — we'll detect your Drive folder automatically",
    ],
  },
  {
    id: "dropbox",
    name: "Dropbox",
    icon: "📦",
    description: "Sync via Dropbox desktop app",
    available: true,
    setupSteps: [
      "Install Dropbox from dropbox.com/install",
      "Sign in with your Dropbox account",
      "Come back here — we'll detect your Dropbox folder automatically",
    ],
  },
];

interface StorageSetupProps {
  currentPath: string;
  enabled: boolean;
  autoMove: boolean;
  organizeByDate: boolean;
  onSave: (config: { path: string; enabled: boolean; autoMove: boolean; organizeByDate: boolean }) => void;
}

export default function StorageSetup(props: StorageSetupProps) {
  const [step, setStep] = createSignal<"choose" | "setup" | "done">(props.enabled ? "done" : "choose");
  const [selectedDest, setSelectedDest] = createSignal<StorageDestination | null>(null);
  const [setupStep, setSetupStep] = createSignal(0);
  const [path, setPath] = createSignal(props.currentPath);
  const [testResult, setTestResult] = createSignal<boolean | null>(null);
  const [testing, setTesting] = createSignal(false);
  const [autoMove, setAutoMove] = createSignal(props.autoMove);
  const [organizeByDate, setOrganizeByDate] = createSignal(props.organizeByDate);
  const [cloudDetected, setCloudDetected] = createSignal(false);
  const [cloudAccount, setCloudAccount] = createSignal("");

  const selectDestination = async (dest: StorageDestination) => {
    setSelectedDest(dest);
    setSetupStep(0);
    setTestResult(null);
    setCloudDetected(false);
    setCloudAccount("");
    setStep("setup");

    // Auto-detect cloud drives
    if (dest.id === "google-drive" || dest.id === "dropbox") {
      try {
        const { detectCloudDrives } = await import("../../lib/tauri");
        const drives = await detectCloudDrives();
        const match = drives.find(d => d.provider === dest.id);
        if (match) {
          setPath(match.path + "/Charmera Photos");
          setCloudDetected(true);
          setCloudAccount(match.account);
          setSetupStep(dest.setupSteps.length); // Skip to end
          showToast(`Found ${dest.name}: ${match.account}`, "success");
        }
      } catch {}
    }
  };

  const handleBrowse = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, title: "Select storage folder" });
      if (selected) {
        setPath(selected as string);
        setTestResult(null);
      }
    } catch (e) {
      console.error("Browse failed:", e);
    }
  };

  const handleDetect = async () => {
    try {
      const { detectNasVolumes } = await import("../../lib/tauri");
      const volumes = await detectNasVolumes();
      if (volumes.length > 0) {
        setPath(volumes[0]);
        setTestResult(null);
        showToast(`Found: ${volumes[0].split("/").pop()}`, "success");
      } else {
        showToast("No network drives found. Make sure your NAS is mounted in Finder first.", "info");
      }
    } catch {
      showToast("Detection failed", "error");
    }
  };

  const handleTest = async () => {
    if (!path()) return;
    setTesting(true);
    try {
      const { testNasPath } = await import("../../lib/tauri");
      const ok = await testNasPath(path());
      setTestResult(ok);
      if (ok) {
        showToast("Connection verified!", "success");
      } else {
        showToast("Cannot write to this location. Check permissions.", "error");
      }
    } catch {
      setTestResult(false);
    }
    setTesting(false);
  };

  const handleSave = () => {
    props.onSave({
      path: path(),
      enabled: true,
      autoMove: autoMove(),
      organizeByDate: organizeByDate(),
    });
    setStep("done");
    showToast("Storage destination saved!", "success");
  };

  const handleDisconnect = () => {
    props.onSave({ path: "", enabled: false, autoMove: false, organizeByDate: true });
    setPath("");
    setSelectedDest(null);
    setTestResult(null);
    setStep("choose");
  };

  return (
    <section class="mb-8">
      <h2 class="text-sm font-bold uppercase tracking-wider text-kodak-warm-gray mb-3 flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
        </svg>
        Photo Storage
      </h2>

      {/* === Step 1: Choose destination === */}
      <Show when={step() === "choose"}>
        <div class="bg-white rounded-xl border border-kodak-cream-dark p-4">
          <p class="text-sm text-kodak-charcoal font-medium mb-1">Where should your photos go?</p>
          <p class="text-xs text-kodak-warm-gray mb-4">After labeling, photos can be automatically moved to your chosen destination.</p>

          <div class="grid grid-cols-2 gap-2">
            <For each={DESTINATIONS}>
              {(dest) => (
                <button
                  onClick={() => dest.available && selectDestination(dest)}
                  disabled={!dest.available}
                  class={`text-left p-3 rounded-xl border-2 transition-all ${
                    dest.available
                      ? "border-kodak-cream-dark hover:border-kodak-yellow hover:shadow-md cursor-pointer"
                      : "border-kodak-cream-dark/50 opacity-40 cursor-not-allowed"
                  }`}
                >
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-lg">{dest.icon}</span>
                    <span class="text-sm font-semibold text-kodak-charcoal">{dest.name}</span>
                  </div>
                  <p class="text-[11px] text-kodak-warm-gray leading-tight">{dest.description}</p>
                  <Show when={!dest.available}>
                    <span class="text-[10px] text-kodak-warm-gray/60 italic mt-1 block">Coming soon</span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* === Step 2: Guided setup === */}
      <Show when={step() === "setup" && selectedDest()}>
        <div class="bg-white rounded-xl border border-kodak-cream-dark overflow-hidden">
          {/* Header */}
          <div class="px-4 py-3 bg-kodak-cream/50 border-b border-kodak-cream-dark flex items-center gap-2">
            <button onClick={() => setStep("choose")} class="text-kodak-warm-gray hover:text-kodak-charcoal transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span class="text-lg">{selectedDest()!.icon}</span>
            <span class="text-sm font-semibold text-kodak-charcoal">{selectedDest()!.name} Setup</span>
          </div>

          <div class="p-4">
            {/* Cloud auto-detected banner */}
            <Show when={cloudDetected()}>
              <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 bg-green-500 rounded-full" />
                  <span class="text-sm font-medium text-green-800">
                    {selectedDest()!.name} detected
                  </span>
                </div>
                <Show when={cloudAccount()}>
                  <p class="text-xs text-green-700 mt-1">Account: {cloudAccount()}</p>
                </Show>
                <p class="text-xs text-green-600 mt-1">
                  Photos will sync automatically via your {selectedDest()!.name} desktop app.
                </p>
              </div>
            </Show>

            {/* Setup instructions (hidden when auto-detected) */}
            <Show when={selectedDest()!.setupSteps.length > 0 && !cloudDetected()}>
              <div class="mb-4">
                <p class="text-xs font-medium text-kodak-charcoal mb-2">
                  {selectedDest()!.id === "local" ? "Pick a folder:" : "Follow these steps:"}
                </p>
                <div class="space-y-2">
                  <For each={selectedDest()!.setupSteps}>
                    {(stepText, i) => (
                      <div class={`flex items-start gap-2 text-xs transition-opacity ${
                        i() <= setupStep() ? "opacity-100" : "opacity-40"
                      }`}>
                        <div class={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                          i() < setupStep() ? "bg-green-500 text-white"
                          : i() === setupStep() ? "bg-kodak-yellow text-white"
                          : "bg-kodak-cream-dark text-kodak-warm-gray"
                        }`}>
                          {i() < setupStep() ? "✓" : i() + 1}
                        </div>
                        <p class="text-kodak-charcoal pt-0.5">{stepText}</p>
                      </div>
                    )}
                  </For>
                </div>

                <Show when={selectedDest()!.id === "nas" && setupStep() < selectedDest()!.setupSteps.length - 1}>
                  <button
                    onClick={() => setSetupStep(s => Math.min(s + 1, selectedDest()!.setupSteps.length - 1))}
                    class="mt-3 px-3 py-1.5 text-xs bg-kodak-yellow/10 hover:bg-kodak-yellow/20 text-kodak-yellow-dark rounded-lg transition-colors font-medium"
                  >
                    I've done this →
                  </button>
                </Show>
              </div>
            </Show>

            {/* Path picker */}
            <div class="mb-4">
              <label class="text-xs font-medium text-kodak-charcoal block mb-1">Storage location</label>
              <div class="flex items-center gap-2">
                <input
                  type="text"
                  value={path()}
                  onInput={(e) => { setPath(e.currentTarget.value); setTestResult(null); }}
                  placeholder={selectedDest()!.id === "nas" ? "/Volumes/NAS_NAME/Photos" : "/Users/you/Pictures"}
                  class="flex-1 text-sm px-3 py-2 rounded-lg border border-kodak-cream-dark bg-kodak-cream/50 focus:outline-none focus:ring-2 focus:ring-kodak-yellow/40 font-mono"
                />
                <button onClick={handleBrowse} class="px-3 py-2 text-xs bg-kodak-yellow hover:bg-kodak-yellow-dark text-white rounded-lg font-medium transition-colors">
                  Browse
                </button>
                <Show when={selectedDest()!.id === "nas"}>
                  <button onClick={handleDetect} class="px-3 py-2 text-xs bg-kodak-cream hover:bg-kodak-cream-dark text-kodak-charcoal rounded-lg transition-colors">
                    Detect
                  </button>
                </Show>
              </div>
            </div>

            {/* Test + status */}
            <Show when={path()}>
              <div class="mb-4 flex items-center gap-3">
                <button
                  onClick={handleTest}
                  disabled={testing()}
                  class="px-3 py-1.5 text-xs bg-kodak-cream hover:bg-kodak-cream-dark text-kodak-charcoal rounded-lg transition-colors disabled:opacity-50"
                >
                  {testing() ? "Checking..." : "Verify Access"}
                </button>
                <Show when={testResult() !== null}>
                  <span class="flex items-center gap-1.5 text-xs">
                    <span class={`w-2 h-2 rounded-full ${testResult() ? "bg-green-500" : "bg-kodak-red"}`} />
                    {testResult() ? "Writable — ready to go" : "Cannot write here — check path and permissions"}
                  </span>
                </Show>
              </div>
            </Show>

            {/* Options */}
            <Show when={path() && testResult()}>
              <div class="space-y-3 mb-4 p-3 bg-kodak-cream/50 rounded-lg">
                <label class="flex items-center gap-3 cursor-pointer">
                  <button
                    onClick={() => setAutoMove(!autoMove())}
                    class={`w-9 h-5 rounded-full transition-colors relative ${autoMove() ? "bg-kodak-yellow" : "bg-kodak-cream-dark"}`}
                    role="switch"
                    aria-checked={autoMove()}
                  >
                    <div class={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoMove() ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                  <div>
                    <p class="text-xs text-kodak-charcoal font-medium">Auto-move after labeling</p>
                    <p class="text-[11px] text-kodak-warm-gray">Prompt to move photos right after AI labels them</p>
                  </div>
                </label>

                <label class="flex items-center gap-3 cursor-pointer">
                  <button
                    onClick={() => setOrganizeByDate(!organizeByDate())}
                    class={`w-9 h-5 rounded-full transition-colors relative ${organizeByDate() ? "bg-kodak-yellow" : "bg-kodak-cream-dark"}`}
                    role="switch"
                    aria-checked={organizeByDate()}
                  >
                    <div class={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${organizeByDate() ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                  <div>
                    <p class="text-xs text-kodak-charcoal font-medium">Organize by month</p>
                    <p class="text-[11px] text-kodak-warm-gray">Create 2026-03/ subfolders automatically</p>
                  </div>
                </label>
              </div>

              <button
                onClick={handleSave}
                class="w-full py-2.5 bg-kodak-yellow hover:bg-kodak-yellow-dark text-white text-sm font-bold rounded-lg transition-colors"
              >
                Save & Enable
              </button>
            </Show>
          </div>
        </div>
      </Show>

      {/* === Step 3: Done / Connected === */}
      <Show when={step() === "done"}>
        <div class="bg-white rounded-xl border border-kodak-cream-dark p-4">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 bg-green-500 rounded-full" />
              <span class="text-sm font-semibold text-kodak-charcoal">Storage Connected</span>
            </div>
            <button
              onClick={handleDisconnect}
              class="text-xs text-kodak-warm-gray hover:text-kodak-red transition-colors"
            >
              Disconnect
            </button>
          </div>

          <div class="bg-kodak-cream rounded-lg px-3 py-2 mb-3">
            <p class="text-[10px] uppercase tracking-wider text-kodak-warm-gray font-bold">Destination</p>
            <p class="text-sm font-mono text-kodak-charcoal truncate">{props.currentPath}</p>
          </div>

          <div class="flex gap-4 text-xs text-kodak-warm-gray">
            <span class="flex items-center gap-1">
              <span class={`w-1.5 h-1.5 rounded-full ${props.autoMove ? "bg-kodak-yellow" : "bg-kodak-cream-dark"}`} />
              Auto-move: {props.autoMove ? "on" : "off"}
            </span>
            <span class="flex items-center gap-1">
              <span class={`w-1.5 h-1.5 rounded-full ${props.organizeByDate ? "bg-kodak-yellow" : "bg-kodak-cream-dark"}`} />
              Date folders: {props.organizeByDate ? "on" : "off"}
            </span>
          </div>

          <button
            onClick={() => setStep("choose")}
            class="mt-3 text-xs text-kodak-warm-gray hover:text-kodak-yellow-dark transition-colors"
          >
            Change destination...
          </button>
        </div>
      </Show>
    </section>
  );
}
