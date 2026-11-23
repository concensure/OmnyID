// @locs-version: 1.0
export type AnchorRect = {
  top: number;
  left: number;
  right: number;
  height: number;
};

export type PanelSize = {
  width: number;
  height: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export function anchoredPopoverPosition(options: {
  anchor: AnchorRect;
  panel: PanelSize;
  viewport: ViewportSize;
  gap?: number;
  margin?: number;
}): { top: number; left: number; side: "left" | "right" } {
  const gap = options.gap ?? 12;
  const margin = options.margin ?? 16;
  const { anchor, panel, viewport } = options;

  let side: "left" | "right" = "right";
  let left = anchor.right + gap;
  if (left + panel.width + margin > viewport.width) {
    side = "left";
    left = anchor.left - panel.width - gap;
  }
  left = Math.min(
    Math.max(margin, left),
    Math.max(margin, viewport.width - panel.width - margin),
  );

  let top = anchor.top + anchor.height / 2 - panel.height / 2;
  top = Math.min(
    Math.max(margin, top),
    Math.max(margin, viewport.height - panel.height - margin),
  );

  return {
    top: Math.round(top),
    left: Math.round(left),
    side,
  };
}
