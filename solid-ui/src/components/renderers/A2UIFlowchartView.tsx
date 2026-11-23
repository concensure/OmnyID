// @locs-version: 1.0
import { createMemo, For, Show } from "solid-js";

export type FlowchartNodeShape = "process" | "decision" | "terminal";
export type FlowchartNodeTone = "default" | "info" | "success" | "warning" | "danger";

export type FlowchartNode = {
  id: string;
  title: string;
  subtitle?: string;
  body?: string;
  shape: FlowchartNodeShape;
  tone: FlowchartNodeTone;
  column: number;
  row: number;
};

export type FlowchartEdge = {
  from: string;
  to: string;
  label?: string;
  kind: "solid" | "dashed";
};

type FlowchartViewProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
};

type PositionedNode = FlowchartNode & {
  x: number;
  y: number;
  width: number;
  height: number;
};

type FlowchartHeaderState = {
  eyebrow: string;
  showEyebrow: boolean;
  title: string;
  showTitle: boolean;
  description: string;
  showDescription: boolean;
};

type FlowchartNodeViewItem = {
  id: string;
  title: string;
  subtitle: string;
  showSubtitle: boolean;
  body: string;
  showBody: boolean;
  shape: FlowchartNodeShape;
  toneClass: string;
  shapeClass: string;
  isDecision: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  shellStyle: string;
};

type FlowchartEdgeViewItem = {
  path: string;
  stroke: string;
  dashArray?: string;
  label: string;
  showLabel: boolean;
  labelX: number;
  labelY: number;
};

type FlowchartCanvasState = {
  width: number;
  height: number;
  shellStyle: string;
  viewBox: string;
};

type FlowchartViewState = {
  header: FlowchartHeaderState;
  canvas: FlowchartCanvasState;
  nodes: FlowchartNodeViewItem[];
  edges: FlowchartEdgeViewItem[];
};

const CARD_WIDTH = 220;
const CARD_HEIGHT = 122;
const COLUMN_GAP = 96;
const ROW_GAP = 64;
const PADDING_X = 32;
const PADDING_Y = 32;
const FLOWCHART_ARROW_MARKER_ID = "a2ui-flowchart-arrow";
const FLOWCHART_ARROW_FILL = "rgba(255,255,255,0.45)";
const FLOWCHART_LABEL_FILL = "rgba(255,255,255,0.82)";
const FLOWCHART_LABEL_BG = "rgba(15,23,42,0.78)";
const FLOWCHART_LABEL_BORDER = "rgba(255,255,255,0.1)";

function toneClasses(tone: FlowchartNodeTone): string {
  switch (tone) {
    case "info":
      return "border-sky-300/25 bg-sky-400/8";
    case "success":
      return "border-emerald-300/25 bg-emerald-400/8";
    case "warning":
      return "border-amber-300/25 bg-amber-400/8";
    case "danger":
      return "border-rose-300/25 bg-rose-400/8";
    default:
      return "border-white/15 bg-white/6";
  }
}

function edgeStroke(tone: FlowchartNodeTone): string {
  switch (tone) {
    case "info":
      return "rgba(125,211,252,0.8)";
    case "success":
      return "rgba(110,231,183,0.8)";
    case "warning":
      return "rgba(253,230,138,0.85)";
    case "danger":
      return "rgba(251,113,133,0.8)";
    default:
      return "rgba(255,255,255,0.38)";
  }
}

function nodeShapeClass(shape: FlowchartNodeShape): string {
  switch (shape) {
    case "terminal":
      return "rounded-full";
    case "decision":
      return "rounded-[1.1rem]";
    default:
      return "rounded-[1.25rem]";
  }
}

function normalizeNodes(rawNodes: Array<Record<string, unknown>>): PositionedNode[] {
  return rawNodes
    .map((node, index) => {
      const column =
        typeof node.column === "number"
          ? node.column
          : typeof node.level === "number"
            ? node.level
            : index;
      const row = typeof node.row === "number" ? node.row : 0;
      const x = PADDING_X + column * (CARD_WIDTH + COLUMN_GAP);
      const y = PADDING_Y + row * (CARD_HEIGHT + ROW_GAP);
      const shape: PositionedNode["shape"] =
        node.shape === "decision" || node.shape === "terminal" ? node.shape : "process";
      const tone: PositionedNode["tone"] =
        node.tone === "info" ||
        node.tone === "success" ||
        node.tone === "warning" ||
        node.tone === "danger"
          ? node.tone
          : "default";
      return {
        id: typeof node.id === "string" ? node.id : `node-${index + 1}`,
        title: typeof node.title === "string" ? node.title : `Node ${index + 1}`,
        subtitle: typeof node.subtitle === "string" ? node.subtitle : undefined,
        body:
          typeof node.body === "string"
            ? node.body
            : typeof node.description === "string"
              ? node.description
              : undefined,
        shape,
        tone,
        column,
        row,
        x,
        y,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
      };
    })
    .sort((left, right) => left.row - right.row || left.column - right.column);
}

function normalizeEdges(rawEdges: Array<Record<string, unknown>>): FlowchartEdge[] {
  return rawEdges
    .map((edge): FlowchartEdge => {
      const kind: FlowchartEdge["kind"] = edge.kind === "dashed" ? "dashed" : "solid";
      return {
        from:
          typeof edge.from === "string"
            ? edge.from
            : typeof edge.source === "string"
              ? edge.source
              : "",
        to:
          typeof edge.to === "string"
            ? edge.to
            : typeof edge.target === "string"
              ? edge.target
              : "",
        label: typeof edge.label === "string" ? edge.label : undefined,
        kind,
      };
    })
    .filter((edge) => edge.from && edge.to);
}

function edgePath(from: PositionedNode, to: PositionedNode): string {
  const startX = from.x + from.width;
  const startY = from.y + from.height / 2;
  const endX = to.x;
  const endY = to.y + to.height / 2;
  const deltaX = Math.max((endX - startX) * 0.45, 48);
  return `M ${startX} ${startY} C ${startX + deltaX} ${startY}, ${endX - deltaX} ${endY}, ${endX} ${endY}`;
}

function edgeLabelPosition(from: PositionedNode, to: PositionedNode) {
  const startX = from.x + from.width;
  const startY = from.y + from.height / 2;
  const endX = to.x;
  const endY = to.y + to.height / 2;
  return {
    x: startX + (endX - startX) / 2,
    y: startY + (endY - startY) / 2 - 10,
  };
}

function headerState(props: FlowchartViewProps): FlowchartHeaderState {
  const eyebrow = props.eyebrow ?? "";
  const title = props.title ?? "";
  const description = props.description ?? "";
  return {
    eyebrow,
    showEyebrow: Boolean(eyebrow),
    title,
    showTitle: Boolean(title),
    description,
    showDescription: Boolean(description),
  };
}

function canvasState(nodes: PositionedNode[]): FlowchartCanvasState {
  const width = Math.max(
    ...nodes.map((node) => node.x + node.width),
    CARD_WIDTH + PADDING_X * 2
  ) + PADDING_X;
  const height = Math.max(
    ...nodes.map((node) => node.y + node.height),
    CARD_HEIGHT + PADDING_Y * 2
  ) + PADDING_Y;
  return {
    width,
    height,
    shellStyle: `width:${width}px;height:${height}px;min-width:100%;`,
    viewBox: `0 0 ${width} ${height}`,
  };
}

function nodeViewItems(nodes: PositionedNode[]): FlowchartNodeViewItem[] {
  return nodes.map((node) => {
    const subtitle = node.subtitle ?? "";
    const body = node.body ?? "";
    return {
      id: node.id,
      title: node.title,
      subtitle,
      showSubtitle: Boolean(subtitle),
      body,
      showBody: Boolean(body),
      shape: node.shape,
      toneClass: toneClasses(node.tone),
      shapeClass: nodeShapeClass(node.shape),
      isDecision: node.shape === "decision",
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      shellStyle: `left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px;`,
    };
  });
}

function edgeViewItems(nodes: PositionedNode[], edges: FlowchartEdge[]): FlowchartEdgeViewItem[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const edgeItems = edges
    .map((edge) => {
      const from = nodeMap.get(edge.from);
      const to = nodeMap.get(edge.to);
      if (!from || !to) return null;
      const label = edge.label ?? "";
      const labelPosition = edgeLabelPosition(from, to);
      return {
        path: edgePath(from, to),
        stroke: edgeStroke(to.tone),
        dashArray: edge.kind === "dashed" ? "7 6" : undefined,
        label,
        showLabel: Boolean(label),
        labelX: labelPosition.x,
        labelY: labelPosition.y,
      };
    })
    .filter((edge): edge is NonNullable<typeof edge> => edge !== null);
  return edgeItems;
}

function flowchartViewState(props: FlowchartViewProps): FlowchartViewState {
  const normalizedNodes = normalizeNodes(props.nodes);
  const normalizedEdges = normalizeEdges(props.edges);
  return {
    header: headerState(props),
    canvas: canvasState(normalizedNodes),
    nodes: nodeViewItems(normalizedNodes),
    edges: edgeViewItems(normalizedNodes, normalizedEdges),
  };
}

export function A2UIFlowchartView(props: FlowchartViewProps) {
  const viewState = createMemo(() => flowchartViewState(props));

  return (
    <div class="space-y-4">
      <Show when={viewState().header.showEyebrow}>
        <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/70">
          {viewState().header.eyebrow}
        </p>
      </Show>
      <Show when={viewState().header.showTitle}>
        <h3 class="text-base font-semibold text-on-surface">{viewState().header.title}</h3>
      </Show>
      <Show when={viewState().header.showDescription}>
        <p class="max-w-3xl text-sm leading-6 text-on-surface-variant">
          {viewState().header.description}
        </p>
      </Show>

      <div class="overflow-x-auto rounded-[1.5rem] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-3">
        <div class="relative" style={viewState().canvas.shellStyle}>
          <svg
            class="absolute inset-0 h-full w-full"
            viewBox={viewState().canvas.viewBox}
            preserveAspectRatio="xMinYMin meet"
          >
            <defs>
              <marker
                id={FLOWCHART_ARROW_MARKER_ID}
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="5"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={FLOWCHART_ARROW_FILL} />
              </marker>
            </defs>

            <For each={viewState().edges}>
              {(edge) => (
                <g>
                  <path
                    d={edge.path}
                    fill="none"
                    stroke={edge.stroke}
                    stroke-width="2"
                    stroke-dasharray={edge.dashArray}
                    marker-end={`url(#${FLOWCHART_ARROW_MARKER_ID})`}
                  />
                  <Show when={edge.showLabel}>
                    <g transform={`translate(${edge.labelX}, ${edge.labelY})`}>
                      <rect
                        x="-44"
                        y="-12"
                        width="88"
                        height="20"
                        rx="10"
                        fill={FLOWCHART_LABEL_BG}
                        stroke={FLOWCHART_LABEL_BORDER}
                      />
                      <text
                        x="0"
                        y="2"
                        text-anchor="middle"
                        dominant-baseline="middle"
                        fill={FLOWCHART_LABEL_FILL}
                        style={{
                          "font-size": "11px",
                          "font-family": "ui-monospace, SFMono-Regular, monospace",
                          "letter-spacing": "0.04em",
                        }}
                      >
                        {edge.label}
                      </text>
                    </g>
                  </Show>
                </g>
              )}
            </For>
          </svg>

          <For each={viewState().nodes}>
            {(node) => (
              <div class="absolute" style={node.shellStyle}>
                <Show
                  when={!node.isDecision}
                  fallback={
                    <div class="relative h-full w-full">
                      <div
                        class={`absolute inset-[18px] rotate-45 border shadow-[0_18px_40px_rgba(15,23,42,0.14)] ${node.toneClass} ${node.shapeClass}`}
                      />
                      <div class="absolute inset-0 flex items-center justify-center px-8 text-center">
                        <div>
                          <Show when={node.showSubtitle}>
                            <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/65">
                              {node.subtitle}
                            </p>
                          </Show>
                          <h4 class="mt-1 text-sm font-semibold leading-5 text-on-surface">
                            {node.title}
                          </h4>
                          <Show when={node.showBody}>
                            <p class="mt-2 text-xs leading-5 text-on-surface-variant">{node.body}</p>
                          </Show>
                        </div>
                      </div>
                    </div>
                  }
                >
                  <article
                    class={`h-full border p-4 shadow-[0_18px_40px_rgba(15,23,42,0.12)] ${node.toneClass} ${node.shapeClass}`}
                  >
                    <Show when={node.showSubtitle}>
                      <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/65">
                        {node.subtitle}
                      </p>
                    </Show>
                    <h4 class="mt-1 text-sm font-semibold leading-5 text-on-surface">{node.title}</h4>
                    <Show when={node.showBody}>
                      <p class="mt-2 text-xs leading-5 text-on-surface-variant">{node.body}</p>
                    </Show>
                  </article>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
