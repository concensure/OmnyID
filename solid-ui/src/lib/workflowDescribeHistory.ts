// @locs-version: 1.0
export type DescribeHistoryEntry = {
  event_id: string;
  event_kind: string;
  intent: string;
  preset_kind?: string;
  optimization_mode?: string;
  regeneration_mode?: string;
  timestamp?: string;
};
