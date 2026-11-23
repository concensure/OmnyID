// @locs-version: 1.0
import { Show, type JSXElement } from "solid-js";

const QUEUE_WORKSPACE_LAYOUT_CLASS = "grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]";
const QUEUE_WORKSPACE_LIST_CLASS = "flex min-w-0 flex-col gap-3";
const QUEUE_WORKSPACE_DESKTOP_PANEL_CLASS = "hidden min-w-0 lg:block";
const QUEUE_WORKSPACE_DESKTOP_PANEL_STICKY_CLASS = "sticky top-4";
const QUEUE_WORKSPACE_MOBILE_PANEL_CLASS =
  "fixed inset-x-0 bottom-0 z-50 max-h-[60vh] overflow-y-auto rounded-t-2xl border-t border-white/60 bg-white/95 shadow-2xl backdrop-blur-md lg:hidden";

type QueueWorkspaceLayoutProps = {
  list: JSXElement;
  desktopPanel: JSXElement;
  mobilePanel?: JSXElement;
  mobileOpen?: boolean;
};

export function QueueWorkspaceLayout(props: QueueWorkspaceLayoutProps) {
  const listContent = () => props.list;
  const desktopPanelContent = () => props.desktopPanel;
  const mobilePanelContent = () => props.mobilePanel;
  const mobilePanelOpen = () => props.mobileOpen ?? false;
  const layoutState = () => {
    const mobilePanelView = mobilePanelContent();

    return {
      listView: listContent(),
      desktopPanelView: desktopPanelContent(),
      mobilePanelView,
      showMobilePanel: mobilePanelOpen() && Boolean(mobilePanelView),
    };
  };

  return (
    <div class={QUEUE_WORKSPACE_LAYOUT_CLASS}>
      <div class={QUEUE_WORKSPACE_LIST_CLASS}>{layoutState().listView}</div>

      <div class={QUEUE_WORKSPACE_DESKTOP_PANEL_CLASS}>
        <div class={QUEUE_WORKSPACE_DESKTOP_PANEL_STICKY_CLASS}>
          {layoutState().desktopPanelView}
        </div>
      </div>

      <Show when={layoutState().showMobilePanel}>
        <div class={QUEUE_WORKSPACE_MOBILE_PANEL_CLASS}>
          {layoutState().mobilePanelView}
        </div>
      </Show>
    </div>
  );
}
