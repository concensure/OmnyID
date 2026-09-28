// @locs-version: 1.0
type AgentApprovalTask = {
  intent?: string | null;
  content?: string | null;
};

const AGENT_APPROVAL_KEYBOARD_HINT = "Enter approve / Del reject";
const AGENT_APPROVAL_KEYBOARD_TITLE = "Focus here: Enter to approve, Delete/Backspace to reject";

export function agentApprovalKeyboardHint(): string {
  return AGENT_APPROVAL_KEYBOARD_HINT;
}

export function agentApprovalKeyboardTitle(): string {
  return AGENT_APPROVAL_KEYBOARD_TITLE;
}

export function agentApprovalExplainer(task: AgentApprovalTask): string {
  const raw = (task.intent ?? task.content ?? "").toLowerCase();
  if (raw.includes("send") || raw.includes("email") || raw.includes("message")) {
    return "The agent will send a message on your behalf. No edits are possible after approval.";
  }
  if (raw.includes("delete") || raw.includes("remove") || raw.includes("archive")) {
    return "The agent will permanently modify or remove data. This action may be irreversible.";
  }
  if (raw.includes("search") || raw.includes("fetch") || raw.includes("research")) {
    return "The agent will read external data. No data will be written or sent.";
  }
  if (raw.includes("create") || raw.includes("write") || raw.includes("draft")) {
    return "The agent will create new content. You can review the output before sharing.";
  }
  if (raw.includes("schedule") || raw.includes("calendar") || raw.includes("book")) {
    return "The agent will create or modify a calendar event.";
  }
  return "The agent is requesting permission to act. Review the task description before approving.";
}
