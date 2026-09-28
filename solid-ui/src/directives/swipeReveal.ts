// @locs-version: 1.0
import { onCleanup } from "solid-js";

declare module "solid-js" {
  namespace JSX {
    interface Directives {
      swipeReveal: true;
    }
  }
}

const THRESHOLD = 48;

export function swipeReveal(el: HTMLElement) {
  let startX = 0;
  let startY = 0;
  let revealed = false;

  const tray = el.querySelector<HTMLElement>("[data-swipe-tray]");
  if (!tray) return;

  function show() {
    revealed = true;
    tray!.style.transform = "translateX(0)";
    tray!.style.opacity = "1";
  }

  function hide() {
    revealed = false;
    tray!.style.transform = "translateX(100%)";
    tray!.style.opacity = "0";
  }

  function onTouchStart(e: TouchEvent) {
    startX = e.touches[0]!.clientX;
    startY = e.touches[0]!.clientY;
  }

  function onTouchEnd(e: TouchEvent) {
    const dx = (e.changedTouches[0]?.clientX ?? startX) - startX;
    const dy = (e.changedTouches[0]?.clientY ?? startY) - startY;
    if (Math.abs(dx) > Math.abs(dy) && dx < -THRESHOLD) {
      show();
    } else if (dx > THRESHOLD && revealed) {
      hide();
    }
  }

  function onOutsideTap(e: Event) {
    if (revealed && !el.contains(e.target as Node)) {
      hide();
    }
  }

  el.style.position = "relative";
  el.style.overflow = "hidden";

  el.addEventListener("touchstart", onTouchStart, { passive: true });
  el.addEventListener("touchend", onTouchEnd, { passive: true });
  document.addEventListener("click", onOutsideTap);
  document.addEventListener("touchstart", onOutsideTap, { passive: true });

  onCleanup(() => {
    el.removeEventListener("touchstart", onTouchStart);
    el.removeEventListener("touchend", onTouchEnd);
    document.removeEventListener("click", onOutsideTap);
    document.removeEventListener("touchstart", onOutsideTap);
  });
}
