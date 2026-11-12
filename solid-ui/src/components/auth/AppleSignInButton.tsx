import { createSignal, onCleanup, onMount, Show } from "solid-js";

import { API_BASE } from "@/lib/api";
import { parseAuthApiResponse, type AuthApiResponse } from "@/lib/authResponseState";

const APPLE_SDK_URL = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
let sdkPromise: Promise<void> | null = null;

type AppleAuthorization = {
  id_token?: string;
  state?: string;
};

type AppleSuccessEvent = CustomEvent<{
  authorization?: AppleAuthorization;
  user?: { email?: string };
}>;

type AppleWindow = Window & {
  AppleID?: {
    auth: {
      init: (config: Record<string, unknown>) => void;
    };
  };
};

function randomChallenge(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function loadAppleSdk(): Promise<void> {
  const appleWindow = window as AppleWindow;
  if (appleWindow.AppleID?.auth) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${APPLE_SDK_URL}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Apple sign-in could not be loaded.")), { once: true });
    if (!existing) {
      script.src = APPLE_SDK_URL;
      script.async = true;
      document.head.append(script);
    }
  });
  return sdkPromise;
}

export function AppleSignInButton(props: { onAuthenticated: (response: AuthApiResponse) => void; signupSource?: string }) {
  const [enabled, setEnabled] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const state = randomChallenge();
  const nonce = randomChallenge();

  onMount(() => {
    let disposed = false;
    const onSuccess = async (rawEvent: Event) => {
      const event = rawEvent as AppleSuccessEvent;
      const authorization = event.detail?.authorization;
      if (disposed || authorization?.state !== state || !authorization.id_token) {
        if (!disposed) setError("Apple sign-in could not be verified.");
        return;
      }
      setBusy(true);
      setError("");
      try {
        const response = await fetch(`${API_BASE}/auth/apple`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identity_token: authorization.id_token,
            email: event.detail?.user?.email ?? "",
            nonce,
            ...(props.signupSource ? { source: props.signupSource } : {}),
          }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(typeof payload === "string" ? payload : "Apple sign-in failed.");
        props.onAuthenticated(parseAuthApiResponse(payload));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Apple sign-in failed.");
      } finally {
        setBusy(false);
      }
    };
    const onFailure = () => { if (!disposed) setError("Apple sign-in was cancelled or could not be completed."); };
    document.addEventListener("AppleIDSignInOnSuccess", onSuccess);
    document.addEventListener("AppleIDSignInOnFailure", onFailure);

    void (async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/apple/config`, { credentials: "include" });
        const config = await response.json() as { enabled?: boolean; client_id?: string; redirect_uri?: string };
        if (!response.ok || !config.enabled || !config.client_id || !config.redirect_uri || disposed) return;
        setEnabled(true);
        await loadAppleSdk();
        if (disposed) return;
        (window as AppleWindow).AppleID?.auth.init({
          clientId: config.client_id,
          scope: "name email",
          redirectURI: config.redirect_uri,
          state,
          nonce,
          usePopup: true,
        });
      } catch {
        if (!disposed) setError("Apple sign-in is unavailable right now.");
      }
    })();

    onCleanup(() => {
      disposed = true;
      document.removeEventListener("AppleIDSignInOnSuccess", onSuccess);
      document.removeEventListener("AppleIDSignInOnFailure", onFailure);
    });
  });

  return (
    <Show when={enabled() || error()}>
      <div class="space-y-2">
        <div id="appleid-signin" class={enabled() ? "min-h-11" : "hidden"} data-color="black" data-border="true" data-type="sign in" aria-busy={busy()} />
        <Show when={busy()}><p class="text-center text-xs text-on-surface-variant" role="status">Completing Apple sign-in…</p></Show>
        <Show when={error()}>{(message) => <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="alert">{message()}</p>}</Show>
      </div>
    </Show>
  );
}
