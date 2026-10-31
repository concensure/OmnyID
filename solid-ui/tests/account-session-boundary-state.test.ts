import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  AUTHENTICATED_ACCOUNT_BOUNDARY_KEY,
  enforceAuthenticatedAccountBoundary,
  shouldReloadForAuthenticatedAccountReplacement,
} from "../src/lib/accountSessionBoundaryState";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test("account change removes ambiguous Wedding state but preserves scoped records", () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  local.setItem(AUTHENTICATED_ACCOUNT_BOUNDARY_KEY, "user-old");
  local.setItem("omnyid.contacts.v1", "old contacts");
  local.setItem("omnyid.contacts.v1:user-old", "old scoped contacts");
  local.setItem("omnyid.contacts.v1:user-new", "new scoped contacts");
  local.setItem("omnyid.wedding-task-completion:shared-workspace", "old decisions");
  local.setItem("omnyid:wedding_guest_operations:shared-workspace", "old guest drafts");
  local.setItem("omnyid:wedding_home_card_order:shared-workspace", "old layout");
  local.setItem("omnyid.theme", "dark");
  session.setItem("omnyid.preview.session", "new session");
  session.setItem("omnyid.nav.session_view_trail", "old trail");

  const result = enforceAuthenticatedAccountBoundary({
    userId: "user-new",
    localStorage: local,
    sessionStorage: session,
  });

  assert.equal(result.accountChanged, true);
  assert.equal(local.getItem("omnyid.contacts.v1"), null);
  assert.equal(local.getItem("omnyid.wedding-task-completion:shared-workspace"), null);
  assert.equal(local.getItem("omnyid:wedding_guest_operations:shared-workspace"), null);
  assert.equal(local.getItem("omnyid:wedding_home_card_order:shared-workspace"), null);
  assert.equal(local.getItem("omnyid.contacts.v1:user-old"), "old scoped contacts");
  assert.equal(local.getItem("omnyid.contacts.v1:user-new"), "new scoped contacts");
  assert.equal(local.getItem("omnyid.theme"), "dark");
  assert.equal(session.getItem("omnyid.preview.session"), "new session");
  assert.equal(session.getItem("omnyid.nav.session_view_trail"), null);
});

test("first authenticated load drops legacy caches without deleting a quiz handoff when requested", () => {
  const local = new MemoryStorage();
  local.setItem("omnyid.contacts.v1", "unowned contacts");
  local.setItem("omnyid.wedding.coupleBrief.v1", "quiz brief");

  const result = enforceAuthenticatedAccountBoundary({
    userId: "user-one",
    localStorage: local,
    preserveWeddingQuizHandoff: true,
  });

  assert.equal(result.accountChanged, false);
  assert.equal(local.getItem("omnyid.contacts.v1"), null);
  assert.equal(local.getItem("omnyid.wedding.coupleBrief.v1"), "quiz brief");
  assert.equal(local.getItem(AUTHENTICATED_ACCOUNT_BOUNDARY_KEY), "user-one");
});

test("first login is adopted in place while a live account replacement reloads", () => {
  assert.equal(shouldReloadForAuthenticatedAccountReplacement({ accountChanged: true, hadAuthenticatedSession: false }), false);
  assert.equal(shouldReloadForAuthenticatedAccountReplacement({ accountChanged: true, hadAuthenticatedSession: true }), true);
  assert.equal(shouldReloadForAuthenticatedAccountReplacement({ accountChanged: false, hadAuthenticatedSession: true }), false);

  const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const sessionRead = app.indexOf("const initialSession = readSession()");
  const boundary = app.indexOf("enforceAuthenticatedAccountBoundary({", sessionRead);
  const signal = app.indexOf("createSignal(initialSession)", boundary);
  assert.ok(sessionRead >= 0 && boundary > sessionRead && signal > boundary);
  assert.match(app, /shouldReloadForAuthenticatedAccountReplacement\(\{/);
  assert.match(app, /hadAuthenticatedSession: Boolean\(session\(\)\?\.token\)/);
  assert.match(app, /setSession\(nextSession\)/);
  assert.match(app, /if \(!nextSession\) \{\s*setDashboard\(null\)/);
});
