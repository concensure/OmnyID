// @locs-version: 1.0
// Heroicons v2 outline set (https://heroicons.com, MIT licensed), used sparingly as
// small accent badges on the wedding dashboard's card/tab headers — not scattered
// throughout, per design guidance to add visual interest without adding clutter.
import type { JSX } from "solid-js";

export type WeddingDashboardIconId = "calendar-days" | "banknotes" | "users" | "table-cells" | "user-plus" | "shield-check" | "check-circle" | "clock" | "lock" | "alert-circle" | "search" | "arrow-right"
  | "venue" | "planner" | "camera" | "celebrant" | "music" | "flower" | "cake" | "video" | "catering" | "beauty" | "decor" | "transport" | "stationery" | "jewellery";

function Icon(props: { class?: string; children: JSX.Element }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      aria-hidden="true"
      class={props.class ?? "h-5 w-5"}
    >
      {props.children}
    </svg>
  );
}

export function WeddingDashboardIcon(props: { id: WeddingDashboardIconId; class?: string }) {
  switch (props.id) {
    case "venue": return <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01" /></Icon>;
    case "planner": return <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="M8 3v3m8-3v3M4 8h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm3 8 2 2 4-4" /></Icon>;
    case "camera": return <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="M3 8a2 2 0 0 1 2-2h3l1.5-2h5L16 6h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Zm13 5a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" /></Icon>;
    case "celebrant": return <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0M18 4v4m-2-2h4" /></Icon>;
    case "music": return <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="M9 18V5l11-2v13M9 8l11-2M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm11-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></Icon>;
    case "flower": return <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="M12 12c-5-1-5-7-1-8 2-.5 3 1 3 3 1-3 5-3 6 0 1 4-4 6-8 5Zm0 0c1 4 0 7-2 9m2-9c-3 2-6 3-9 2" /></Icon>;
    case "cake": return <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="M5 11h14v9H5v-9Zm2-4h10v4H7V7Zm5-4v4m-2-4h4M5 15c2 2 4-2 7 0s5-2 7 0" /></Icon>;
    case "video": return <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm13 4 5-3v10l-5-3v-4Z" /></Icon>;
    case "catering": return <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="M4 13a8 8 0 0 1 16 0H4Zm-2 4h20M12 5V3m-8 14 2 4m14-4-2 4" /></Icon>;
    case "beauty": return <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="m4 20 8-8m-5-5 2-2 10 10-2 2L7 7Zm7-3 2-2m-1 7 2-2M4 20l3-1-2-2-1 3Z" /></Icon>;
    case "decor": return <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="M4 20h16M6 20v-8h12v8M4 12h16L12 4 4 12Zm8-8V2" /></Icon>;
    case "transport": return <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="M4 16V9l2-4h12l2 4v7M4 12h16M7 16h.01M17 16h.01M6 16v3H4v-3m14 0v3h2v-3" /></Icon>;
    case "stationery": return <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="M4 4h16v16H4V4Zm0 3 8 6 8-6M8 16h8" /></Icon>;
    case "jewellery": return <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="m8 7 2-4h4l2 4m-8 0h8l3 4-7 10-7-10 3-4Zm-3 4h14M8 7l4 14 4-14" /></Icon>;
    case "calendar-days": return (
      <Icon class={props.class}>
        <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z" />
      </Icon>
    );
    case "banknotes": return (
      <Icon class={props.class}>
        <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
      </Icon>
    );
    case "users": return (
      <Icon class={props.class}>
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </Icon>
    );
    case "table-cells": return (
      <Icon class={props.class}>
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125m0 0h7.5" />
      </Icon>
    );
    case "user-plus": return (
      <Icon class={props.class}>
        <path stroke-linecap="round" stroke-linejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
      </Icon>
    );
    case "shield-check": return (
      <Icon class={props.class}>
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.75A11.959 11.959 0 0 1 12 2.714Z" />
      </Icon>
    );
    case "check-circle": return (
      <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></Icon>
    );
    case "clock": return (
      <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></Icon>
    );
    case "lock": return (
      <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 0 0-9 0v3.75m-.75 10.5h10.5A2.25 2.25 0 0 0 19.5 18.75v-6A2.25 2.25 0 0 0 17.25 10.5H6.75A2.25 2.25 0 0 0 4.5 12.75v6A2.25 2.25 0 0 0 6.75 21Z" /></Icon>
    );
    case "alert-circle": return (
      <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 4.5h.008v.008H12V16.5Z" /></Icon>
    );
    case "search": return (
      <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-4.35-4.35m1.35-5.4a6.75 6.75 0 1 1-13.5 0 6.75 6.75 0 0 1 13.5 0Z" /></Icon>
    );
    case "arrow-right": return (
      <Icon class={props.class}><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5 15.75 12l-7.5 7.5" /></Icon>
    );
    default: return null;
  }
}
