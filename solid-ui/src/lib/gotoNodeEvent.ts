// @locs-version: 1.0
import { customEventRecordDetail, optionalStringProperty } from "@/lib/eventDetail";

export const GOTO_NODE_EVENT = "omnyid:goto-node";

export type GotoNodeEventDetail = {
  nodeId?: string;
};

export function dispatchGotoNodeEvent(
  detail: GotoNodeEventDetail,
  target: Document = document,
): void {
  target.dispatchEvent(new CustomEvent(GOTO_NODE_EVENT, { detail }));
}

export function readGotoNodeEventDetail(
  event: Event,
): GotoNodeEventDetail | null {
  const detail = customEventRecordDetail(event);
  if (!detail) return null;
  const nodeId = optionalStringProperty(detail, "nodeId");
  if (nodeId === null) return null;
  return {
    nodeId,
  };
}

export function subscribeGotoNodeEvent(
  callback: (detail: GotoNodeEventDetail) => void,
  target: Document = document,
): () => void {
  const handler = (event: Event) => {
    const detail = readGotoNodeEventDetail(event);
    if (detail === null) return;
    callback(detail);
  };
  target.addEventListener(GOTO_NODE_EVENT, handler);
  return () => target.removeEventListener(GOTO_NODE_EVENT, handler);
}
