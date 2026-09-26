// @locs-version: 1.0
import { createEffect, onCleanup, type Accessor } from "solid-js";

let bodyScrollLockCount = 0;
let previousBodyOverflow: string | null = null;

export function useBodyScrollLock(active: Accessor<boolean>) {
  createEffect(() => {
    if (!active()) return;
    if (bodyScrollLockCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
    }
    bodyScrollLockCount += 1;
    document.body.style.overflow = "hidden";
    onCleanup(() => {
      bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
      if (bodyScrollLockCount === 0) {
        document.body.style.overflow = previousBodyOverflow ?? "";
        previousBodyOverflow = null;
      }
    });
  });
}
