import { render } from "solid-js/web";
import { PracticeWorkspace } from "../../src/components/practice/PracticeWorkspace";
import "../../src/practice.css";

render(() => <PracticeWorkspace load={async (practice, signal) => {
  const response = await fetch(`/fixture-practice?practice=${encodeURIComponent(practice || "")}`, { signal });
  if (!response.ok) throw new Error("fixture error");
  return response.json();
}} />, document.getElementById("root")!);
