import { Show } from "solid-js";
import { type AgentSearchResult } from "../lib/api";

type Props = {
  agent: AgentSearchResult;
  isFollowing: boolean;
  followInProgress: boolean;
  isAnon: boolean;
  onFollow: () => void;
};

export function AgentCardTile(props: Props) {
  return (
    <div class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-on-surface">
          {props.agent.name || props.agent.agent_id}
        </p>
        <p class="font-mono text-[10px] text-on-surface-variant truncate">
          {props.agent.agent_id}
        </p>
        <span
          class={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
            props.agent.status === "active"
              ? "bg-green-500/15 text-green-600"
              : "bg-white/10 text-on-surface-variant"
          }`}
        >
          {props.agent.status}
        </span>
      </div>

      <Show when={!props.isAnon}>
        <button
          type="button"
          disabled={props.isFollowing || props.followInProgress}
          onClick={props.onFollow}
          class={`flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${
            props.isFollowing
              ? "border border-white/15 bg-white/5 text-on-surface-variant"
              : "bg-primary text-white hover:bg-primary/80"
          }`}
        >
          {props.followInProgress ? "…" : props.isFollowing ? "Following ✓" : "Follow"}
        </button>
      </Show>
    </div>
  );
}
