import { create } from 'zustand';

const STORAGE_KEY = 'subvision_layout';

export const PANEL_LIMITS = {
  left: { min: 280, max: 520, collapsed: 64 },
  right: { min: 320, max: 680, collapsed: 56 },
} as const;

export type Side = keyof typeof PANEL_LIMITS;

interface LayoutState {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  /** Height of the timeline track area in px; null = fit the rows. */
  timelineHeight: number | null;
  algoPreviewOpen: boolean;

  setWidth: (side: Side, width: number) => void;
  toggleCollapsed: (side: Side) => void;
  setTimelineHeight: (height: number | null) => void;
  toggleAlgoPreview: () => void;
}

type Persisted = Pick<LayoutState, 'leftWidth' | 'rightWidth' | 'leftCollapsed' | 'rightCollapsed' | 'timelineHeight' | 'algoPreviewOpen'>;

const defaults: Persisted = {
  leftWidth: 360,
  rightWidth: 420,
  leftCollapsed: false,
  rightCollapsed: false,
  timelineHeight: null,
  algoPreviewOpen: true,
};

const clamp = (value: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, value)));

function load(): Persisted {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Persisted>;
    return {
      leftWidth: clamp(Number(raw.leftWidth) || defaults.leftWidth, PANEL_LIMITS.left.min, PANEL_LIMITS.left.max),
      rightWidth: clamp(Number(raw.rightWidth) || defaults.rightWidth, PANEL_LIMITS.right.min, PANEL_LIMITS.right.max),
      leftCollapsed: raw.leftCollapsed === true,
      rightCollapsed: raw.rightCollapsed === true,
      timelineHeight: typeof raw.timelineHeight === 'number' ? raw.timelineHeight : null,
      algoPreviewOpen: raw.algoPreviewOpen !== false,
    };
  } catch {
    return defaults;
  }
}

/** Panel sizes and toggles; per viewer, kept across reloads. */
export const useLayoutStore = create<LayoutState>((set) => ({
  ...load(),

  setWidth: (side, width) =>
    set(side === 'left'
      ? { leftWidth: clamp(width, PANEL_LIMITS.left.min, PANEL_LIMITS.left.max) }
      : { rightWidth: clamp(width, PANEL_LIMITS.right.min, PANEL_LIMITS.right.max) }),

  toggleCollapsed: (side) =>
    set((s) => (side === 'left' ? { leftCollapsed: !s.leftCollapsed } : { rightCollapsed: !s.rightCollapsed })),

  setTimelineHeight: (timelineHeight) => set({ timelineHeight }),

  toggleAlgoPreview: () => set((s) => ({ algoPreviewOpen: !s.algoPreviewOpen })),
}));

useLayoutStore.subscribe((s) => {
  const value: Persisted = {
    leftWidth: s.leftWidth,
    rightWidth: s.rightWidth,
    leftCollapsed: s.leftCollapsed,
    rightCollapsed: s.rightCollapsed,
    timelineHeight: s.timelineHeight,
    algoPreviewOpen: s.algoPreviewOpen,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage can be unavailable; the layout then resets on reload.
  }
});
