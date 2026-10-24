export const COOKIE_SESSION_TOKEN = "__http_only_cookie__";

let volatileBearerToken: string | null = null;

export function forgetSessionBearerToken(): void {
  volatileBearerToken = null;
}

export function rememberSessionBearerToken(token: string): void {
  if (token !== COOKIE_SESSION_TOKEN) volatileBearerToken = token;
}

export function resolveSessionBearerToken(token: string | null): string | null {
  return !token || token === COOKIE_SESSION_TOKEN ? volatileBearerToken : token;
}
