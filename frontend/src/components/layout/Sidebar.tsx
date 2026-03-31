import { Show } from "solid-js";
import type { View } from "../../App";
import type { AiStatus } from "../../lib/tauri";

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  aiStatus: AiStatus | null;
  isLabeling: boolean;
  labelStatus: string;
  onAutoLabel: () => void;
}

interface NavItem {
  id: View;
  label: string;
  icon: string;
  badge?: string;
}

const libraryItems: NavItem[] = [
  { id: "all-photos", label: "All Photos", icon: "grid" },
  { id: "recent", label: "Recent Imports", icon: "clock" },
];

const organizeItems: NavItem[] = [
  { id: "tags", label: "Tags", icon: "tag" },
  { id: "smart-albums", label: "Smart Albums", icon: "sparkles" },
  { id: "duplicates", label: "Duplicates", icon: "copy" },
];

const cameraItems: NavItem[] = [
  { id: "splash", label: "Boot Splash", icon: "image" },
];

function NavIcon(props: { name: string; class?: string }) {
  const icons: Record<string, string> = {
    grid: "M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z",
    clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    tag: "M7 7h.01M7 3h5a2 2 0 011.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A2 2 0 013 10V5a2 2 0 012-2z",
    sparkles: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
    copy: "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z",
    image: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
    settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
    camera: "M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z",
  };

  return (
    <svg class={`w-4 h-4 ${props.class || ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={icons[props.name] || ""} />
    </svg>
  );
}

function NavButton(props: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      class={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm rounded-lg transition-colors relative ${
        props.active
          ? "bg-kodak-yellow/15 text-kodak-yellow-dark font-semibold"
          : "text-kodak-charcoal/70 hover:bg-kodak-cream-dark/60 hover:text-kodak-charcoal"
      }`}
    >
      {props.active && (
        <div class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-kodak-yellow rounded-r" />
      )}
      <NavIcon name={props.item.icon} class={props.active ? "text-kodak-yellow-dark" : ""} />
      <span>{props.item.label}</span>
      {props.item.badge && (
        <span class="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-kodak-yellow/20 text-kodak-yellow-dark font-medium">
          {props.item.badge}
        </span>
      )}
    </button>
  );
}

function SectionLabel(props: { label: string }) {
  return (
    <div class="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-kodak-warm-gray">
      {props.label}
    </div>
  );
}

export default function Sidebar(props: SidebarProps) {
  return (
    <aside class="w-56 h-full flex flex-col bg-kodak-cream border-r border-kodak-cream-dark shrink-0">
      {/* Logo */}
      <div class="relative bg-kodak-yellow px-4 py-3">
        <div class="text-sm font-bold text-kodak-red tracking-wide font-[Nunito]">
          Kodak
        </div>
        <div class="text-lg font-extrabold text-white leading-tight tracking-tight font-[Nunito]">
          Charmera
        </div>
        <div class="absolute bottom-2 right-3 text-[9px] font-medium text-white bg-kodak-charcoal px-1.5 py-0.5 rounded-full">
          1987
        </div>
      </div>
      {/* Rainbow stripe divider */}
      <div class="kodak-stripe" />

      {/* Navigation */}
      <nav class="flex-1 overflow-auto px-2 py-1">
        <SectionLabel label="Library" />
        {libraryItems.map((item) => (
          <NavButton
            item={item}
            active={props.currentView === item.id}
            onClick={() => props.onNavigate(item.id)}
          />
        ))}

        <SectionLabel label="Organize" />
        {organizeItems.map((item) => (
          <NavButton
            item={item}
            active={props.currentView === item.id}
            onClick={() => props.onNavigate(item.id)}
          />
        ))}

        {/* AI Auto-Label */}
        <Show when={props.aiStatus?.available}>
          <div class="px-1 py-2">
            <button
              onClick={props.onAutoLabel}
              disabled={props.isLabeling}
              class={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all ${
                props.isLabeling
                  ? "bg-kodak-yellow/30 text-kodak-yellow-dark cursor-wait"
                  : "bg-kodak-yellow text-white hover:bg-kodak-yellow-dark cursor-pointer"
              }`}
            >
              <Show
                when={!props.isLabeling}
                fallback={
                  <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                }
              >
                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
              </Show>
              <span class="font-medium">
                {props.isLabeling ? "Labeling..." : "Auto Label Photos"}
              </span>
            </button>
            <Show when={props.labelStatus && !props.isLabeling}>
              <p class="text-[10px] text-kodak-warm-gray mt-1 px-3">{props.labelStatus}</p>
            </Show>
          </div>
        </Show>

        <SectionLabel label="Albums" />
        <button class="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-kodak-warm-gray hover:text-kodak-yellow-dark transition-colors rounded-lg">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>New Album</span>
        </button>

        <SectionLabel label="Camera" />
        {cameraItems.map((item) => (
          <NavButton
            item={item}
            active={props.currentView === item.id}
            onClick={() => props.onNavigate(item.id)}
          />
        ))}
      </nav>

      {/* Settings button at bottom */}
      <div class="px-2 pb-3 border-t border-kodak-cream-dark pt-2">
        <NavButton
          item={{ id: "settings", label: "Settings", icon: "settings" }}
          active={props.currentView === "settings"}
          onClick={() => props.onNavigate("settings")}
        />
      </div>
    </aside>
  );
}
