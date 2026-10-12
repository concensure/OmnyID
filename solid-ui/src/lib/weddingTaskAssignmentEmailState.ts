// @locs-version: 1.0
export type WeddingTaskAssignmentEmail = {
  subject: string;
  text: string;
  html: string;
};

export const WEDDING_ASSIGNMENT_ROLE_OPTIONS = [
  "Helper",
  "Parent",
  "Sibling",
  "Friend",
  "Wedding party",
  "Planner",
  "Vendor",
] as const;

export function weddingAssignmentContactKey(email: string, role: string): string {
  return `${clean(email).toLowerCase()}|${clean(role).toLowerCase().replace(/\s+/g, " ")}`;
}

export function hasWeddingAssignmentContact(
  contacts: readonly { email?: string; roles?: string[] }[],
  email: string,
  role: string,
): boolean {
  const key = weddingAssignmentContactKey(email, role);
  if (key === "|") return false;
  return contacts.some((contact) => (contact.roles ?? []).some(
    (candidateRole) => weddingAssignmentContactKey(contact.email ?? "", candidateRole) === key,
  ));
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildWeddingTaskAssignmentEmail(input: {
  assigneeName: string;
  coupleNames?: string | null;
  coupleEmail?: string | null;
  taskName: string;
  taskBrief?: string | null;
  expiry?: string | null;
}): WeddingTaskAssignmentEmail {
  const assigneeName = clean(input.assigneeName) || "there";
  const coupleNames = clean(input.coupleNames) || "the couple";
  const coupleEmail = clean(input.coupleEmail);
  const taskName = clean(input.taskName) || "a wedding planning task";
  const taskBrief = clean(input.taskBrief) || "Please help the couple complete this wedding planning task.";
  const expiry = clean(input.expiry) || "No due date has been set yet";
  const contact = coupleEmail
    ? `Please feel free to contact ${coupleEmail} with any questions.`
    : "Please contact the couple directly with any questions.";
  const paragraphs = [
    `Hello ${assigneeName},`,
    `${coupleNames} have assigned “${taskName}” to you.`,
    `Task brief: ${taskBrief}\nDue: ${expiry}.`,
    contact,
    `Thank you for your time and support.\n\nWarmly,\n${coupleNames}\nMade by OmnyID Wedding Planner.`,
  ];
  return {
    subject: `${coupleNames} assigned you: ${taskName}`,
    text: paragraphs.join("\n\n"),
    html: paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join(""),
  };
}
