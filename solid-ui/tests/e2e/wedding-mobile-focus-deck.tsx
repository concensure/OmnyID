import { createSignal } from "solid-js";
import { render } from "solid-js/web";

import "../../src/index.css";
import { MobileFocusDeck } from "../../src/components/MobileFocusDeck";
import { DecisionCard } from "../../src/components/DecisionCard";
import { decisionCardFromFocusDeckItem } from "../../src/lib/decisionCardState";
import type { FocusDeckItem } from "../../src/lib/mobileFocusHomeState";

const items: FocusDeckItem[] = [{
  id: "transport",
  kind: "decision",
  sourceSurface: "wedding",
  title: "Book limousine or wedding transport and pickup schedule",
  recommendedActionLabel: "The saved evidence identifies ranked by hard constraints first, then fit",
  whyNowLabel: "This planning check is backed by the wedding plan and ready to review.",
  dueAt: "2028-09-18T00:00:00.000Z",
  evidenceLabels: ["Transport budget A$2,000", "Prepared wedding research brief"],
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
    <main class="flex max-w-sm flex-col" style={{ height: "100dvh", padding: "12px", "box-sizing": "border-box" }}>
      <MobileFocusDeck
        items={items}
        position={position()}
        onPositionChange={setPosition}
        onApprove={(item, method) => setNotice(`Opened ${decisionCardFromFocusDeckItem(item).actions[0]?.label} by ${method}`)}
        onDefer={(item, method, deferredUntilAt) => { setNotice(`Deferred ${item.title} by ${method}${deferredUntilAt ? ` until ${deferredUntilAt.slice(0, 10)}` : ""}`); return true; }}
        defaultReminderAt={() => "2028-09-15T00:00:00.000Z"}
        renderCard={(item) => <DecisionCard card={decisionCardFromFocusDeckItem(item)} showActions={false} class="h-full w-full overflow-y-auto" />}
        renderEnd={() => <p>All decisions reviewed</p>}
        label="Decision"
        sequential
        primaryActionLabel={(item) => decisionCardFromFocusDeckItem(item).actions[0]?.label ?? "Open next step"}
      />
      <p role="status">{notice()}</p>
    </main>
  );
}

render(() => <Fixture />, document.getElementById("root")!);
