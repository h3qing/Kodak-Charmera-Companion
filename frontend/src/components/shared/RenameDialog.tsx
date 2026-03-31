import { createSignal, For, Show, onMount } from "solid-js";
import { getThumbnailBase64, type RenameProposal } from "../../lib/tauri";

interface RenameDialogProps {
  proposals: RenameProposal[];
  onConfirm: (approved: [number, string][]) => void;
  onCancel: () => void;
}

export default function RenameDialog(props: RenameDialogProps) {
  const [selections, setSelections] = createSignal<Map<number, { checked: boolean; name: string }>>(
    new Map()
  );

  onMount(() => {
    const initial = new Map<number, { checked: boolean; name: string }>();
    for (const p of props.proposals) {
      initial.set(p.id, { checked: true, name: p.proposed_name });
    }
    setSelections(initial);
  });

  const toggle = (id: number) => {
    const current = selections();
    const entry = current.get(id);
    if (entry) {
      const updated = new Map(current);
      updated.set(id, { ...entry, checked: !entry.checked });
      setSelections(updated);
    }
  };

  const updateName = (id: number, name: string) => {
    const current = selections();
    const entry = current.get(id);
    if (entry) {
      const updated = new Map(current);
      updated.set(id, { ...entry, name });
      setSelections(updated);
    }
  };

  const selectedCount = () => {
    let count = 0;
    selections().forEach((v) => { if (v.checked) count++; });
    return count;
  };

  const handleConfirm = () => {
    const approved: [number, string][] = [];
    selections().forEach((v, id) => {
      if (v.checked && v.name) {
        approved.push([id, v.name]);
      }
    });
    props.onConfirm(approved);
  };

  const selectAll = () => {
    const updated = new Map(selections());
    updated.forEach((v, k) => updated.set(k, { ...v, checked: true }));
    setSelections(updated);
  };

  const selectNone = () => {
    const updated = new Map(selections());
    updated.forEach((v, k) => updated.set(k, { ...v, checked: false }));
    setSelections(updated);
  };

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="bg-kodak-cream rounded-xl shadow-2xl w-[700px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div class="px-6 py-4 border-b border-kodak-cream-dark">
          <h2 class="text-lg font-bold font-[Nunito] text-kodak-charcoal">
            Rename Photos?
          </h2>
          <p class="text-sm text-kodak-warm-gray mt-1">
            The AI has described your photos. Would you like to rename the files to match?
            You can edit any name before confirming.
          </p>
        </div>

        {/* Proposals list */}
        <div class="flex-1 overflow-auto px-6 py-3">
          <div class="flex items-center gap-2 mb-3 text-xs text-kodak-warm-gray">
            <button onClick={selectAll} class="hover:text-kodak-amber transition-colors">Select all</button>
            <span>|</span>
            <button onClick={selectNone} class="hover:text-kodak-amber transition-colors">Select none</button>
            <span class="ml-auto">{selectedCount()} of {props.proposals.length} selected</span>
          </div>

          <div class="space-y-2">
            <For each={props.proposals}>
              {(proposal) => {
                const sel = () => selections().get(proposal.id);
                return (
                  <RenameRow
                    proposal={proposal}
                    checked={sel()?.checked ?? true}
                    editedName={sel()?.name ?? proposal.proposed_name}
                    onToggle={() => toggle(proposal.id)}
                    onNameChange={(name) => updateName(proposal.id, name)}
                  />
                );
              }}
            </For>
          </div>
        </div>

        {/* Footer */}
        <div class="px-6 py-4 border-t border-kodak-cream-dark flex items-center justify-between">
          <button
            onClick={props.onCancel}
            class="px-4 py-2 text-sm text-kodak-warm-gray hover:text-kodak-charcoal transition-colors"
          >
            Skip Renaming
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedCount() === 0}
            class="px-5 py-2 bg-kodak-amber hover:bg-kodak-amber-dark disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Rename {selectedCount()} Files
          </button>
        </div>
      </div>
    </div>
  );
}

function RenameRow(props: {
  proposal: RenameProposal;
  checked: boolean;
  editedName: string;
  onToggle: () => void;
  onNameChange: (name: string) => void;
}) {
  const [thumbSrc, setThumbSrc] = createSignal<string | null>(null);

  onMount(async () => {
    if (props.proposal.thumbnail_path) {
      try {
        setThumbSrc(await getThumbnailBase64(props.proposal.thumbnail_path));
      } catch {}
    }
  });

  return (
    <div
      class={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
        props.checked
          ? "border-kodak-amber/30 bg-kodak-amber/5"
          : "border-kodak-cream-dark bg-white/50 opacity-60"
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={props.onToggle}
        class={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
          props.checked
            ? "bg-kodak-amber border-kodak-amber"
            : "border-kodak-cream-dark"
        }`}
      >
        <Show when={props.checked}>
          <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
          </svg>
        </Show>
      </button>

      {/* Thumbnail */}
      <div class="w-10 h-10 rounded overflow-hidden shrink-0 bg-kodak-cream-dark">
        <Show when={thumbSrc()}>
          <img src={thumbSrc()!} class="w-full h-full object-cover" />
        </Show>
      </div>

      {/* Names */}
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 text-xs text-kodak-warm-gray mb-1">
          <span class="truncate">{props.proposal.current_name}</span>
          <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
        <input
          type="text"
          value={props.editedName}
          onInput={(e) => props.onNameChange(e.currentTarget.value)}
          disabled={!props.checked}
          class="w-full text-sm px-2 py-1 rounded border border-kodak-cream-dark bg-white focus:outline-none focus:ring-1 focus:ring-kodak-amber/40 disabled:opacity-50"
        />
      </div>
    </div>
  );
}
