// @locs-version: 1.0
import { createContext, useContext } from "solid-js";

// Loosely typed context: all signals, memos, handlers, and refs from WorkflowsView
// pass through here so JSX can be split across files without prop drilling.
export type WorkflowsContextValue = Record<string, unknown>;

export const WorkflowsCtx = createContext<WorkflowsContextValue>({});

export function useWorkflowsCtx<T extends object = WorkflowsContextValue>(): T {
  return useContext(WorkflowsCtx) as T;
}
