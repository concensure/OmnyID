// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";

export type EditorPayload = {
  markdown: string;
  text: string;
  html?: string;
  afpMessage: Omit<AfpMessage, "id" | "timestamp" | "from">;
};
