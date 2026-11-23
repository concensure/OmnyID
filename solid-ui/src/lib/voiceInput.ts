// @locs-version: 1.0
// @module-id: lib.voice-input-shim
// @primary-capability: browser-speech-recognition-shim
// @stability: stable
// Browser-native SpeechRecognition shim used when the full voice-input-ts
// package is not bundled (production build via vite.config.mjs).
// Covers the subset of the API that SearchBar.tsx consumes:
//   new VoiceInput(opts) → .start() / .stop() / .destroy()

interface VoiceInputOptions {
  lang?: string;
  vadThreshold?: number;
  silenceThresholdMs?: number;
  contextHint?: string;
  hotWords?: string[];
  onUpdate?: (text: string) => void;
  onError?: (err?: unknown) => void;
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export class VoiceInput {
  private recognition: SpeechRecognition | null = null;
  private opts: VoiceInputOptions;
  private running = false;

  constructor(opts: VoiceInputOptions = {}) {
    this.opts = opts;
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;

    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = opts.lang ?? navigator.language ?? "en-US";

    r.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      // resultIndex only points at the changed segment, so rebuild the complete
      // transcript or earlier final words disappear as the user keeps talking.
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (transcript.trim()) opts.onUpdate?.(transcript.trim());
    };

    r.onerror = (event) => {
      this.running = false;
      opts.onError?.(event);
    };

    r.onend = () => {
      // Auto-restart while still supposed to be running (silence gap).
      if (this.running) {
        try { r.start(); } catch { /* already started */ }
      }
    };

    this.recognition = r;
  }

  async start(): Promise<void> {
    if (!this.recognition) {
      this.opts.onError?.(new Error("Speech recognition is not supported by this browser."));
      return;
    }
    if (this.running) return;
    // SpeechRecognition implementations do not consistently prompt for mic
    // access themselves. Ask through MediaDevices in the user-gesture path,
    // release the probe stream immediately, then let the recognizer own input.
    try {
      const stream = await navigator.mediaDevices?.getUserMedia?.({ audio: true });
      stream?.getTracks().forEach((track) => track.stop());
    } catch (error) {
      this.opts.onError?.(error);
      return;
    }
    this.running = true;
    try { this.recognition.start(); } catch { this.opts.onError?.(); }
  }

  stop(): void {
    this.running = false;
    try { this.recognition?.stop(); } catch { /* ignore */ }
  }

  destroy(): void {
    this.running = false;
    try { this.recognition?.abort(); } catch { /* ignore */ }
    this.recognition = null;
  }
}
