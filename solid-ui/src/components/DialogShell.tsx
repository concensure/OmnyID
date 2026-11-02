// @locs-version: 1.0
import { createEffect, JSX, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { getFocusableElements } from "@/lib/getFocusableElements";
import { handleDialogTabNavigation } from "@/lib/handleDialogTabNavigation";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";

type Props = {
  open?: boolean;
  dialogId?: string;
  labelledBy: string;
  describedBy?: string;
  busy?: boolean;
  focusableSelector: string;
  overlayClass: string;
  dialogClass: string;
  dialogStyle?: JSX.CSSProperties;
  onClose: () => void;
  dialogRef?: (element: HTMLDivElement | undefined) => void;
  children: JSX.Element;
};

export function DialogShell(props: Props) {
  let dialogRef: HTMLDivElement | undefined;
  let returnFocus: HTMLElement | null = null;
  const isOpen = () => props.open ?? true;

  function focusableDialogElements(): HTMLElement[] {
    return getFocusableElements(dialogRef, props.focusableSelector);
  }

  useBodyScrollLock(isOpen);
  createEffect(() => {
    if (!isOpen()) return;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    queueMicrotask(() => (focusableDialogElements()[0] ?? dialogRef)?.focus());
  });
  onCleanup(() => returnFocus?.focus());

  return (
    <Show when={isOpen()}>
      <Portal>
        <div
          class={props.overlayClass}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              props.onClose();
            }
          }}
        >
          <div
            ref={(element) => {
              dialogRef = element;
              props.dialogRef?.(element);
            }}
            id={props.dialogId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={props.labelledBy}
            aria-describedby={props.describedBy}
            aria-busy={props.busy}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                props.onClose();
                return;
              }
              if (event.key === "Tab") {
                handleDialogTabNavigation(event, focusableDialogElements(), dialogRef);
              }
            }}
            class={props.dialogClass}
            style={props.dialogStyle}
          >
            {props.children}
          </div>
        </div>
      </Portal>
    </Show>
  );
}
