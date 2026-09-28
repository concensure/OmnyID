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
    <div class="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div class="min-w-0 flex-1">
        <p class="break-words text-sm font-semibold text-on-surface">
          {props.agent.name || props.agent.agent_id}
        </p>
        <p class="break-all font-mono text-[10px] text-on-surface-variant">
          {props.agent.agent_id}
        </p>
        <span
          class={`mt-0.5 inline-block max-w-full rounded-full px-2 py-1 text-[10px] font-medium break-words ${
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
          class={`w-full rounded-lg px-3 py-2 text-xs font-medium transition disabled:opacity-60 sm:w-auto sm:py-1.5 ${
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
