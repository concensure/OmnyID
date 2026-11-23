import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { fetchPracticeBootstrap } from "@/lib/weddingPracticeApi";

export function PracticeEntryLink() {
  const [available, setAvailable] = createSignal(false);
  const controller = new AbortController();
  onMount(() => {
    void fetchPracticeBootstrap(null, controller.signal).then(data => setAvailable(data.professional_planner)).catch(() => setAvailable(false));
  });
  onCleanup(() => controller.abort());
  return <Show when={available()}><a class="block min-h-12 rounded-lg border border-primary/20 px-3 py-3 mb-2 text-sm text-primary" href="/workspace/practice.html">Professional workspace</a></Show>;
}
