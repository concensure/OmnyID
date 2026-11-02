import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

type Couple = {
  owner_user_id: string;
  plan_id: string;
  workspace_id: string;
  catering_household_id: string;
  private_household_id: string;
  catering_person_id: string;
  draft_request_id: string;
};
type Manifest = {
  accounts: Record<string, string>;
  couples: { mia_jordan: Couple; priya_sam: Couple };
};
type ApiReply = { status: number; body: unknown };

const manifestPath = process.env.OMNYID_E2E_SEED_MANIFEST?.trim();
const password = process.env.OMNYID_E2E_PASSWORD?.trim();
if (!manifestPath || !password) throw new Error("seed manifest and synthetic password are required");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

async function signIn(browser: Browser, email: string): Promise<{ context: BrowserContext; page: Page; userId: string; cookie: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/workspace/?open_auth=1", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Account email").fill(email);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect.poll(async () => page.evaluate(() => sessionStorage.getItem("omnyid.preview.session")), {
    message: `${email} should receive a real homeserver session`,
  }).not.toBeNull();
  const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem("omnyid.preview.session") || "null"));
  expect(session?.user?.email).toBe(email);
  expect(session?.token).toBe("__http_only_cookie__");
  const authenticatedUser = await page.evaluate(async () => {
    const response = await fetch("/auth/session");
    return { status: response.status, body: await response.json() };
  });
  expect(authenticatedUser).toMatchObject({ status: 200, body: { email } });
  const sessionCookie = (await context.cookies()).find(({ name }) => name === "omnyid_session");
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.value).toEqual(expect.any(String));

  // A real first login intentionally opens the product tour. Close it through
  // the user-facing control so it cannot mask the Wedding surface exercised by
  // the rest of this full-account journey.
  const skipTour = page.getByRole("button", { name: "Skip", exact: true });
  await skipTour.click({ timeout: 10_000 }).catch(() => undefined);
  await expect(skipTour).toBeHidden();
  return {
    context,
    page,
    userId: (authenticatedUser.body as { id: string }).id,
    cookie: sessionCookie!.value,
  };
}

async function api(page: Page, path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiReply> {
  return page.evaluate(async ({ path: apiPath, method, body }) => {
    const response = await fetch(apiPath, {
      method: method || "GET",
      cache: "no-store",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: unknown = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* retain bounded text */ }
    return { status: response.status, body: parsed };
  }, { path, method: init.method, body: init.body });
}

function grantBody(couple: Couple, delegateEmail: string) {
  return {
    wedding_plan_id: couple.plan_id,
    response_workspace_id: couple.workspace_id,
    delegate_email: delegateEmail,
    role: "planner",
    person_id: null,
    household_ids: [couple.catering_household_id],
    expires_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  };
}

test("Mia/Jordan and Priya/Sam stay isolated through real registration, login, grants and review", async ({ browser }) => {
  const sessions = await Promise.all([
    signIn(browser, "mia@omnyid.test"),
    signIn(browser, "jordan@omnyid.test"),
    signIn(browser, "priya@omnyid.test"),
    signIn(browser, "sam@omnyid.test"),
    signIn(browser, "alex@omnyid.test"),
  ]);
  const [mia, jordan, priya, sam, alex] = sessions;
  expect(new Set(sessions.map(({ cookie }) => cookie)).size).toBe(5);
  expect(new Set(sessions.map(({ userId }) => userId)).size).toBe(5);

  const miaCouple = manifest.couples.mia_jordan;
  const priyaCouple = manifest.couples.priya_sam;

  // Prove the same persisted fixtures consumed by the route tests are visible
  // through the real wedding UI. This catches tag/projection drift that an API
  // response alone cannot detect.
  await mia.page.evaluate((couple) => {
    window.dispatchEvent(new CustomEvent("omnyid:open-wedding-planning-intent", {
      detail: {
        view: "response_queue",
        surface: "planning_files",
        weddingPlanId: couple.plan_id,
        responseWorkspaceId: couple.workspace_id,
        sourceResponseId: null,
        artifactId: null,
        sectionId: "home",
        notice: "Opening synthetic wedding plan.",
        metadata: {},
      },
    }));
  }, miaCouple);
  await expect(mia.page.getByRole("button", { name: /^Guests/ }).first()).toBeVisible();
  await mia.page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("omnyid:wedding-workspace-menu", { detail: { menu: "guests" } }));
  });
  await mia.page.getByRole("button", { name: "Open family boundaries" }).click();
  await expect(mia.page.getByText("Catering coordination", { exact: true }).first()).toBeVisible();
  await expect(mia.page.getByText("Private family", { exact: true }).first()).toBeVisible();

  const submitted = await api(mia.page, "/wedding/boundaries/requests/transitions", {
    method: "POST",
    body: {
      wedding_plan_id: miaCouple.plan_id,
      response_workspace_id: miaCouple.workspace_id,
      request_id: miaCouple.draft_request_id,
      operation: "submit",
      expected_revision: 1,
      idempotency_key: "e2e-mia-submit",
    },
  });
  expect(submitted).toMatchObject({ status: 200, body: { status: "pending", revision: 2 } });
  const withdrawn = await api(mia.page, "/wedding/boundaries/requests/transitions", {
    method: "POST",
    body: {
      wedding_plan_id: miaCouple.plan_id,
      response_workspace_id: miaCouple.workspace_id,
      request_id: miaCouple.draft_request_id,
      operation: "withdraw",
      expected_revision: 2,
      idempotency_key: "e2e-mia-withdraw",
    },
  });
  expect(withdrawn).toMatchObject({ status: 200, body: { status: "withdrawn", revision: 3 } });

  const helperReply = await api(mia.page, "/wedding/boundaries/grants", {
    method: "POST",
    body: {
      wedding_plan_id: miaCouple.plan_id,
      response_workspace_id: miaCouple.workspace_id,
      principal_label: "Jordan catering helper",
      household_ids: [miaCouple.catering_household_id],
      allowed_actions: ["view_summary", "propose_request"],
      expires_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    },
  });
  expect(helperReply.status).toBe(200);
  const helper = helperReply.body as { grant: { grant_id: string }; token: string };
  const helperView = await api(jordan.page, "/wedding/boundaries/helpers/open", {
    method: "POST", body: { token: helper.token },
  });
  expect(helperView.status).toBe(200);
  expect(JSON.stringify(helperView.body)).toContain(miaCouple.catering_household_id);
  expect(JSON.stringify(helperView.body)).not.toContain(miaCouple.private_household_id);

  const miaGrantReply = await api(mia.page, "/wedding/boundaries/delegates/grants", {
    method: "POST", body: grantBody(miaCouple, "alex@omnyid.test"),
  });
  expect(miaGrantReply.status).toBe(200);
  const miaGrant = miaGrantReply.body as { grant_id: string };
  expect(miaGrant.grant_id).toEqual(expect.any(String));
  const alexView = await api(alex.page, `/wedding/boundaries/delegates/grants/${miaGrant.grant_id}/open`);
  expect(alexView.status).toBe(200);
  expect(JSON.stringify(alexView.body)).toContain(miaCouple.catering_household_id);
  expect(JSON.stringify(alexView.body)).not.toContain(miaCouple.private_household_id);
  expect(JSON.stringify(alexView.body)).not.toContain("must stay private");
  expect((await api(sam.page, `/wedding/boundaries/delegates/grants/${miaGrant.grant_id}/open`)).status).toBe(404);

  const proposal = await api(alex.page, `/wedding/boundaries/delegates/grants/${miaGrant.grant_id}/propose`, {
    method: "POST",
    body: {
      change_type: "plus_one_change",
      request_label: "Catering coordinator plus-one check",
      target_household_id: miaCouple.catering_household_id,
      target_person_id: miaCouple.catering_person_id,
      proposed_guest_name: null,
      proposed_plus_one_allowed: true,
      proposed_invitation_status: null,
      proposed_contact_label: null,
      idempotency_key: "e2e-alex-catering-change",
    },
  });
  expect(proposal).toMatchObject({ status: 200, body: { status: "pending" } });
  const requestId = (proposal.body as { request_id: string }).request_id;
  const approved = await api(mia.page, "/wedding/boundaries/decisions", {
    method: "POST",
    body: {
      wedding_plan_id: miaCouple.plan_id,
      response_workspace_id: miaCouple.workspace_id,
      request_id: requestId,
      decision: "approve",
      expected_revision: 1,
      approval_actor_id: null,
      confirmed_elevated_impact: false,
      idempotency_key: "e2e-mia-approve-alex",
    },
  });
  expect(approved).toMatchObject({ status: 200, body: { status: "approved" } });

  const priyaGrantReply = await api(priya.page, "/wedding/boundaries/delegates/grants", {
    method: "POST", body: grantBody(priyaCouple, "sam@omnyid.test"),
  });
  expect(priyaGrantReply.status).toBe(200);
  const priyaGrant = priyaGrantReply.body as { grant_id: string };
  expect((await api(sam.page, `/wedding/boundaries/delegates/grants/${priyaGrant.grant_id}/open`)).status).toBe(200);
  expect((await api(jordan.page, `/wedding/boundaries/delegates/grants/${priyaGrant.grant_id}/open`)).status).toBe(404);
  expect((await api(alex.page, `/wedding/boundaries/delegates/grants/${priyaGrant.grant_id}/open`)).status).toBe(404);
  expect((await api(mia.page, `/wedding/boundaries/delegates/grants/${priyaGrant.grant_id}/revoke`, { method: "POST", body: {} })).status).toBe(404);

  const revoked = await api(mia.page, `/wedding/boundaries/delegates/grants/${miaGrant.grant_id}/revoke`, { method: "POST", body: {} });
  expect(revoked.status).toBe(200);
  expect((await api(alex.page, `/wedding/boundaries/delegates/grants/${miaGrant.grant_id}/open`)).status).toBe(404);
  expect((await api(mia.page, `/wedding/boundaries/grants/${helper.grant.grant_id}/revoke`, { method: "POST", body: {} })).status).toBe(200);
  expect((await api(jordan.page, "/wedding/boundaries/helpers/open", { method: "POST", body: { token: helper.token } })).status).toBe(404);

  for (const { context } of sessions) await context.close();
});
