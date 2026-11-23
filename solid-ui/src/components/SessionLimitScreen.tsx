export function SessionLimitScreen() {
  return (
    <div class="flex h-screen flex-col items-center justify-center gap-6 bg-surface px-6 text-center">
      <div class="text-5xl">🔒</div>
      <h1 class="text-2xl font-semibold text-on-surface">Guest session limit reached</h1>
      <p class="max-w-sm text-on-surface-variant">
        You've used all 3 free guest sessions from this device. Sign in to keep using your agent
        with persistent memory and soul.
      </p>
      <a
        href="/"
        class="rounded-xl bg-primary px-8 py-3 font-medium text-white transition hover:bg-primary/80"
      >
        Sign in to OmnyID
      </a>
    </div>
  );
}
