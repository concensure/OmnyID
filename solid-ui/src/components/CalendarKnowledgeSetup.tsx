// @module-id: calendar.knowledge-setup
// @primary-capability: default-supertag-taxonomy-installation
// @locs-version: 1.0
// @stability: beta
// @owner: omnyid
import { createEffect, createSignal, Show } from "solid-js";

import { fetchSupertagDefinitions, installDefaultSupertags } from "@/lib/api";

const DEFAULT_SUPERTAG_NAMES = ["#Work", "#Personal", "#Health", "#Finance", "#Travel", "#Learning", "#Ideas", "#Urgent"];

/** Installs the calendar's baseline knowledge taxonomy the first time it is needed. */
export function CalendarKnowledgeSetup() {
  const [installing, setInstalling] = createSignal(true);
  const [installed, setInstalled] = createSignal<string[] | null>(null);
  const [failed, setFailed] = createSignal(false);

  const ensureInstalled = async () => {
    setInstalling(true);
    setFailed(false);
    try {
      const { definitions } = await fetchSupertagDefinitions();
      const names = new Set(definitions.map((definition) => definition.tag_name.trim().toLocaleLowerCase()));
      const present = DEFAULT_SUPERTAG_NAMES.filter((name) => names.has(name.toLocaleLowerCase()));
      if (present.length === DEFAULT_SUPERTAG_NAMES.length) {
        setInstalled(present);
        return;
      }
      const result = await installDefaultSupertags();
      setInstalled(result.installed.length > 0 ? result.installed : DEFAULT_SUPERTAG_NAMES);
    } catch {
      setFailed(true);
    } finally {
      setInstalling(false);
    }
  };

  createEffect(() => void ensureInstalled());

  return (
    <section>
      <p style={{ margin: "0 0 0.45em", "font-size": "0.68em", "font-weight": 700, "letter-spacing": "0.1em", "text-transform": "uppercase", color: "#666666" }}>Knowledge Setup</p>
      <div style={{ background: "#FFFFFF", border: "1px solid #E5E0D8", "border-radius": "0.75em", padding: "1em" }}>
        <p style={{ margin: "0", "font-size": "0.82em", color: "#1C1C1C", "line-height": 1.6 }}>Supertag taxonomy installed</p>
        <Show when={installing()}><p style={{ margin: "0.55em 0 0", "font-size": "0.8em", color: "#666666" }}>Installing your default taxonomy…</p></Show>
        <Show when={installed() && !installing()}><p style={{ margin: "0.55em 0 0", "font-size": "0.8em", color: "#2E8B57" }}>Ready for knowledge curation.</p></Show>
        <Show when={failed()}>
          <div style={{ margin: "0.55em 0 0" }}>
            <p style={{ margin: "0 0 0.55em", "font-size": "0.8em", color: "#E63939" }}>We could not install the taxonomy yet.</p>
            <button type="button" onClick={() => void ensureInstalled()} style={{ "min-height": "2.75em", border: "1px solid #FF6B35", "border-radius": "0.5em", background: "#FFFFFF", color: "#FF6B35", padding: "0.45em 0.75em", "font-weight": 700 }}>Retry setup</button>
          </div>
        </Show>
      </div>
    </section>
  );
}
