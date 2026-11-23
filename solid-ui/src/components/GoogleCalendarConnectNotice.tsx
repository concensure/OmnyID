import { Show } from "solid-js";

export function GoogleCalendarConnectNotice(props: { message: string | null; reauthRequired: boolean; accent: string; textColor: string }) {
  return <Show when={props.message}>
    <div style={{ display: "flex", "align-items": "center", gap: "0.65em", "flex-wrap": "wrap", margin: "0 0 1em" }}>
      <p role="status" style={{ margin: 0, "font-size": "0.78em", color: props.textColor }}>{props.message}</p>
      <Show when={props.reauthRequired}>
        <a href="/workspace/?auth=login&calendar_return=1" style={{ color: props.accent, "font-size": "0.78em", "font-weight": 600 }}>Sign in again</a>
      </Show>
    </div>
  </Show>;
}
