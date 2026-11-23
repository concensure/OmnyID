// @locs-version: 1.0
import type { InlineEntityKind } from "@/lib/inlineEntityKinds";

export const INLINE_ENTITY_ICONS: Record<InlineEntityKind, string> = {
  date: "📅",
  person: "👤",
  place: "📍",
  currency: "💱",
  phone: "☎",
  zip: "📮",
  city: "🗺",
  landmark: "📌",
  ticket: "🎫",
  invoice: "🧾",
  product: "🛍",
  file: "📄",
  document: "📚",
  meeting: "🗓",
  hashtag: "#",
};

export function inlineEntityChipClass(kind: InlineEntityKind): string {
  switch (kind) {
    case "date":
      return "border-sky-300/60 bg-sky-50/85 text-sky-800 hover:bg-sky-100/90";
    case "currency":
      return "border-emerald-300/60 bg-emerald-50/85 text-emerald-800 hover:bg-emerald-100/90";
    case "phone":
    case "person":
    case "meeting":
      return "border-violet-300/60 bg-violet-50/85 text-violet-800 hover:bg-violet-100/90";
    case "ticket":
    case "invoice":
      return "border-amber-300/60 bg-amber-50/85 text-amber-800 hover:bg-amber-100/90";
    default:
      return "border-slate-300/60 bg-slate-50/85 text-slate-800 hover:bg-slate-100/90";
  }
}
