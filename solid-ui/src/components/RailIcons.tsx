// @locs-version: 2.0
// @module-id: ui.rail-icons
// @primary-capability: navigation-icon-system
// @stability: stable
import type { JSX } from "solid-js";
import type { ViewName } from "@/lib/viewNames";

export type IconId = ViewName | "home" | "more" | "back" | "forward" | "fleet" | "user" | "weather" | "help" | "tools" | "para" | "seating" | "timeline" | "lens";

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

    case "lens": return (
      <I>
        <circle cx="8" cy="8" r="4.5" />
        <path d="M11.3 11.3 17 17" />
        <path d="M5.7 8 h4.6" />
        <path d="M8 5.7 v4.6" />
      </I>
    );

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

    case "study": return (
      <I>
        <path d="M3.5 4 h6.5 a2 2 0 0 1 2 2 v11 a2 2 0 0 0 -2 -2 h-6.5 z" />
        <path d="M16.5 4 h-4.5 a2 2 0 0 0 -2 2 v11 a2 2 0 0 1 2 -2 h4.5 z" />
        <path d="M6 7.5 h3" />
        <path d="M13 7.5 h1.5" />
        <path d="M6 10.5 h3" />
        <path d="M13 10.5 h1.5" />
      </I>
    );

    case "response_queue": return (
      <I>
        <path d="M3 6.5 h14 v7.5 a2,2 0,0,1 -2,2 h-10 a2,2 0,0,1 -2,-2 z" />
        <path d="M6 11 h4" />
        <path d="M9 8.5 l-3 2.5 l3 2.5" />
        <path d="M17 13.5 h-2.5" />
      </I>
    );

    case "decision_queue": return (
      <I>
        <path d="M4 4.5 h12 a1.5 1.5 0 0 1 1.5 1.5 v8.5 a1.5 1.5 0 0 1 -1.5 1.5 h-12 a1.5 1.5 0 0 1 -1.5 -1.5 v-8.5 a1.5 1.5 0 0 1 1.5 -1.5 z" />
        <path d="M6.5 8 h7" />
        <path d="M6.5 11 h4.5" />
        <path d="M13.5 10.5 l1.8 1.8 l2.7 -3.4" />
      </I>
    );

    case "admin_dashboard":
    case "cost_dashboard": return (
      <I>
        <path d="M3.5 15.5 h13" />
        <path d="M5.5 14 v-4" />
        <path d="M10 14 v-7" />
        <path d="M14.5 14 v-9" />
        <path d="M4.5 5.5 c1.4 -2 5.3 -2 6.8 0 c1.1 1.5 0.3 3.1 -1.4 3.8 c-1.4 0.6 -2.2 1.2 -2.2 2.7" />
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

    // cofounder_studio — diamond outline + inner spark
    case "cofounder_studio": return (
      <I>
        <path d="M10,2 L18,10 L10,18 L2,10 Z" />
        <circle cx="10" cy="10" r="2.5" fill="currentColor" stroke="none" />
      </I>
    );

    // space_feed — two overlapping circles (community/spaces)
    case "space_feed": return (
      <I>
        <circle cx="7" cy="10" r="4.5" />
        <circle cx="13" cy="10" r="4.5" />
      </I>
    );

    // public_feed — post cards stacked
    case "public_feed": return (
      <I>
        <rect x="2" y="2.5" width="16" height="5" rx="1.5" />
        <rect x="2" y="9.5" width="7.5" height="5" rx="1.5" />
        <rect x="10.5" y="9.5" width="7.5" height="5" rx="1.5" />
        <rect x="2" y="16" width="16" height="1.5" rx="0.75" stroke-opacity="0.35" />
      </I>
    );

    case "files": return (
      <I>
        <path d="M4 2.5 h7 l4 4 v11 a1.5 1.5 0 0 1 -1.5 1.5 h-9 a1.5 1.5 0 0 1 -1.5 -1.5 v-13 a1.5 1.5 0 0 1 1.5 -1.5 z" />
        <path d="M11 2.5 v4 h4" stroke-opacity="0.5" />
        <path d="M6.5 11 h7" />
        <path d="M6.5 14 h5" />
      </I>
    );

    // knowledge_graph — three nodes connected by edges
    case "knowledge_graph": return (
      <I>
        <circle cx="10" cy="4"  r="2" />
        <circle cx="3.5" cy="15" r="2" />
        <circle cx="16.5" cy="15" r="2" />
        <line x1="10"  y1="6"  x2="4.5"  y2="13" />
        <line x1="10"  y1="6"  x2="15.5" y2="13" />
        <line x1="5.5" y1="15" x2="14.5" y2="15" />
      </I>
    );

    // sovereignty_audit — shield with check mark
    // reports - generated study reports
    case "reports": return (
      <I>
        <rect x="3" y="2.5" width="14" height="15" rx="2" />
        <path d="M6.5 6.5 h7" />
        <path d="M6.5 10 h4" />
        <path d="M6.5 13.5 h2.5" />
        <path d="M12.5 13.5 l1.2 1.2 l2.3 -3" stroke-width="1.5" />
      </I>
    );

    // sovereignty_audit - shield with check mark
    case "sovereignty_audit": return (
      <I>
        <path d="M10,2 L17,5 V10 Q17,16 10,18 Q3,16 3,10 V5 Z" />
        <path d="M7,10 L9.5,12.5 L13,8" stroke-width="1.5" />
      </I>
    );

    // templates — document with bullet rows (checklist/template sheet)
    case "templates": return (
      <I>
        <rect x="3.5" y="2" width="13" height="16" rx="1.5" />
        <circle cx="6.5" cy="7.5"  r="0.9" fill="currentColor" stroke="none" />
        <line x1="9"  y1="7.5"  x2="14" y2="7.5"  />
        <circle cx="6.5" cy="11"   r="0.9" fill="currentColor" stroke="none" />
        <line x1="9"  y1="11"   x2="14" y2="11"   />
        <circle cx="6.5" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
        <line x1="9"  y1="14.5" x2="12" y2="14.5" />
      </I>
    );

    // tasks — checklist with tick marks
    case "tasks": return (
      <I>
        <rect x="3" y="2" width="14" height="16" rx="2" />
        <path d="M5.5 7 l1 1 1.8-2" stroke-width="1.4" />
        <line x1="10" y1="7.5" x2="15" y2="7.5" />
        <path d="M5.5 11 l1 1 1.8-2" stroke-width="1.4" />
        <line x1="10" y1="11.5" x2="15" y2="11.5" />
        <line x1="5.5" y1="15.5" x2="15" y2="15.5" stroke-opacity="0.4" />
      </I>
    );

    // contacts — two person silhouettes
    case "contacts": return (
      <I>
        <circle cx="8" cy="6.5" r="2.5" />
        <path d="M2.5,16.5 Q2.5,12 8,12 Q13.5,12 13.5,16.5" />
        <circle cx="15" cy="8" r="2" />
        <path d="M11.5,17 Q11.5,14 15,14 Q18.5,14 18.5,17" />
      </I>
    );

    // connected_apps — plug / link nodes icon
    case "connected_apps": return (
      <I>
        <circle cx="5"  cy="10" r="3" />
        <circle cx="15" cy="5"  r="2.5" />
        <circle cx="15" cy="15" r="2.5" />
        <line x1="8"   y1="9"  x2="12.5" y2="6.5" />
        <line x1="8"   y1="11" x2="12.5" y2="13.5" />
      </I>
    );

    // tools — plug connector with spark node (MCP / integrations)
    case "tools": return (
      <I>
        <circle cx="5.5" cy="10" r="3" />
        <line x1="8.5" y1="10" x2="12" y2="10" />
        <rect x="12" y="7" width="6" height="6" rx="1.5" />
        <line x1="14" y1="7" x2="14" y2="5" />
        <line x1="16" y1="7" x2="16" y2="5" />
        <line x1="14" y1="13" x2="14" y2="15" />
        <line x1="16" y1="13" x2="16" y2="15" />
      </I>
    );

    // pulse — signal wave (news feed)
    case "pulse": return (
      <I>
        <path d="M2 10 Q4 4 6 10 Q8 16 10 10 Q12 4 14 10 Q16 16 18 10" />
      </I>
    );

    // goals — target / bullseye with arrow
    case "goals": return (
      <I>
        <circle cx="10" cy="10" r="7" />
        <circle cx="10" cy="10" r="3.5" />
        <line x1="10" y1="3" x2="10" y2="6.5" />
        <line x1="10" y1="13.5" x2="10" y2="17" />
        <line x1="3" y1="10" x2="6.5" y2="10" />
        <line x1="13.5" y1="10" x2="17" y2="10" />
      </I>
    );

    // para — four quadrant grid (P / A / R / A sections)
    case "para": return (
      <I>
        <rect x="2"  y="2"  width="7" height="7" rx="1.5" />
        <rect x="11" y="2"  width="7" height="7" rx="1.5" />
        <rect x="2"  y="11" width="7" height="7" rx="1.5" />
        <rect x="11" y="11" width="7" height="7" rx="1.5" />
      </I>
    );

    // seating — a table with four seats around it
    case "seating": return (
      <I>
        <rect x="5" y="7" width="10" height="6" rx="1.5" />
        <circle cx="3.5"  cy="6"  r="1.6" fill="currentColor" stroke="none" />
        <circle cx="16.5" cy="6"  r="1.6" fill="currentColor" stroke="none" />
        <circle cx="3.5"  cy="14" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="16.5" cy="14" r="1.6" fill="currentColor" stroke="none" />
      </I>
    );

    // timeline — stepped horizontal bars, like a simplified planning schedule
    case "timeline": return (
      <I>
        <line x1="3" y1="5"  x2="9"  y2="5"  stroke-width="2.5" />
        <line x1="6" y1="10" x2="15" y2="10" stroke-width="2.5" />
        <line x1="4" y1="15" x2="12" y2="15" stroke-width="2.5" />
        <circle cx="3" cy="5"  r="1" fill="currentColor" stroke="none" />
        <circle cx="6" cy="10" r="1" fill="currentColor" stroke="none" />
        <circle cx="4" cy="15" r="1" fill="currentColor" stroke="none" />
      </I>
    );

    case "back":    return <I class="w-4 h-4"><path d="M12,4 L7,10 L12,16" /></I>;
    case "forward": return <I class="w-4 h-4"><path d="M8,4 L13,10 L8,16" /></I>;

    default: return null;
  }
}
