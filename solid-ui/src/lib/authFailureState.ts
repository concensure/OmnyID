// @locs-version: 1.0
export function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function isAccountDisabledFailure(message: string): boolean {
  return normalizeFailureMessage(message).includes("account access is disabled");
}

export function isReauthenticationFailure(message: string): boolean {
  if (isAccountDisabledFailure(message)) {
    return false;
  }
  return /unauthorized|401|forbidden|403|recent sign-in required|sign in again/.test(
    normalizeFailureMessage(message),
  );
}
