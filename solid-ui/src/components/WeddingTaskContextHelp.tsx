import { Show } from "solid-js";

import { WeddingInfoTip } from "@/components/WeddingInfoTip";

export function weddingTaskContextHelp(title: string): { title: string; body: string } | null {
  if (!/verify unknown wedding costs/i.test(title)) return null;
  return {
    title: "What costs should we verify?",
    body: "Check the base price and GST, minimum spend, staffing and service fees, cleaning, security, setup and pack-down, delivery or travel, overtime, optional extras, payment and cancellation terms, and anything the quote excludes. Record each confirmed amount or question beside the original quote.",
  };
}

export function WeddingTaskContextHelp(props: { title: string }) {
  const help = () => weddingTaskContextHelp(props.title);
  return (
    <Show when={help()}>
      {(item) => <WeddingInfoTip title={item().title} label={`More information about ${props.title}`}>{item().body}</WeddingInfoTip>}
    </Show>
  );
}
