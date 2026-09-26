// @locs-version: 1.0
import { createSignal, type Accessor } from "solid-js";

export type PreviewControllerTimeoutHandle = number | ReturnType<typeof setTimeout>;

export type PreviewControllerScheduler = {
  setTimeout: (callback: () => void, delayMs: number) => PreviewControllerTimeoutHandle;
  clearTimeout: (handle: PreviewControllerTimeoutHandle) => void;
};

export type PreviewController<T> = {
  preview: Accessor<T | null>;
  set: (next: T | null) => void;
  clear: () => void;
  load: (query: string) => Promise<T | null>;
  schedule: (query: string) => void;
};

function defaultScheduler(): PreviewControllerScheduler {
  return {
    setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
  };
}

export function createPreviewController<T>(
  loader: (query: string) => Promise<T>,
  options?: {
    delayMs?: number;
    scheduler?: PreviewControllerScheduler;
  },
): PreviewController<T> {
  const delayMs = options?.delayMs ?? 70;
  const scheduler = options?.scheduler ?? defaultScheduler();
  const [preview, setPreview] = createSignal<T | null>(null);
  let activeRequestId = 0;
  let timer: PreviewControllerTimeoutHandle | null = null;

  function clear() {
    activeRequestId += 1;
    if (timer !== null) {
      scheduler.clearTimeout(timer);
      timer = null;
    }
    setPreview(null);
  }

  function set(next: T | null) {
    activeRequestId += 1;
    if (timer !== null) {
      scheduler.clearTimeout(timer);
      timer = null;
    }
    setPreview(() => next);
  }

  async function load(query: string): Promise<T | null> {
    const normalized = query.trim();
    if (!normalized) {
      clear();
      return null;
    }
    const requestId = ++activeRequestId;
    const next = await loader(normalized);
    if (requestId !== activeRequestId) return null;
    setPreview(() => next);
    return next;
  }

  function schedule(query: string) {
    const normalized = query.trim();
    if (timer !== null) {
      scheduler.clearTimeout(timer);
      timer = null;
    }
    if (!normalized) {
      clear();
      return;
    }
    const requestId = ++activeRequestId;
    timer = scheduler.setTimeout(() => {
      timer = null;
      void loader(normalized).then((next) => {
        if (requestId !== activeRequestId) return;
        setPreview(() => next);
      });
    }, delayMs);
  }

  return {
    preview,
    set,
    clear,
    load,
    schedule,
  };
}
