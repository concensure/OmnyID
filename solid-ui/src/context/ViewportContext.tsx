// @locs-version: 1.0
import { createContext, createSignal, onCleanup, onMount, useContext } from "solid-js";
import type { JSX } from "solid-js";
import { subscribeDevViewportEvent } from "@/lib/devViewportEvent";
import {
  isMobileViewport,
  isNanoViewport,
  isWatchViewport,
} from "@/lib/viewportFlags";
import { classifyViewportWidth, type ViewportClass } from "@/lib/viewportClass";

interface ViewportContextValue {
  viewport: () => ViewportClass;
  isWatch: () => boolean;
  isNano: () => boolean;
  isMobile: () => boolean;
  highContrast: () => boolean;
  setHighContrast: (v: boolean) => void;
}

const defaultViewportContext: ViewportContextValue = {
  viewport: (): ViewportClass => "desktop",
  isWatch: () => false,
  isNano: () => false,
  isMobile: () => false,
  highContrast: () => false,
  setHighContrast: () => {},
};

const ViewportContext = createContext<ViewportContextValue>(defaultViewportContext);

export function ViewportProvider(props: { children: JSX.Element }) {
  const [vp, setVp] = createSignal<ViewportClass>(classifyViewportWidth(window.innerWidth));
  const [hc, setHc] = createSignal(false);

  let timer: ReturnType<typeof setTimeout>;

  const ro = new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => setVp(classifyViewportWidth(window.innerWidth)), 100);
  });

  onMount(() => {
    ro.observe(document.body);
    const unsubscribeDevViewport = subscribeDevViewportEvent((detail) => {
      setVp(classifyViewportWidth(detail.width));
    });
    onCleanup(() => unsubscribeDevViewport());
  });

  onCleanup(() => {
    ro.disconnect();
    clearTimeout(timer);
  });

  return (
    <ViewportContext.Provider value={{
      viewport: vp,
      isWatch: () => isWatchViewport(vp()),
      isNano: () => isNanoViewport(vp()),
      isMobile: () => isMobileViewport(vp()),
      highContrast: hc,
      setHighContrast: setHc,
    }}>
      {props.children}
    </ViewportContext.Provider>
  );
}

export function useViewport() {
  return useContext(ViewportContext);
}
