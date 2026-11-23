import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { PracticeActionCard } from "./PracticeActionCard";
import { assertPracticeBootstrap, createPracticeRequestGate, practiceActionLabels, practiceClientsForRoute,
  practiceContextKey, practiceHref, readPracticeRoute, samePracticePlan,
  type PracticeBootstrap, type PracticePage, type PracticeRoute } from "@/lib/weddingPracticeState";

const labels: Record<PracticePage, string> = { home: "Home", clients: "Clients", inbox: "Inbox", calendar: "Calendar", suppliers: "Suppliers", settings: "Settings", more: "More" };
const desktop: PracticePage[] = ["home", "clients", "inbox", "calendar", "suppliers", "settings"];
const mobile: PracticePage[] = ["home", "clients", "inbox", "calendar", "more"];
export function PracticeWorkspace(props: { load: (practice: string | null, signal: AbortSignal) => Promise<PracticeBootstrap> }) {
  const [route, setRoute] = createSignal(readPracticeRoute(window.location.search));
  const [data, setData] = createSignal<PracticeBootstrap | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal(false);
  const gate = createPracticeRequestGate();
  let previousContext = "";
  let main: HTMLElement | undefined;
  const selectedPractice = createMemo(() => data()?.practices.find(p => p.practice_id === data()?.selected_practice_id));
  const selectedClient = createMemo(() => route().client ? data()?.clients.find(c => samePracticePlan(c.summary.plan, route().client!)) : undefined);
  const list = createMemo(() => data() ? practiceClientsForRoute(data()!, route()) : []);
  const routeFor = (page: PracticePage, filter = "all"): PracticeRoute => ({ ...route(), page, filter, client: null, search: "", offset: 0 });
  const clientRoute = (plan: NonNullable<PracticeRoute["client"]>): PracticeRoute => ({ ...route(), page: "clients", client: plan,
    filter: route().filter === "all" && route().page === "inbox" ? "inbox" : route().filter === "all" && route().page === "calendar" ? "week" : route().filter });
  const savePosition = () => { if (!loading()) window.history.replaceState({ ...window.history.state, practiceScroll: window.scrollY, practiceContext: previousContext }, ""); };
  async function reload(restore = false) {
    const request = gate.begin(), expected = route().practice;
    const savedPosition = window.history.state;
    setData(null); setError(false); setLoading(true);
    try {
      const result = await props.load(expected, request.signal);
      if (!request.isCurrent()) return;
      assertPracticeBootstrap(result, expected);
      const context = practiceContextKey(result);
      const scroll = restore && savedPosition?.practiceContext === context ? savedPosition.practiceScroll || 0 : 0;
      previousContext = context;
      setData(result);
      setLoading(false);
      if (restore) requestAnimationFrame(() => { if (request.isCurrent()) window.scrollTo(0, scroll); });
    } catch {
      if (!request.isCurrent()) return;
      setError(true); setLoading(false);
    }
  }
  function navigate(next: PracticeRoute, event?: MouseEvent, preserveFocus = false) {
    if (event && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0)) return;
    event?.preventDefault(); savePosition();
    const switched = next.practice !== route().practice;
    window.history.pushState({}, "", practiceHref(next)); setRoute(next);
    if (switched) { previousContext = ""; void reload(); }
    else { window.scrollTo(0, 0); if (!preserveFocus) main?.focus(); }
  }
  function switchContext(value: string) {
    if (value === "personal" || value === "wedding") {
      gate.cancel(); setData(null);
      window.location.assign(value === "personal" ? "/workspace/" : "/workspace/?source=wedding&view=response_queue"); return;
    }
    navigate({ practice: value || null, page: "home", client: null, filter: "all", search: "", offset: 0 });
  }
  onMount(() => {
    const originalRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const pop = () => { setRoute(readPracticeRoute(window.location.search)); void reload(true); };
    const visible = () => { if (document.visibilityState === "visible") void reload(true); else { gate.cancel(); setData(null); setLoading(true); } };
    const storage = () => { previousContext = ""; void reload(); };
    const scroll = () => savePosition();
    window.addEventListener("popstate", pop); window.addEventListener("storage", storage);
    window.addEventListener("scroll", scroll, { passive: true }); document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void reload(true); }, 30000);
    void reload(true);
    onCleanup(() => { gate.cancel(); window.history.scrollRestoration = originalRestoration; window.clearInterval(timer); window.removeEventListener("popstate", pop);
      window.removeEventListener("storage", storage); window.removeEventListener("scroll", scroll); document.removeEventListener("visibilitychange", visible); });
  });
  const Nav = (navProps: { pages: PracticePage[]; class: string }) => <nav class={navProps.class} aria-label={navProps.class.includes("mobile") ? "Practice mobile" : "Practice"}>
    <For each={navProps.pages}>{page => <a href={practiceHref(routeFor(page))} aria-current={route().page === page ? "page" : undefined}
      onClick={e => navigate(routeFor(page), e)}>{labels[page]}</a>}</For>
  </nav>;
  const count = (page: PracticePage, filter: string) => data() ? practiceClientsForRoute(data()!, routeFor(page, filter)).length : 0;
  return <div class="practice-workspace">
    <a class="practice-skip" href="#practice-main">Skip to workspace</a>
    <header class="practice-header">
      <div><p class="practice-eyebrow">OmnyID · Professional workspace</p><h1>{selectedPractice()?.display_name || "Your practice workspace"}</h1>
        <Show when={selectedPractice()}><p>{selectedPractice()!.role.replaceAll("_", " ")} · {selectedClient()?.summary.client_label || "Practice overview"}</p></Show></div>
      <label class="practice-switch">Workspace<select aria-label="Workspace" value={data()?.selected_practice_id || ""} onChange={e => switchContext(e.currentTarget.value)}>
        <option value="">Choose a practice</option><option value="personal">Personal account</option><option value="wedding">My wedding</option>
        <For each={data()?.practices || []}>{p => <option value={p.practice_id} selected={data()?.selected_practice_id === p.practice_id}>{p.display_name}</option>}</For>
      </select></label>
    </header>
    <Show when={data()?.status === "ready"}><Nav pages={desktop} class="practice-desktop-nav" /></Show>
    <main id="practice-main" ref={main} tabindex="-1" class="practice-main" aria-busy={loading()}>
      <Show when={loading()}><p role="status">Loading your authorised workspace…</p></Show>
      <Show when={error()}><section class="practice-card"><h2>We couldn’t load your practice</h2><p role="alert">Please try again. If you have signed out, sign in to continue.</p>
        <button class="practice-primary" onClick={() => void reload()}>Try again</button> <a href="/workspace/?auth=signin">Sign in</a></section></Show>
      <Show when={data() && data()!.status !== "ready"}>
        <section class="practice-card"><h2>{({ unavailable: "Professional workspace is not available for this account", no_practice: "You haven’t joined a practice yet", choose_practice: "Choose your workspace", forbidden: "You no longer have access to this practice", ready: "" })[data()!.status]}</h2>
          <p>{data()!.status === "choose_practice" ? "Select a practice above to see its authorised clients." : "You can continue in your personal workspace, or ask your practice owner about access."}</p>
          <a href="/workspace/">Return to personal account</a></section>
      </Show>
      <Show when={data()?.status === "ready"}>
        <nav aria-label="Breadcrumb" class="practice-breadcrumb"><a href={practiceHref(routeFor("home"))} onClick={e => navigate(routeFor("home"), e)}>{selectedPractice()?.display_name}</a><span aria-hidden="true"> / </span><span>{selectedClient()?.summary.client_label || labels[route().page]}</span></nav>
        <Show when={route().client} fallback={<>
          <Show when={route().page === "home"}>
            <div class="practice-section-heading"><div><p class="practice-eyebrow">Your working day</p><h2>What needs you now?</h2></div><button onClick={() => void reload()}>Refresh</button></div>
            <Show when={data()!.next_action} fallback={<section class="practice-card"><h3>{data()!.clients.length ? "No actions need your attention" : "Your client list is empty"}</h3><p>{data()!.clients.length ? "Check the client list for the full planning picture." : "Clients will appear here after you have been granted access to their wedding plan."}</p></section>}>
              <PracticeActionCard card={data()!.next_action!} generatedAt={data()!.generated_at} href={practiceHref(clientRoute(data()!.next_action!.plan))} open={e => navigate(clientRoute(data()!.next_action!.plan), e)} />
            </Show>
            <div class="practice-grid">
              <For each={[
                { page: "calendar" as const, filter: "week", label: "Due and next seven days" },
                { page: "inbox" as const, filter: "inbox", label: "Replies and approvals" },
                { page: "clients" as const, filter: "holds", label: "Date holds to review" },
                { page: "clients" as const, filter: "payments", label: "Payment evidence due" },
              ]}>{item => <a class="practice-card practice-count" href={practiceHref(routeFor(item.page, item.filter))} onClick={e => navigate(routeFor(item.page, item.filter), e)}><span>{item.label}</span><strong>{count(item.page, item.filter)} {count(item.page, item.filter) === 1 ? "client" : "clients"}</strong></a>}</For>
            </div>
            <section class="practice-card"><h3>Due and coming up</h3><ol class="practice-agenda"><For each={practiceClientsForRoute(data()!, routeFor("calendar", "week")).slice().sort((a,b) => Date.parse(a.summary.next_action_due_at!) - Date.parse(b.summary.next_action_due_at!)).slice(0, 4)}>{client => <li><a href={practiceHref(clientRoute(client.summary.plan))} onClick={e => navigate(clientRoute(client.summary.plan), e)}>{client.summary.client_label}</a><p>{client.summary.next_action ? practiceActionLabels[client.summary.next_action] : "Review client"} · {new Date(client.summary.next_action_due_at!).toLocaleString()}</p></li>}</For></ol><Show when={count("calendar", "week") === 0}><p>No shared deadlines in the next seven days.</p></Show></section>
            <section class="practice-card"><h3>Client stages</h3><div class="practice-stage-links"><For each={["onboarding", "planning", "confirming", "event_ready", "completed", "archived"]}>{stage => <a href={practiceHref(routeFor("clients", `stage:${stage}`))} onClick={e => navigate(routeFor("clients", `stage:${stage}`), e)}>{stage.replaceAll("_", " ")} · {count("clients", `stage:${stage}`)}</a>}</For></div></section>
          </Show>
          <Show when={["clients", "inbox", "calendar", "suppliers"].includes(route().page)}>
            <h2>{labels[route().page]}</h2>
            <Show when={route().page === "calendar"}><p>Due actions and the next seven days. Dates are shown in your local timezone.</p></Show>
            <Show when={route().page === "inbox"}><p>Clients with replies, quotes, approvals or follow-ups to review.</p></Show>
            <Show when={route().page === "suppliers"}><p>Choose a client to see their current supplier-related next action.</p></Show>
            <form class="practice-filters" onSubmit={e => e.preventDefault()}>
              <label>Find a client<input type="search" value={route().search} onInput={e => navigate({ ...route(), search: e.currentTarget.value, offset: 0 }, undefined, true)} /></label>
              <label>Show<select value={route().filter} onChange={e => navigate({ ...route(), filter: e.currentTarget.value, offset: 0 }, undefined, true)}><option value="all">All in this view</option><option value="inbox">Replies and approvals</option><option value="week">Due and next seven days</option><option value="attention">Needs attention</option><option value="payments">Payment evidence</option><option value="holds">Date holds</option><For each={["onboarding", "planning", "confirming", "event_ready", "completed", "archived"]}>{stage => <option value={`stage:${stage}`}>{stage.replaceAll("_", " ")}</option>}</For></select></label>
            </form>
            <p role="status">{list().length} matching {list().length === 1 ? "client" : "clients"}</p>
            <ul class="practice-client-list"><For each={list().slice(route().offset, route().offset + 50)}>{client => <li class="practice-card">
              <div><h3>{client.summary.client_label}</h3><p>{client.summary.wedding_date || "Date not decided"} · {client.summary.stage.replaceAll("_", " ")}</p>
                <p>{client.summary.next_action ? practiceActionLabels[client.summary.next_action] : "No action to review"}</p>
                <Show when={client.summary.next_action_due_at}><p>Due {new Date(client.summary.next_action_due_at!).toLocaleString()}</p></Show></div>
              <a href={practiceHref(clientRoute(client.summary.plan))} onClick={e => navigate(clientRoute(client.summary.plan), e)}>View client summary<span class="practice-sr-only">: {client.summary.client_label}</span></a>
            </li>}</For></ul>
            <Show when={!list().length}><section class="practice-card"><h3>No clients in this view</h3><p>Try another filter, or return to all clients.</p><a href={practiceHref(routeFor("clients"))} onClick={e => navigate(routeFor("clients"), e)}>View all clients</a></section></Show>
            <div class="practice-pagination"><Show when={route().offset > 0}><button onClick={() => navigate({ ...route(), offset: Math.max(0, route().offset - 50) })}>Previous clients</button></Show><Show when={list().length > route().offset + 50}><button onClick={() => navigate({ ...route(), offset: route().offset + 50 })}>Next clients</button></Show></div>
          </Show>
          <Show when={route().page === "settings"}><section class="practice-card"><h2>Practice access</h2><p>Your role: {selectedPractice()?.role.replaceAll("_", " ")}</p><p>Client access is granted separately. Membership does not give access to every wedding.</p><button onClick={() => void reload()}>Check current access</button></section></Show>
          <Show when={route().page === "more"}><h2>More</h2><div class="practice-stage-links"><For each={["suppliers", "settings"] as PracticePage[]}>{page => <a href={practiceHref(routeFor(page))} onClick={e => navigate(routeFor(page), e)}>{labels[page]}</a>}</For><a href="/workspace/">Personal account</a></div></Show>
        </>}>
          <Show when={selectedClient()} fallback={<section class="practice-card"><h2>This client is not available</h2><p>Your access may have changed. Choose a client from your current list.</p><a href={practiceHref(routeFor("clients"))} onClick={e => navigate(routeFor("clients"), e)}>View authorised clients</a></section>}>
            <section class="practice-card"><p class="practice-eyebrow">Client summary · scoped access</p><h2>{selectedClient()!.summary.client_label}</h2><p>{selectedClient()!.summary.wedding_date || "Date not decided"}</p>
              <h3>Next action</h3><p>{selectedClient()!.summary.next_action ? practiceActionLabels[selectedClient()!.summary.next_action!] : "No action to review"}</p>
              <p>Assigned planner: {selectedClient()!.summary.assigned_planner_id === data()!.account_id ? "You" : selectedClient()!.summary.assigned_planner_id ? "Another team member" : "Not assigned"}</p>
              <p>This summary shows the information shared with your practice.</p>
              <a href={practiceHref({ ...route(), client: null })} onClick={e => navigate({ ...route(), client: null }, e)}>Return to client list</a>
            </section>
          </Show>
        </Show>
      </Show>
    </main>
    <Show when={data()?.status === "ready"}><Nav pages={mobile} class="practice-mobile-nav" /></Show>
  </div>;
}
