(() => {
  const attemptKey = "omnyid.workspace.boot-recovery.v1";
  const root = () => document.getElementById("root");
  const status = (message, recoverable = true) => {
    if (document.documentElement.dataset.workspaceMounted === "true") return;
    const target = root();
    if (!target) return;
    const wrapper = document.createElement("div");
    wrapper.id = "workspace-boot-status";
    wrapper.setAttribute("role", "alert");
    const content = document.createElement("div");
    const title = document.createElement("h1");
    title.textContent = "Workspace could not finish loading";
    const detail = document.createElement("p");
    detail.textContent = message;
    content.append(title, detail);
    if (recoverable) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.workspaceRecover = "true";
      button.textContent = "Reload a fresh copy";
      content.append(button);
    }
    wrapper.append(content);
    target.replaceChildren(wrapper);
  };
  const recover = async () => {
    const previous = Number(sessionStorage.getItem(attemptKey) || 0);
    if (previous && Date.now() - previous < 60000) {
      status("A fresh copy was already requested. Your sign-in is preserved; check your connection, then try again.");
      return;
    }
    sessionStorage.setItem(attemptKey, String(Date.now()));
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
      await Promise.all(registrations.filter((item) => item.scope.includes("/workspace/")).map((item) => item.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys().catch(() => []);
      await Promise.all(keys.filter((key) => key.startsWith("omnyid-shell-")).map((key) => caches.delete(key)));
    }
    location.reload();
  };
  window.__omnyidWorkspaceMounted = () => {
    document.documentElement.dataset.workspaceMounted = "true";
    sessionStorage.removeItem(attemptKey);
  };
  window.__omnyidWorkspaceRecover = recover;
  const startupUrl = new URL(location.href);
  if (startupUrl.searchParams.get("refresh") === "1") {
    startupUrl.searchParams.delete("refresh");
    history.replaceState(history.state, "", startupUrl);
    void recover();
  }
  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("[data-workspace-recover]")) void recover();
  });
  window.addEventListener("error", (event) => {
    if (document.documentElement.dataset.workspaceMounted === "true") return;
    const target = event.target;
    const startupResourceFailed = target instanceof HTMLScriptElement
      || (target instanceof HTMLLinkElement && ["modulepreload", "stylesheet"].includes(target.rel));
    if (!startupResourceFailed && !(event instanceof ErrorEvent)) return;
    status("A required workspace file did not load. Your account session has not been cleared.");
  }, true);
  window.addEventListener("unhandledrejection", () => {
    status("The workspace stopped during startup. Your account session has not been cleared.");
  });
  window.setTimeout(() => {
    status("The workspace is taking longer than expected. Your account session has not been cleared.");
  }, 15000);
})();



