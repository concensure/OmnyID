// @locs-version: 1.0
import { missingReasonFallbackText } from "@/lib/reasonFallbackText";

export const SHELL_HEADER_TITLE = "Shell";
export const SHELL_SAFE_MODE_LABEL = "safe mode";
export const SHELL_SAFE_BADGE = "safe";
export const SHELL_APPROVAL_CONTEXT = "shell_command";
export const SHELL_BUSY_LABEL = "Processing...";
export const SHELL_COMMAND_LABEL = "Command";
export const SHELL_FULL_COMMAND_SHOW = "full";
export const SHELL_FULL_COMMAND_HIDE = "hide";
export const SHELL_STDOUT_LABEL = "stdout";
export const SHELL_STDERR_LABEL = "stderr";
export const SHELL_NO_OUTPUT_LABEL = "(no output)";
export const SHELL_REQUEST_ICON = "!";

const EXIT_CODE_NOTES: Record<number, string> = {
  1: "general error",
  2: "misuse of shell command",
  126: "command not executable",
  127: "command not found",
  128: "invalid exit argument",
  130: "interrupted",
};

export function shellRequestReason(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : missingReasonFallbackText();
}

export function shellExitCodeNote(exitCode: number): string | null {
  return EXIT_CODE_NOTES[exitCode] ?? null;
}
