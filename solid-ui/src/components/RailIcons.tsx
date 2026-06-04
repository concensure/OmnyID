// @locs-version: 2.0
// @module-id: ui.rail-icons
// @primary-capability: navigation-icon-system
// @stability: stable
import type { JSX } from "solid-js";
import type { ViewName } from "@/components/NavBar";

export type IconId = ViewName | "home" | "more" | "back" | "forward" | "fleet" | "user" | "weather" | "help";

// Typed SVG wrapper — avoids object-spread type errors with SvgSVGAttributes.
function I(props: { class?: string; children: JSX.Element }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class={`w-[18px] h-[18px]${props.class ? " " + props.class : ""}`}
    >
      {props.children}
    </svg>
  );
}

export function RailIcon(props: { id: IconId }) {
  switch (props.id) {

    // search — rounded bubble with bottom-left tail + 3 bobbing dots (CSS rd1/2/3)
    case "search": return (
      <I>
        <rect x="2" y="2" width="15" height="11" rx="2.5" />
        <polygon points="3,13 3,18 7.5,13" fill="currentColor" stroke="none" />
        <circle class="rd1" cx="6.5" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
        <circle class="rd2" cx="9.5" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
        <circle class="rd3" cx="12.5" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
      </I>
    );

    // threads — two overlapping cards, back one peeking top-right
    case "threads": return (
      <I>
        <rect x="5" y="2" width="13" height="14" rx="2" />
        <rect x="2" y="5" width="13" height="13" rx="2" />
      </I>
    );

    // workflows — Y-fork with animated flow edges (CSS ri-flow)
    case "workflows": return (
      <I>
        <circle cx="10" cy="3.5" r="2" />
        <circle cx="4"  cy="16"  r="2" />
        <circle cx="16" cy="16"  r="2" />
        <path class="ri-flow" d="M9 5.4 C 7 9 5 12 5 14" />
        <path class="ri-flow" d="M11 5.4 C 13 9 15 12 15 14" />
      </I>
    );

    // email — envelope with curved arc flap
    case "email": return (
      <I>
        <rect x="2" y="5" width="16" height="11" rx="2.5" />
        <path d="M2 7.5 Q10 13 18 7.5" />
      </I>
    );

    // note — page with folded top-right corner + two text lines
    case "note": return (
      <I>
        <path d="M3,2 H11 L15,6 V18 a1,1,0,0,1,-1,1 H4 a1,1,0,0,1,-1,-1 V3 a1,1,0,0,1,1,-1Z" />
        <path d="M11,2 V6 H15" stroke-opacity="0.55" />
        <line x1="5.5" y1="10" x2="12.5" y2="10" />
        <line x1="5.5" y1="13" x2="10.5" y2="13" />
      </I>
    );

    // calendar — hanging pins + header + dot grid + filled today dot
    case "calendar": return (
      <I>
        <line x1="7"  y1="1"   x2="7"  y2="4.5" />
        <line x1="13" y1="1"   x2="13" y2="4.5" />
        <rect x="2"   y="3.5"  width="16" height="15" rx="2" />
        <line x1="2"  y1="8.5" x2="18" y2="8.5" />
        <circle cx="6.5"  cy="12"   r="0.9" fill="currentColor" stroke="none" />
        <circle cx="10"   cy="12"   r="0.9" fill="currentColor" stroke="none" />
        <circle cx="13.5" cy="12"   r="0.9" fill="currentColor" stroke="none" />
        <circle cx="6.5"  cy="15.5" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="13.5" cy="15.5" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="10"   cy="15.5" r="2"   fill="currentColor" stroke="none" />
      </I>
    );

    // database — two cylinders with mid-body separator ring
    case "database": return (
      <I>
        <ellipse cx="10" cy="5"  rx="7" ry="2.5" />
        <ellipse cx="10" cy="10" rx="7" ry="2.5" />
        <ellipse cx="10" cy="15" rx="7" ry="2.5" />
        <line x1="3"  y1="5"  x2="3"  y2="15" />
        <line x1="17" y1="5"  x2="17" y2="15" />
      </I>
    );

    // diary — open book with pencil stroke on right page
    case "diary": return (
      <I>
        <path d="M10,3 H4.5 a1,1,0,0,0,-1,1 v12 a1,1,0,0,0,1,1 H10" />
        <path d="M10,3 H15.5 a1,1,0,0,1,1,1 v12 a1,1,0,0,1,-1,1 H10" />
        <line x1="10" y1="3"   x2="10" y2="17" />
        <line x1="12" y1="7.5" x2="15.5" y2="13" stroke-opacity="0.5" />
      </I>
    );

    // discover — compass with settling needle (CSS ri-needle on <g>)
    case "discover": return (
      <I>
        <circle cx="10" cy="10" r="7.5" />
        <g class="ri-needle">
          <polygon points="10,3.5 8.5,10 10,8.5 11.5,10" fill="currentColor" stroke="none" />
          <polygon points="10,16.5 8.5,10 10,11.5 11.5,10" fill="currentColor" stroke="none" opacity="0.35" />
        </g>
      </I>
    );

    // runner — terminal box + title dots + prompt chevron + blinking cursor
    case "runner": return (
      <I>
        <rect x="2" y="3" width="16" height="14" rx="2" />
        <line x1="2"  y1="8.5" x2="18" y2="8.5" />
        <circle cx="5.5"  cy="5.75" r="0.85" fill="currentColor" stroke="none" />
        <circle cx="8.5"  cy="5.75" r="0.85" fill="currentColor" stroke="none" />
        <circle cx="11.5" cy="5.75" r="0.85" fill="currentColor" stroke="none" />
        <path d="M5,12 l2.5,1.5 l-2.5,1.5" />
        <line class="ri-cursor" x1="10" y1="15" x2="15" y2="15" />
      </I>
    );

    // agent_settings — hexagon + inner orbit circle (deliberately not a gear)
    case "agent_settings": return (
      <I>
        <polygon points="10,2 16.9,5.8 16.9,13.7 10,17.5 3.1,13.7 3.1,5.8" />
        <circle cx="10" cy="9.75" r="3.5" />
      </I>
    );

    // home — asymmetric bento grid (the OmnyID workspace mark)
    case "home": return (
      <I>
        <rect x="2"  y="2"  width="9" height="9" rx="1.5" />
        <rect x="13" y="2"  width="5" height="5" rx="1" />
        <rect x="2"  y="13" width="5" height="5" rx="1" />
        <rect x="13" y="9"  width="5" height="9" rx="1" />
      </I>
    );

    // more — three horizontal dots
    case "more": return (
      <I>
        <circle cx="5"  cy="10" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="10" cy="10" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none" />
      </I>
    );

    // fleet — two overlapping node circles with connecting line
    case "fleet": return (
      <I>
        <circle cx="6.5"  cy="10" r="3" />
        <circle cx="13.5" cy="10" r="3" />
        <path d="M9.5,10 h1" stroke-width="1" />
      </I>
    );

    // user — silhouette: head circle + shoulders arc
    case "user": return (
      <I>
        <circle cx="10" cy="7" r="3.5" />
        <path d="M3,18 Q3,13 10,13 Q17,13 17,18" />
      </I>
    );

    // weather — sun with 8 rays
    case "weather": return (
      <I>
        <circle cx="10" cy="10" r="3.5" />
        <line x1="10"  y1="2"    x2="10"  y2="4"    />
        <line x1="10"  y1="16"   x2="10"  y2="18"   />
        <line x1="2"   y1="10"   x2="4"   y2="10"   />
        <line x1="16"  y1="10"   x2="18"  y2="10"   />
        <line x1="4.6" y1="4.6"  x2="5.9" y2="5.9"  />
        <line x1="14.1" y1="14.1" x2="15.4" y2="15.4" />
        <line x1="4.6" y1="15.4" x2="5.9" y2="14.1" />
        <line x1="14.1" y1="5.9"  x2="15.4" y2="4.6"  />
      </I>
    );

    // help — circle with question mark glyph
    case "help": return (
      <I>
        <circle cx="10" cy="10" r="7.5" />
        <path d="M7.5,8 Q7.5,5.5 10,5.5 Q12.5,5.5 12.5,8 Q12.5,10 10,10.5 V12" />
        <circle cx="10" cy="14.5" r="0.8" fill="currentColor" stroke="none" />
      </I>
    );

    case "back":    return <I class="w-4 h-4"><path d="M12,4 L7,10 L12,16" /></I>;
    case "forward": return <I class="w-4 h-4"><path d="M8,4 L13,10 L8,16" /></I>;

    default: return null;
  }
}
