import { render } from "solid-js/web";
import "../../src/index.css";
import { RunbookPanel } from "../../src/components/RunbookPanel";
render(() => <><h1>Runbook controls</h1><RunbookPanel mode={new URLSearchParams(location.search).has("questions") ? "questions" : "manage"} /></>, document.getElementById("root")!);
