// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";

export type GoogleAuthConfigResponse = {
  enabled?: boolean;
  client_id?: string | null;
};

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleAccountsId = {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: Record<string, string | number | boolean>,
  ): void;
};

type GoogleIdentityWindow = Window & {
  google?: {
    accounts?: {
      id?: GoogleAccountsId;
    };
  };
};

export const GOOGLE_IDENTITY_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const GOOGLE_IDENTITY_SCRIPT_ID = "omnyid-google-identity-script";

export function normalizeGoogleAuthConfig(
  config?: unknown,
): string | null {
  if (!isRecord(config) || config.enabled !== true) return null;
  const clientId = typeof config.client_id === "string" ? config.client_id.trim() : "";
  return clientId ? clientId : null;
}

export async function loadGoogleIdentityClient(
  doc: Document = document,
): Promise<GoogleAccountsId> {
  const existingApi = (window as GoogleIdentityWindow).google?.accounts?.id;
  if (existingApi) return existingApi;

  await new Promise<void>((resolve, reject) => {
    const existing = doc.getElementById(GOOGLE_IDENTITY_SCRIPT_ID) as HTMLScriptElement | null;
    const onLoad = () => resolve();
    const onError = () => reject(new Error("Google Sign-In script failed to load."));

    if (existing) {
      // The script's load/error events are one-shot. If a previous attempt
      // already saw one of them fire, attaching a fresh listener here would
      // wait forever (success) or need a retry (failure) — resolve/retry
      // based on the outcome we recorded, instead of re-listening on a tag
      // whose events will never fire again.
      if (existing.dataset.omnyidGoogleLoaded === "true") {
        resolve();
        return;
      }
      if (existing.dataset.omnyidGoogleFailed === "true") {
        existing.remove();
      } else {
        existing.addEventListener("load", onLoad, { once: true });
        existing.addEventListener("error", onError, { once: true });
        return;
      }
    }

    const script = doc.createElement("script");
    script.id = GOOGLE_IDENTITY_SCRIPT_ID;
    script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      script.dataset.omnyidGoogleLoaded = "true";
      onLoad();
    }, { once: true });
    script.addEventListener("error", () => {
      script.dataset.omnyidGoogleFailed = "true";
      onError();
    }, { once: true });
    doc.head.appendChild(script);
  });

  const api = (window as GoogleIdentityWindow).google?.accounts?.id;
  if (!api) {
    throw new Error("Google Sign-In did not finish initialising.");
  }
  return api;
}

export async function mountGoogleSignInButton(args: {
  clientId: string;
  container: HTMLElement;
  onCredential: (idToken: string) => void | Promise<void>;
}): Promise<void> {
  const google = await loadGoogleIdentityClient();
  google.initialize({
    client_id: args.clientId,
    callback: (response) => {
      const credential = response.credential?.trim() ?? "";
      if (credential) {
        void args.onCredential(credential);
      }
    },
  });
  args.container.replaceChildren();
  google.renderButton(args.container, {
    type: "standard",
    theme: "outline",
    size: "large",
    shape: "pill",
    text: "continue_with",
    width: Math.max(args.container.clientWidth, 280),
    logo_alignment: "left",
  });
}
