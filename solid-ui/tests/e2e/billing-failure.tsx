import { ErrorBoundary } from "solid-js";
import { render } from "solid-js/web";
import { UsageView } from "../../src/components/UsageView";
render(() => <ErrorBoundary fallback={(error) => <p>Workspace crashed: {String(error)}</p>}><h1>Workspace remains available</h1><UsageView /></ErrorBoundary>, document.getElementById("root")!);
