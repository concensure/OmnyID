import { createSignal } from "solid-js";
import { render } from "solid-js/web";

import "../../src/index.css";
import { MobileFocusDeck } from "../../src/components/MobileFocusDeck";
import type { FocusDeckItem } from "../../src/lib/mobileFocusHomeState";

const items: FocusDeckItem[] = [{
  id: "research-photographers",
  kind: "decision",
  sourceSurface: "wedding",
  title: "Research photographers",
  recommendedActionLabel: "Search vendors",
  whyNowLabel: "The shortlist is ready to start.",
  dueAt: null,
  evidenceLabels: [],
  deferCount: 0,
  returnedFromLater: false,
  external: false,
}, {
  id: "confirm-catering",
  kind: "decision",
  sourceSurface: "wedding",
  title: "Confirm catering",
  recommendedActionLabel: "Review task",
  whyNowLabel: "This can follow the photographer search.",
  dueAt: null,
  evidenceLabels: [],
  deferCount: 0,
  returnedFromLater: false,
  external: false,
}];

function Fixture() {
  const [position, setPosition] = createSignal(0);
  const [notice, setNotice] = createSignal("Ready");
  return (
    <main class="h-[44rem] max-w-sm p-3">
      <MobileFocusDeck
        items={items}
        position={position()}
        onPositionChange={setPosition}
        onApprove={(item, method) => setNotice(`Opened ${item.recommendedActionLabel} by ${method}`)}
        onDefer={(item, method) => { setNotice(`Deferred ${item.title} by ${method}`); return true; }}
        renderCard={(item) => <article class="flex-1 rounded-xl bg-white p-5"><h1 class="text-xl font-bold">{item.title}</h1><p class="mt-3">{item.whyNowLabel}</p></article>}
        renderEnd={() => <p>All decisions reviewed</p>}
        label="Decision"
        sequential
        primaryActionLabel={(item) => item.recommendedActionLabel}
      />
      <p role="status">{notice()}</p>
    </main>
  );
}

render(() => <Fixture />, document.getElementById("root")!);
