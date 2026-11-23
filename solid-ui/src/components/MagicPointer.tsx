// @locs-version: 1.0
import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { dispatchMagicActionEvent } from '@/lib/magicActionEvent';

type MagicPhase = 'idle' | 'spark' | 'armed' | 'radial' | 'executing' | 'confirming';

interface MagicTarget {
  label: string;
  icon: string;
  action: string;
  altLabel?: string;
  altIcon?: string;
  altAction?: string;
  msgId: string | null;
  el: Element;
  rect: DOMRect;
}

export function MagicPointer() {
  const [pos, setPos] = createSignal({ x: 0, y: 0 });
  const [phase, setPhase] = createSignal<MagicPhase>('idle');
  const [target, setTarget] = createSignal<MagicTarget | null>(null);
  const [radialChoice, setRadialChoice] = createSignal<'primary' | 'alt'>('primary');
  const [toastMsg, setToastMsg] = createSignal('');
  const [modHeld, setModHeld] = createSignal(false);
  // Keyboard-navigation state: true while the user is cycling with Tab instead of mouse
  const [kbMode, setKbMode] = createSignal(false);
  const [kbIndex, setKbIndex] = createSignal(0);

  let executeTimer: ReturnType<typeof setTimeout> | undefined;
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;

  function detectTarget(x: number, y: number): MagicTarget | null {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    let node: Element | null = el;
    while (node && node !== document.body) {
      const action = node.getAttribute('data-magic-action');
      if (action) {
        return {
          label: node.getAttribute('data-magic-label') ?? 'Take action',
          icon: node.getAttribute('data-magic-icon') ?? '✦',
          action,
          altLabel: node.getAttribute('data-magic-alt-label') ?? undefined,
          altIcon: node.getAttribute('data-magic-alt-icon') ?? undefined,
          altAction: node.getAttribute('data-magic-alt-action') ?? undefined,
          msgId: node.getAttribute('data-magic-id'),
          el: node,
          rect: node.getBoundingClientRect(),
        };
      }
      node = node.parentElement;
    }
    return null;
  }

  function executeAction(t: MagicTarget, choice: 'primary' | 'alt') {
    const action = choice === 'alt' && t.altAction ? t.altAction : t.action;
    const label = choice === 'alt' && t.altLabel ? t.altLabel : t.label;
    const icon = choice === 'alt' && t.altIcon ? t.altIcon : t.icon;

    setPhase('executing');
    setModHeld(false);

    dispatchMagicActionEvent({ action, el: t.el, label, icon, msgId: t.msgId });

    clearTimeout(executeTimer);
    executeTimer = setTimeout(() => {
      setToastMsg(`${icon} ${label}`);
      setPhase('confirming');
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => {
        setPhase('idle');
        setTarget(null);
      }, 2200);
    }, 420);
  }

  onMount(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      return target instanceof Element
        && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    }

    function onMouseMove(e: MouseEvent) {
      // Mouse movement takes over from keyboard mode so the reticle follows the cursor again.
      if (kbMode()) {
        setKbMode(false);
        setKbIndex(0);
      }
      setPos({ x: e.clientX, y: e.clientY });
      if (phase() === 'executing' || phase() === 'confirming') return;

      const t = detectTarget(e.clientX, e.clientY);

      if (modHeld()) {
        if (t) {
          setTarget(t);
          if (t.altAction) {
            const cx = t.rect.left + t.rect.width / 2;
            setRadialChoice(e.clientX < cx ? 'alt' : 'primary');
            setPhase('radial');
          } else {
            setPhase('armed');
          }
        } else {
          setPhase('idle');
          setTarget(null);
        }
      } else {
        if (t) {
          setTarget(t);
          setPhase('spark');
        } else if (phase() === 'spark') {
          setTarget(null);
          setPhase('idle');
        }
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      // Native text entry owns its keyboard.  In particular, Enter in the
      // vendor-search form must never be reinterpreted as the last armed
      // Magic Pointer action (which could navigate back to Wedding Home).
      if (e.defaultPrevented || isEditableTarget(e.target)) return;
      // Tab / Shift+Tab: cycle through data-magic-action elements without a mouse.
      if (e.key === 'Tab' && phase() !== 'executing' && phase() !== 'confirming') {
        const magicEls = Array.from(
          document.querySelectorAll<HTMLElement>('[data-magic-action]')
        ).filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        if (magicEls.length === 0) return;
        e.preventDefault();
        setKbMode(true);
        const dir = e.shiftKey ? -1 : 1;
        const nextIdx = (kbIndex() + dir + magicEls.length) % magicEls.length;
        setKbIndex(nextIdx);
        const el = magicEls[nextIdx];
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        setPos({ x: cx, y: cy });
        setTarget({
          label: el.getAttribute('data-magic-label') ?? 'Take action',
          icon: el.getAttribute('data-magic-icon') ?? '✦',
          action: el.getAttribute('data-magic-action')!,
          altLabel: el.getAttribute('data-magic-alt-label') ?? undefined,
          altIcon: el.getAttribute('data-magic-alt-icon') ?? undefined,
          altAction: el.getAttribute('data-magic-alt-action') ?? undefined,
          msgId: el.getAttribute('data-magic-id'),
          el,
          rect,
        });
        setPhase(el.getAttribute('data-magic-alt-action') ? 'radial' : 'armed');
        return;
      }

      // Enter or Space: execute the currently focused magic target in keyboard mode.
      if ((e.key === 'Enter' || e.key === ' ') && kbMode() && target() &&
          phase() !== 'executing' && phase() !== 'confirming') {
        e.preventDefault();
        executeAction(target()!, 'primary');
        setKbMode(false);
        return;
      }

      if ((e.key === 'Control' || e.key === 'Meta') && !modHeld()) {
        setModHeld(true);
        const p = pos();
        const t = detectTarget(p.x, p.y);
        if (t) {
          setTarget(t);
          setPhase(t.altAction ? 'radial' : 'armed');
        }
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Control' || e.key === 'Meta') {
        const cur = phase();
        if ((cur === 'armed' || cur === 'radial') && target()) {
          executeAction(target()!, radialChoice());
          return;
        }
        setModHeld(false);
        if (cur === 'armed' || cur === 'radial') { setPhase('idle'); setTarget(null); }
      }
      if (e.key === 'Escape') {
        setModHeld(false);
        setKbMode(false);
        setKbIndex(0);
        setPhase('idle');
        setTarget(null);
      }
    }

    document.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    onCleanup(() => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      clearTimeout(executeTimer);
      clearTimeout(confirmTimer);
    });
  });

  return (
    <div class="pointer-events-none fixed inset-0 z-[9998]" aria-hidden="true">

      {/* Keyboard focus ring — shows which magic element is focused when navigating with Tab */}
      <Show when={kbMode() && target()}>
        {(t) => (
          <div
            class="absolute"
            style={{
              left: `${t().rect.left - 4}px`,
              top: `${t().rect.top - 4}px`,
              width: `${t().rect.width + 8}px`,
              height: `${t().rect.height + 8}px`,
              border: "2px solid rgba(99,102,241,0.8)",
              "border-radius": "6px",
              "box-shadow": "0 0 0 3px rgba(99,102,241,0.2)",
              transition: "all 0.15s ease",
            }}
          />
        )}
      </Show>

      {/* Keyboard mode hint */}
      <Show when={kbMode() && target()}>
        <div
          class="absolute"
          style={{ left: `${pos().x + 14}px`, top: `${pos().y - 34}px` }}
        >
          <span class="rounded-full border border-white/50 bg-white/95 px-2 py-0.5 font-mono text-[8px] text-indigo-600 backdrop-blur-sm shadow-sm whitespace-nowrap">
            ↵ to execute · Tab to cycle · Esc to cancel
          </span>
        </div>
      </Show>

      {/* Spark phase — subtle hover indicator */}
      <Show when={phase() === 'spark' && target()}>
        <div class="absolute magic-spark-dot"
          style={{ left: `${pos().x + 10}px`, top: `${pos().y - 14}px` }} />
        <div class="absolute magic-hint-pill"
          style={{ left: `${pos().x + 18}px`, top: `${pos().y - 28}px` }}>
          <span class="rounded-full border border-white/50 bg-white/88 px-2 py-0.5 font-mono text-[8px] text-indigo-500/70 backdrop-blur-sm shadow-sm whitespace-nowrap"
          >hold ⌃ to {target()?.label ?? "preview"}</span>
        </div>
      </Show>

      {/* Armed phase — reticle + intent pill */}
      <Show when={phase() === 'armed' && target()}>
        <div class="absolute magic-reticle"
          style={{ left: `${pos().x - 22}px`, top: `${pos().y - 22}px` }}>
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
            <circle cx="22" cy="22" r="18" stroke="rgba(99,102,241,0.65)" stroke-width="1.5"
              stroke-dasharray="5 3.5" class="magic-reticle-dash" />
            <circle cx="22" cy="22" r="3" fill="rgba(99,102,241,0.9)" />
            <line x1="22" y1="5" x2="22" y2="10" stroke="rgba(99,102,241,0.5)" stroke-width="1.5" stroke-linecap="round" />
            <line x1="22" y1="34" x2="22" y2="39" stroke="rgba(99,102,241,0.5)" stroke-width="1.5" stroke-linecap="round" />
            <line x1="5" y1="22" x2="10" y2="22" stroke="rgba(99,102,241,0.5)" stroke-width="1.5" stroke-linecap="round" />
            <line x1="34" y1="22" x2="39" y2="22" stroke="rgba(99,102,241,0.5)" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </div>
        <div class="absolute magic-intent-pill"
          style={{ left: `${pos().x + 18}px`, top: `${pos().y - 38}px` }}>
          <div class="flex items-center gap-1.5 rounded-full border border-indigo-300/40 bg-white/92 px-2.5 py-1 shadow-lg backdrop-blur-sm">
            <span class="text-[13px] leading-none">{target()?.icon}</span>
            <span class="text-[11px] font-semibold text-indigo-700 whitespace-nowrap">{target()?.label}</span>
            <kbd class="rounded border border-indigo-100/80 bg-indigo-50/80 px-1 font-mono text-[8px] text-indigo-400">release ⌃</kbd>
          </div>
        </div>
      </Show>

      {/* Radial phase — two-option split */}
      <Show when={phase() === 'radial' && target()}>
        <div class="absolute magic-reticle"
          style={{ left: `${pos().x - 22}px`, top: `${pos().y - 22}px` }}>
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
            <circle cx="22" cy="22" r="18" stroke="rgba(99,102,241,0.65)" stroke-width="1.5"
              stroke-dasharray="5 3.5" class="magic-reticle-dash" />
            <circle cx="22" cy="22" r="3" fill="rgba(99,102,241,0.9)" />
          </svg>
        </div>
        <div
          class={`absolute flex items-center gap-1.5 rounded-full border px-2.5 py-1 shadow-md backdrop-blur-sm transition-all duration-100 magic-radial-left ${radialChoice() === 'alt' ? 'border-indigo-400/70 bg-indigo-600 text-white' : 'border-white/50 bg-white/90 text-indigo-700'}`}
          style={{ left: `${pos().x - 142}px`, top: `${pos().y - 18}px` }}>
          <span class="text-[12px] leading-none">{target()?.altIcon}</span>
          <span class="text-[11px] font-semibold whitespace-nowrap">{target()?.altLabel}</span>
        </div>
        {/* Directional arrow shows which side is active */}
        <div
          class="absolute pointer-events-none select-none transition-all duration-100"
          style={{ left: `${pos().x - 10}px`, top: `${pos().y - 12}px` }}
          aria-hidden="true"
        >
          <span class="font-mono text-[14px] font-bold text-indigo-500/80">
            {radialChoice() === 'alt' ? '←' : '→'}
          </span>
        </div>
        <div
          class={`absolute flex items-center gap-1.5 rounded-full border px-2.5 py-1 shadow-md backdrop-blur-sm transition-all duration-100 magic-radial-right ${radialChoice() === 'primary' ? 'border-indigo-400/70 bg-indigo-600 text-white' : 'border-white/50 bg-white/90 text-indigo-700'}`}
          style={{ left: `${pos().x + 52}px`, top: `${pos().y - 18}px` }}>
          <span class="text-[12px] leading-none">{target()?.icon}</span>
          <span class="text-[11px] font-semibold whitespace-nowrap">{target()?.label}</span>
        </div>
        <div class="absolute magic-hint-pill"
          style={{ left: `${pos().x - 62}px`, top: `${pos().y + 28}px` }}>
          <span class="rounded-full border border-white/40 bg-white/88 px-2.5 py-0.5 font-mono text-[8px] text-indigo-400/70 backdrop-blur-sm shadow-sm whitespace-nowrap"
          >← slide to choose · release ⌃</span>
        </div>
      </Show>

      {/* Executing phase — spinner ring around cursor */}
      <Show when={phase() === 'executing'}>
        <div class="absolute"
          style={{ left: `${pos().x - 18}px`, top: `${pos().y - 18}px` }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <circle cx="18" cy="18" r="13" stroke="rgba(99,102,241,0.12)" stroke-width="2.5" />
            <circle cx="18" cy="18" r="13" stroke="rgba(99,102,241,0.85)" stroke-width="2.5"
              stroke-dasharray="20 62" stroke-linecap="round" class="magic-spinner-arc" />
          </svg>
        </div>
      </Show>

      {/* Confirming phase — toast anchored to the acted-on element */}
      <Show when={phase() === 'confirming'}>
        <div class="absolute magic-cursor-toast"
          style={{
            left: `${target() ? target()!.rect.left + target()!.rect.width / 2 : pos().x + 16}px`,
            top: `${target() ? target()!.rect.top - 48 : pos().y - 48}px`,
            transform: 'translateX(-50%)',
          }}>
          <div class="flex items-center gap-2 rounded-xl border border-emerald-200/60 bg-white/96 px-3 py-1.5 shadow-lg backdrop-blur-sm">
            <span class="text-[13px] text-emerald-500">✓</span>
            <span class="text-[11px] font-medium text-on-surface whitespace-nowrap">{toastMsg()}</span>
          </div>
        </div>
      </Show>

    </div>
  );
}
