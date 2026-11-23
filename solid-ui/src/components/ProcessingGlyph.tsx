// @locs-version: 1.0
import { onCleanup, onMount } from "solid-js";

type ProcessingGlyphProps = {
  class?: string;
  size?: number | string;
  strokeWidth?: number;
};

const N_POINTS = 48;
const SYMMETRIES = [4, 6, 8] as const;
const DURATION_MS = 3200;
const RADIUS = 13.5;
const ROTATION_SPEED = 0.00022;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeInOutCubic = (t: number) => (
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
);

function generateShape() {
  const symmetry = SYMMETRIES[Math.floor(Math.random() * SYMMETRIES.length)] ?? 4;
  const sectorLength = N_POINTS / symmetry;
  const halfLength = sectorLength / 2;
  const half = new Float64Array(halfLength);
  const curved = Math.random() < 0.6;

  if (curved) {
    const harmonicA = rand(1, 2.4);
    const harmonicB = rand(2.2, 4.1);
    const ampA = rand(0.08, 0.2);
    const ampB = rand(0.04, 0.1);
    const phaseA = rand(0, Math.PI * 2);
    const phaseB = rand(0, Math.PI * 2);
    const base = rand(0.58, 0.72);
    for (let index = 0; index < halfLength; index += 1) {
      const angle = (index / Math.max(halfLength, 1)) * Math.PI * 2;
      half[index] = base
        + ampA * Math.sin(harmonicA * angle + phaseA)
        + ampB * Math.sin(harmonicB * angle + phaseB);
    }
  } else {
    const levels = Math.floor(rand(3, 6));
    const blockLength = Math.max(1, Math.floor(halfLength / Math.floor(rand(2, 4))));
    let level = Math.floor(rand(0, levels));
    for (let index = 0; index < halfLength; index += 1) {
      if (index % blockLength === 0) level = Math.floor(rand(0, levels));
      half[index] = 0.42 + (level / Math.max(1, levels - 1)) * 0.42;
    }
  }

  const sector = new Float64Array(sectorLength);
  for (let index = 0; index < halfLength; index += 1) {
    sector[index] = half[index];
    sector[sectorLength - 1 - index] = half[index];
  }

  const shape = new Float64Array(N_POINTS);
  for (let sectorIndex = 0; sectorIndex < symmetry; sectorIndex += 1) {
    for (let pointIndex = 0; pointIndex < sectorLength; pointIndex += 1) {
      shape[sectorIndex * sectorLength + pointIndex] = sector[pointIndex];
    }
  }
  return shape;
}

function renderPath(
  target: SVGPathElement,
  from: Float64Array,
  to: Float64Array,
  progress: number,
  pulse: number,
  rotation: number,
) {
  const points = new Array<string>(N_POINTS);
  for (let index = 0; index < N_POINTS; index += 1) {
    const radius = (from[index] * (1 - progress) + to[index] * progress) * pulse * RADIUS;
    const angle = (index / N_POINTS) * Math.PI * 2 + rotation;
    points[index] = `${(radius * Math.cos(angle)).toFixed(2)} ${(radius * Math.sin(angle)).toFixed(2)}`;
  }
  target.setAttribute("d", `M${points[0]} L${points.slice(1).join(" L")} Z`);
}

export function ProcessingGlyph(props: ProcessingGlyphProps) {
  let pathRef: SVGPathElement | undefined;
  let frameId = 0;
  let from = generateShape();
  let to = generateShape();
  let transitionStart = 0;
  let lastFrameTime = 0;
  let rotation = 0;

  onMount(() => {
    if (!pathRef) return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) {
      renderPath(pathRef, from, from, 0, 0.9, 0);
      return;
    }

    transitionStart = performance.now();
    lastFrameTime = transitionStart;

    const step = (now: number) => {
      if (!pathRef) return;
      frameId = requestAnimationFrame(step);
      const delta = now - lastFrameTime;
      lastFrameTime = now;
      rotation += delta * ROTATION_SPEED;

      let progress = (now - transitionStart) / DURATION_MS;
      if (progress >= 1) {
        from = to;
        to = generateShape();
        transitionStart = now;
        progress = 0;
      }

      const eased = easeInOutCubic(progress);
      const pulse = 0.82 + 0.12 * Math.cos(Math.PI * 2 * progress);
      renderPath(pathRef, from, to, eased, pulse, rotation);
    };

    frameId = requestAnimationFrame(step);
  });

  onCleanup(() => {
    if (frameId) cancelAnimationFrame(frameId);
  });

  return (
    <svg
      aria-hidden="true"
      viewBox="-20 -20 40 40"
      class={props.class}
      style={{
        width: typeof props.size === "number" ? `${props.size}px` : props.size ?? "1.125rem",
        height: typeof props.size === "number" ? `${props.size}px` : props.size ?? "1.125rem",
      }}
    >
      <path
        ref={pathRef}
        fill="none"
        stroke="currentColor"
        stroke-width={props.strokeWidth ?? 1.45}
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </svg>
  );
}
